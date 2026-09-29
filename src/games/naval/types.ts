/** Batalha Naval: payloads and state. */

import type { BoardRoom } from '../../core/boardRoom'

/** Batalha Naval has no setting of its own: the sea and the fleet are fixed. */
export type NavalConfig = object

export type RoomState = BoardRoom<NavalConfig>

/** One ship is its cells. A layout is the fleet of one player. */
export type Layout = number[][]

export type ShotMark = 'hit' | 'miss'

/** What everyone knows about the sea of one player. Never the ships. */
export type Sea = {
  /** Cell to mark. The key is the cell index. */
  shots: Record<string, ShotMark>
  /** The ships the owner declared sunk, with their cells. */
  sunk: number[][]
  alive: boolean
  /** Left the room during the round. */
  left: boolean
}

export type Pending = { shotId: number; shooterId: string; targetId: string; cell: number }

/** The check of a player's answers against the fleet they reveal at the end. */
export type Verdict = 'ok' | 'cheat' | 'missing'

export type Phase = 'placing' | 'firing' | 'done'

/** Retained on `round`. Published by the host. Holds no ship until the reveal. */
export type RoundState = {
  v: number
  seq: number
  ts: number
  src: string
  roundId: string
  roundNumber: number
  size: number
  fleet: number[]
  phase: Phase
  seats: string[]
  /** SHA-256 of each fleet and its salt, published before the first shot. */
  commits: Record<string, string>
  seas: Record<string, Sea>
  turnPlayerId: string | null
  pending: Pending | null
  /** Shot counter. A shot must name it, so a repeated request is refused. */
  shots: number
  outcome: 'running' | 'won' | 'draw'
  winnerId: string | null
  verdicts: Record<string, Verdict>
}

export type ActionBody =
  | { kind: 'ready'; commit: string }
  | { kind: 'shot'; targetId: string; cell: number; expected: number }
  | { kind: 'answer'; shotId: number; result: 'miss' | 'hit' | 'sunk'; ship?: number[] }
  | { kind: 'reveal'; layout: Layout; salt: string }

/** Published on `move`. Never retained. */
export type NavalAction = ActionBody & {
  v: number
  seq: number
  ts: number
  src: string
  roundId: string
  playerId: string
}
