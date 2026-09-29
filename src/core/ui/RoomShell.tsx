/**
 * The frame of every room screen: the header, the sound switch, the exit,
 * the connection banner, the history switch, the lobby card and the final
 * ranking. A game fills the main column and the side column.
 */

import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Banner } from './Banner'
import { leaveRoom } from '../session'
import { useGameStore, type Identity } from '../store'
import { ranking } from '../roomRules'
import { isMuted, play, setMuted } from './sound'
import type { CoreRoom } from '../types'

const STATUS: Record<string, string> = {
  lobby: 'átrio',
  choosing: 'a escolher',
  playing: 'a jogar',
  round_end: 'fim da ronda',
  game_over: 'fim do jogo',
}

export function shareLink(identity: Identity): string {
  const base = `${location.origin}${location.pathname}`
  return `${base}#/?game=${identity.game}&room=${encodeURIComponent(identity.roomName)}`
}

type Props = {
  identity: Identity
  roster: CoreRoom
  title: string
  /** The history screen, with a close action. */
  history: (onClose: () => void) => ReactNode
  /** The game view for every status but the lobby and the end of the game. */
  children: ReactNode
  /** The player list and the panels. */
  side: ReactNode
  lobbyHint?: string
}

export function RoomShell({ identity, roster, title, history, children, side, lobbyHint }: Props) {
  const navigate = useNavigate()
  const link = useGameStore((state) => state.link)
  const notice = useGameStore((state) => state.notice)
  const [quiet, setQuiet] = useState(isMuted())
  const [showHistory, setShowHistory] = useState(false)
  const isHost = identity.role === 'host'

  function toggleSound(): void {
    const next = !quiet
    setQuiet(next)
    setMuted(next)
    // The click is the gesture that lets the browser open the audio context.
    if (!next) play('hit')
  }

  async function leave(): Promise<void> {
    await leaveRoom()
    navigate('/')
  }

  return (
    <main className="screen screen--room">
      <header className="room__head">
        <div>
          <p className="eyebrow">{title}</p>
          <h1>{identity.roomName}</h1>
          <p className="hint">
            Ronda {roster.roundNumber} · {STATUS[roster.status] ?? roster.status}
          </p>
        </div>
        <div className="actions">
          <button type="button" onClick={() => setShowHistory(!showHistory)}>
            Histórico{roster.history.length > 0 ? ` (${roster.history.length})` : ''}
          </button>
          <button
            type="button"
            className="icon"
            aria-label={quiet ? 'Ligar o som' : 'Desligar o som'}
            title={quiet ? 'Ligar o som' : 'Desligar o som'}
            onClick={toggleSound}
          >
            {quiet ? '🔇' : '🔊'}
          </button>
          <button type="button" onClick={() => void leave()}>
            {isHost ? 'Fechar a sala' : 'Sair'}
          </button>
        </div>
      </header>

      <Banner status={link} />
      {notice && <p className="notice">{notice}</p>}

      <div className="room__grid">
        <div className="room__main">
          {showHistory && history(() => setShowHistory(false))}

          {!showHistory && roster.status === 'lobby' && (
            <section className="card">
              <h2>À espera de jogadores</h2>
              <p className="hint">
                Partilhe o nome da sala e a chave. O link leva o jogo e o nome, nunca a chave.
                {lobbyHint ? ` ${lobbyHint}` : ''}
              </p>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(shareLink(identity))}
              >
                Copiar o link
              </button>
            </section>
          )}

          {!showHistory && roster.status !== 'lobby' && children}

          {!showHistory && roster.status === 'game_over' && (
            <section className="card">
              <h2>Fim do jogo</h2>
              <ol className="ranking">
                {ranking(roster.players).map((player) => (
                  <li key={player.id}>
                    <span>
                      {player.symbol ? `${player.symbol} ` : ''}
                      {player.name}
                    </span>
                    <strong>{player.score}</strong>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <aside className="room__side">{side}</aside>
      </div>
    </main>
  )
}
