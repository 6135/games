/** Protocol payloads and game state. */

import type { Player, RoomStatus } from '../../core/types'

export type {
  BotLevel,
  JoinRequest,
  Player,
  Presence,
  RoomAd,
  RoomMeta,
  RoomStatus,
} from '../../core/types'

export type RoomConfig = {
  /** Marks in a row that win. Clamped to the grid size at round start. */
  winLength: number
  /** Optional limit: the game ends after each player opened one round. */
  onePassLimit: boolean
}

export type LastRound = {
  winnerId: string | null
  draw: boolean
  voided: boolean
}

/** One finished round, kept for the history screen. */
export type RoundRecord = {
  n: number
  size: number
  moves: number
  starterName: string
  winnerId: string | null
  winnerName: string | null
  draw: boolean
  voided: boolean
}

/** Retained on `roster`. Published by the host. */
export type RoomState = {
  v: number
  seq: number
  ts: number
  src: string
  status: RoomStatus
  hostId: string
  hostPlayerId: string
  config: RoomConfig
  players: Player[]
  order: string[]
  roundNumber: number
  lastRound: LastRound | null
  /** Newest last. Capped, because the roster travels on every change. */
  history: RoundRecord[]
}

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

