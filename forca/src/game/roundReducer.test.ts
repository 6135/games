import { describe, expect, it } from 'vitest'
import { applyGuess, adjustLives, createRound } from './roundReducer'
import { revealedWord } from './words'
import type { Player, RoundState } from './types'

const players: Player[] = [
  { id: 'm', name: 'mestre', score: 0, connected: true },
  { id: 'a', name: 'ana', score: 0, connected: true },
  { id: 'b', name: 'bruno', score: 0, connected: true },
]
const ctx = { order: ['m', 'a', 'b'], players }

function round(word: string, lives = 3): RoundState {
  return createRound({
    roundId: 'r1',
    roundNumber: 1,
    masterId: 'm',
    src: 'client',
    category: 'animais',
    word,
    maxLives: lives,
    livesRemaining: lives,
    turnPlayerId: 'a',
  })
}

describe('guess evaluation', () => {
  it('reveals every accented form of a folded letter', () => {
    const result = applyGuess(round('ação'), 'ação', { kind: 'letter', value: 'a', playerId: 'a' }, ctx)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(revealedWord(result.state.slots)).toBe('a_ã_')
    expect(result.state.slots[0]).toEqual({ kind: 'letter', char: 'a' })
    expect(result.state.slots[2]).toEqual({ kind: 'letter', char: 'ã' })
    expect(result.state.livesRemaining).toBe(3)
  })

  it('reveals the cedilla for a plain C', () => {
    const result = applyGuess(round('ação'), 'ação', { kind: 'letter', value: 'C', playerId: 'a' }, ctx)
    expect(result.ok && result.state.slots[1]).toEqual({ kind: 'letter', char: 'ç' })
  })

  it('costs one life on a miss and moves the turn', () => {
    const result = applyGuess(round('gato'), 'gato', { kind: 'letter', value: 'z', playerId: 'a' }, ctx)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.hit).toBe(false)
    expect(result.state.livesRemaining).toBe(2)
    expect(result.state.wrongLetters).toEqual(['Z'])
    expect(result.state.turnPlayerId).toBe('b')
  })

  it('skips the round master in the turn rotation', () => {
    const state = round('gato')
    const first = applyGuess(state, 'gato', { kind: 'letter', value: 'z', playerId: 'b' }, ctx)
    expect(first.ok && first.state.turnPlayerId).toBe('a')
  })

  it('rejects a repeated letter without a state change', () => {
    const first = applyGuess(round('gato'), 'gato', { kind: 'letter', value: 'g', playerId: 'a' }, ctx)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const second = applyGuess(first.state, 'gato', { kind: 'letter', value: 'G', playerId: 'b' }, ctx)
    expect(second).toEqual({ ok: false, reason: 'repeated' })
  })

  it('rejects a multi character letter guess', () => {
    const result = applyGuess(round('gato'), 'gato', { kind: 'letter', value: 'ga', playerId: 'a' }, ctx)
    expect(result).toEqual({ ok: false, reason: 'not_a_letter' })
  })

  it('wins on the last letter and names the winner', () => {
    let state = round('oi')
    const first = applyGuess(state, 'oi', { kind: 'letter', value: 'o', playerId: 'a' }, ctx)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    state = first.state
    const second = applyGuess(state, 'oi', { kind: 'letter', value: 'i', playerId: 'b' }, ctx)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.state.outcome).toBe('won')
    expect(second.winnerId).toBe('b')
    expect(second.state.turnPlayerId).toBe(null)
  })

  it('gives no point to the round master', () => {
    const result = applyGuess(round('oi'), 'oi', { kind: 'word', value: 'oi', playerId: 'm' }, ctx)
    expect(result.ok && result.state.outcome).toBe('won')
    expect(result.ok && result.winnerId).toBe(null)
  })

  it('accepts a whole word without the accents', () => {
    const result = applyGuess(round('coração'), 'coração', {
      kind: 'word',
      value: 'coracao',
      playerId: 'a',
    }, ctx)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.outcome).toBe('won')
    expect(revealedWord(result.state.slots)).toBe('coração')
  })

  it('loses the round when the pool reaches zero', () => {
    let state = round('gato', 1)
    const result = applyGuess(state, 'gato', { kind: 'word', value: 'pato', playerId: 'a' }, ctx)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    state = result.state
    expect(state.outcome).toBe('lost')
    expect(state.livesRemaining).toBe(0)
    expect(applyGuess(state, 'gato', { kind: 'letter', value: 'g', playerId: 'a' }, ctx)).toEqual({
      ok: false,
      reason: 'not_running',
    })
  })

  it('never stores the word in the published state', () => {
    const result = applyGuess(round('gato'), 'gato', { kind: 'letter', value: 'g', playerId: 'a' }, ctx)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(JSON.stringify(result.state)).not.toContain('gato')
  })
})

describe('manual life correction', () => {
  it('puts a lost round back into play', () => {
    const lost = { ...round('gato', 2), livesRemaining: 0, outcome: 'lost' as const }
    const fixed = adjustLives(lost, 1)
    expect(fixed.livesRemaining).toBe(1)
    expect(fixed.outcome).toBe('running')
  })

  it('never passes the maximum and never goes below zero', () => {
    expect(adjustLives(round('gato', 2), 5).livesRemaining).toBe(2)
    expect(adjustLives({ ...round('gato', 2), livesRemaining: 0 }, -1).livesRemaining).toBe(0)
  })
})
