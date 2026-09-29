/**
 * Forca on every device: shows the round the master publishes. On the device
 * of the round master it also runs the master controller, which holds the word.
 */

import type { ClientDeps, GameClient } from '../../core/game'
import type { CoreRoom } from '../../core/types'
import { useGameStore } from '../../core/store'
import { MasterController } from './masterController'
import type { RoomState, RoundState } from './types'

export class ForcaClient implements GameClient {
  readonly master: MasterController

  constructor(private readonly deps: ClientDeps) {
    this.master = new MasterController({
      link: deps.link,
      topics: deps.topics,
      clientId: deps.identity.clientId,
      playerId: deps.identity.playerId,
      onState: (round) => useGameStore.getState().setRound(round),
    })
  }

  onMessage(topic: string, message: Record<string, unknown>): void {
    if (topic !== this.deps.topics.round) return
    const round = message as unknown as RoundState
    const roster = useGameStore.getState().roster as RoomState | null
    // A stale retained round from an earlier round must not render.
    if (roster && round.roundNumber !== roster.roundNumber) return
    if (roster && roster.masterId !== null && round.masterId !== roster.masterId) return
    useGameStore.getState().setRound(round)
    if (round.masterId === this.deps.identity.playerId && !this.master.hasWord) {
      // A reload recovers the word from session storage.
      this.master.recover(round)
    }
  }

  onRoster(roster: CoreRoom): void {
    // A restart drops the open round on every device, the master included.
    if (roster.status === 'lobby') this.master.abandon()
  }

  onCleared(topic: string): void {
    if (topic === this.deps.topics.round) useGameStore.getState().setRound(null)
  }

  dispose(): void {
    this.master.dispose()
  }
}
