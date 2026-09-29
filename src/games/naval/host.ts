/**
 * Naval host. It runs the turns and records every shot and answer, but it
 * never sees a human fleet before the reveal. It holds the bot fleets, so it
 * answers for the bots and shoots for them.
 */

import { HostCore, type HostDeps } from '../../core/host'
import { shuffle } from '../../core/order'
import { boardRoomReducer, createBoardRoom, type BoardEvent } from '../../core/boardRoom'
import { answerFor, commitOf, newSalt, randomLayout, verify } from './fleet'
import { answer, createRound, eliminate, markReady, MAX_PLAYERS, MIN_PLAYERS, shoot, withVerdict } from './rules'
import { botShot } from './bot'
import type { ActionBody, Layout, NavalAction, NavalConfig, RoomState, RoundState } from './types'

export const LEAVE_GRACE_MS = 15_000
export const REVEAL_WAIT_MS = 10_000
export const BOT_DELAY_MS = 350

const RULES = {
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  normalizeConfig: (config: NavalConfig & { onePassLimit: boolean }) => ({
    onePassLimit: config.onePassLimit === true,
  }),
}

export class NavalHost extends HostCore<RoomState, BoardEvent<NavalConfig>> {
  private round: RoundState | null = null
  private readonly botFleets = new Map<string, { layout: Layout; salt: string }>()
  private readonly leaveTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private botTimer: ReturnType<typeof setTimeout> | null = null
  private revealTimer: ReturnType<typeof setTimeout> | null = null
  private finished = false

  constructor(deps: HostDeps) {
    super(
      deps,
      createBoardRoom<NavalConfig>({
        hostId: deps.hostId,
        hostPlayerId: deps.hostPlayerId,
        hostName: deps.hostName,
        config: { onePassLimit: false },
      }),
    )
  }

  protected reduce(state: RoomState, event: BoardEvent<NavalConfig>): RoomState {
    return boardRoomReducer(RULES, state, event)
  }

  async onMessage(topic: string, message: Record<string, unknown>): Promise<void> {
    if (topic !== this.deps.topics.move) return
    const action = message as unknown as NavalAction
    // The publisher must be the client that joined as that player.
    if (this.clients.get(action.src) !== action.playerId) return
    await this.handle(action.playerId, action.roundId, action)
  }

  /** An action of the host player. No network hop. */
  async localAction(body: ActionBody): Promise<void> {
    if (!this.round) return
    await this.handle(this.deps.hostPlayerId, this.round.roundId, body)
  }

  private starter = (alive: string[]): string | null =>
    alive.length === 0 ? null : alive[(this.state.roundNumber - 1) % alive.length]!

  private async handle(playerId: string, roundId: string, body: ActionBody): Promise<void> {
    const round = this.round
    if (!round || round.roundId !== roundId || this.state.status !== 'playing') return
    let next = round
    switch (body.kind) {
      case 'ready':
        next = markReady(round, playerId, body.commit, this.starter)
        break
      case 'shot':
        next = shoot(round, playerId, body.targetId, body.cell, body.expected)
        break
      case 'answer':
        next = answer(round, playerId, body.shotId, body.result, body.ship)
        break
      case 'reveal': {
        if (round.phase !== 'done' || round.verdicts[playerId]) return
        const sea = round.seas[playerId]
        if (!sea) return
        const verdict = await verify(body.layout, body.salt, round.commits[playerId], sea)
        // Other reveals may land while this one is checked: apply it to the round as it is now.
        const now = this.round
        if (!now || now.roundId !== roundId || this.finished) return
        await this.update(withVerdict(now, playerId, verdict))
        return
      }
    }
    if (next === round) return
    await this.update(next)
  }

  private async update(next: RoundState): Promise<void> {
    this.round = next
    await this.publishRound()
    if (next.phase === 'done') await this.onDone()
    else this.driveBots()
  }

  private async publishRound(): Promise<void> {
    const round = this.round
    this.deps.onRound(round)
    if (!round) {
      this.deps.link.clearRetained(this.deps.topics.round)
      return
    }
    const { v: _v, seq: _seq, ts: _ts, src: _src, ...body } = round
    await this.deps.link.publish(this.deps.topics.round, body, { retain: true })
  }

  /**
   * A bot answers a shot at its fleet, or shoots on its turn. The timer reads
   * the round when it fires, so a change during the wait is never lost.
   */
  private driveBots(): void {
    if (this.botTimer !== null || !this.botAction()) return
    this.botTimer = setTimeout(() => {
      this.botTimer = null
      const act = this.botAction()
      if (act) void act()
    }, BOT_DELAY_MS)
  }

  private botAction(): (() => Promise<void>) | null {
    const round = this.round
    if (!round || round.phase !== 'firing' || this.state.status !== 'playing') return null
    const pending = round.pending
    if (pending) {
      const fleet = this.botFleets.get(pending.targetId)
      if (!fleet) return null
      const reply = answerFor(fleet.layout, round.seas[pending.targetId]!.shots, pending.cell)
      return () =>
        this.handle(pending.targetId, round.roundId, { kind: 'answer', shotId: pending.shotId, ...reply })
    }
    const bot = this.state.players.find((player) => player.id === round.turnPlayerId && player.bot)
    if (!bot?.bot) return null
    const shot = botShot(round, bot.id, bot.bot)
    if (!shot) return null
    return () => this.handle(bot.id, round.roundId, { kind: 'shot', ...shot, expected: round.shots })
  }

  /** The round is over: the bots reveal at once, people get a moment, then the host scores. */
  private async onDone(): Promise<void> {
    if (this.finished || !this.round) return
    const botVerdicts: [string, 'ok' | 'cheat'][] = []
    for (const [botId, fleet] of this.botFleets) {
      const sea = this.round.seas[botId]
      if (!sea || this.round.verdicts[botId]) continue
      botVerdicts.push([botId, await verify(fleet.layout, fleet.salt, this.round.commits[botId], sea)])
    }
    // Human reveals may land during the checks above: add to the round as it is now.
    let round = this.round
    for (const [botId, verdict] of botVerdicts) round = withVerdict(round, botId, verdict)
    if (round !== this.round) {
      this.round = round
      await this.publishRound()
    }
    const waiting = round.seats.filter((id) => round.commits[id] && !round.verdicts[id])
    if (waiting.length === 0) {
      await this.finish()
      return
    }
    if (this.revealTimer === null) {
      this.revealTimer = setTimeout(() => {
        this.revealTimer = null
        void this.finish()
      }, REVEAL_WAIT_MS)
    }
  }

  private async finish(): Promise<void> {
    if (this.finished || !this.round) return
    this.finished = true
    if (this.revealTimer !== null) clearTimeout(this.revealTimer)
    this.revealTimer = null
    let round = this.round
    for (const id of round.seats) {
      if (round.commits[id] && !round.verdicts[id]) round = withVerdict(round, id, 'missing')
    }
    this.round = round
    await this.publishRound()
    const name = (id: string) => this.state.players.find((player) => player.id === id)?.name ?? '—'
    const cheats = round.seats.filter((id) => round.verdicts[id] === 'cheat').map(name)
    const missing = round.seats.filter((id) => round.verdicts[id] === 'missing').map(name)
    const winnerCheated = round.winnerId !== null && round.verdicts[round.winnerId] === 'cheat'
    const parts = [`${round.shots} tiros`]
    parts.push(cheats.length > 0 ? `batota: ${cheats.join(', ')}` : 'respostas verificadas')
    if (missing.length > 0) parts.push(`sem revelação: ${missing.join(', ')}`)
    await this.dispatch({
      type: 'round_end',
      winnerId: winnerCheated ? null : round.winnerId,
      draw: round.outcome === 'draw',
      detail: parts.join(' · '),
    })
  }

  private async beginRound(): Promise<void> {
    this.clearTimers()
    this.finished = false
    this.botFleets.clear()
    const seats = this.state.order.slice()
    const gone = seats.filter((id) => !this.state.players.find((p) => p.id === id)?.connected)
    let round = createRound({
      roundId: crypto.randomUUID(),
      roundNumber: this.state.roundNumber,
      seats,
      gone,
    })
    // The host places the bot fleets and commits them like everyone else.
    for (const player of this.state.players) {
      if (!player.bot || !seats.includes(player.id)) continue
      const fleet = { layout: randomLayout(), salt: newSalt() }
      this.botFleets.set(player.id, fleet)
      round = markReady(round, player.id, await commitOf(fleet.layout, fleet.salt), this.starter)
    }
    this.round = round
    await this.publishRound()
    this.driveBots()
  }

  protected async onPresence(playerId: string, online: boolean): Promise<void> {
    const round = this.round
    if (!round || round.phase === 'done' || !round.seas[playerId]) return
    const timer = this.leaveTimers.get(playerId)
    if (online) {
      if (timer) clearTimeout(timer)
      this.leaveTimers.delete(playerId)
      return
    }
    if (timer) return
    this.leaveTimers.set(
      playerId,
      setTimeout(() => {
        this.leaveTimers.delete(playerId)
        if (!this.round || this.round.roundId !== round.roundId) return
        const next = eliminate(this.round, playerId, this.starter)
        if (next !== this.round) void this.update(next)
      }, LEAVE_GRACE_MS),
    )
  }

  async startGame(): Promise<void> {
    const ids = this.state.players.filter((p) => p.connected).map((p) => p.id)
    await this.dispatch({ type: 'start_game', order: shuffle(ids) })
    if (this.state.status === 'playing') await this.beginRound()
  }

  async nextRound(): Promise<void> {
    await this.dispatch({ type: 'start_round' })
    if (this.state.status === 'playing') {
      await this.beginRound()
    } else {
      this.round = null
      await this.publishRound()
    }
  }

  async restart(): Promise<void> {
    this.clearTimers()
    this.round = null
    await this.publishRound()
    await this.dispatch({ type: 'restart' })
  }

  async endGame(): Promise<void> {
    this.clearTimers()
    this.round = null
    await this.publishRound()
    await this.dispatch({ type: 'end_game' })
  }

  async voidRound(): Promise<void> {
    if (!this.round || this.state.status !== 'playing') return
    this.clearTimers()
    this.finished = true
    await this.dispatch({ type: 'void_round', detail: `${this.round.shots} tiros` })
  }

  private clearTimers(): void {
    for (const timer of this.leaveTimers.values()) clearTimeout(timer)
    this.leaveTimers.clear()
    if (this.botTimer !== null) clearTimeout(this.botTimer)
    if (this.revealTimer !== null) clearTimeout(this.revealTimer)
    this.botTimer = null
    this.revealTimer = null
  }

  dispose(): void {
    this.clearTimers()
    super.dispose()
  }
}
