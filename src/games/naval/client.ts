/**
 * Naval on every device, the host included. It keeps this player's fleet,
 * answers every shot at it, and reveals it when the round is over.
 * The fleet never leaves this device before the reveal.
 */

import type { ClientDeps, GameClient } from '../../core/game'
import { useGameStore } from '../../core/store'
import { answerFor, commitOf, newSalt } from './fleet'
import { fleetStore } from './secret'
import type { NavalHost } from './host'
import type { ActionBody, Layout, RoundState } from './types'

export class NavalClient implements GameClient {
  private answered = -1
  private revealed: string | null = null
  private readonly stop: () => void

  constructor(private readonly deps: ClientDeps) {
    // Answer and reveal on every new round state, wherever it comes from.
    this.stop = useGameStore.subscribe((state, before) => {
      if (state.round !== before.round) this.react(state.round as RoundState | null)
    })
  }

  onMessage(topic: string, message: Record<string, unknown>): void {
    if (topic !== this.deps.topics.round || this.deps.host) return
    const meta = useGameStore.getState().meta
    if (meta && message['src'] !== meta.hostId) return
    useGameStore.getState().setRound(message as unknown as RoundState)
  }

  onRoster(): void {}

  onCleared(topic: string): void {
    if (topic === this.deps.topics.round && !this.deps.host) useGameStore.getState().setRound(null)
  }

  private react(round: RoundState | null): void {
    const me = this.deps.identity.playerId
    if (!round || !round.seats.includes(me)) return
    const saved = fleetStore.load(round.roundId)
    if (!saved) return
    const pending = round.pending
    if (pending && pending.targetId === me && pending.shotId !== this.answered) {
      this.answered = pending.shotId
      const reply = answerFor(saved.layout, round.seas[me]!.shots, pending.cell)
      this.later({ kind: 'answer', shotId: pending.shotId, ...reply })
    }
    if (round.phase === 'done' && round.commits[me] && !round.verdicts[me] && this.revealed !== round.roundId) {
      this.revealed = round.roundId
      this.later({ kind: 'reveal', layout: saved.layout, salt: saved.salt })
    }
  }

  /** Out of the store callback, so the host never runs inside its own publish. */
  private later(body: ActionBody): void {
    setTimeout(() => void this.send(body), 0)
  }

  /** Commits to a fleet. Only the SHA-256 of the fleet and a salt goes out. */
  async ready(layout: Layout): Promise<void> {
    const round = useGameStore.getState().round as RoundState | null
    if (!round || round.phase !== 'placing') return
    const salt = newSalt()
    fleetStore.save({ roundId: round.roundId, layout, salt })
    await this.send({ kind: 'ready', commit: await commitOf(layout, salt) })
  }

  async shoot(targetId: string, cell: number): Promise<void> {
    const round = useGameStore.getState().round as RoundState | null
    if (!round || round.turnPlayerId !== this.deps.identity.playerId || round.pending) return
    await this.send({ kind: 'shot', targetId, cell, expected: round.shots })
  }

  /** My fleet for this round, once committed. */
  fleet(roundId: string): Layout | null {
    return fleetStore.load(roundId)?.layout ?? null
  }

  private async send(body: ActionBody): Promise<void> {
    if (this.deps.host) {
      await (this.deps.host as unknown as NavalHost).localAction(body)
      return
    }
    const round = useGameStore.getState().round as RoundState | null
    if (!round) return
    await this.deps.link.publish(
      this.deps.topics.move,
      { ...body, roundId: round.roundId, playerId: this.deps.identity.playerId },
      { retain: false },
    )
  }

  dispose(): void {
    this.stop()
  }
}
