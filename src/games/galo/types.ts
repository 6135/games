/** Protocol payloads and game state. */

import type { BoardRoom } from '../../core/boardRoom'

export type { BotLevel, Player } from '../../core/types'

export type GaloConfig = {
  /** Marks in a row that win. Clamped to the grid size at round start. */
  winLength: number
}

/** Retained on `roster`. Published by the host. */
export type RoomState = BoardRoom<GaloConfig>

export type RoundOutcome = 'running' | 'won' | 'draw'

/** Retained on `round`. Published by the host. */
export type RoundState = {
  v: number
  seq: number
  ts: number
  src: string
  roundId: string
  roundNumber: number
  size: number
  winLength: number
  /** Row major, `size * size` cells. A cell holds a player identifier or null. */
  cells: (string | null)[]
  /** Cell indexes in play order. `moves.length` is the move counter. */
  moves: number[]
  turnPlayerId: string | null
  outcome: RoundOutcome
  winnerId: string | null
  /** The cells of the winning line. Empty until a win. */
  line: number[]
}

/** Published on `move` by the player on turn. Never retained. */
export type MoveRequest = {
  v: number
  seq: number
  ts: number
  src: string
  roundId: string
  playerId: string
  cell: number
  /** `moves.length` that the player saw. A stale request is refused. */
  expected: number
}

