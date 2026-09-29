/** The galo room: the grid, the turn, the result, and the host settings. */

import { RoomShell } from '../../core/ui/RoomShell'
import { PlayerList } from '../../core/ui/PlayerList'
import { HostPanel } from '../../core/ui/HostPanel'
import { BoardHistory } from '../../core/ui/BoardHistory'
import { gameClient, hostApi } from '../../core/session'
import { useGameStore, useRoster, useRound } from '../../core/store'
import { useCues } from '../../core/ui/useCues'
import { Grid } from './Grid'
import { cuesFor } from './cues'
import { seatColor } from '../../core/ui/seats'
import { gridSize, MAX_PLAYERS, MIN_PLAYERS } from './rules'
import { effectiveWinLength, MAX_WIN_LENGTH, MIN_WIN_LENGTH } from './roundReducer'
import type { GaloClient } from './client'
import type { RoomState, RoundState } from './types'

export default function GaloRoom() {
  const identity = useGameStore((state) => state.identity)
  const roster = useRoster<RoomState>()
  const storedRound = useRound<RoundState>()
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

  // A board from another round number is stale and never renders.
  const round =
    storedRound && storedRound.roundNumber === roster.roundNumber && roster.status !== 'lobby'
      ? storedRound
      : null
  const blocked = link !== 'online'
  const nameOf = (id: string | null) =>
    roster.players.find((player) => player.id === id)?.name ?? null
  const seated = roster.order.includes(identity.playerId)
  const turnName = nameOf(round?.turnPlayerId ?? null)
  const myTurn = round?.outcome === 'running' && round.turnPlayerId === identity.playerId
  const connected = roster.players.filter((player) => player.connected).length
  const size = gridSize(Math.min(connected, MAX_PLAYERS))
  const winLength = effectiveWinLength(roster.config.winLength, size)

  return (
    <RoomShell
      identity={identity}
      roster={roster}
      title="Galo"
      lobbyHint="A grelha cresce com o número de jogadores."
      history={(onClose) => <BoardHistory history={roster.history} onClose={onClose} />}
      side={
        <>
          <PlayerList
            players={roster.players}
            turnPlayerId={round?.outcome === 'running' ? round.turnPlayerId : null}
            hostPlayerId={roster.hostPlayerId}
            meId={identity.playerId}
            colorOf={(id) => seatColor(roster.order.indexOf(id))}
          />
          {identity.role === 'host' && (
            <HostPanel
              game="galo"
              roster={roster}
              blocked={blocked}
              minPlayers={MIN_PLAYERS}
              maxPlayers={MAX_PLAYERS}
              bots
            >
              <label className="row">
                Em linha para ganhar
                <input
                  type="number"
                  min={MIN_WIN_LENGTH}
                  max={MAX_WIN_LENGTH}
                  value={roster.config.winLength}
                  onChange={(event) =>
                    void hostSetConfig({ winLength: Number(event.target.value) })
                  }
                />
              </label>
              <label className="row">
                <input
                  type="checkbox"
                  checked={roster.config.onePassLimit}
                  onChange={(event) => void hostSetConfig({ onePassLimit: event.target.checked })}
                />
                Uma ronda por jogador
              </label>
              <p className="hint">
                Com {connected} jogador(es) a grelha é {size}×{size} e ganha quem fizer {winLength}{' '}
                em linha.
              </p>
            </HostPanel>
          )}
        </>
      }
    >
      {round && (
        <section className="card galo-board">
          <p className="board__status" aria-live="polite">
            {round.outcome === 'won'
              ? `${nameOf(round.winnerId) ?? '—'} ganhou.`
              : round.outcome === 'draw'
                ? 'Empate.'
                : myTurn
                  ? 'É a sua vez.'
                  : `Vez de ${turnName ?? 'ninguém'}.`}
          </p>
          <Grid
            round={round}
            players={roster.players}
            order={roster.order}
            meId={identity.playerId}
            canPlay={!blocked && seated && roster.status === 'playing'}
            onPlay={(cell) => void gameClient<GaloClient>()?.play(cell)}
          />
          <p className="hint">
            {round.size}×{round.size} · {round.winLength} em linha para ganhar ·{' '}
            {round.moves.length} jogada(s)
            {!seated && ' · está a assistir'}
          </p>
        </section>
      )}

      {roster.status === 'round_end' && roster.lastRound?.voided && (
        <section className="card">
          <h2>Ronda anulada</h2>
          <p>Ninguém marcou.</p>
        </section>
      )}
    </RoomShell>
  )
}

function hostSetConfig(patch: Record<string, unknown>): Promise<void> | undefined {
  return hostApi()?.setConfig(patch)
}
