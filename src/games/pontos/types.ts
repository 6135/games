/** Pontos e Quadrados: payloads and state. */

import type { BoardRoom } from '../../core/boardRoom'

export type PontosConfig = {
  /** Boxes per side. 0 picks a size from the number of players. */
  size: number
}

export type RoomState = BoardRoom<PontosConfig>

export type RoundOutcome = 'running' | 'won' | 'draw'

/** Retained on `round`. Published by the host. */
export type RoundState = {
  v: number
  seq: number
  ts: number
  src: string
  roundId: string
  roundNumber: number
  /** Boxes per side. */
  size: number
  /** Who drew each line. Horizontal lines first, then vertical ones. */
  lines: (string | null)[]
  /** Who closed each box, row major. */
  boxes: (string | null)[]
  /** Line indexes in play order. */
  moves: number[]
  turnPlayerId: string | null
  outcome: RoundOutcome
  winnerId: string | null
}

/** Published on `move` by the player on turn. Never retained. */
export type MoveRequest = {
  v: number
  seq: number
  ts: number
  src: string
  roundId: string
  playerId: string
  line: number
  /** `moves.length` that the player saw. A stale request is refused. */
  expected: number
}
