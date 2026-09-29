/** Room rules that every game shares. Pure. The host is the only writer. */

import type { BotLevel, CoreRoom, Player } from './types'

/** The roster travels on every change, so the history cannot grow forever. */
export const HISTORY_LIMIT = 50

export type CoreEvent =
  | { type: 'join'; playerId: string; name: string }
  | { type: 'presence'; playerId: string; online: boolean }
  | { type: 'add_bot'; playerId: string; name: string; level: BotLevel }
  | { type: 'remove_bot'; playerId: string }

export function cleanName(name: string): string {
  return name.trim().slice(0, 24)
}

export function remember<T>(history: readonly T[], record: T): T[] {
  return [...history, record].slice(-HISTORY_LIMIT)
}

/** The ranking. Sorted by score, then by name. */
export function ranking(players: readonly Player[]): Player[] {
  return players.slice().sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}

export function nameOf(players: readonly Player[], id: string | null): string | null {
  if (id === null) return null
  return players.find((player) => player.id === id)?.name ?? null
}

function withPlayers<S extends CoreRoom>(state: S, players: Player[]): S {
  return { ...state, players }
}

/**
 * The events every game treats the same way. Returns the same state object
 * when nothing changes. `maxPlayers` counts the bots too.
 */
export function reduceCore<S extends CoreRoom>(
  state: S,
  event: CoreEvent,
  maxPlayers: number,
): S {
  switch (event.type) {
    case 'join': {
      const name = cleanName(event.name) || 'jogador'
      const existing = state.players.find((player) => player.id === event.playerId)
      if (existing) {
        // A repeated join updates the name and does not add a row.
        return withPlayers(
          state,
          state.players.map((player) =>
            player.id === event.playerId ? { ...player, name, connected: true } : player,
          ),
        )
      }
      // The frozen order cannot accept a new member, so no late join.
      if (state.status !== 'lobby' || state.players.length >= maxPlayers) return state
      return withPlayers(state, [
        ...state.players,
        { id: event.playerId, name, score: 0, connected: true },
      ])
    }

    case 'presence': {
      const player = state.players.find((row) => row.id === event.playerId)
      // A bot has no device, so no presence can change it.
      if (!player || player.bot || player.connected === event.online) return state
      return withPlayers(
        state,
        state.players.map((row) =>
          row.id === event.playerId ? { ...row, connected: event.online } : row,
        ),
      )
    }

    case 'add_bot': {
      if (state.status !== 'lobby' || state.players.length >= maxPlayers) return state
      if (state.players.some((player) => player.id === event.playerId)) return state
      return withPlayers(state, [
        ...state.players,
        {
          id: event.playerId,
          name: cleanName(event.name) || 'bot',
          score: 0,
          connected: true,
          bot: event.level,
        },
      ])
    }

    case 'remove_bot': {
      if (state.status !== 'lobby') return state
      const players = state.players.filter(
        (player) => !(player.id === event.playerId && player.bot),
      )
      return players.length === state.players.length ? state : withPlayers(state, players)
    }

    default:
      return state
  }
}

export function isCoreEvent(event: { type: string }): event is CoreEvent {
  return (
    event.type === 'join' ||
    event.type === 'presence' ||
    event.type === 'add_bot' ||
    event.type === 'remove_bot'
  )
}
