/** The naval room: place the fleet, then shoot at the other seas. */

import { useEffect, useState } from 'react'
import { RoomShell } from '../../core/ui/RoomShell'
import { PlayerList } from '../../core/ui/PlayerList'
import { HostPanel } from '../../core/ui/HostPanel'
import { BoardHistory } from '../../core/ui/BoardHistory'
import { gameClient, hostApi } from '../../core/session'
import { useGameStore, useRoster, useRound } from '../../core/store'
import { useCues } from '../../core/ui/useCues'
import { randomLayout } from './fleet'
import { MAX_PLAYERS, MIN_PLAYERS } from './rules'
import { Sea } from './Sea'
import { cuesFor } from './cues'
import type { NavalClient } from './client'
import type { Layout, RoomState, RoundState } from './types'

const VERDICT: Record<string, string> = {
  ok: 'respostas certas',
  cheat: 'mentiu numa resposta',
  missing: 'não revelou a frota',
}

export default function NavalRoom() {
  const identity = useGameStore((state) => state.identity)
  const roster = useRoster<RoomState>()
  const stored = useRound<RoundState>()
  const link = useGameStore((state) => state.link)
  const [draft, setDraft] = useState<Layout>(() => randomLayout())
  useCues(identity?.playerId ?? '', cuesFor)

  const roundId = stored?.roundId
  // A new round starts with a new random fleet.
  useEffect(() => setDraft(randomLayout()), [roundId])

  if (!identity || !roster) {
    return (
      <main className="screen">
        <p>A carregar a sala…</p>
      </main>
    )
  }

  const client = gameClient<NavalClient>()
  const round =
    stored && stored.roundNumber === roster.roundNumber && roster.status !== 'lobby' ? stored : null
  const me = identity.playerId
  const blocked = link !== 'online'
  const nameOf = (id: string | null) => roster.players.find((p) => p.id === id)?.name ?? '—'
  const seated = round?.seats.includes(me) ?? false
  const committed = round ? Boolean(round.commits[me]) : false
  const myFleet = round && committed ? (client?.fleet(round.roundId) ?? null) : null
  const myTurn = round?.phase === 'firing' && round.turnPlayerId === me && !round.pending
  const others = round ? round.seats.filter((id) => id !== me) : []

  let status = ''
  if (round?.phase === 'placing') {
    const waiting = round.seats.filter((id) => round.seas[id]?.alive && !round.commits[id])
    status = `À espera das frotas de: ${waiting.map(nameOf).join(', ')}.`
  } else if (round?.phase === 'firing') {
    status = round.pending
      ? `${nameOf(round.pending.shooterId)} disparou sobre ${nameOf(round.pending.targetId)}…`
      : myTurn
        ? 'É a sua vez: escolha um mar e dispare.'
        : `Vez de ${nameOf(round.turnPlayerId)}.`
  } else if (round?.phase === 'done') {
    status = round.winnerId ? `${nameOf(round.winnerId)} ganhou.` : 'Ninguém ficou a flutuar.'
  }

  return (
    <RoomShell
      identity={identity}
      roster={roster}
      title="Batalha Naval"
      lobbyHint="Cada frota fica no dispositivo do seu dono. No fim, as respostas são verificadas."
      history={(onClose) => <BoardHistory history={roster.history} onClose={onClose} />}
      side={
        <>
          <PlayerList
            players={roster.players}
            turnPlayerId={round?.phase === 'firing' ? round.turnPlayerId : null}
            hostPlayerId={roster.hostPlayerId}
            meId={me}
          />
          {identity.role === 'host' && (
            <HostPanel
              game="naval"
              roster={roster}
              blocked={blocked}
              minPlayers={MIN_PLAYERS}
              maxPlayers={MAX_PLAYERS}
              bots
            >
              <label className="row">
                <input
                  type="checkbox"
                  checked={roster.config.onePassLimit}
                  onChange={(event) => void hostApi()?.setConfig({ onePassLimit: event.target.checked })}
                />
                Uma ronda por jogador
              </label>
              <p className="hint">Mar 10×10. Frota: 5, 4, 3, 3 e 2. Os navios não se tocam.</p>
            </HostPanel>
          )}
        </>
      }
    >
      {round && (
        <section className="card naval">
          <p className="board__status" aria-live="polite">
            {status}
          </p>

          {round.phase === 'placing' && seated && !committed && round.seas[me]?.alive && (
            <div className="naval__placing">
              <Sea size={round.size} ships={draft} label="A sua frota" />
              <div className="actions">
                <button type="button" onClick={() => setDraft(randomLayout())}>
                  Baralhar
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={blocked}
                  onClick={() => void client?.ready(draft)}
                >
                  Pronto
                </button>
              </div>
              <p className="hint">
                A frota fica neste dispositivo. Só um resumo cifrado (SHA-256) sai agora.
              </p>
            </div>
          )}

          {round.phase !== 'placing' && (
            <div className="naval__seas">
              {seated && (
                <div className="naval__sea">
                  <h3>O seu mar{round.seas[me]?.alive ? '' : ' (afundado)'}</h3>
                  <Sea
                    size={round.size}
                    sea={round.seas[me]}
                    ships={myFleet}
                    pendingCell={round.pending?.targetId === me ? round.pending.cell : null}
                    label="O seu mar"
                  />
                </div>
              )}
              {others.map((id) => {
                const sea = round.seas[id]
                return (
                  <div key={id} className="naval__sea">
                    <h3>
                      {nameOf(id)}
                      {sea?.left ? ' (saiu)' : sea?.alive ? '' : ' (afundado)'} · {sea?.sunk.length ?? 0}/
                      {round.fleet.length}
                    </h3>
                    <Sea
                      size={round.size}
                      sea={sea}
                      small={others.length > 2}
                      pendingCell={round.pending?.targetId === id ? round.pending.cell : null}
                      label={`Mar de ${nameOf(id)}`}
                      canShoot={!blocked && myTurn && sea?.alive === true}
                      onShoot={(cell) => void client?.shoot(id, cell)}
                    />
                  </div>
                )
              })}
            </div>
          )}

          {round.phase === 'done' && Object.keys(round.verdicts).length > 0 && (
            <ul className="naval__verdicts">
              {round.seats
                .filter((id) => round.verdicts[id])
                .map((id) => (
                  <li key={id} className={round.verdicts[id] === 'ok' ? '' : 'error'}>
                    {nameOf(id)}: {VERDICT[round.verdicts[id]!]}
                  </li>
                ))}
            </ul>
          )}
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
