/** The pontos room: the board, the turn, the boxes of each player, and the host settings. */

import { RoomShell } from '../../core/ui/RoomShell'
import { PlayerList } from '../../core/ui/PlayerList'
import { HostPanel } from '../../core/ui/HostPanel'
import { BoardHistory } from '../../core/ui/BoardHistory'
import { gameClient, hostApi } from '../../core/session'
import { useGameStore, useRoster, useRound } from '../../core/store'
import { useCues } from '../../core/ui/useCues'
import { seatColor } from '../../core/ui/seats'
import { Board } from './Board'
import { cuesFor } from './cues'
import { boardSize, boxCounts, MAX_PLAYERS, MAX_SIZE, MIN_PLAYERS, MIN_SIZE } from './rules'
import type { PontosClient } from './client'
import type { RoomState, RoundState } from './types'

export default function PontosRoom() {
  const identity = useGameStore((state) => state.identity)
  const roster = useRoster<RoomState>()
  const stored = useRound<RoundState>()
  const link = useGameStore((state) => state.link)
  useCues(identity?.playerId ?? '', cuesFor)

  if (!identity || !roster) {
    return (
      <main className="screen">
        <p>A carregar a sala…</p>
      </main>
    )
  }

  const round =
    stored && stored.roundNumber === roster.roundNumber && roster.status !== 'lobby' ? stored : null
  const blocked = link !== 'online'
  const nameOf = (id: string | null) => roster.players.find((p) => p.id === id)?.name ?? null
  const myTurn = round?.outcome === 'running' && round.turnPlayerId === identity.playerId
  const counts = round ? boxCounts(round) : new Map<string, number>()
  const connected = roster.players.filter((p) => p.connected).length
  const size = boardSize(roster.config.size, Math.min(connected, MAX_PLAYERS))

  return (
    <RoomShell
      identity={identity}
      roster={roster}
      title="Pontos e Quadrados"
      lobbyHint="O tabuleiro cresce com o número de jogadores."
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
              game="pontos"
              roster={roster}
              blocked={blocked}
              minPlayers={MIN_PLAYERS}
              maxPlayers={MAX_PLAYERS}
              bots
            >
              <label className="row">
                Quadrados por lado
                <select
                  value={roster.config.size}
                  onChange={(event) => void hostApi()?.setConfig({ size: Number(event.target.value) })}
                >
                  <option value={0}>automático</option>
                  {Array.from({ length: MAX_SIZE - MIN_SIZE + 1 }, (_, i) => MIN_SIZE + i).map((n) => (
                    <option key={n} value={n}>
                      {n}×{n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="row">
                <input
                  type="checkbox"
                  checked={roster.config.onePassLimit}
                  onChange={(event) => void hostApi()?.setConfig({ onePassLimit: event.target.checked })}
                />
                Uma ronda por jogador
              </label>
              <p className="hint">
                Com {connected} jogador(es) o tabuleiro é {size}×{size}.
              </p>
            </HostPanel>
          )}
        </>
      }
    >
      {round && (
        <section className="card pontos-board">
          <p className="board__status" aria-live="polite">
            {round.outcome === 'won'
              ? `${nameOf(round.winnerId) ?? '—'} ganhou.`
              : round.outcome === 'draw'
                ? 'Empate.'
                : myTurn
                  ? 'É a sua vez.'
                  : `Vez de ${nameOf(round.turnPlayerId) ?? 'ninguém'}.`}
          </p>
          <Board
            round={round}
            players={roster.players}
            order={roster.order}
            canPlay={!blocked && myTurn && roster.status === 'playing'}
            onPlay={(line) => void gameClient<PontosClient>()?.play(line)}
          />
          <p className="hint">
            {roster.order
              .map((id) => `${nameOf(id) ?? '—'} ${counts.get(id) ?? 0}`)
              .join(' · ')}{' '}
            · quem fecha um quadrado joga outra vez
          </p>
        </section>
      )}
      {roster.status === 'round_end' && roster.lastRound?.voided && (
        <section className="card">
          <h2>Ronda anulada</h2>
        </section>
      )}
    </RoomShell>
  )
}
