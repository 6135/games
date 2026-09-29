import { describe, expect, it } from 'vitest'
import { masterForRound, nextTurn, randomBelow, shuffle } from './order'
import type { Player } from './types'

const players: Player[] = [
  { id: 'a', name: 'ana', score: 0, connected: true },
  { id: 'b', name: 'bruno', score: 0, connected: false },
  { id: 'c', name: 'carla', score: 0, connected: true },
]

describe('shuffle', () => {
  it('keeps every member exactly once', () => {
    const source = ['a', 'b', 'c', 'd', 'e']
    const out = shuffle(source)
    expect(out.slice().sort()).toEqual(source.slice().sort())
    expect(source).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('draws inside the bound', () => {
    for (let i = 0; i < 200; i += 1) expect(randomBelow(3)).toBeLessThan(3)
    expect(randomBelow(1)).toBe(0)
  })
})

describe('the master rotation', () => {
  it('follows the order and steps over a lost player', () => {
    const order = ['a', 'b', 'c']
    expect(masterForRound(order, players, 1)).toBe('a')
    expect(masterForRound(order, players, 2)).toBe('c')
    expect(masterForRound(order, players, 3)).toBe('c')
    expect(masterForRound(order, players, 4)).toBe('a')
  })

  it('returns null when nobody is connected', () => {
    const offline = players.map((player) => ({ ...player, connected: false }))
    expect(masterForRound(['a', 'b', 'c'], offline, 1)).toBe(null)
  })
})

describe('the guess rotation', () => {
  it('skips the master and every lost player', () => {
    const order = ['a', 'b', 'c']
    expect(nextTurn(order, players, 'a', null)).toBe('c')
    expect(nextTurn(order, players, 'a', 'c')).toBe('c')
    expect(nextTurn(order, players, 'c', 'a')).toBe('a')
  })

  it('returns null when only the master is left', () => {
    const alone: Player[] = [{ id: 'a', name: 'ana', score: 0, connected: true }]
    expect(nextTurn(['a'], alone, 'a', null)).toBe(null)
  })
})
