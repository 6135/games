/**
 * Pontos e Quadrados rules. Pure.
 *
 * A board of `size` x `size` boxes has `(size + 1) * size` horizontal lines
 * and as many vertical ones. A player draws one line. A line that closes a
 * box (or two) gives the box to that player, and the same player plays again.
 * When every line is drawn, the most boxes win.
 */

import { nextTurn } from '../../core/order'
import type { Player } from '../../core/types'
import type { RoundState } from './types'

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 8
export const MIN_SIZE = 3
export const MAX_SIZE = 10

/** Two players play 4x4 boxes. Each extra player adds one row and one column, up to 8. */
export function autoSize(players: number): number {
  return Math.min(8, Math.max(MIN_SIZE, players + 2))
}

export function boardSize(wanted: number, players: number): number {
  if (!wanted) return autoSize(players)
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(wanted)))
}

export function lineCount(size: number): number {
  return 2 * size * (size + 1)
}

/** The four lines of box `(r, c)`: top, bottom, left, right. */
export function boxLines(size: number, box: number): [number, number, number, number] {
  const r = Math.floor(box / size)
  const c = box % size
  const horizontal = (size + 1) * size
  return [
    r * size + c,
    (r + 1) * size + c,
    horizontal + r * (size + 1) + c,
    horizontal + r * (size + 1) + c + 1,
  ]
}

/** The one or two boxes that a line borders. */
export function boxesOfLine(size: number, line: number): number[] {
  const horizontal = (size + 1) * size
  const out: number[] = []
  if (line < horizontal) {
    const r = Math.floor(line / size)
    const c = line % size
    if (r > 0) out.push((r - 1) * size + c)
    if (r < size) out.push(r * size + c)
  } else {
    const v = line - horizontal
    const r = Math.floor(v / (size + 1))
    const c = v % (size + 1)
    if (c > 0) out.push(r * size + c - 1)
    if (c < size) out.push(r * size + c)
  }
  return out
}

export function sidesDrawn(lines: readonly (string | null)[], size: number, box: number): number {
  return boxLines(size, box).filter((line) => lines[line] !== null).length
}

export function createRound(args: {
  roundId: string
  roundNumber: number
  size: number
  starterId: string | null
}): RoundState {
  return {
    v: 1,
    seq: 0,
    ts: 0,
    src: '',
    roundId: args.roundId,
    roundNumber: args.roundNumber,
    size: args.size,
    lines: Array.from({ length: lineCount(args.size) }, () => null),
    boxes: Array.from({ length: args.size * args.size }, () => null),
    moves: [],
    turnPlayerId: args.starterId,
    outcome: 'running',
    winnerId: null,
  }
}

export type Move = { playerId: string; line: number; expected: number }

export function checkMove(state: RoundState, move: Move): string | null {
  if (state.outcome !== 'running') return 'finished'
  if (move.playerId !== state.turnPlayerId) return 'not_your_turn'
  if (move.expected !== state.moves.length) return 'stale'
  if (!Number.isInteger(move.line) || move.line < 0 || move.line >= state.lines.length) {
    return 'out_of_range'
  }
  if (state.lines[move.line] !== null) return 'taken'
  return null
}

/** Boxes per player, for the score line and the result. */
export function boxCounts(state: RoundState): Map<string, number> {
  const counts = new Map<string, number>()
  for (const owner of state.boxes) if (owner) counts.set(owner, (counts.get(owner) ?? 0) + 1)
  return counts
}

/** Applies a legal move. An illegal move returns the same state object. */
export function applyMove(
  state: RoundState,
  move: Move,
  order: readonly string[],
  players: readonly Player[],
): RoundState {
  if (checkMove(state, move) !== null) return state
  const lines = state.lines.slice()
  lines[move.line] = move.playerId
  const boxes = state.boxes.slice()
  let closed = 0
  for (const box of boxesOfLine(state.size, move.line)) {
    if (boxes[box] === null && sidesDrawn(lines, state.size, box) === 4) {
      boxes[box] = move.playerId
      closed += 1
    }
  }
  const next: RoundState = { ...state, lines, boxes, moves: [...state.moves, move.line] }

  if (lines.every((line) => line !== null)) {
    const counts = boxCounts(next)
    const top = Math.max(...counts.values())
    const leaders = [...counts.entries()].filter(([, count]) => count === top)
    const winnerId = leaders.length === 1 ? leaders[0]![0] : null
    return {
      ...next,
      turnPlayerId: null,
      outcome: winnerId ? 'won' : 'draw',
      winnerId,
    }
  }
  // A closed box plays again. Else the turn passes.
  const turnPlayerId = closed > 0 ? move.playerId : nextTurn(order, players, move.playerId)
  return { ...next, turnPlayerId }
}

/** Passes the turn without a move. The host uses it when the player on turn is gone. */
export function skipTurn(
  state: RoundState,
  order: readonly string[],
  players: readonly Player[],
): RoundState {
  if (state.outcome !== 'running') return state
  const turnPlayerId = nextTurn(order, players, state.turnPlayerId)
  return turnPlayerId === state.turnPlayerId ? state : { ...state, turnPlayerId }
}

/** A short summary for the history: the size and the boxes of each player. */
export function summary(state: RoundState, players: readonly Player[]): string {
  const counts = boxCounts(state)
  const parts = players
    .filter((player) => counts.has(player.id))
    .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))
    .map((player) => `${player.name} ${counts.get(player.id)}`)
  return `${state.size}×${state.size} · ${parts.join(', ') || 'sem quadrados'}`
}
