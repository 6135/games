/**
 * Host controller. The host owns the room state and is the only writer of a
 * score. It never touches the word, the guesses, the letters or the lives.
 */

import type { RoomLink } from '../../net/mqtt'
import { directoryTopic, type Topics } from '../../net/topics'
import { HEARTBEAT_MS } from '../../net/directory'
import { roomReducer, createRoomState, type RoomEvent } from '../../game/roomReducer'
import { shuffle } from '../../game/order'
import type {
  JoinRequest,
  Presence,
  RoomConfig,
  RoomState,
  RoundEnd,
  RoundState,
} from '../../game/types'

/** Section 9.1: the host waits for a reconnection before it voids the round. */
export const MASTER_GRACE_MS = 15_000

export type HostDeps = {
  link: RoomLink
  topics: Topics
  hostId: string
  hostPlayerId: string
  hostName: string
  roomName: string
  roomId: string
  /** Puts the room on the open list. The host chooses this in the lobby. */
  listed: boolean
  onState: (state: RoomState) => void
}

export class HostController {
  private state: RoomState
  private openRoundId: string | null = null
  private graceTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeat: ReturnType<typeof setInterval> | null = null

  constructor(private readonly deps: HostDeps) {
    this.state = createRoomState({
      hostId: deps.hostId,
      hostPlayerId: deps.hostPlayerId,
      hostName: deps.hostName,
    })
  }

  get snapshot(): RoomState {
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
      directoryTopic(this.deps.roomId),
      {
        v: 1,
        roomId: this.deps.roomId,
        name: this.deps.roomName,
        players: this.state.players.filter((player) => player.connected).length,
        open: this.state.status === 'lobby',
        ts: Date.now(),
      },
      { retain: true },
    )
  }

  private async publishRoster(): Promise<void> {
    const { v: _v, seq: _seq, ts: _ts, src: _src, ...body } = this.state
    this.deps.onState(this.state)
    await this.deps.link.publish(this.deps.topics.roster, body, { retain: true })
    this.advertise()
  }

  /** Reduces one event and republishes when the state changed. */
  async dispatch(event: RoomEvent): Promise<void> {
    const next = roomReducer(this.state, event)
    if (next === this.state) return
    this.state = next
    await this.publishRoster()
  }

  async handleJoin(message: JoinRequest): Promise<void> {
    await this.dispatch({ type: 'join', playerId: message.playerId, name: message.name })
  }

  async handlePresence(message: Presence): Promise<void> {
    await this.dispatch({
      type: 'presence',
      playerId: message.playerId,
      online: message.online,
    })
    if (message.playerId === this.state.masterId) {
      if (message.online) this.cancelGrace()
      else this.startGrace()
    }
  }

  /** The round is live once the master publishes a matching round state. */
  async handleRound(message: RoundState): Promise<void> {
    if (message.roundNumber !== this.state.roundNumber) return
    if (message.masterId !== this.state.masterId) return
    this.openRoundId = message.roundId
    await this.dispatch({ type: 'round_live' })
  }

  /** Applies the score, then clears the retained round. */
  async handleRoundEnd(message: RoundEnd): Promise<void> {
    if (this.openRoundId !== null && message.roundId !== this.openRoundId) return
    if (message.roundNumber !== this.state.roundNumber) return
    if (message.masterId !== this.state.masterId) return
    this.cancelGrace()
    this.openRoundId = null
    await this.dispatch({
      type: 'round_end',
      winnerId: message.winnerId,
      word: message.word,
      outcome: message.outcome,
      livesRemaining: message.livesRemaining,
    })
    this.deps.link.clearRetained(this.deps.topics.round)
  }

  async setConfig(patch: Partial<RoomConfig>): Promise<void> {
    await this.dispatch({ type: 'config', patch })
  }

  /** Builds the frozen order once. It never changes while the room is open. */
  async startGame(): Promise<void> {
    const ids = this.state.players.filter((player) => player.connected).map((player) => player.id)
    await this.dispatch({ type: 'start_game', order: shuffle(ids) })
  }

  async nextRound(): Promise<void> {
    this.deps.link.clearRetained(this.deps.topics.round)
    await this.dispatch({ type: 'start_round' })
  }

  /** Puts the room back in the lobby. Nobody leaves and nobody reconnects. */
  async restart(): Promise<void> {
    this.cancelGrace()
    this.openRoundId = null
    this.deps.link.clearRetained(this.deps.topics.round)
    await this.dispatch({ type: 'restart' })
  }

  async endGame(): Promise<void> {
    this.cancelGrace()
    this.deps.link.clearRetained(this.deps.topics.round)
    await this.dispatch({ type: 'end_game' })
  }

  private startGrace(): void {
    if (this.graceTimer !== null) return
    if (this.state.status !== 'choosing' && this.state.status !== 'playing') return
    this.graceTimer = setTimeout(() => {
      this.graceTimer = null
      void this.voidRound()
    }, MASTER_GRACE_MS)
  }

  private cancelGrace(): void {
    if (this.graceTimer === null) return
    clearTimeout(this.graceTimer)
    this.graceTimer = null
  }

  /** The word died with the master device. No player gains a point. */
  async voidRound(): Promise<void> {
    this.openRoundId = null
    await this.dispatch({ type: 'void_round' })
    this.deps.link.clearRetained(this.deps.topics.round)
  }

  /** Closes the room by hand. The Last Will covers a lost host. */
  async close(): Promise<void> {
    this.cancelGrace()
    this.stopHeartbeat()
    this.deps.link.clearRetained(directoryTopic(this.deps.roomId))
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

  private stopHeartbeat(): void {
    if (this.heartbeat === null) return
    clearInterval(this.heartbeat)
    this.heartbeat = null
  }

  dispose(): void {
    this.cancelGrace()
    this.stopHeartbeat()
  }
}
