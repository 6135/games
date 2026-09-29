/** Frozen turn order, master rotation and guess turn rotation. */

import type { Player } from './types'

/** Fisher-Yates. Every index comes from crypto.getRandomValues. */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomBelow(i + 1)
    const a = out[i]!
    const b = out[j]!
    out[i] = b
    out[j] = a
  }
  return out
}

/** Uniform integer in [0, bound). Rejection sampling removes the modulo bias. */
export function randomBelow(bound: number): number {
  if (bound <= 1) return 0
  const limit = Math.floor(0xffffffff / bound) * bound
  const buffer = new Uint32Array(1)
  let value = 0
  do {
    crypto.getRandomValues(buffer)
    value = buffer[0]!
  } while (value >= limit)
  return value % bound
}

function isConnected(players: readonly Player[], id: string): boolean {
  return players.some((player) => player.id === id && player.connected)
}

/**
 * The master of round `roundNumber`. Starts at `order[(roundNumber - 1) % n]`
 * and steps forward over any player that is not connected.
 */
export function masterForRound(
  order: readonly string[],
  players: readonly Player[],
  roundNumber: number,
): string | null {
  if (order.length === 0 || roundNumber < 1) return null
  const start = (roundNumber - 1) % order.length
  for (let step = 0; step < order.length; step += 1) {
    const id = order[(start + step) % order.length]!
    if (isConnected(players, id)) return id
  }
  return null
}

/**
 * The next player that may guess. Skips the round master and any player that
 * is not connected. Returns null when nobody can guess.
 */
export function nextTurn(
  order: readonly string[],
  players: readonly Player[],
  masterId: string,
  currentTurnId: string | null,
): string | null {
  if (order.length === 0) return null
  const currentIndex = currentTurnId === null ? -1 : order.indexOf(currentTurnId)
  for (let step = 1; step <= order.length; step += 1) {
    const id = order[(currentIndex + step + order.length) % order.length]!
    if (id !== masterId && isConnected(players, id)) return id
  }
  return null
}
