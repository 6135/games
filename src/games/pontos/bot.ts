/**
 * The pontos bot. Greedy, as most people play:
 *
 * 1. Close a box when a line can.
 * 2. Else draw a safe line: one that leaves no box with three sides.
 * 3. Else give away the fewest boxes: the line whose chain is shortest.
 *
 * The easy bot skips step 2 half of the time.
 */

import { boxLines, boxesOfLine, sidesDrawn } from './rules'
import type { BotLevel } from '../../core/types'
import type { RoundState } from './types'

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]!
}

/** Boxes the next player could take in a row after `line` is drawn. */
function chainAfter(state: RoundState, line: number): number {
  const lines = state.lines.slice()
  lines[line] = 'x'
  const done = new Set<number>()
  let progress = true
  while (progress) {
    progress = false
    for (let box = 0; box < state.boxes.length; box += 1) {
      if (state.boxes[box] !== null || done.has(box)) continue
      if (sidesDrawn(lines, state.size, box) !== 3) continue
      // Draw the fourth side and look again: the chain goes on.
      const missing = boxLines(state.size, box).find((side) => lines[side] === null)
      if (missing !== undefined) lines[missing] = 'x'
      done.add(box)
      progress = true
    }
  }
  return done.size
}

export function botMove(state: RoundState, level: BotLevel, random: () => number = Math.random): number {
  const free: number[] = []
  for (let line = 0; line < state.lines.length; line += 1) if (state.lines[line] === null) free.push(line)
  if (free.length === 0) return -1

  const closing = free.filter((line) =>
    boxesOfLine(state.size, line).some(
      (box) => state.boxes[box] === null && sidesDrawn(state.lines, state.size, box) === 3,
    ),
  )
  if (closing.length > 0) return pick(closing, random)

  if (level === 'easy' && random() < 0.5) return pick(free, random)

  const safe = free.filter((line) =>
    boxesOfLine(state.size, line).every((box) => sidesDrawn(state.lines, state.size, box) < 2),
  )
  if (safe.length > 0) return pick(safe, random)

  let best = free[0]!
  let bestCost = Infinity
  for (const line of free) {
    const cost = chainAfter(state, line)
    if (cost < bestCost) {
      best = line
      bestCost = cost
    }
  }
  return best
}
