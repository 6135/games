/** Pontos host. The host owns the board and is the only judge of a line. Bots play here. */

import { HostCore, type HostDeps } from '../../core/host'
import { seatForRound, shuffle } from '../../core/order'
import { boardRoomReducer, createBoardRoom, type BoardEvent } from '../../core/boardRoom'
import { applyMove, boardSize, createRound, MAX_PLAYERS, MAX_SIZE, MIN_PLAYERS, MIN_SIZE, skipTurn, summary } from './rules'
import { botMove } from './bot'
import type { MoveRequest, PontosConfig, RoomState, RoundState } from './types'

export const TURN_GRACE_MS = 15_000
export const BOT_DELAY_MS = 400

const RULES = {
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  normalizeConfig: (config: PontosConfig & { onePassLimit: boolean }) => ({
    size: config.size ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(config.size))) : 0,
    onePassLimit: config.onePassLimit === true,
  }),
}

export class PontosHost extends HostCore<RoomState, BoardEvent<PontosConfig>> {
  private round: RoundState | null = null
  private graceTimer: ReturnType<typeof setTimeout> | null = null
  private botTimer: ReturnType<typeof setTimeout> | null = null

  constructor(deps: HostDeps) {
    super(
      deps,
      createBoardRoom<PontosConfig>({
        hostId: deps.hostId,
        hostPlayerId: deps.hostPlayerId,
        hostName: deps.hostName,
        config: { size: 0, onePassLimit: false },
      }),
    )
  }

  protected reduce(state: RoomState, event: BoardEvent<PontosConfig>): RoomState {
    return boardRoomReducer(RULES, state, event)
  }

  async onMessage(topic: string, message: Record<string, unknown>): Promise<void> {
    if (topic !== this.deps.topics.move) return
    const move = message as unknown as MoveRequest
    if (this.clients.get(move.src) !== move.playerId) return
    await this.play(move.roundId, move.playerId, move.line, move.expected)
  }

  /** A line from the host screen. No network hop. */
  async localMove(line: number): Promise<void> {
    if (!this.round) return
    await this.play(this.round.roundId, this.deps.hostPlayerId, line, this.round.moves.length)
  }

  protected async onPresence(playerId: string, online: boolean): Promise<void> {
    if (playerId !== this.round?.turnPlayerId) return
    if (online) this.cancelGrace()
    else this.startGrace()
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
    this.driveBot()
  }

  private driveBot(): void {
    const round = this.round
    if (this.botTimer !== null || !round || round.outcome !== 'running') return
    const bot = this.state.players.find((p) => p.id === round.turnPlayerId && p.bot)
    if (!bot?.bot) return
    const level = bot.bot
    this.botTimer = setTimeout(() => {
      this.botTimer = null
      const now = this.round
      if (!now || now.roundId !== round.roundId || now.turnPlayerId !== bot.id) return
      void this.play(now.roundId, bot.id, botMove(now, level), now.moves.length)
    }, BOT_DELAY_MS)
  }

  private async play(roundId: string, playerId: string, line: number, expected: number): Promise<void> {
    const round = this.round
    if (this.state.status !== 'playing' || !round || round.roundId !== roundId) return
    const next = applyMove(round, { playerId, line, expected }, this.state.order, this.state.players)
    if (next === round) return
    this.cancelGrace()
    this.round = next
    await this.publishRound()
    if (next.outcome === 'running') return
    await this.dispatch({
      type: 'round_end',
      winnerId: next.winnerId,
      draw: next.outcome === 'draw',
      detail: summary(next, this.state.players),
    })
  }

  private async beginRound(): Promise<void> {
    this.cancelGrace()
    this.round = createRound({
      roundId: crypto.randomUUID(),
      roundNumber: this.state.roundNumber,
      size: boardSize(this.state.config.size, this.state.order.length),
      starterId: seatForRound(this.state.order, this.state.players, this.state.roundNumber),
    })
    await this.publishRound()
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
    this.cancelGrace()
    this.round = null
    await this.publishRound()
    await this.dispatch({ type: 'restart' })
  }

  async endGame(): Promise<void> {
    this.cancelGrace()
    this.round = null
    await this.publishRound()
    await this.dispatch({ type: 'end_game' })
  }

  async voidRound(): Promise<void> {
    const round = this.round
    if (!round || this.state.status !== 'playing') return
    this.cancelGrace()
    await this.dispatch({ type: 'void_round', detail: summary(round, this.state.players) })
  }

  private startGrace(): void {
    if (this.graceTimer !== null || this.state.status !== 'playing') return
    this.graceTimer = setTimeout(() => {
      this.graceTimer = null
      if (!this.round) return
      const next = skipTurn(this.round, this.state.order, this.state.players)
      if (next === this.round) return
      this.round = next
      void this.publishRound()
    }, TURN_GRACE_MS)
  }

  private cancelGrace(): void {
    if (this.graceTimer === null) return
    clearTimeout(this.graceTimer)
    this.graceTimer = null
  }

  dispose(): void {
    this.cancelGrace()
    if (this.botTimer !== null) clearTimeout(this.botTimer)
    this.botTimer = null
    super.dispose()
  }
}
