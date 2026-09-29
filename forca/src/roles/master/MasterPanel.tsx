/** Round master controls: the word entry, the guess entry and the life control. */

import { useEffect, useMemo, useState } from 'react'
import { Keyboard } from '../../ui/Keyboard'
import { validateCategory, validateWord } from '../../game/words'
import { masterApi } from '../roomSession'
import type { RoomState, RoundState } from '../../game/types'

const WORD_PROBLEM: Record<string, string> = {
  empty: 'Escreva a palavra.',
  too_short: 'A palavra precisa de duas letras.',
  too_long: 'A palavra é longa demais.',
  bad_char: 'Use letras, espaço, hífen e apóstrofo.',
}

const GUESS_PROBLEM: Record<string, string> = {
  not_running: 'A ronda já terminou.',
  empty: 'Escreva a letra.',
  not_a_letter: 'Isso não é uma letra.',
  repeated: 'Essa tentativa já saiu.',
  no_player: 'Escolha o jogador.',
}

type Props = { roster: RoomState; round: RoundState | null; blocked: boolean }

export function MasterPanel({ roster, round, blocked }: Props) {
  const [word, setWord] = useState('')
  const [category, setCategory] = useState('')
  const [wordGuess, setWordGuess] = useState('')
  const [attributed, setAttributed] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const guessers = useMemo(
    () => roster.players.filter((player) => player.connected && player.id !== roster.masterId),
    [roster.players, roster.masterId],
  )

  useEffect(() => {
    if (round?.turnPlayerId) setAttributed(round.turnPlayerId)
  }, [round?.turnPlayerId])

  const controller = masterApi.controller()
  const ctx = { order: roster.order, players: roster.players }

  async function start(): Promise<void> {
    const wordProblem = validateWord(word)
    const categoryProblem = validateCategory(category)
    if (wordProblem) return setProblem(WORD_PROBLEM[wordProblem] ?? 'Palavra inválida.')
    if (categoryProblem) return setProblem('Escreva a categoria.')
    setProblem(null)
    const carried = roster.lastRound?.livesRemaining
    await controller?.begin({
      roundNumber: roster.roundNumber,
      word,
      category,
      maxLives: roster.config.maxLives,
      livesRemaining:
        roster.config.livesResetEachRound || carried === undefined || carried <= 0
          ? roster.config.maxLives
          : carried,
      order: roster.order,
      players: roster.players,
    })
    setWord('')
    setCategory('')
  }

  async function guess(kind: 'letter' | 'word', value: string): Promise<void> {
    const playerId = attributed || round?.turnPlayerId || ''
    const rejection = await controller?.guess({ kind, value, playerId }, ctx)
    setProblem(rejection ? (GUESS_PROBLEM[rejection] ?? 'Tentativa inválida.') : null)
    if (kind === 'word' && !rejection) setWordGuess('')
  }

  if (roster.status === 'choosing' && !round) {
    return (
      <section className="panel panel--master">
        <h3>É a sua ronda</h3>
        <p className="hint">A palavra fica no seu dispositivo. Ninguém a recebe até ao fim.</p>
        <label>
          Categoria
          <input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="animais"
            maxLength={40}
          />
        </label>
        <label>
          Palavra
          <input
            value={word}
            onChange={(event) => setWord(event.target.value)}
            placeholder="cão de água"
            maxLength={40}
          />
        </label>
        {problem && <p className="error">{problem}</p>}
        <button type="button" className="primary" disabled={blocked} onClick={() => void start()}>
          Começar a ronda
        </button>
      </section>
    )
  }

  if (!round) {
    return (
      <section className="panel panel--master">
        <h3>Ronda perdida</h3>
        <p className="hint">
          A palavra vivia neste separador e desapareceu. O anfitrião vai anular a ronda.
        </p>
      </section>
    )
  }

  const over = round.outcome !== 'running'

  return (
    <section className="panel panel--master">
      <h3>Mesa do mestre</h3>

      {!over && (
        <>
          <label className="row">
            Tentativa de
            <select value={attributed} onChange={(event) => setAttributed(event.target.value)}>
              {guessers.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
          </label>

          <Keyboard
            used={round.guessedLetters}
            wrong={round.wrongLetters}
            disabled={blocked}
            onPick={(letter) => void guess('letter', letter)}
          />

          <div className="row">
            <input
              value={wordGuess}
              onChange={(event) => setWordGuess(event.target.value)}
              placeholder="palavra inteira"
              maxLength={40}
            />
            <button
              type="button"
              disabled={blocked || wordGuess.trim().length === 0}
              onClick={() => void guess('word', wordGuess)}
            >
              Tentar
            </button>
          </div>

          <div className="row">
            <span>Correção de vidas</span>
            <button type="button" disabled={blocked} onClick={() => void controller?.adjust(-1)}>
              −
            </button>
            <button type="button" disabled={blocked} onClick={() => void controller?.adjust(1)}>
              +
            </button>
          </div>
        </>
      )}

      {problem && <p className="error">{problem}</p>}

      {over && (
        <>
          <p>{round.outcome === 'won' ? 'A palavra saiu.' : 'As vidas acabaram.'}</p>
          <button
            type="button"
            className="primary"
            disabled={blocked}
            onClick={() => void controller?.finish()}
          >
            Revelar e fechar a ronda
          </button>
        </>
      )}
    </section>
  )
}
