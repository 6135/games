/**
 * Round rules. Pure. Imports nothing from `net/`.
 *
 * The word is a parameter and never enters `RoundState`, so the publisher
 * cannot leak it: it serializes `RoundState` only.
 */

import { fold, matchKeyChars, buildSlots, isFullyRevealed, normalizeText } from './words'
import { nextTurn } from './order'
import type { Guess, Player, RoundState, Slot } from './types'

export type RoundInit = {
  roundId: string
  roundNumber: number
  masterId: string
  src: string
  category: string
  word: string
  maxLives: number
  livesRemaining: number
  turnPlayerId: string | null
}

export function createRound(init: RoundInit): RoundState {
  return {
    v: 1,
    seq: 0,
    ts: 0,
    src: init.src,
    roundId: init.roundId,
    roundNumber: init.roundNumber,
    masterId: init.masterId,
    category: normalizeText(init.category),
    slots: buildSlots(normalizeText(init.word)),
    guessedLetters: [],
    wrongLetters: [],
    wrongWords: [],
    livesRemaining: init.livesRemaining,
    maxLives: init.maxLives,
    turnPlayerId: init.turnPlayerId,
    outcome: 'running',
  }
}

export type TurnContext = {
  order: readonly string[]
  players: readonly Player[]
}

export type GuessRejection =
  | 'not_running'
  | 'empty'
  | 'not_a_letter'
  | 'repeated'
  | 'no_player'

export type GuessResult =
  | { ok: false; reason: GuessRejection }
  | { ok: true; hit: boolean; state: RoundState; winnerId: string | null }

/**
 * Evaluate one guess against the local word and return the next round state.
 * The round master runs this. No message is exchanged to evaluate.
 */
export function applyGuess(
  state: RoundState,
  word: string,
  guess: Guess,
  ctx: TurnContext,
): GuessResult {
  if (state.outcome !== 'running') return { ok: false, reason: 'not_running' }
  if (guess.playerId.length === 0) return { ok: false, reason: 'no_player' }

  const value = fold(guess.value)
  if (value.length === 0) return { ok: false, reason: 'empty' }

  const target = normalizeText(word)
  const key = matchKeyChars(target)

  let slots: Slot[]
  let hit: boolean
  const guessedLetters = state.guessedLetters.slice()
  const wrongLetters = state.wrongLetters.slice()
  const wrongWords = state.wrongWords.slice()

  if (guess.kind === 'letter') {
    if (Array.from(value).length !== 1 || !/\p{Letter}/u.test(value)) {
      return { ok: false, reason: 'not_a_letter' }
    }
    if (guessedLetters.includes(value)) return { ok: false, reason: 'repeated' }
    guessedLetters.push(value)

    const indexes: number[] = []
    key.forEach((folded, index) => {
      if (folded === value && state.slots[index]?.kind === 'letter') indexes.push(index)
    })
    hit = indexes.length > 0
    slots = state.slots.map((slot, index) =>
      indexes.includes(index) && slot.kind === 'letter'
        ? { kind: 'letter', char: Array.from(target)[index] ?? null }
        : slot,
    )
    if (!hit) wrongLetters.push(value)
  } else {
    if (wrongWords.includes(value)) return { ok: false, reason: 'repeated' }
    hit = value === fold(target)
    slots = hit
      ? state.slots.map((slot, index) =>
          slot.kind === 'letter'
            ? { kind: 'letter', char: Array.from(target)[index] ?? null }
            : slot,
        )
      : state.slots
    if (!hit) wrongWords.push(value)
  }

  const livesRemaining = hit ? state.livesRemaining : Math.max(0, state.livesRemaining - 1)
  const won = isFullyRevealed(slots)
  const outcome = won ? 'won' : livesRemaining === 0 ? 'lost' : 'running'

  const next: RoundState = {
    ...state,
    slots,
    guessedLetters,
    wrongLetters,
    wrongWords,
    livesRemaining,
    outcome,
    turnPlayerId:
      outcome === 'running'
        ? nextTurn(ctx.order, ctx.players, state.masterId, guess.playerId)
        : null,
  }

  // The round master never scores in their own round.
  const winnerId = outcome === 'won' && guess.playerId !== state.masterId ? guess.playerId : null
  return { ok: true, hit, state: next, winnerId }
}

/**
 * Manual life correction, for a mistyped guess.
 * A raise above zero puts a lost round back into play.
 */
export function adjustLives(state: RoundState, delta: number): RoundState {
  if (state.outcome === 'won') return state
  const livesRemaining = Math.min(state.maxLives, Math.max(0, state.livesRemaining + delta))
  if (livesRemaining === state.livesRemaining) return state
  return {
    ...state,
    livesRemaining,
    outcome: livesRemaining === 0 ? 'lost' : 'running',
  }
}
