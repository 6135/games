/**
 * Batalha Naval round rules. Pure. The host is the only writer of this state.
 *
 * Every player shoots in turn at any other player still afloat. The target
 * answers from its own device. The last fleet afloat wins.
 */

import { nextTurn } from '../../core/order'
import { FLEET, SIZE } from './fleet'
import type { RoundState, Sea } from './types'

export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6

export function createRound(args: {
  roundId: string
  roundNumber: number
  seats: string[]
  gone: readonly string[]
}): RoundState {
  const seas: Record<string, Sea> = {}
  for (const id of args.seats) {
    const left = args.gone.includes(id)
    seas[id] = { shots: {}, sunk: [], alive: !left, left }
  }
  return {
    v: 1,
    seq: 0,
    ts: 0,
    src: '',
    roundId: args.roundId,
    roundNumber: args.roundNumber,
    size: SIZE,
    fleet: FLEET.slice(),
    phase: 'placing',
    seats: args.seats,
    commits: {},
    seas,
    turnPlayerId: null,
    pending: null,
    shots: 0,
    outcome: 'running',
    winnerId: null,
    verdicts: {},
  }
}

function afloat(state: RoundState): string[] {
  return state.seats.filter((id) => state.seas[id]?.alive)
}

/** The next player afloat after `from`, in seat order. */
function nextAfloat(state: RoundState, from: string | null): string | null {
  const players = state.seats.map((id) => ({
    id,
    name: id,
    score: 0,
    connected: state.seas[id]?.alive === true,
  }))
  return nextTurn(state.seats, players, from)
}

/** Ends the round when at most one fleet is afloat. Only while shooting. */
function settle(state: RoundState): RoundState {
  if (state.phase !== 'firing') return state
  const alive = afloat(state)
  if (alive.length > 1) return state
  return {
    ...state,
    phase: 'done',
    pending: null,
    turnPlayerId: null,
    outcome: alive.length === 1 ? 'won' : 'draw',
    winnerId: alive[0] ?? null,
  }
}

/** A player commits to a fleet. When every player afloat is ready, the shooting starts. */
export function markReady(
  state: RoundState,
  playerId: string,
  commit: string,
  starterId: (alive: string[]) => string | null,
): RoundState {
  if (state.phase !== 'placing' || !state.seas[playerId]?.alive) return state
  if (state.commits[playerId] || !/^[0-9a-f]{64}$/.test(commit)) return state
  const next = { ...state, commits: { ...state.commits, [playerId]: commit } }
  return startIfReady(next, starterId)
}

function startIfReady(state: RoundState, starterId: (alive: string[]) => string | null): RoundState {
  if (state.phase !== 'placing') return state
  const alive = afloat(state)
  if (!alive.every((id) => state.commits[id])) return state
  const firing: RoundState = { ...state, phase: 'firing', turnPlayerId: starterId(alive) }
  return settle(firing)
}

export function checkShot(
  state: RoundState,
  shooterId: string,
  targetId: string,
  cell: number,
  expected: number,
): string | null {
  if (state.phase !== 'firing') return 'not_firing'
  if (state.pending) return 'pending'
  if (state.turnPlayerId !== shooterId) return 'not_your_turn'
  if (expected !== state.shots) return 'stale'
  if (targetId === shooterId || !state.seas[targetId]?.alive) return 'bad_target'
  if (!Number.isInteger(cell) || cell < 0 || cell >= state.size * state.size) return 'out_of_range'
  if (state.seas[targetId]!.shots[String(cell)]) return 'repeated'
  return null
}

export function shoot(
  state: RoundState,
  shooterId: string,
  targetId: string,
  cell: number,
  expected: number,
): RoundState {
  if (checkShot(state, shooterId, targetId, cell, expected) !== null) return state
  return {
    ...state,
    pending: { shotId: state.shots, shooterId, targetId, cell },
    shots: state.shots + 1,
  }
}

/**
 * The target's answer. The host checks what it can see now: a sunk ship must
 * hold the cell, be a fleet length, be straight, and every other cell of it
 * must be a hit already. A lie about a miss only shows at the reveal.
 */
export function answer(
  state: RoundState,
  playerId: string,
  shotId: number,
  result: 'miss' | 'hit' | 'sunk',
  ship?: number[],
): RoundState {
  const pending = state.pending
  if (!pending || pending.targetId !== playerId || pending.shotId !== shotId) return state
  const sea = state.seas[playerId]!
  if (result === 'sunk') {
    if (!ship || !ship.includes(pending.cell) || !state.fleet.includes(ship.length)) return state
    const sorted = ship.slice().sort((a, b) => a - b)
    const step = sorted.length > 1 ? sorted[1]! - sorted[0]! : 1
    if (step !== 1 && step !== state.size) return state
    for (let i = 1; i < sorted.length; i += 1) if (sorted[i]! - sorted[i - 1]! !== step) return state
    if (step === 1 && Math.floor(sorted[0]! / state.size) !== Math.floor(sorted.at(-1)! / state.size)) {
      return state
    }
    if (!ship.every((cell) => cell === pending.cell || sea.shots[String(cell)] === 'hit')) return state
  }
  const shots = { ...sea.shots, [String(pending.cell)]: (result === 'miss' ? 'miss' : 'hit') as 'miss' | 'hit' }
  const sunk = result === 'sunk' ? [...sea.sunk, ship!] : sea.sunk
  const alive = sunk.length < state.fleet.length
  const next: RoundState = {
    ...state,
    seas: { ...state.seas, [playerId]: { ...sea, shots, sunk, alive } },
    pending: null,
  }
  return settle({ ...next, turnPlayerId: nextAfloat(next, pending.shooterId) })
}

/** A player who left: out of the round. A shot waiting on them is dropped. */
export function eliminate(
  state: RoundState,
  playerId: string,
  starterId: (alive: string[]) => string | null,
): RoundState {
  const sea = state.seas[playerId]
  if (!sea || !sea.alive || state.phase === 'done') return state
  let next: RoundState = {
    ...state,
    seas: { ...state.seas, [playerId]: { ...sea, alive: false, left: true } },
  }
  if (next.pending && (next.pending.targetId === playerId || next.pending.shooterId === playerId)) {
    next = { ...next, pending: null, turnPlayerId: nextAfloat(next, next.pending.shooterId) }
  } else if (next.turnPlayerId === playerId) {
    next = { ...next, turnPlayerId: nextAfloat(next, playerId) }
  }
  return next.phase === 'placing' ? startIfReady(next, starterId) : settle(next)
}

export function withVerdict(state: RoundState, playerId: string, verdict: RoundState['verdicts'][string]): RoundState {
  if (state.verdicts[playerId] === verdict) return state
  return { ...state, verdicts: { ...state.verdicts, [playerId]: verdict } }
}
