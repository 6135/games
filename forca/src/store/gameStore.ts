/** The single client store. The controllers write it, the screens read it. */

import { create } from 'zustand'
import type { LinkStatus } from '../net/mqtt'
import type { RoomMeta, RoomState, RoundState } from '../game/types'

export type Phase = 'lobby' | 'connecting' | 'in_room' | 'error'

export type Identity = {
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
  roster: RoomState | null
  round: RoundState | null
  /** Maps a client identifier to a player identifier. Built from presence. */
  clients: Record<string, string>

  setPhase: (phase: Phase) => void
  setError: (error: string | null) => void
  setNotice: (notice: string | null) => void
  setLink: (link: LinkStatus) => void
  setIdentity: (identity: Identity | null) => void
  setMeta: (meta: RoomMeta | null) => void
  setRoster: (roster: RoomState | null) => void
  setRound: (round: RoundState | null) => void
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

/** Per tab. A rejoin with the same identifier restores the row and the score. */
export function stablePlayerId(): string {
  const stored = sessionStorage.getItem('forca.playerId')
  if (stored) return stored
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  const id = `p-${hex}`
  sessionStorage.setItem('forca.playerId', id)
  return id
}

/** The word of the open round. Session storage only, so a reload recovers it. */
export const secretStore = {
  save(roundId: string, word: string): void {
    sessionStorage.setItem('forca.round', JSON.stringify({ roundId, word }))
  },
  load(roundId: string): string | null {
    const raw = sessionStorage.getItem('forca.round')
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as { roundId?: string; word?: string }
      return parsed.roundId === roundId && typeof parsed.word === 'string' ? parsed.word : null
    } catch {
      return null
    }
  },
  clear(): void {
    sessionStorage.removeItem('forca.round')
  },
}

/** Broker and display name only. The room key never reaches storage. */
export const prefs = {
  read(): { name: string; broker: string; roomName: string } {
    return {
      name: localStorage.getItem('forca.name') ?? '',
      broker: localStorage.getItem('forca.broker') ?? '',
      roomName: localStorage.getItem('forca.roomName') ?? '',
    }
  },
  write(values: { name: string; broker: string; roomName: string }): void {
    localStorage.setItem('forca.name', values.name)
    localStorage.setItem('forca.broker', values.broker)
    localStorage.setItem('forca.roomName', values.roomName)
  },
}
