/** Entry screen. Creates a room or joins one. */

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createRoom, joinRoom, DEFAULT_BROKER, type Credentials } from '../core/session'
import { prefs, useGameStore } from '../core/store'
import { watchDirectory } from '../core/net/directory'
import type { GameId, RoomAd } from '../core/types'
import { GAMES, GAME_LIST, gameOfProtocol, isGameId } from '../games'

const PROTOCOLS = GAME_LIST.map((game) => game.protocol)

function storedGame(): GameId {
  try {
    const value = localStorage.getItem('games.game')
    return isGameId(value) ? value : 'forca'
  } catch {
    return 'forca'
  }
}

const BROKERS = [
  { label: 'HiveMQ público', url: DEFAULT_BROKER },
  { label: 'EMQX público', url: 'wss://broker.emqx.io:8084/mqtt' },
]

export function Lobby() {
  const [params] = useSearchParams()
  const stored = prefs.read()
  const fromLink = params.get('game')
  const [game, setGame] = useState<GameId>(isGameId(fromLink) ? fromLink : storedGame())
  const [roomName, setRoomName] = useState(params.get('room') ?? stored.roomName)
  const [roomKey, setRoomKey] = useState('')
  const [playerName, setPlayerName] = useState(stored.name)
  const [brokerUrl, setBrokerUrl] = useState(stored.broker || DEFAULT_BROKER)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const [listRoom, setListRoom] = useState(true)
  const [rooms, setRooms] = useState<RoomAd[]>([])
  const [picked, setPicked] = useState<RoomAd | null>(null)
  const keyInput = useRef<HTMLInputElement>(null)
  const phase = useGameStore((state) => state.phase)
  const error = useGameStore((state) => state.error)
  const busy = phase === 'connecting'

  useEffect(() => {
    const room = params.get('room')
    if (room) setRoomName(room)
    const linked = params.get('game')
    if (isGameId(linked)) setGame(linked)
  }, [params])

  // The open list is a convenience, so it runs on its own connection and a
  // broker that refuses it changes nothing else on this screen.
  useEffect(() => {
    if (!/^wss?:\/\//.test(brokerUrl)) {
      setRooms([])
      return undefined
    }
    const stop = watchDirectory(brokerUrl, PROTOCOLS, setRooms)
    return () => stop()
  }, [brokerUrl])

  const ready = roomName.trim().length > 0 && roomKey.length > 0 && playerName.trim().length > 0

  function pick(room: RoomAd): void {
    const owner = gameOfProtocol(room.protocol)
    if (owner) chooseGame(owner.id)
    setPicked(room)
    setRoomName(room.name)
    keyInput.current?.focus()
  }

  function typeRoomName(value: string): void {
    setRoomName(value)
    // A hand written name no longer belongs to the room that was picked.
    if (picked && value !== picked.name) setPicked(null)
  }

  function chooseGame(next: GameId): void {
    setGame(next)
    try {
      localStorage.setItem('games.game', next)
    } catch {
      /* A blocked storage only loses the preference. */
    }
    // A room picked from the list belongs to one game only.
    if (picked && gameOfProtocol(picked.protocol)?.id !== next) setPicked(null)
  }

  function credentials(): Credentials {
    prefs.write({ name: playerName.trim(), broker: brokerUrl, roomName: roomName.trim() })
    return {
      roomName,
      roomKey,
      playerName,
      brokerUrl,
      listRoom,
      ...(picked && picked.name === roomName ? { roomId: picked.roomId } : {}),
      ...(username ? { username } : {}),
      ...(password ? { password } : {}),
    }
  }

  return (
    <main className="screen screen--lobby">
      <h1>Jogos Multiplayer</h1>
      <p className="lead">
        Sem servidor. O estado passa por um broker MQTT público e vai cifrado com a chave da sala.
      </p>

      {error && <p className="error">{error}</p>}

      <div className="games" role="radiogroup" aria-label="Jogo">
        {GAME_LIST.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={game === option.id}
            className={game === option.id ? 'game game--picked' : 'game'}
            onClick={() => chooseGame(option.id)}
          >
            <strong>{option.title}</strong>
            <span className="hint">{option.description}</span>
          </button>
        ))}
      </div>

      <form className="card" onSubmit={(event) => event.preventDefault()}>
        <label>
          Nome da sala
          <input
            value={roomName}
            onChange={(event) => typeRoomName(event.target.value)}
            placeholder="sala dos amigos"
            autoComplete="off"
          />
        </label>
        <label>
          Chave da sala
          <input
            ref={keyInput}
            type="password"
            value={roomKey}
            onChange={(event) => setRoomKey(event.target.value)}
            placeholder="partilhe fora do link"
            autoComplete="off"
          />
        </label>
        <label>
          O seu nome
          <input
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
            maxLength={24}
            autoComplete="off"
          />
        </label>

        <label className="row">
          <input
            type="checkbox"
            checked={listRoom}
            onChange={(event) => setListRoom(event.target.checked)}
          />
          Mostrar a sala na lista aberta
        </label>

        <button type="button" className="link" onClick={() => setAdvanced(!advanced)}>
          {advanced ? 'Esconder o broker' : 'Broker e credenciais'}
        </button>

        {advanced && (
          <div className="advanced">
            <label>
              Broker (WSS)
              <input value={brokerUrl} onChange={(event) => setBrokerUrl(event.target.value)} />
            </label>
            <div className="presets">
              {BROKERS.map((broker) => (
                <button
                  key={broker.url}
                  type="button"
                  className="chip"
                  onClick={() => setBrokerUrl(broker.url)}
                >
                  {broker.label}
                </button>
              ))}
            </div>
            <label>
              Utilizador (opcional)
              <input value={username} onChange={(event) => setUsername(event.target.value)} />
            </label>
            <label>
              Palavra-passe (opcional)
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <p className="hint">
              Uma credencial no pacote público é pública. Serve para limitar o espaço de tópicos,
              não para proteger o conteúdo.
            </p>
          </div>
        )}

        <div className="actions">
          <button
            type="submit"
            className="primary"
            disabled={!ready || busy}
            onClick={() => void createRoom(GAMES[game], credentials())}
          >
            Criar sala
          </button>
          <button
            type="submit"
            disabled={!ready || busy}
            onClick={() => void joinRoom(GAMES[game], credentials())}
          >
            Entrar
          </button>
        </div>
      </form>

      <section className="card rooms">
        <h2>Salas abertas</h2>
        {rooms.length === 0 ? (
          <p className="hint">
            Nenhuma sala na lista. Uma sala só aparece aqui se o anfitrião a mostrar.
          </p>
        ) : (
          <ul className="rooms__list">
            {rooms.map((room) => (
              <li key={`${room.protocol}/${room.roomId}`}>
                <button
                  type="button"
                  className={
                    picked?.roomId === room.roomId && picked.protocol === room.protocol
                      ? 'room room--picked'
                      : 'room'
                  }
                  onClick={() => pick(room)}
                >
                  <span className="tag">{gameOfProtocol(room.protocol)?.title ?? '?'}</span>
                  <span className="room__name">{room.name}</span>
                  <span className="tag">{room.players} jogador(es)</span>
                  <span className={room.open ? 'tag tag--turn' : 'tag'}>
                    {room.open ? 'a aceitar' : 'a jogar'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="hint">
          A lista mostra o nome, nunca a chave. Escolha uma sala e escreva a chave para entrar.
        </p>
      </section>

      <p className="hint">
        A chave da sala entra no identificador do tópico e na chave de cifra. Nunca a ponha no link.
      </p>
    </main>
  )
}
