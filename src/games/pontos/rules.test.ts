import { describe, expect, it } from 'vitest'
import { applyMove, boxesOfLine, createRound, lineCount } from './rules'
import { botMove } from './bot'
import type { Player } from '../../core/types'

const players: Player[] = ['a', 'b'].map((id) => ({ id, name: id, score: 0, connected: true }))
const order = ['a', 'b']

function play(lines: number[], size = 1) {
  let state = createRound({ roundId: 'r', roundNumber: 1, size, starterId: 'a' })
  for (const line of lines) {
    state = applyMove(state, { playerId: state.turnPlayerId!, line, expected: state.moves.length }, order, players)
  }
  return state
}

describe('pontos', () => {
  it('maps every line to its boxes', () => {
    expect(lineCount(2)).toBe(12)
    expect(boxesOfLine(2, 2)).toEqual([0, 2]) // the middle horizontal line of the left column
  })

  it('gives the box to who closes it, and that player plays again', () => {
    // 1x1: lines 0 top, 1 bottom, 2 left, 3 right. a, b, a, then b closes.
    const state = play([0, 1, 2, 3])
    expect(state.boxes[0]).toBe('b')
    expect(state.outcome).toBe('won')
    expect(state.winnerId).toBe('b')
  })

  it('keeps the turn after a closed box on a bigger board', () => {
    // 2x2: close box 0 (lines 0, 2, 6, 7) with b on the last one.
    const state = play([0, 2, 6, 7], 2)
    expect(state.boxes[0]).toBe('b')
    expect(state.turnPlayerId).toBe('b')
  })

  it('the bot takes a free box', () => {
    const state = play([0, 2, 6], 2)
    expect(botMove(state, 'normal')).toBe(7)
  })
})
