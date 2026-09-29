/**
 * Galo host. The host owns the board and is the only judge of a move.
 * A bot plays on this device, through the same judge as a person.
 */

import { HostCore, type HostDeps } from '../../core/host'
import { seatForRound, shuffle } from '../../core/order'
import { nameOf } from '../../core/roomRules'
import { roomReducer, createRoomState, type RoomEvent } from './roomReducer'
import { applyMove, createRound, skipTurn } from './roundReducer'
import { gridSize } from './rules'
import { toRequest } from './ai/bot'
import { think } from './ai/think'
import type { MoveRequest, RoomState, RoundState } from './types'

/** The host waits this long for the player on turn to come back, then skips the turn. */
export const TURN_GRACE_MS = 15_000
/** A bot waits at least this long, so a person can follow its move. */
export const BOT_MIN_DELAY_MS = 450

export class GaloHost extends HostCore<RoomState, RoomEvent> {
  private round: RoundState | null = null
  private graceTimer: ReturnType<typeof setTimeout> | null = null
  /** The board position a bot is thinking about. Stops a double move. */
  private botTurn: string | null = null
  private disposed = false

  constructor(deps: HostDeps) {
    super(
      deps,
      createRoomState({
        hostId: deps.hostId,
        hostPlayerId: deps.hostPlayerId,
        hostName: deps.hostName,
      }),
    )
  }

  protected reduce(state: RoomState, event: RoomEvent): RoomState {
    return roomReducer(state, event)
  }

  async onMessage(topic: string, message: Record<string, unknown>): Promise<void> {
    if (topic !== this.deps.topics.move) return
    const move = message as unknown as MoveRequest
    // The publisher must be the client that joined as that player.
    if (this.clients.get(move.src) !== move.playerId) return
    await this.play(move.roundId, move.playerId, move.cell, move.expected)
  }

  /** A move from the host screen. No network hop. */
  async localMove(cell: number): Promise<void> {
    if (!this.round) return
    await this.play(this.round.roundId, this.deps.hostPlayerId, cell, this.round.moves.length)
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

  /** When a bot holds the turn, the host device plays for it. */
  private driveBot(): void {
    const round = this.round
    if (!round || round.outcome !== 'running' || this.state.status !== 'playing') return
    const bot = this.state.players.find((player) => player.id === round.turnPlayerId && player.bot)
    if (!bot?.bot) return
    const key = `${round.roundId}:${round.moves.length}`
    if (this.botTurn === key) return
    this.botTurn = key
    const request = toRequest(round, this.state.order, this.state.players, bot.id, bot.bot)
    const delay = new Promise((resolve) => setTimeout(resolve, BOT_MIN_DELAY_MS))
    void Promise.all([think(request), delay]).then(async ([cell]) => {
      if (this.disposed || this.botTurn !== key) return
      this.botTurn = null
      await this.play(round.roundId, bot.id, cell, round.moves.length)
    })
  }

  private async play(roundId: string, playerId: string, cell: number, expected: number): Promise<void> {
    const round = this.round
    if (this.state.status !== 'playing' || !round || round.roundId !== roundId) return
    const next = applyMove(round, { playerId, cell, expected }, this.state.order, this.state.players)
    if (next === round) return
    this.cancelGrace()
    this.round = next
    await this.publishRound()
    if (next.outcome === 'running') return
    await this.dispatch({
      type: 'round_end',
      winnerId: next.winnerId,
      draw: next.outcome === 'draw',
      detail: this.summary(next),
    })
  }

  /** The history line: the grid, the moves and who opened the round. */
  private summary(round: RoundState): string {
    const first = round.moves[0]
    const starterId = first !== undefined ? (round.cells[first] ?? null) : round.turnPlayerId
    const starter = nameOf(this.state.players, starterId) ?? '—'
    return `${round.size}×${round.size} · ${round.moves.length} jogada(s) · aberta por ${starter}`
  }

  /** Draws the board of the current round number and publishes it. */
  private async beginRound(): Promise<void> {
    this.cancelGrace()
    this.round = createRound({
      roundId: crypto.randomUUID(),
      roundNumber: this.state.roundNumber,
      size: gridSize(this.state.order.length),
      winLength: this.state.config.winLength,
      starterId: seatForRound(this.state.order, this.state.players, this.state.roundNumber),
    })
    await this.publishRound()
  }

  /** Builds the frozen order once. The seat in the order gives the symbol. */
  async startGame(): Promise<void> {
    const ids = this.state.players.filter((player) => player.connected).map((player) => player.id)
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

  /** Puts the room back in the lobby. Nobody leaves and nobody reconnects. */
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

  /** Stops the open round. Nobody gains a point. */
  async voidRound(): Promise<void> {
    const round = this.round
    if (!round || this.state.status !== 'playing') return
    this.cancelGrace()
    await this.dispatch({ type: 'void_round', detail: this.summary(round) })
  }

  private startGrace(): void {
    if (this.graceTimer !== null) return
    if (this.state.status !== 'playing') return
    this.graceTimer = setTimeout(() => {
      this.graceTimer = null
      void this.skip()
    }, TURN_GRACE_MS)
  }

  private async skip(): Promise<void> {
    if (!this.round || this.state.status !== 'playing') return
    const next = skipTurn(this.round, this.state.order, this.state.players)
    if (next === this.round) return
    this.round = next
    await this.publishRound()
  }

  private cancelGrace(): void {
    if (this.graceTimer === null) return
    clearTimeout(this.graceTimer)
    this.graceTimer = null
  }

  dispose(): void {
    this.disposed = true
    this.cancelGrace()
    super.dispose()
  }
}
