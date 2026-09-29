/** The room. One screen for every status and every role. */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Banner } from '../ui/Banner'
import { Board } from '../ui/Board'
import { History } from '../ui/History'
import { PlayerList } from '../ui/PlayerList'
import { HostPanel } from '../roles/host/HostPanel'
import { MasterPanel } from '../roles/master/MasterPanel'
import { leaveRoom } from '../roles/roomSession'
import { useGameStore } from '../store/gameStore'
import { ranking } from '../game/roomReducer'
import { useCues } from '../ui/useCues'
import { isMuted, play, setMuted } from '../ui/sound'

function shareLink(roomName: string): string {
  const base = `${location.origin}${location.pathname}`
  return `${base}#/?room=${encodeURIComponent(roomName)}`
}

export function Room() {
  const navigate = useNavigate()
  const identity = useGameStore((state) => state.identity)
  const roster = useGameStore((state) => state.roster)
  const round = useGameStore((state) => state.round)
  const link = useGameStore((state) => state.link)
  const notice = useGameStore((state) => state.notice)
  const [quiet, setQuiet] = useState(isMuted())
  const [showHistory, setShowHistory] = useState(false)

  // Hooks run before the early return, so the cues survive a slow first state.
  useCues(identity?.playerId ?? '')

  function toggleSound(): void {
    const next = !quiet
    setQuiet(next)
    setMuted(next)
    // The click is the gesture that lets the browser open the audio context.
    if (!next) play('hit')
  }

  if (!identity || !roster) {
    return (
      <main className="screen">
        <p>A carregar a sala…</p>
      </main>
    )
  }

  const isHost = identity.role === 'host'
  const isMaster = roster.masterId === identity.playerId
  const blocked = link !== 'online'
  const masterName =
    roster.players.find((player) => player.id === roster.masterId)?.name ?? 'ninguém'
  const winnerName = roster.lastRound?.winnerId
    ? (roster.players.find((player) => player.id === roster.lastRound?.winnerId)?.name ?? null)
    : null

  async function leave(): Promise<void> {
    await leaveRoom()
    navigate('/')
  }

  return (
    <main className="screen screen--room">
      <header className="room__head">
        <div>
          <h1>{identity.roomName}</h1>
          <p className="hint">
            Ronda {roster.roundNumber} · {roster.status}
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
          {showHistory && <History roster={roster} onClose={() => setShowHistory(false)} />}

          {!showHistory && roster.status === 'lobby' && (
            <section className="card">
              <h2>À espera de jogadores</h2>
              <p className="hint">
                Partilhe o nome da sala e a chave. O link leva o nome, nunca a chave.
              </p>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(shareLink(identity.roomName))}
              >
                Copiar o link
              </button>
            </section>
          )}

          {!showHistory && roster.status === 'choosing' && !isMaster && (
            <section className="card">
              <h2>{masterName} está a escolher a palavra</h2>
            </section>
          )}

          {!showHistory &&
            (roster.status === 'playing' || (roster.status === 'choosing' && round)) &&
            round && <Board round={round} />}

          {!showHistory && roster.status === 'round_end' && (
            <section className="card">
              <h2>Fim da ronda</h2>
              {roster.lastRound?.voided ? (
                <p>A ronda foi anulada. O mestre perdeu a ligação.</p>
              ) : (
                <>
                  <p className="reveal">
                    A palavra era <strong>{roster.lastRound?.word}</strong>
                  </p>
                  <p>{winnerName ? `${winnerName} marcou um ponto.` : 'Ninguém marcou.'}</p>
                </>
              )}
            </section>
          )}

          {!showHistory && roster.status === 'game_over' && (
            <section className="card">
              <h2>Fim do jogo</h2>
              <ol className="ranking">
                {ranking(roster.players).map((player) => (
                  <li key={player.id}>
                    <span>{player.name}</span>
                    <strong>{player.score}</strong>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <aside className="room__side">
          <PlayerList
            players={roster.players}
            masterId={roster.masterId}
            turnPlayerId={round?.turnPlayerId ?? null}
            hostPlayerId={roster.hostPlayerId}
            meId={identity.playerId}
          />

          {isMaster && (roster.status === 'choosing' || roster.status === 'playing') && (
            <MasterPanel roster={roster} round={round} blocked={blocked} />
          )}

          {isHost && <HostPanel roster={roster} blocked={blocked} />}
        </aside>
      </div>
    </main>
  )
}
