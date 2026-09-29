/** Word normalization, accent folding and slot building. */

import type { Slot } from './types'

export const MIN_LETTERS = 2
export const MAX_CHARS = 40

/** Always visible. The round master never hides these. */
const FIXED_CHARS = new Set([' ', '-', "'"])

const DIACRITICS = /\p{Diacritic}/gu

/**
 * Fold one character: strip the accents and fold to upper case.
 * `Ç` folds to `C`, `Á` folds to `A`. The result can be empty.
 */
export function foldChar(char: string): string {
  return char.normalize('NFD').replace(DIACRITICS, '').toUpperCase()
}

/** Fold a whole string. Also normalizes the apostrophe and the whitespace. */
export function fold(text: string): string {
  return Array.from(normalizeText(text)).map(foldChar).join('')
}

/** Collapse the whitespace and unify the apostrophe variants. */
export function normalizeText(text: string): string {
  return text.replace(/[‘’ʼ]/g, "'").replace(/\s+/g, ' ').trim()
}

export function isFixedChar(char: string): boolean {
  return FIXED_CHARS.has(char)
}

/**
 * One folded entry per character of the word, so an index of the match key
 * always maps to the same index of the original word.
 */
export function matchKeyChars(word: string): string[] {
  return Array.from(word).map(foldChar)
}

export function letterCount(word: string): number {
  return Array.from(word).filter((char) => !isFixedChar(char)).length
}

/** Every letter starts hidden. Every fixed character starts visible. */
export function buildSlots(word: string): Slot[] {
  return Array.from(word).map<Slot>((char) =>
    isFixedChar(char) ? { kind: 'fixed', char } : { kind: 'letter', char: null },
  )
}

export type WordProblem = 'empty' | 'too_short' | 'too_long' | 'bad_char'

/** Validates the secret word. Returns null when the word is usable. */
export function validateWord(raw: string): WordProblem | null {
  const word = normalizeText(raw)
  if (word.length === 0) return 'empty'
  if (Array.from(word).length > MAX_CHARS) return 'too_long'
  if (letterCount(word) < MIN_LETTERS) return 'too_short'
  for (const char of Array.from(word)) {
    if (isFixedChar(char)) continue
    if (!/\p{Letter}/u.test(char)) return 'bad_char'
  }
  return null
}

export function validateCategory(raw: string): 'empty' | 'too_long' | null {
  const category = normalizeText(raw)
  if (category.length === 0) return 'empty'
  if (category.length > 40) return 'too_long'
  return null
}

/** True when no `letter` slot is still hidden. */
export function isFullyRevealed(slots: Slot[]): boolean {
  return slots.every((slot) => slot.kind === 'fixed' || slot.char !== null)
}

export function revealedWord(slots: Slot[]): string {
  return slots.map((slot) => (slot.kind === 'fixed' ? slot.char : (slot.char ?? '_'))).join('')
}
