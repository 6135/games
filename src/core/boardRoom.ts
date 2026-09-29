/**
 * Room rules for a game where the host runs the whole round (pontos, naval).
 * Pure. The game adds its own config and a short summary of each round.
 */

import { isCoreEvent, nameOf, reduceCore, remember, type CoreEvent } from './roomRules'
import type { CoreRoom } from './types'

export type BoardLastRound = { winnerId: string | null; draw: boolean; voided: boolean }

/** One finished round, for the history screen. `detail` is the game's summary. */
export type BoardRecord = {
  n: number
  winnerId: string | null
  winnerName: string | null
  draw: boolean
  voided: boolean
  detail: string
}

export type BoardRoom<C> = CoreRoom & {
  config: C & { onePassLimit: boolean }
  lastRound: BoardLastRound | null
  history: BoardRecord[]
}

export type BoardEvent<C> =
  | CoreEvent
  | { type: 'config'; patch: Partial<C & { onePassLimit: boolean }> }
  | { type: 'start_game'; order: string[] }
  | { type: 'start_round' }
  | { type: 'round_end'; winnerId: string | null; draw: boolean; detail: string }
  | { type: 'void_round'; detail: string }
  | { type: 'end_game' }
  | { type: 'restart' }

export type BoardRules<C> = {
  minPlayers: number
  maxPlayers: number
  /** Clamps a config patch. Returns the whole config. */
  normalizeConfig: (config: C & { onePassLimit: boolean }) => C & { onePassLimit: boolean }
}

export function createBoardRoom<C>(args: {
  hostId: string
  hostPlayerId: string
  hostName: string
  config: C & { onePassLimit: boolean }
}): BoardRoom<C> {
  return {
    v: 1,
    seq: 0,
    ts: 0,
    src: args.hostId,
    status: 'lobby',
    hostId: args.hostId,
    hostPlayerId: args.hostPlayerId,
    config: args.config,
    players: [{ id: args.hostPlayerId, name: args.hostName, score: 0, connected: true }],
    order: [],
    roundNumber: 0,
    lastRound: null,
    history: [],
  }
}

export function boardRoomReducer<C>(
  rules: BoardRules<C>,
  state: BoardRoom<C>,
  event: BoardEvent<C>,
): BoardRoom<C> {
  if (isCoreEvent(event)) return reduceCore(state, event, rules.maxPlayers)
  switch (event.type) {
    case 'config':
      if (state.status !== 'lobby') return state
      return { ...state, config: rules.normalizeConfig({ ...state.config, ...event.patch }) }

    case 'start_game': {
      if (state.status !== 'lobby') return state
      const known = new Set(state.players.map((player) => player.id))
      const order = event.order.filter((id) => known.has(id)).slice(0, rules.maxPlayers)
      if (order.length < rules.minPlayers) return state
      return { ...state, status: 'playing', order, roundNumber: 1, lastRound: null }
    }

    case 'start_round': {
      if (state.status !== 'round_end') return state
      const roundNumber = state.roundNumber + 1
      if (state.config.onePassLimit && roundNumber > state.order.length) {
        return { ...state, status: 'game_over' }
      }
      return { ...state, status: 'playing', roundNumber }
    }

    case 'round_end': {
      if (state.status !== 'playing') return state
      const winner = event.draw ? undefined : state.players.find((p) => p.id === event.winnerId)
      const players = winner
        ? state.players.map((p) => (p.id === winner.id ? { ...p, score: p.score + 1 } : p))
        : state.players
      const winnerId = winner?.id ?? null
      const passDone = state.config.onePassLimit && state.roundNumber >= state.order.length
      return {
        ...state,
        players,
        status: passDone ? 'game_over' : 'round_end',
        lastRound: { winnerId, draw: event.draw, voided: false },
        history: remember(state.history, {
          n: state.roundNumber,
          winnerId,
          winnerName: nameOf(state.players, winnerId),
          draw: event.draw,
          voided: false,
          detail: event.detail,
        }),
      }
    }

    case 'void_round':
      if (state.status !== 'playing') return state
      return {
        ...state,
        status: 'round_end',
        lastRound: { winnerId: null, draw: false, voided: true },
        history: remember(state.history, {
          n: state.roundNumber,
          winnerId: null,
          winnerName: null,
          draw: false,
          voided: true,
          detail: event.detail,
        }),
      }

    case 'end_game':
      return state.status === 'lobby' ? state : { ...state, status: 'game_over' }

    case 'restart':
      if (state.status === 'lobby') return state
      return {
        ...state,
        status: 'lobby',
        players: state.players.map((player) => ({ ...player, score: 0 })),
        order: [],
        roundNumber: 0,
        lastRound: null,
        history: [],
      }

    default:
      return state
  }
}
