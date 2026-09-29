/** Room rules. Pure. The host is the only writer of this state. */

import { seatForRound } from '../../core/order'
import { isCoreEvent, nameOf, reduceCore, remember, type CoreEvent } from '../../core/roomRules'
import type {
  LastRound,
  RoomConfig,
  RoomState,
  RoundOutcome,
  RoundRecord,
} from './types'

/** Public brokers hold about this many clients in one room. */
export const MAX_PLAYERS = 12

export type RoomEvent =
  | CoreEvent
  | { type: 'config'; patch: Partial<RoomConfig> }
  | { type: 'rename'; playerId: string; name: string }
  | { type: 'start_game'; order: string[] }
  | { type: 'start_round' }
  | { type: 'round_live' }
  | {
      type: 'round_end'
      winnerId: string | null
      word: string
      outcome: Exclude<RoundOutcome, 'running'>
      livesRemaining: number
    }
  | { type: 'void_round' }
  | { type: 'end_game' }
  | { type: 'restart' }

export const DEFAULT_CONFIG: RoomConfig = {
  maxLives: 6,
  livesResetEachRound: true,
  onePassLimit: false,
}

export function createRoomState(args: {
  hostId: string
  hostPlayerId: string
  hostName: string
  config?: Partial<RoomConfig>
}): RoomState {
  return {
    v: 1,
    seq: 0,
    ts: 0,
    src: args.hostId,
    status: 'lobby',
    hostId: args.hostId,
    hostPlayerId: args.hostPlayerId,
    config: { ...DEFAULT_CONFIG, ...args.config },
    players: [{ id: args.hostPlayerId, name: args.hostName, score: 0, connected: true }],
    order: [],
    roundNumber: 0,
    masterId: null,
    lastRound: null,
    history: [],
  }
}

function withHistory(state: RoomState, record: RoundRecord): RoundRecord[] {
  return remember(state.history, record)
}

export function roomReducer(state: RoomState, event: RoomEvent): RoomState {
  if (isCoreEvent(event)) return reduceCore(state, event, MAX_PLAYERS)
  switch (event.type) {
    case 'rename':
      return {
        ...state,
        players: state.players.map((player) =>
          player.id === event.playerId
            ? { ...player, name: event.name.trim().slice(0, 24) || player.name }
            : player,
        ),
      }

    case 'config': {
      if (state.status !== 'lobby') return state
      const maxLives = event.patch.maxLives ?? state.config.maxLives
      return {
        ...state,
        config: {
          ...state.config,
          ...event.patch,
          maxLives: Math.min(12, Math.max(1, Math.round(maxLives))),
        },
      }
    }

    case 'start_game': {
      if (state.status !== 'lobby') return state
      if (event.order.length < 2) return state
      const next: RoomState = { ...state, status: 'choosing', order: event.order, roundNumber: 1 }
      return { ...next, masterId: seatForRound(next.order, next.players, 1) }
    }

    case 'start_round': {
      if (state.status !== 'round_end') return state
      const roundNumber = state.roundNumber + 1
      if (state.config.onePassLimit && roundNumber > state.order.length) {
        return { ...state, status: 'game_over', masterId: null }
      }
      const masterId = seatForRound(state.order, state.players, roundNumber)
      if (masterId === null) return { ...state, status: 'game_over', masterId: null }
      // `lastRound` survives the transition: it carries the life pool when
      // `livesResetEachRound` is false.
      return { ...state, status: 'choosing', roundNumber, masterId }
    }

    case 'round_live':
      return state.status === 'choosing' ? { ...state, status: 'playing' } : state

    case 'round_end': {
      if (state.status !== 'choosing' && state.status !== 'playing') return state
      const winner = state.players.find((player) => player.id === event.winnerId)
      // The host applies a point only for a connected player that is not the master.
      const scores =
        winner && winner.connected && winner.id !== state.masterId
          ? state.players.map((player) =>
              player.id === winner.id ? { ...player, score: player.score + 1 } : player,
            )
          : state.players
      const lastRound: LastRound = {
        word: event.word,
        winnerId: scores === state.players ? null : (event.winnerId ?? null),
        voided: false,
        livesRemaining: event.livesRemaining,
      }
      const poolEmpty = !state.config.livesResetEachRound && event.livesRemaining <= 0
      const passDone = state.config.onePassLimit && state.roundNumber >= state.order.length
      const record: RoundRecord = {
        n: state.roundNumber,
        word: event.word,
        masterId: state.masterId ?? '',
        masterName: nameOf(state.players, state.masterId) ?? '—',
        winnerId: lastRound.winnerId,
        winnerName: nameOf(state.players, lastRound.winnerId),
        voided: false,
      }
      return {
        ...state,
        players: scores,
        history: withHistory(state, record),
        status: poolEmpty || passDone ? 'game_over' : 'round_end',
        masterId: poolEmpty || passDone ? null : state.masterId,
        lastRound,
      }
    }

    case 'void_round': {
      if (state.status !== 'choosing' && state.status !== 'playing') return state
      return {
        ...state,
        status: 'round_end',
        lastRound: { word: '', winnerId: null, voided: true },
        history: withHistory(state, {
          n: state.roundNumber,
          word: '',
          masterId: state.masterId ?? '',
          masterName: nameOf(state.players, state.masterId) ?? '—',
          winnerId: null,
          winnerName: null,
          voided: true,
        }),
      }
    }

    case 'end_game':
      return { ...state, status: 'game_over', masterId: null }

    case 'restart': {
      // Back to the lobby with the same people. The scores go to zero and the
      // order is dropped, so the next start draws a new one. Because the room
      // is in the lobby again, a new player can enter.
      if (state.status === 'lobby') return state
      return {
        ...state,
        status: 'lobby',
        players: state.players.map((player) => ({ ...player, score: 0 })),
        order: [],
        roundNumber: 0,
        masterId: null,
        lastRound: null,
        history: [],
      }
    }

    default:
      return state
  }
}
