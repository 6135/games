/** The forca room: the board, the master desk, the round result, and the host settings. */

import { RoomShell } from '../../core/ui/RoomShell'
import { PlayerList } from '../../core/ui/PlayerList'
import { HostPanel } from '../../core/ui/HostPanel'
import { hostApi } from '../../core/session'
import { useGameStore, useRoster, useRound } from '../../core/store'
import { useCues } from '../../core/ui/useCues'
import { Board } from './Board'
import { History } from './History'
import { MasterPanel } from './MasterPanel'
import { cuesFor } from './cues'
import { MAX_PLAYERS } from './roomReducer'
import type { RoomState, RoundState } from './types'

export default function ForcaRoom() {
  const identity = useGameStore((state) => state.identity)
  const roster = useRoster<RoomState>()
  const round = useRound<RoundState>()
  const link = useGameStore((state) => state.link)

  // Hooks run before the early return, so the cues survive a slow first state.
  useCues(identity?.playerId ?? '', cuesFor)

  if (!identity || !roster) {
    return (
      <main className="screen">
        <p>A carregar a sala…</p>
      </main>
    )
  }

  const isMaster = roster.masterId === identity.playerId
  const blocked = link !== 'online'
  const masterName =
    roster.players.find((player) => player.id === roster.masterId)?.name ?? 'ninguém'
  const winnerName = roster.lastRound?.winnerId
    ? (roster.players.find((player) => player.id === roster.lastRound?.winnerId)?.name ?? null)
    : null
  const setConfig = (patch: Record<string, unknown>) => void hostApi()?.setConfig(patch)

  return (
    <RoomShell
      identity={identity}
      roster={roster}
      title="Forca"
      history={(onClose) => <History roster={roster} onClose={onClose} />}
      side={
        <>
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

          {identity.role === 'host' && (
            <HostPanel
              game="forca"
              roster={roster}
              blocked={blocked}
              minPlayers={2}
              maxPlayers={MAX_PLAYERS}
              bots={false}
            >
              <label className="row">
                Vidas
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={roster.config.maxLives}
                  onChange={(event) => setConfig({ maxLives: Number(event.target.value) })}
                />
              </label>
              <label className="row">
                <input
                  type="checkbox"
                  checked={roster.config.livesResetEachRound}
                  onChange={(event) => setConfig({ livesResetEachRound: event.target.checked })}
                />
                Repor as vidas em cada ronda
              </label>
              <label className="row">
                <input
                  type="checkbox"
                  checked={roster.config.onePassLimit}
                  onChange={(event) => setConfig({ onePassLimit: event.target.checked })}
                />
                Uma ronda por jogador
              </label>
            </HostPanel>
          )}
        </>
      }
    >
      {roster.status === 'choosing' && !isMaster && (
        <section className="card">
          <h2>{masterName} está a escolher a palavra</h2>
        </section>
      )}

      {(roster.status === 'playing' || roster.status === 'choosing') && round && (
        <Board round={round} />
      )}

      {roster.status === 'round_end' && (
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
    </RoomShell>
  )
}
