/**
 * The fleet: placement, answers and the end-of-round check. Pure, apart from
 * the SHA-256 digest, which WebCrypto gives on every device.
 *
 * Rule: ships are straight and never touch, not even at a corner.
 */

import type { Layout, Sea } from './types'

export const SIZE = 10
export const FLEET = [5, 4, 3, 3, 2]

function neighbours(size: number, cell: number): number[] {
  const r = Math.floor(cell / size)
  const c = cell % size
  const out: number[] = []
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue
      const rr = r + dr
      const cc = c + dc
      if (rr >= 0 && rr < size && cc >= 0 && cc < size) out.push(rr * size + cc)
    }
  }
  return out
}

/** The cells a ship of this length takes from `start`, or null when it leaves the sea. */
export function shipCells(size: number, start: number, length: number, vertical: boolean): number[] | null {
  const r = Math.floor(start / size)
  const c = start % size
  if (vertical ? r + length > size : c + length > size) return null
  return Array.from({ length }, (_, i) => (vertical ? start + i * size : start + i))
}

export function randomLayout(
  size = SIZE,
  fleet: readonly number[] = FLEET,
  random: () => number = Math.random,
): Layout {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const blocked = new Set<number>()
    const layout: Layout = []
    let ok = true
    for (const length of fleet) {
      let placed = false
      for (let tries = 0; tries < 200 && !placed; tries += 1) {
        const cells = shipCells(size, Math.floor(random() * size * size), length, random() < 0.5)
        if (!cells || cells.some((cell) => blocked.has(cell))) continue
        layout.push(cells)
        for (const cell of cells) {
          blocked.add(cell)
          for (const near of neighbours(size, cell)) blocked.add(near)
        }
        placed = true
      }
      if (!placed) {
        ok = false
        break
      }
    }
    if (ok) return layout
  }
  throw new Error('no layout fits')
}

/** True when a new ship on `cells` would not overlap or touch any ship already in `layout`. */
export function canPlace(layout: Layout, cells: readonly number[] | null, size = SIZE): boolean {
  if (!cells || cells.length === 0) return false
  if (cells.some((cell) => !Number.isInteger(cell) || cell < 0 || cell >= size * size)) return false
  const taken = new Set(layout.flat())
  return cells.every((cell) => !taken.has(cell) && !neighbours(size, cell).some((near) => taken.has(near)))
}

/** True when the layout is the fleet, straight, inside the sea, with no ship touching another. */
export function validLayout(layout: Layout, size = SIZE, fleet: readonly number[] = FLEET): boolean {
  if (!Array.isArray(layout) || layout.length !== fleet.length) return false
  const lengths = layout.map((ship) => (Array.isArray(ship) ? ship.length : -1)).sort()
  if (lengths.join() !== fleet.slice().sort().join()) return false
  const owner = new Map<number, number>()
  for (const [index, ship] of layout.entries()) {
    const cells = ship.slice().sort((a, b) => a - b)
    if (cells.some((cell) => !Number.isInteger(cell) || cell < 0 || cell >= size * size)) return false
    const vertical = cells.length > 1 && cells[1]! - cells[0]! === size
    const expected = shipCells(size, cells[0]!, cells.length, vertical)
    if (!expected || expected.join() !== cells.join()) return false
    for (const cell of cells) {
      if (owner.has(cell)) return false
      owner.set(cell, index)
    }
  }
  for (const [cell, index] of owner) {
    for (const near of neighbours(size, cell)) {
      const other = owner.get(near)
      if (other !== undefined && other !== index) return false
    }
  }
  return true
}

/** The true answer to a shot at `cell`, given the marks already on this sea. */
export function answerFor(
  layout: Layout,
  shots: Record<string, string>,
  cell: number,
): { result: 'miss' | 'hit' | 'sunk'; ship?: number[] } {
  const ship = layout.find((cells) => cells.includes(cell))
  if (!ship) return { result: 'miss' }
  const sunk = ship.every((part) => part === cell || shots[String(part)] === 'hit')
  return sunk ? { result: 'sunk', ship } : { result: 'hit' }
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function newSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** The commitment: nobody can read the fleet from it, and nobody can change the fleet after it. */
export function commitOf(layout: Layout, salt: string): Promise<string> {
  return sha256(JSON.stringify({ layout, salt }))
}

const key = (ship: readonly number[]) => ship.slice().sort((a, b) => a - b).join()

/**
 * Checks a revealed fleet against the commitment and against every answer
 * the owner gave. Any lie shows up here: a false miss, a false hit, a sunk
 * ship that was not sunk, or a sunk ship that was never declared.
 */
export async function verify(
  layout: Layout,
  salt: string,
  commit: string | undefined,
  sea: Sea,
  size = SIZE,
  fleet: readonly number[] = FLEET,
): Promise<'ok' | 'cheat'> {
  if (!commit || (await commitOf(layout, salt)) !== commit) return 'cheat'
  if (!validLayout(layout, size, fleet)) return 'cheat'
  const shipCellsSet = new Set(layout.flat())
  for (const [cell, mark] of Object.entries(sea.shots)) {
    if ((mark === 'hit') !== shipCellsSet.has(Number(cell))) return 'cheat'
  }
  const fullyHit = layout.filter((ship) => ship.every((cell) => sea.shots[String(cell)] === 'hit'))
  const declared = new Set(sea.sunk.map(key))
  if (fullyHit.length !== declared.size) return 'cheat'
  return fullyHit.every((ship) => declared.has(key(ship))) ? 'ok' : 'cheat'
}
