import { describe, expect, it } from 'vitest'
import {
  buildSlots,
  fold,
  isFullyRevealed,
  letterCount,
  matchKeyChars,
  validateCategory,
  validateWord,
} from './words'

describe('accent folding', () => {
  it('folds the Portuguese accents to the base letter', () => {
    expect(fold('coração')).toBe('CORACAO')
    expect(fold('ÁRVORE')).toBe('ARVORE')
    expect(fold('pão-de-ló')).toBe('PAO-DE-LO')
  })

  it('keeps one folded entry per character of the word', () => {
    const word = 'ação'
    expect(matchKeyChars(word)).toEqual(['A', 'C', 'A', 'O'])
    expect(matchKeyChars(word)).toHaveLength(Array.from(word).length)
  })

  it('unifies the apostrophe and collapses the whitespace', () => {
    expect(fold('  d’água   doce ')).toBe("D'AGUA DOCE")
  })
})

describe('slots', () => {
  it('reveals the space, the hyphen and the apostrophe at the start', () => {
    const slots = buildSlots("pão-de-ló d'água")
    expect(slots.filter((slot) => slot.kind === 'fixed')).toHaveLength(4)
    expect(slots.every((slot) => slot.kind === 'fixed' || slot.char === null)).toBe(true)
    expect(isFullyRevealed(slots)).toBe(false)
  })

  it('counts the letters only', () => {
    expect(letterCount('a-b c')).toBe(3)
  })
})

describe('validation', () => {
  it('rejects a short word, a long word and a bad character', () => {
    expect(validateWord('a')).toBe('too_short')
    expect(validateWord('a-b')).toBe(null)
    expect(validateWord('x'.repeat(41))).toBe('too_long')
    expect(validateWord('cão3')).toBe('bad_char')
    expect(validateWord('   ')).toBe('empty')
  })

  it('rejects an empty category', () => {
    expect(validateCategory('  ')).toBe('empty')
    expect(validateCategory('animais')).toBe(null)
  })
})
