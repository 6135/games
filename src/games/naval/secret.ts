/** The fleet of the open round. Session storage only, so a reload recovers it. */

import type { Layout } from './types'

type Saved = { roundId: string; layout: Layout; salt: string }

export const fleetStore = {
  save(saved: Saved): void {
    sessionStorage.setItem('naval.fleet', JSON.stringify(saved))
  },
  load(roundId: string): Saved | null {
    try {
      const saved = JSON.parse(sessionStorage.getItem('naval.fleet') ?? 'null') as Saved | null
      return saved && saved.roundId === roundId ? saved : null
    } catch {
      return null
    }
  },
}
