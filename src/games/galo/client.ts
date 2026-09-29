/** Galo on every device: shows the board the host publishes, sends the moves. */

import type { ClientDeps, GameClient } from '../../core/game'
import { useGameStore } from '../../core/store'
import type { GaloHost } from './host'
import type { RoundState } from './types'

export class GaloClient implements GameClient {
  constructor(private readonly deps: ClientDeps) {}

  onMessage(topic: string, message: Record<string, unknown>): void {
    // The host writes its own store directly.
    if (topic !== this.deps.topics.round || this.deps.host) return
    const meta = useGameStore.getState().meta
    // Only the host writes the board.
    if (meta && message['src'] !== meta.hostId) return
    useGameStore.getState().setRound(message as unknown as RoundState)
  }

  onRoster(): void {}

  onCleared(topic: string): void {
    if (topic === this.deps.topics.round && !this.deps.host) useGameStore.getState().setRound(null)
  }

  /** Plays one cell. The host judges it locally, a player asks the host. */
  async play(cell: number): Promise<void> {
    if (this.deps.host) {
      await (this.deps.host as unknown as GaloHost).localMove(cell)
      return
    }
    const round = useGameStore.getState().round as RoundState | null
    const { identity } = this.deps
    if (!round || round.turnPlayerId !== identity.playerId || round.cells[cell] !== null) return
    await this.deps.link.publish(
      this.deps.topics.move,
      { roundId: round.roundId, playerId: identity.playerId, cell, expected: round.moves.length },
      { retain: false },
    )
  }

  dispose(): void {}
}
