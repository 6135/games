/**
 * Galo room rules: the shared board room, plus the symbols. Pure.
 * The host is the only writer of this state.
 */

import { boardRoomReducer, createBoardRoom, type BoardEvent } from '../../core/boardRoom'
import { MAX_PLAYERS, MIN_PLAYERS, SYMBOLS } from './rules'
import { MAX_WIN_LENGTH, MIN_WIN_LENGTH } from './roundReducer'
import type { GaloConfig, RoomState } from './types'

export type RoomEvent = BoardEvent<GaloConfig>

const RULES = {
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  normalizeConfig: (config: GaloConfig & { onePassLimit: boolean }) => ({
    winLength: Math.min(MAX_WIN_LENGTH, Math.max(MIN_WIN_LENGTH, Math.round(config.winLength))),
    onePassLimit: config.onePassLimit === true,
  }),
}

export function createRoomState(args: { hostId: string; hostPlayerId: string; hostName: string }): RoomState {
  return createBoardRoom<GaloConfig>({ ...args, config: { winLength: 3, onePassLimit: false } })
}

/** The shared board room, then the symbols: given at the start, dropped on a restart. */
export function roomReducer(state: RoomState, event: RoomEvent): RoomState {
  const next = boardRoomReducer(RULES, state, event)
  if (next === state) return next
  if (event.type === 'start_game') {
    // The seat in the frozen order gives the symbol. A player outside the
    // order (not connected at the start) stays a spectator.
    return {
      ...next,
      players: next.players.map((player) => {
        const seat = next.order.indexOf(player.id)
        return { ...player, symbol: seat === -1 ? '' : SYMBOLS[seat]! }
      }),
    }
  }
  if (event.type === 'restart') {
    return { ...next, players: next.players.map(({ symbol: _symbol, ...player }) => player) }
  }
  return next
}
