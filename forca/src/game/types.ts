/** Protocol payloads and game state. */

export type RoomStatus = 'lobby' | 'choosing' | 'playing' | 'round_end' | 'game_over'

export type RoomConfig = {
  maxLives: number
  livesResetEachRound: boolean
  /** Optional limit: the game ends after one round per player. */
  onePassLimit: boolean
}

export type Player = {
  id: string
  name: string
  score: number
  connected: boolean
}

export type LastRound = {
  word: string
  winnerId: string | null
  voided: boolean
  /** Carried pool, so the next master can continue with `livesResetEachRound: false`. */
  livesRemaining?: number
}

/** Retained on `room`. Lifecycle only. Also the host Last Will. */
export type RoomMeta = {
  v: number
  seq: number
  ts: number
  src: string
  status: 'open' | 'closed'
  reason?: 'host_lost' | 'host_closed'
  hostId: string
  roomName: string
}

/** One finished round, kept for the history screen. */
export type RoundRecord = {
  n: number
  word: string
  masterId: string
  masterName: string
  winnerId: string | null
  winnerName: string | null
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
  masterId: string | null
  lastRound: LastRound | null
  /** Newest last. Capped, because the roster travels on every change. */
  history: RoundRecord[]
}

export type Slot =
  | { kind: 'letter'; char: string | null }
  | { kind: 'fixed'; char: string }

export type RoundOutcome = 'running' | 'won' | 'lost'

/** Retained on `round`. Published by the round master. Holds no word. */
export type RoundState = {
  v: number
  seq: number
  ts: number
  src: string
  roundId: string
  roundNumber: number
  masterId: string
  category: string
  slots: Slot[]
  guessedLetters: string[]
  wrongLetters: string[]
  wrongWords: string[]
  livesRemaining: number
  maxLives: number
  turnPlayerId: string | null
  outcome: RoundOutcome
}

/** Published on `round/end`. Never retained. */
export type RoundEnd = {
  v: number
  seq: number
  ts: number
  src: string
  roundId: string
  roundNumber: number
  masterId: string
  word: string
  winnerId: string | null
  outcome: Exclude<RoundOutcome, 'running'>
  livesRemaining: number
}

/** Published on `join`. Never retained. */
export type JoinRequest = {
  v: number
  seq: number
  ts: number
  src: string
  playerId: string
  name: string
}

/** Retained on `presence/<clientId>`. Also the client Last Will. */
export type Presence = {
  v: number
  seq: number
  ts: number
  src: string
  playerId: string
  name: string
  online: boolean
}

/**
 * Published in clear text on `forca/v1/directory/<roomId>`, retained.
 * The lobby holds no room key, so this one topic cannot be encrypted.
 * It carries no secret: the key still gates the room.
 */
export type RoomAd = {
  v: number
  roomId: string
  name: string
  players: number
  open: boolean
  ts: number
}

export type Guess = {
  kind: 'letter' | 'word'
  value: string
  playerId: string
}
