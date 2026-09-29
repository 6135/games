/** The roster. Shows the score, the connection state, the roles and the turn. */

import { ranking } from '../roomRules'
import type { Player } from '../types'

type Props = {
  players: Player[]
  turnPlayerId: string | null
  hostPlayerId: string
  meId: string
  /** Forca: the round master of this round. */
  masterId?: string | null
  /** Galo: the colour of a player's symbol. */
  colorOf?: (playerId: string) => string
}

export function PlayerList({ players, turnPlayerId, hostPlayerId, meId, masterId, colorOf }: Props) {
  return (
    <ul className="players">
      {ranking(players).map((player) => (
        <li key={player.id} className={player.id === meId ? 'player player--me' : 'player'}>
          <span className={player.connected ? 'dot dot--on' : 'dot dot--off'} aria-hidden />
          {colorOf &&
            (player.symbol ? (
              <span className="player__symbol" style={{ color: colorOf(player.id) }}>
                {player.symbol}
              </span>
            ) : (
              // Pontos has no symbols: a swatch of the seat colour, empty before the order exists.
              <span className="player__swatch" style={{ background: colorOf(player.id) }} aria-hidden />
            ))}
          <span className="player__name">{player.name}</span>
          {player.id === hostPlayerId && <span className="tag">anfitrião</span>}
          {player.bot && <span className="tag tag--bot">bot</span>}
          {player.id === masterId && <span className="tag tag--master">mestre</span>}
          {player.id === turnPlayerId && <span className="tag tag--turn">vez</span>}
          <span className="player__score">{player.score}</span>
        </li>
      ))}
    </ul>
  )
}
