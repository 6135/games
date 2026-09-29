/**
 * The host base. The host owns the room state and is the only writer of a
 * score. This class holds what every game does the same way: the retained
 * `room` and `roster`, the open room list, the joins, the presence and the
 * bots. A game extends it with its rounds.
 */

import type { RoomLink } from './net/mqtt'
import { directoryTopic, type Topics } from './net/topics'
import { HEARTBEAT_MS } from './net/directory'
import type { CoreEvent } from './roomRules'
import type { BotLevel, CoreRoom, JoinRequest, Presence } from './types'

export type HostDeps = {
  link: RoomLink
  topics: Topics
  protocol: string
  hostId: string
  hostPlayerId: string
  hostName: string
  roomName: string
  roomId: string
  /** Puts the room on the open list. The host chooses this in the lobby. */
  listed: boolean
  onState: (state: CoreRoom) => void
  onRound: (round: unknown) => void
}

/** The actions the host screen calls. Every game has them. */
export type HostActions = {
  setConfig: (patch: Record<string, unknown>) => Promise<void>
  startGame: () => Promise<void>
  nextRound: () => Promise<void>
  endGame: () => Promise<void>
  restart: () => Promise<void>
  voidRound: () => Promise<void>
  addBot: (level: BotLevel) => Promise<void>
  removeBot: (playerId: string) => Promise<void>
}

const BOT_NAMES = [
  'Ana Bot',
  'Rui Bot',
  'Eva Bot',
  'Tó Bot',
  'Zé Bot',
  'Lia Bot',
  'Gil Bot',
  'Bia Bot',
  'Duda Bot',
  'Nuno Bot',
  'Rita Bot',
]

type ConfigEvent = { type: 'config'; patch: Record<string, unknown> }

export abstract class HostCore<S extends CoreRoom, E extends { type: string }>
  implements HostActions
{
  protected state: S
  /** Client identifier to player identifier, learned from `join`. Blocks a forged message. */
  protected readonly clients = new Map<string, string>()
  private heartbeat: ReturnType<typeof setInterval> | null = null

  constructor(
    protected readonly deps: HostDeps,
    initial: S,
  ) {
    this.state = initial
    this.clients.set(deps.hostId, deps.hostPlayerId)
  }

  /** The game rules. Pure. */
  protected abstract reduce(state: S, event: E | CoreEvent | ConfigEvent): S

  /** A message on a topic that the core does not handle: the round topics. */
  abstract onMessage(topic: string, message: Record<string, unknown>): Promise<void>

  abstract startGame(): Promise<void>
  abstract nextRound(): Promise<void>
  abstract endGame(): Promise<void>
  abstract restart(): Promise<void>
  abstract voidRound(): Promise<void>

  /** Called after a presence change. A game uses it for a lost player on turn. */
  protected async onPresence(_playerId: string, _online: boolean): Promise<void> {}

  get snapshot(): S {
    return this.state
  }

  /** Publishes the retained `room` and `roster` messages. */
  async open(): Promise<void> {
    await this.deps.link.publish(
      this.deps.topics.room,
      { status: 'open', hostId: this.deps.hostId, roomName: this.deps.roomName },
      { retain: true },
    )
    await this.publishRoster()
    if (!this.deps.listed) return
    // A crashed host cannot clear the entry, and one Last Will is already
    // taken by `room`. The repeat is what makes a dead room drop off.
    this.heartbeat = setInterval(() => this.advertise(), HEARTBEAT_MS)
  }

  /** One retained message in clear text, so a lobby with no key can read it. */
  private advertise(): void {
    if (!this.deps.listed) return
    this.deps.link.publishRaw(
      directoryTopic(this.deps.protocol, this.deps.roomId),
      {
        v: 1,
        roomId: this.deps.roomId,
        name: this.deps.roomName,
        players: this.state.players.filter((player) => player.connected && !player.bot).length,
        open: this.state.status === 'lobby',
        ts: Date.now(),
      },
      { retain: true },
    )
  }

  protected async publishRoster(): Promise<void> {
    const { v: _v, seq: _seq, ts: _ts, src: _src, ...body } = this.state
    this.deps.onState(this.state)
    await this.deps.link.publish(this.deps.topics.roster, body, { retain: true })
    this.advertise()
  }

  /** Reduces one event and republishes when the state changed. */
  async dispatch(event: E | CoreEvent | ConfigEvent): Promise<void> {
    const next = this.reduce(this.state, event)
    if (next === this.state) return
    this.state = next
    await this.publishRoster()
  }

  async handleJoin(message: JoinRequest): Promise<void> {
    this.clients.set(message.src, message.playerId)
    await this.dispatch({ type: 'join', playerId: message.playerId, name: message.name })
  }

  async handlePresence(message: Presence): Promise<void> {
    // Presence never teaches the client map: only `join` does.
    if (this.clients.get(message.src) !== message.playerId) return
    await this.dispatch({ type: 'presence', playerId: message.playerId, online: message.online })
    await this.onPresence(message.playerId, message.online)
  }

  async setConfig(patch: Record<string, unknown>): Promise<void> {
    await this.dispatch({ type: 'config', patch })
  }

  /** Adds a bot in the lobby. A game without bots never shows the button. */
  async addBot(level: BotLevel): Promise<void> {
    const used = new Set(this.state.players.map((player) => player.name))
    const name =
      BOT_NAMES.find((candidate) => !used.has(candidate)) ?? `Bot ${this.state.players.length}`
    const id = `bot-${crypto.randomUUID().slice(0, 8)}`
    await this.dispatch({ type: 'add_bot', playerId: id, name, level })
  }

  async removeBot(playerId: string): Promise<void> {
    await this.dispatch({ type: 'remove_bot', playerId })
  }

  /** Closes the room by hand. The Last Will covers a lost host. */
  async close(): Promise<void> {
    this.dispose()
    this.deps.link.clearRetained(directoryTopic(this.deps.protocol, this.deps.roomId))
    this.deps.link.clearRetained(this.deps.topics.round)
    await this.deps.link.publish(
      this.deps.topics.room,
      {
        status: 'closed',
        reason: 'host_closed',
        hostId: this.deps.hostId,
        roomName: this.deps.roomName,
      },
      { retain: true },
    )
  }

  dispose(): void {
    if (this.heartbeat === null) return
    clearInterval(this.heartbeat)
    this.heartbeat = null
  }
}
