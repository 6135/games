/** Sound cues for naval. Pure. */

import type { Cue } from '../../core/ui/sound'
import type { RoomState, RoundState } from './types'

export type Snapshot = { roster: RoomState | null; round: RoundState | null }

function marks(round: RoundState, mark: 'hit' | 'miss'): number {
  return Object.values(round.seas).reduce(
    (sum, sea) => sum + Object.values(sea.shots).filter((m) => m === mark).length,
    0,
  )
}

export function cuesFor(prev: Snapshot, next: Snapshot, meId: string): Cue[] {
  const cues: Cue[] = []
  if (prev.roster && next.roster) {
    if (next.roster.players.length > prev.roster.players.length) cues.push('join')
    if (next.roster.status === 'game_over' && prev.roster.status !== 'game_over') cues.push('over')
  }
  const was = prev.round
  const now = next.round
  if (!now || !was || was.roundId !== now.roundId) return cues
  if (now.phase === 'done' && was.phase !== 'done') {
    cues.push(now.winnerId === meId ? 'win' : 'lose')
    return cues
  }
  const sunkNow = Object.values(now.seas).reduce((sum, sea) => sum + sea.sunk.length, 0)
  const sunkWas = Object.values(was.seas).reduce((sum, sea) => sum + sea.sunk.length, 0)
  if (sunkNow > sunkWas) cues.push('master')
  else if (marks(now, 'hit') > marks(was, 'hit')) cues.push('hit')
  else if (marks(now, 'miss') > marks(was, 'miss')) cues.push('miss')
  if (now.turnPlayerId === meId && was.turnPlayerId !== meId) cues.push('turn')
  return cues
}
