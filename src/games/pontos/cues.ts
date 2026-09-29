/** Sound cues for pontos. Pure. */

import type { Cue } from '../../core/ui/sound'
import type { RoomState, RoundState } from './types'

export type Snapshot = { roster: RoomState | null; round: RoundState | null }

export function cuesFor(prev: Snapshot, next: Snapshot, meId: string): Cue[] {
  const cues: Cue[] = []
  if (prev.roster && next.roster) {
    if (next.roster.players.length > prev.roster.players.length) cues.push('join')
    if (next.roster.status === 'game_over' && prev.roster.status !== 'game_over') cues.push('over')
  }
  const was = prev.round
  const now = next.round
  if (!now) return cues
  if (!was || was.roundId !== now.roundId) {
    if (now.turnPlayerId === meId) cues.push('turn')
    return cues
  }
  if (now.outcome !== 'running' && was.outcome === 'running') {
    cues.push(now.winnerId === meId ? 'win' : 'lose')
    return cues
  }
  const closed = now.boxes.filter(Boolean).length > was.boxes.filter(Boolean).length
  if (now.moves.length > was.moves.length) cues.push(closed ? 'master' : 'hit')
  if (now.turnPlayerId === meId && was.turnPlayerId !== meId) cues.push('turn')
  return cues
}
