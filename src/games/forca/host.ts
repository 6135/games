/**
 * Forca host. The host never touches the word, the guesses, the letters or
 * the lives: the round master owns the round. The host picks the master,
 * applies the score the master reports and voids a round whose master is lost.
 */

import { HostCore, type HostDeps } from '../../core/host'
import { shuffle } from '../../core/order'
import { roomReducer, createRoomState, type RoomEvent } from './roomReducer'
import type { RoomState, RoundEnd, RoundState } from './types'

/** The host waits for a reconnection before it voids the round. */
export const MASTER_GRACE_MS = 15_000

export class ForcaHost extends HostCore<RoomState, RoomEvent> {
  private openRoundId: string | null = null
  private graceTimer: ReturnType<typeof setTimeout> | null = null

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
    if (topic === this.deps.topics.round) await this.handleRound(message as unknown as RoundState)
    if (topic === this.deps.topics.roundEnd) await this.handleRoundEnd(message as unknown as RoundEnd)
  }

  protected async onPresence(playerId: string, online: boolean): Promise<void> {
    if (playerId !== this.state.masterId) return
    if (online) this.cancelGrace()
    else this.startGrace()
  }

  /** The round is live once the master publishes a matching round state. */
  private async handleRound(message: RoundState): Promise<void> {
    if (message.roundNumber !== this.state.roundNumber) return
    if (message.masterId !== this.state.masterId) return
    this.openRoundId = message.roundId
    await this.dispatch({ type: 'round_live' })
  }

  /** Applies the score, then clears the retained round. */
  private async handleRoundEnd(message: RoundEnd): Promise<void> {
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

  /** The word died with the master device. No player gains a point. */
  async voidRound(): Promise<void> {
    this.openRoundId = null
    await this.dispatch({ type: 'void_round' })
    this.deps.link.clearRetained(this.deps.topics.round)
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

  dispose(): void {
    this.cancelGrace()
    super.dispose()
  }
}
