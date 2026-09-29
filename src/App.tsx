import { Suspense, useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { Lobby } from './screens/Lobby'
import { useGameStore } from './core/store'
import { GAMES, isGameId } from './games'

/** GitHub Pages has no SPA fallback, so the router works on the hash. */
export default function App() {
  return (
    <HashRouter>
      <PhaseRouter />
    </HashRouter>
  )
}

function PhaseRouter() {
  const phase = useGameStore((state) => state.phase)
  const game = useGameStore((state) => state.identity?.game)
  const navigate = useNavigate()

  useEffect(() => {
    if (phase === 'in_room' && game) navigate(`/${game}/room`)
    if (phase === 'lobby' || phase === 'error') navigate('/')
  }, [phase, game, navigate])

  return (
    <Routes>
      <Route path="/" element={<Lobby />} />
      <Route path="/:game/room" element={<GameRoom />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

/** Each game screen is its own chunk, loaded when a room of that game opens. */
function GameRoom() {
  const { game } = useParams()
  const phase = useGameStore((state) => state.phase)
  const current = useGameStore((state) => state.identity?.game)
  if (phase !== 'in_room' || !isGameId(game) || game !== current) return <Navigate to="/" replace />
  const Room = GAMES[game].Room
  return (
    <Suspense
      fallback={
        <main className="screen">
          <p>A carregar o jogo…</p>
        </main>
      }
    >
      <Room />
    </Suspense>
  )
}
