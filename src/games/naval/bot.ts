/**
 * The naval bot: hunt and target.
 *
 * - Target: an open hit (a hit on a ship not yet sunk) means a ship is near.
 *   Two open hits in a line give the direction: shoot the ends of the line.
 *   One open hit: shoot its four neighbours.
 * - Hunt: no open hit. Shoot a free cell on a checkerboard (the smallest
 *   ship is two long, so it always covers a checkerboard cell), never next to
 *   a sunk ship (ships never touch).
 * - Easy: any free cell.
 */

import type { BotLevel } from '../../core/types'
import type { RoundState } from './types'

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]!
}

function around(size: number, cell: number, diagonal: boolean): number[] {
  const r = Math.floor(cell / size)
  const c = cell % size
  const out: number[] = []
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if ((dr === 0 && dc === 0) || (!diagonal && dr !== 0 && dc !== 0)) continue
      const rr = r + dr
      const cc = c + dc
      if (rr >= 0 && rr < size && cc >= 0 && cc < size) out.push(rr * size + cc)
    }
  }
  return out
}

function targetCells(state: RoundState, targetId: string): number[] {
  const { size } = state
  const sea = state.seas[targetId]!
  const free = (cell: number) => !sea.shots[String(cell)]
  const sunkCells = new Set(sea.sunk.flat())
  const open = Object.entries(sea.shots)
    .filter(([cell, mark]) => mark === 'hit' && !sunkCells.has(Number(cell)))
    .map(([cell]) => Number(cell))
    .sort((a, b) => a - b)
  if (open.length === 0) return []
  if (open.length >= 2) {
    const horizontal = open.every((cell) => Math.floor(cell / size) === Math.floor(open[0]! / size))
    const step = horizontal ? 1 : size
    const first = open[0]!
    const last = open.at(-1)!
    const ends = [first - step, last + step].filter((cell) => {
      if (cell < 0 || cell >= size * size) return false
      if (horizontal && Math.floor(cell / size) !== Math.floor(first / size)) return false
      return free(cell)
    })
    if (ends.length > 0) return ends
  }
  return open.flatMap((cell) => around(size, cell, false)).filter(free)
}

/** The next shot of a bot: the target and the cell. Null when nobody is left to shoot. */
export function botShot(
  state: RoundState,
  botId: string,
  level: BotLevel,
  random: () => number = Math.random,
): { targetId: string; cell: number } | null {
  const targets = state.seats.filter((id) => id !== botId && state.seas[id]?.alive)
  if (targets.length === 0) return null
  const { size } = state

  if (level !== 'easy') {
    for (const targetId of targets.slice().sort(() => random() - 0.5)) {
      const cells = targetCells(state, targetId)
      if (cells.length > 0) return { targetId, cell: pick(cells, random) }
    }
  }

  const targetId = pick(targets, random)
  const sea = state.seas[targetId]!
  const all = Array.from({ length: size * size }, (_, cell) => cell).filter(
    (cell) => !sea.shots[String(cell)],
  )
  if (level === 'easy') return { targetId, cell: pick(all, random) }
  const nearSunk = new Set(sea.sunk.flat().flatMap((cell) => around(size, cell, true)))
  const useful = all.filter((cell) => !nearSunk.has(cell))
  const checker = useful.filter((cell) => (Math.floor(cell / size) + (cell % size)) % 2 === 0)
  const pool = checker.length > 0 ? checker : useful.length > 0 ? useful : all
  return { targetId, cell: pick(pool, random) }
}
