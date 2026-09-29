/** Plays the cues that a state change asks for. */

import { useEffect, useRef } from 'react'
import { useGameStore } from '../store'
import { play, type Cue } from './sound'

/** The part of the store that a game turns into cues. Each game gives it its own types. */
export type Snapshot = { roster: unknown; round: unknown }

/** A second cue waits, so two cues never land on the same instant. */
const SPACING_MS = 180

export function useCues<S extends Snapshot>(
  meId: string,
  cuesFor: (prev: S, next: S, meId: string) => Cue[],
): void {
  const me = useRef(meId)
  me.current = meId
  const rules = useRef(cuesFor)
  rules.current = cuesFor

  useEffect(() => {
    let previous = {
      roster: useGameStore.getState().roster,
      round: useGameStore.getState().round,
    } as S
    const timers: ReturnType<typeof setTimeout>[] = []

    const stop = useGameStore.subscribe((state) => {
      const next = { roster: state.roster, round: state.round } as S
      if (next.roster === previous.roster && next.round === previous.round) return
      const cues = rules.current(previous, next, me.current)
      previous = next
      cues.forEach((cue, index) => {
        if (index === 0) play(cue)
        else timers.push(setTimeout(() => play(cue), index * SPACING_MS))
      })
    })

    return () => {
      stop()
      for (const timer of timers) clearTimeout(timer)
    }
  }, [])
}
