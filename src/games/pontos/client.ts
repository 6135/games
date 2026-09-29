/** Pontos on every device: shows the board the host publishes, sends the lines. */

import type { ClientDeps, GameClient } from '../../core/game'
import { useGameStore } from '../../core/store'
import type { PontosHost } from './host'
import type { RoundState } from './types'

export class PontosClient implements GameClient {
  constructor(private readonly deps: ClientDeps) {}

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

  async play(line: number): Promise<void> {
    if (this.deps.host) {
      await (this.deps.host as unknown as PontosHost).localMove(line)
      return
    }
    const round = useGameStore.getState().round as RoundState | null
    const { identity } = this.deps
    if (!round || round.turnPlayerId !== identity.playerId || round.lines[line] !== null) return
    await this.deps.link.publish(
      this.deps.topics.move,
      { roundId: round.roundId, playerId: identity.playerId, line, expected: round.moves.length },
      { retain: false },
    )
  }

  dispose(): void {}
}
