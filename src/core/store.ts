/** The single client store. The controllers write it, the screens read it. */

import { create } from 'zustand'
import type { LinkStatus } from './net/mqtt'
import type { CoreRoom, GameId, RoomMeta } from './types'

export type Phase = 'lobby' | 'connecting' | 'in_room' | 'error'

export type Identity = {
  game: GameId
  role: 'host' | 'player'
  clientId: string
  playerId: string
  name: string
  roomName: string
  roomId: string
  brokerUrl: string
}

export type GameStore = {
  phase: Phase
  error: string | null
  notice: string | null
  link: LinkStatus
  identity: Identity | null
  meta: RoomMeta | null
  roster: CoreRoom | null
  /** The round state of the game. Each game reads it with its own type. */
  round: unknown
  /** Maps a client identifier to a player identifier. Built from presence. */
  clients: Record<string, string>

  setPhase: (phase: Phase) => void
  setError: (error: string | null) => void
  setNotice: (notice: string | null) => void
  setLink: (link: LinkStatus) => void
  setIdentity: (identity: Identity | null) => void
  setMeta: (meta: RoomMeta | null) => void
  setRoster: (roster: CoreRoom | null) => void
  setRound: (round: unknown) => void
  mapClient: (clientId: string, playerId: string) => void
  reset: () => void
}

const EMPTY = {
  phase: 'lobby' as Phase,
  error: null,
  notice: null,
  link: 'offline' as LinkStatus,
  identity: null,
  meta: null,
  roster: null,
  round: null,
  clients: {},
}

export const useGameStore = create<GameStore>((set) => ({
  ...EMPTY,
  setPhase: (phase) => set({ phase }),
  setError: (error) => set({ error }),
  setNotice: (notice) => set({ notice }),
  setLink: (link) => set({ link }),
  setIdentity: (identity) => set({ identity }),
  setMeta: (meta) => set({ meta }),
  setRoster: (roster) => set({ roster }),
  setRound: (round) => set({ round }),
  mapClient: (clientId, playerId) =>
    set((state) => ({ clients: { ...state.clients, [clientId]: playerId } })),
  reset: () => set({ ...EMPTY }),
}))

/** The roster with the type of the game on screen. */
export function useRoster<T extends CoreRoom>(): T | null {
  return useGameStore((state) => state.roster as T | null)
}

/** The round with the type of the game on screen. */
export function useRound<T>(): T | null {
  return useGameStore((state) => (state.round ?? null) as T | null)
}

/** Per tab. A rejoin with the same identifier restores the row and the score. */
export function stablePlayerId(): string {
  const stored = sessionStorage.getItem('games.playerId')
  if (stored) return stored
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  const id = `p-${hex}`
  sessionStorage.setItem('games.playerId', id)
  return id
}

/** Broker and display name only. The room key never reaches storage. */
export const prefs = {
  read(): { name: string; broker: string; roomName: string } {
    return {
      name: localStorage.getItem('games.name') ?? '',
      broker: localStorage.getItem('games.broker') ?? '',
      roomName: localStorage.getItem('games.roomName') ?? '',
    }
  },
  write(values: { name: string; broker: string; roomName: string }): void {
    localStorage.setItem('games.name', values.name)
    localStorage.setItem('games.broker', values.broker)
    localStorage.setItem('games.roomName', values.roomName)
  },
}
