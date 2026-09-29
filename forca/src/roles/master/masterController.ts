/**
 * Round master controller. It holds the word in device memory, evaluates
 * every guess locally and publishes the round state.
 *
 * The word reaches the network on `round/end` only, when the round is over.
 */

import type { RoomLink } from '../../net/mqtt'
import type { Topics } from '../../net/topics'
import { applyGuess, adjustLives, createRound, type GuessRejection } from '../../game/roundReducer'
import { nextTurn } from '../../game/order'
import { secretStore } from '../../store/gameStore'
import type { Guess, Player, RoundState } from '../../game/types'

export type MasterDeps = {
  link: RoomLink
  topics: Topics
  clientId: string
  playerId: string
  onState: (state: RoundState | null) => void
}

export type BeginArgs = {
  roundNumber: number
  word: string
  category: string
  maxLives: number
  livesRemaining: number
  order: readonly string[]
  players: readonly Player[]
}

export class MasterController {
  private word: string | null = null
  private state: RoundState | null = null
  private winnerId: string | null = null

  constructor(private readonly deps: MasterDeps) {}

  get roundId(): string | null {
    return this.state?.roundId ?? null
  }

  get hasWord(): boolean {
    return this.word !== null
  }

  get pendingWinnerId(): string | null {
    return this.winnerId
  }

  /** Starts the round and publishes the first retained round state. */
  async begin(args: BeginArgs): Promise<void> {
    const roundId = crypto.randomUUID()
    this.word = args.word
    this.winnerId = null
    secretStore.save(roundId, args.word)
    this.state = createRound({
      roundId,
      roundNumber: args.roundNumber,
      masterId: this.deps.playerId,
      src: this.deps.clientId,
      category: args.category,
      word: args.word,
      maxLives: args.maxLives,
      livesRemaining: args.livesRemaining,
      turnPlayerId: nextTurn(args.order, args.players, this.deps.playerId, null),
    })
    await this.publish()
  }

  /** A page reload recovers the word from session storage and the rest from the retained round. */
  recover(round: RoundState): boolean {
    if (round.masterId !== this.deps.playerId) return false
    const word = secretStore.load(round.roundId)
    if (word === null) return false
    this.word = word
    this.state = round
    this.deps.onState(round)
    return true
  }

  async guess(
    guess: Guess,
    ctx: { order: readonly string[]; players: readonly Player[] },
  ): Promise<GuessRejection | null> {
    if (!this.state || this.word === null) return 'not_running'
    const result = applyGuess(this.state, this.word, guess, ctx)
    if (!result.ok) return result.reason
    this.state = result.state
    if (result.winnerId !== null) this.winnerId = result.winnerId
    await this.publish()
    // A complete word leaves nothing to correct, so the round ends at once.
    if (this.state.outcome === 'won') await this.finish()
    return null
  }

  /** Manual correction for a mistyped guess. */
  async adjust(delta: number): Promise<void> {
    if (!this.state) return
    const next = adjustLives(this.state, delta)
    if (next === this.state) return
    this.state = next
    await this.publish()
  }

  /** Sets the turn by hand, for a player that speaks out of turn. */
  async setTurn(playerId: string): Promise<void> {
    if (!this.state || this.state.outcome !== 'running') return
    this.state = { ...this.state, turnPlayerId: playerId }
    await this.publish()
  }

  /** Publishes the reveal and the winner report. Never retained. */
  async finish(): Promise<void> {
    if (!this.state || this.word === null) return
    if (this.state.outcome === 'running') return
    const state = this.state
    await this.deps.link.publish(
      this.deps.topics.roundEnd,
      {
        roundId: state.roundId,
        roundNumber: state.roundNumber,
        masterId: state.masterId,
        word: this.word,
        winnerId: state.outcome === 'won' ? this.winnerId : null,
        outcome: state.outcome,
        livesRemaining: state.livesRemaining,
      },
      { retain: false },
    )
    secretStore.clear()
    this.word = null
  }

  private async publish(): Promise<void> {
    if (!this.state) return
    const { v: _v, seq: _seq, ts: _ts, src: _src, ...body } = this.state
    this.deps.onState(this.state)
    await this.deps.link.publish(this.deps.topics.round, body, { retain: true })
  }

  /** Drops the round without a reveal, after the host restarted the room. */
  abandon(): void {
    if (this.word === null && this.state === null) return
    secretStore.clear()
    this.word = null
    this.state = null
    this.winnerId = null
    this.deps.onState(null)
  }

  dispose(): void {
    this.word = null
    this.state = null
  }
}
