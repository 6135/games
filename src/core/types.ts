/** Types that every game shares. A game adds its own round state and config. */

export type GameId = 'forca' | 'galo'

export type RoomStatus = 'lobby' | 'choosing' | 'playing' | 'round_end' | 'game_over'

/** A bot plays on the host device. The level sets how long it thinks. */
export type BotLevel = 'easy' | 'normal' | 'hard'

export type Player = {
  id: string
  name: string
  score: number
  connected: boolean
  /** Set for a bot. A bot is always connected and never sends a message. */
  bot?: BotLevel
  /** A game that marks its players (galo) sets this when the game starts. */
  symbol?: string
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

/** The fields of the retained `roster` that every game has. */
export type CoreRoom = {
  v: number
  seq: number
  ts: number
  src: string
  status: RoomStatus
  hostId: string
  hostPlayerId: string
  players: Player[]
  order: string[]
  roundNumber: number
  history: unknown[]
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
 * Published in clear text on `<protocol>/directory/<roomId>`, retained.
 * The lobby holds no room key, so this one topic cannot be encrypted.
 */
export type RoomAd = {
  v: number
  /** Read from the topic, never from the payload. */
  protocol: string
  roomId: string
  name: string
  players: number
  open: boolean
  ts: number
}
