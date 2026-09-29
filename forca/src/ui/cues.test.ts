import { describe, expect, it } from 'vitest'
import { cuesFor, type Snapshot } from './cues'
import { createRoomState, roomReducer } from '../game/roomReducer'
import { createRound } from '../game/roundReducer'
import type { RoundState, Slot } from '../game/types'

const ME = 'me'

function roster(patch: Partial<ReturnType<typeof createRoomState>> = {}) {
  const base = createRoomState({ hostId: 'c-host', hostPlayerId: 'host', hostName: 'host' })
  return {
    ...roomReducer(base, { type: 'join', playerId: ME, name: 'eu' }),
    ...patch,
  }
}

function round(patch: Partial<RoundState> = {}): RoundState {
  return {
    ...createRound({
      roundId: 'r1',
      roundNumber: 1,
      masterId: 'other',
      src: 'c',
      category: 'animais',
      word: 'gato',
      maxLives: 6,
      livesRemaining: 6,
      turnPlayerId: 'other2',
    }),
    ...patch,
  }
}

function reveal(state: RoundState, count: number): RoundState {
  let left = count
  const slots = state.slots.map<Slot>((slot) => {
    if (slot.kind === 'letter' && left > 0) {
      left -= 1
      return { kind: 'letter', char: 'a' }
    }
    return slot
  })
  return { ...state, slots }
}

const empty: Snapshot = { roster: null, round: null }

describe('cues', () => {
  it('says nothing on the first snapshot', () => {
    expect(cuesFor(empty, { roster: roster(), round: null }, ME)).toEqual([])
  })

  it('sounds a revealed letter', () => {
    const before = round()
    expect(cuesFor({ roster: null, round: before }, { roster: null, round: reveal(before, 1) }, ME)).toEqual(['hit'])
  })

  it('sounds a lost life, and never a hit at the same time', () => {
    const before = round()
    const after = { ...reveal(before, 1), livesRemaining: 5 }
    expect(cuesFor({ roster: null, round: before }, { roster: null, round: after }, ME)).toEqual(['miss'])
  })

  it('sounds your turn once, not on every message', () => {
    const before = round({ turnPlayerId: 'other2' })
    const mine = { ...before, turnPlayerId: ME }
    expect(cuesFor({ roster: null, round: before }, { roster: null, round: mine }, ME)).toEqual(['turn'])
    expect(cuesFor({ roster: null, round: mine }, { roster: null, round: mine }, ME)).toEqual([])
  })

  it('sounds the turn when the round opens on you', () => {
    const opened = round({ turnPlayerId: ME })
    expect(cuesFor(empty, { roster: null, round: opened }, ME)).toEqual(['turn'])
  })

  it('sounds the end of the round, and not the guess that ended it', () => {
    const before = round({ turnPlayerId: ME })
    const won: RoundState = { ...reveal(before, 4), outcome: 'won', turnPlayerId: null }
    expect(cuesFor({ roster: null, round: before }, { roster: null, round: won }, ME)).toEqual(['win'])
    const lost: RoundState = { ...before, outcome: 'lost', livesRemaining: 0 }
    expect(cuesFor({ roster: null, round: before }, { roster: null, round: lost }, ME)).toEqual(['lose'])
  })

  it('says nothing again once the round is over', () => {
    const won = round({ outcome: 'won' })
    expect(cuesFor({ roster: null, round: won }, { roster: null, round: won }, ME)).toEqual([])
  })

  it('sounds a new player and the end of the game', () => {
    const before = roster()
    const joined = roomReducer(before, { type: 'join', playerId: 'x', name: 'x' })
    expect(cuesFor({ roster: before, round: null }, { roster: joined, round: null }, ME)).toEqual(['join'])
    const over = { ...before, status: 'game_over' as const }
    expect(cuesFor({ roster: before, round: null }, { roster: over, round: null }, ME)).toEqual(['over'])
  })

  it('sounds your own round once the host names you master', () => {
    const before = roster()
    const mine = { ...before, status: 'choosing' as const, masterId: ME }
    expect(cuesFor({ roster: before, round: null }, { roster: mine, round: null }, ME)).toEqual(['master'])
    expect(cuesFor({ roster: mine, round: null }, { roster: mine, round: null }, ME)).toEqual([])
    const other = { ...before, status: 'choosing' as const, masterId: 'someone' }
    expect(cuesFor({ roster: before, round: null }, { roster: other, round: null }, ME)).toEqual([])
  })

  it('ignores a stale round from an earlier round id', () => {
    const first = round({ roundId: 'r1' })
    const second = round({ roundId: 'r2', turnPlayerId: 'other2' })
    expect(cuesFor({ roster: null, round: first }, { roster: null, round: second }, ME)).toEqual([])
  })
})
