/**
 * Host controls that every game shares: the bots, the start, the next round,
 * the restart and the export. A game adds its own settings as `children`.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { ranking } from '../roomRules'
import { hostApi } from '../session'
import type { BotLevel, CoreRoom, GameId } from '../types'

export const BOT_LABELS: Record<BotLevel, string> = {
  easy: 'fácil',
  normal: 'normal',
  hard: 'difícil',
}

function exportRanking(game: GameId, roster: CoreRoom): void {
  const payload = {
    game,
    rounds: roster.roundNumber,
    exportedAt: new Date().toISOString(),
    ranking: ranking(roster.players).map((player) => ({
      name: player.name,
      ...(player.symbol ? { symbol: player.symbol } : {}),
      score: player.score,
    })),
  }
  const text = JSON.stringify(payload, null, 2)
  void navigator.clipboard?.writeText(text)
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${game}-ranking.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

type Props = {
  game: GameId
  roster: CoreRoom
  blocked: boolean
  minPlayers: number
  maxPlayers: number
  bots: boolean
  /** The game settings, shown in the lobby. */
  children?: ReactNode
}

export function HostPanel({ game, roster, blocked, minPlayers, maxPlayers, bots, children }: Props) {
  const api = hostApi()
  const connected = roster.players.filter((player) => player.connected).length
  const [armed, setArmed] = useState(false)
  const [level, setLevel] = useState<BotLevel>('normal')
  const botRows = roster.players.filter((player) => player.bot)
  const full = roster.players.length >= maxPlayers
  const live = roster.status === 'choosing' || roster.status === 'playing'

  // A restart in the middle of a game asks for a second click, and forgets it.
  useEffect(() => {
    if (!armed) return undefined
    const timer = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(timer)
  }, [armed])

  function restart(): void {
    if (live && !armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    void api?.restart()
  }

  return (
    <section className="panel panel--host">
      <h3>Anfitrião</h3>

      {roster.status === 'lobby' && (
        <>
          {bots && (
            <div className="bots">
              <h4>Bots</h4>
              <div className="row">
                <select
                  aria-label="Nível do bot"
                  value={level}
                  onChange={(event) => setLevel(event.target.value as BotLevel)}
                >
                  {(Object.keys(BOT_LABELS) as BotLevel[]).map((key) => (
                    <option key={key} value={key}>
                      {BOT_LABELS[key]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={blocked || full}
                  onClick={() => void api?.addBot(level)}
                >
                  Adicionar bot
                </button>
              </div>
              {botRows.length > 0 && (
                <ul className="bots__list">
                  {botRows.map((bot) => (
                    <li key={bot.id}>
                      <span>
                        {bot.name} · {BOT_LABELS[bot.bot!]}
                      </span>
                      <button
                        type="button"
                        className="chip"
                        aria-label={`Remover ${bot.name}`}
                        disabled={blocked}
                        onClick={() => void api?.removeBot(bot.id)}
                      >
                        Remover
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="hint">
                Sozinho? Adicione bots para jogar. Os bots jogam neste dispositivo e só existem se
                os adicionar.
              </p>
            </div>
          )}

          {children}

          <button
            type="button"
            className="primary"
            disabled={blocked || connected < minPlayers}
            onClick={() => void api?.startGame()}
          >
            Começar o jogo
          </button>
          {connected < minPlayers && (
            <p className="hint">
              São precisos {minPlayers} jogadores ligados.{bots ? ' Um bot conta como jogador.' : ''}
            </p>
          )}
        </>
      )}

      {roster.status === 'round_end' && (
        <div className="actions">
          <button
            type="button"
            className="primary"
            disabled={blocked}
            onClick={() => void api?.nextRound()}
          >
            Próxima ronda
          </button>
          <button type="button" disabled={blocked} onClick={() => void api?.endGame()}>
            Terminar o jogo
          </button>
        </div>
      )}

      {live && (
        <button type="button" disabled={blocked} onClick={() => void api?.voidRound()}>
          Anular a ronda
        </button>
      )}

      {roster.status === 'game_over' && (
        <button type="button" onClick={() => exportRanking(game, roster)}>
          Exportar a classificação
        </button>
      )}

      {roster.status !== 'lobby' && (
        <>
          <button
            type="button"
            className={armed ? 'primary' : ''}
            disabled={blocked}
            onClick={restart}
          >
            {armed ? 'Confirmar o reinício' : 'Reiniciar a sala'}
          </button>
          <p className="hint">
            Volta ao átrio com os mesmos jogadores. Os pontos vão a zero e a ordem é sorteada outra
            vez. Ninguém sai da sala.
          </p>
        </>
      )}

      <p className="hint">A sala fecha quando o anfitrião sai. A classificação perde-se.</p>
    </section>
  )
}
