import { describe, expect, it } from 'vitest'
import { createRoomState, roomReducer } from './roomReducer'
import { MAX_PLAYERS } from './rules'
import type { RoomState } from './types'

function lobby(): RoomState {
  let state = createRoomState({ hostId: 'h', hostPlayerId: 'a', hostName: 'ana' })
  state = roomReducer(state, { type: 'join', playerId: 'b', name: 'bruno' })
  state = roomReducer(state, { type: 'add_bot', playerId: 'c', name: 'carla', level: 'easy' })
  return state
}

const started = () => roomReducer(lobby(), { type: 'start_game', order: ['c', 'a', 'b'] })

describe('the galo room', () => {
  it('caps the room at one player per symbol and needs two to start', () => {
    let state = createRoomState({ hostId: 'h', hostPlayerId: 'p0', hostName: 'p0' })
    expect(roomReducer(state, { type: 'start_game', order: ['p0'] }).status).toBe('lobby')
    for (let i = 1; i < MAX_PLAYERS + 3; i += 1) {
      state = roomReducer(state, { type: 'join', playerId: `p${i}`, name: `p${i}` })
    }
    expect(state.players).toHaveLength(MAX_PLAYERS)
  })

  it('gives each seat its own symbol at the start', () => {
    const state = started()
    const symbols = state.order.map((id) => state.players.find((p) => p.id === id)?.symbol)
    expect(symbols).toEqual(['X', 'O', '△'])
  })

  it('keeps the round summary in the history', () => {
    const detail = '4×4 · 7 jogada(s) · aberta por carla'
    const state = roomReducer(started(), { type: 'round_end', winnerId: 'a', draw: false, detail })
    expect(state.history[0]).toMatchObject({ winnerName: 'ana', detail })
    expect(state.players.find((p) => p.id === 'a')?.score).toBe(1)
  })

  it('clamps the win length', () => {
    expect(roomReducer(lobby(), { type: 'config', patch: { winLength: 99 } }).config.winLength).toBe(6)
    expect(roomReducer(lobby(), { type: 'config', patch: { winLength: 0 } }).config.winLength).toBe(3)
  })

  it('restarts in place and drops the symbols', () => {
    const state = roomReducer(started(), { type: 'restart' })
    expect(state.status).toBe('lobby')
    expect(state.players).toHaveLength(3)
    expect(state.players.every((p) => p.score === 0 && !p.symbol)).toBe(true)
  })
})
