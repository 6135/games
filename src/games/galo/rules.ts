/** Galo seats: one symbol per seat, and a grid that grows with the players. */

/** One symbol per seat in the frozen order. The length caps the room size. */
export const SYMBOLS = ['X', 'O', '△', '□', '★', '◆', '♣', '♥', '☀', '♠', '☾', '✚'] as const
export const MAX_PLAYERS = SYMBOLS.length
export const MIN_PLAYERS = 2

/** Two players play on 3x3. Each extra player adds one row and one column. */
export function gridSize(playerCount: number): number {
  return Math.max(3, playerCount + 1)
}
