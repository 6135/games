/** The naval room: place the fleet, then shoot at the other seas. */

import { useEffect, useState } from 'react'
import { RoomShell } from '../../core/ui/RoomShell'
import { PlayerList } from '../../core/ui/PlayerList'
import { HostPanel } from '../../core/ui/HostPanel'
import { BoardHistory } from '../../core/ui/BoardHistory'
import { gameClient, hostApi } from '../../core/session'
import { useGameStore, useRoster, useRound } from '../../core/store'
import { useCues } from '../../core/ui/useCues'
import { canPlace, FLEET, randomLayout, shipCells, SIZE, validLayout } from './fleet'
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

/** One slot per ship of the fleet, in fleet order. A null slot is not placed yet. */
type Slots = (number[] | null)[]

/** The cells a ship would take from `start`, cut at the edge of the sea. */
function reach(start: number, length: number, vertical: boolean): number[] {
  const r = Math.floor(start / SIZE)
  const c = start % SIZE
  const out: number[] = []
  for (let i = 0; i < length; i += 1) {
    if (vertical ? r + i < SIZE : c + i < SIZE) out.push(vertical ? start + i * SIZE : start + i)
  }
  return out
}

export default function NavalRoom() {
  const identity = useGameStore((state) => state.identity)
  const roster = useRoster<RoomState>()
  const stored = useRound<RoundState>()
  const link = useGameStore((state) => state.link)
  const [slots, setSlots] = useState<Slots>(() => randomLayout())
  const [picked, setPicked] = useState<number | null>(null)
  const [vertical, setVertical] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const [note, setNote] = useState('')
  useCues(identity?.playerId ?? '', cuesFor)

  const roundId = stored?.roundId
  // A new round starts with a new random fleet.
  useEffect(() => {
    setSlots(randomLayout())
    setPicked(null)
    setNote('')
  }, [roundId])

  const draft: Layout = slots.filter((ship): ship is number[] => ship !== null)
  const complete = slots.every((ship) => ship !== null) && validLayout(draft)
  const pickedLength = picked === null ? null : FLEET[picked]!
  const preview = hover === null || pickedLength === null ? null : reach(hover, pickedLength, vertical)
  const previewOk =
    hover !== null && pickedLength !== null && canPlace(draft, shipCells(SIZE, hover, pickedLength, vertical))

  const shuffle = () => {
    setSlots(randomLayout())
    setPicked(null)
    setNote('')
  }
  const clear = () => {
    setSlots(FLEET.map(() => null))
    setPicked(0)
    setNote('')
  }
  const place = (cell: number) => {
    // A tap on a placed ship picks it up again.
    const owner = slots.findIndex((ship) => ship?.includes(cell))
    if (owner >= 0) {
      setSlots(slots.map((ship, index) => (index === owner ? null : ship)))
      setPicked(owner)
      setHover(null)
      setNote('')
      return
    }
    if (picked === null || pickedLength === null) {
      setNote('Escolha primeiro um navio.')
      return
    }
    const cells = shipCells(SIZE, cell, pickedLength, vertical)
    if (!canPlace(draft, cells)) {
      setHover(cell)
      setNote('Aí não cabe: o navio sai do mar ou toca noutro.')
      return
    }
    const next = slots.map((ship, index) => (index === picked ? cells : ship))
    setSlots(next)
    // Pick the next ship still waiting, so a phone needs one tap per ship.
    const waiting = next.findIndex((ship) => ship === null)
    setPicked(waiting >= 0 ? waiting : null)
    setHover(null)
    setNote('')
  }

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
              <div className="naval__ships" role="group" aria-label="Navios">
                {FLEET.map((length, index) => {
                  const placed = slots[index] !== null
                  const classes = ['naval__ship']
                  if (placed) classes.push('naval__ship--placed')
                  if (picked === index) classes.push('naval__ship--picked')
                  return (
                    <button
                      key={index}
                      type="button"
                      className={classes.join(' ')}
                      disabled={placed}
                      aria-pressed={picked === index}
                      aria-label={`Navio de ${length}${placed ? ' (colocado)' : ''}`}
                      onClick={() => {
                        setPicked(index)
                        setNote('')
                      }}
                    >
                      {Array.from({ length }, (_, part) => (
                        <span key={part} />
                      ))}
                    </button>
                  )
                })}
                <button type="button" onClick={() => setVertical(!vertical)}>
                  Rodar ({vertical ? 'vertical' : 'horizontal'})
                </button>
              </div>
              <Sea
                size={round.size}
                ships={draft}
                label="A sua frota"
                placing
                preview={preview}
                previewOk={previewOk}
                onPlace={place}
                onHover={setHover}
              />
              <p className={note ? 'error' : 'hint'} aria-live="polite">
                {note ||
                  (picked !== null
                    ? `Toque numa casa para pôr o navio de ${pickedLength} a partir dela. Toque num navio para o levantar.`
                    : complete
                      ? 'Frota completa. Toque num navio para o levantar.'
                      : 'Escolha um navio.')}
              </p>
              <div className="actions">
                <button type="button" onClick={shuffle}>
                  Baralhar
                </button>
                <button type="button" onClick={clear}>
                  Limpar
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={blocked || !complete}
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
