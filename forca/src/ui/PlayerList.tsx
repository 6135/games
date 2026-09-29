/** The roster. Shows the score, the connection state, the master and the turn. */

import { ranking } from '../game/roomReducer'
import type { Player } from '../game/types'

type Props = {
  players: Player[]
  masterId: string | null
  turnPlayerId: string | null
  hostPlayerId: string
  meId: string
  sorted?: boolean
}

export function PlayerList({
  players,
  masterId,
  turnPlayerId,
  hostPlayerId,
  meId,
  sorted = true,
}: Props) {
  const rows = sorted ? ranking(players) : players
  return (
    <ul className="players">
      {rows.map((player) => (
        <li key={player.id} className={player.id === meId ? 'player player--me' : 'player'}>
          <span className={player.connected ? 'dot dot--on' : 'dot dot--off'} aria-hidden />
          <span className="player__name">{player.name}</span>
          {player.id === hostPlayerId && <span className="tag">anfitrião</span>}
          {player.id === masterId && <span className="tag tag--master">mestre</span>}
          {player.id === turnPlayerId && <span className="tag tag--turn">vez</span>}
          <span className="player__score">{player.score}</span>
        </li>
      ))}
    </ul>
  )
}
