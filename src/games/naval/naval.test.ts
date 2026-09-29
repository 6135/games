import { describe, expect, it } from 'vitest'
import { answerFor, commitOf, FLEET, randomLayout, validLayout, verify } from './fleet'
import { answer, createRound, markReady, shoot } from './rules'
import type { Layout } from './types'

const starter = (alive: string[]) => alive[0] ?? null

describe('the fleet', () => {
  it('places a valid fleet every time', () => {
    for (let i = 0; i < 50; i += 1) expect(validLayout(randomLayout())).toBe(true)
  })

  it('refuses ships that touch', () => {
    const touching: Layout = [[0, 1, 2, 3, 4], [10, 11, 12, 13], [30, 31, 32], [50, 51, 52], [70, 71]]
    expect(validLayout(touching)).toBe(false)
  })

  it('catches a false miss at the reveal', async () => {
    const layout = randomLayout()
    const commit = await commitOf(layout, 'salt')
    const cell = layout[0]![0]!
    const honest = { shots: { [String(cell)]: 'hit' as const }, sunk: [], alive: true, left: false }
    const liar = { shots: { [String(cell)]: 'miss' as const }, sunk: [], alive: true, left: false }
    expect(await verify(layout, 'salt', commit, honest)).toBe('ok')
    expect(await verify(layout, 'salt', commit, liar)).toBe('cheat')
    expect(await verify(randomLayout(), 'salt', commit, honest)).toBe('cheat')
  })
})

describe('a round', () => {
  it('starts when both are ready and ends when a fleet sinks', async () => {
    const fleets: Record<string, Layout> = { a: randomLayout(), b: randomLayout() }
    let state = createRound({ roundId: 'r', roundNumber: 1, seats: ['a', 'b'], gone: [] })
    state = markReady(state, 'a', await commitOf(fleets.a!, 's'), starter)
    expect(state.phase).toBe('placing')
    state = markReady(state, 'b', await commitOf(fleets.b!, 's'), starter)
    expect(state.phase).toBe('firing')
    expect(state.turnPlayerId).toBe('a')

    // a shoots every cell of b's fleet; b wastes each turn on a miss-or-hit at a.
    const targets = fleets.b!.flat()
    let bCell = 0
    while (state.phase === 'firing') {
      const shooter = state.turnPlayerId!
      const target = shooter === 'a' ? 'b' : 'a'
      let cell: number
      if (shooter === 'a') cell = targets.find((c) => !state.seas.b!.shots[String(c)])!
      else {
        while (state.seas.a!.shots[String(bCell)]) bCell += 1
        cell = bCell
      }
      state = shoot(state, shooter, target, cell, state.shots)
      const reply = answerFor(fleets[target]!, state.seas[target]!.shots, cell)
      state = answer(state, target, state.pending!.shotId, reply.result, reply.ship)
    }
    expect(state.phase).toBe('done')
    expect(state.winnerId).toBe('a')
    expect(state.seas.b!.sunk).toHaveLength(FLEET.length)
    expect(await verify(fleets.b!, 's', state.commits.b, state.seas.b!)).toBe('ok')
  })
})
