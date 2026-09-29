/** The shared board. Every device renders the same view of the round. */

import { Gallows } from './Gallows'
import { Slots } from './Slots'
import type { RoundState } from '../game/types'

export function Board({ round }: { round: RoundState }) {
  return (
    <section className="board">
      <Gallows livesRemaining={round.livesRemaining} maxLives={round.maxLives} />
      <div className="board__main">
        <p className="category">
          Categoria: <strong>{round.category}</strong>
        </p>
        <Slots slots={round.slots} />
        <p className="lives">
          Vidas: <strong>{round.livesRemaining}</strong> / {round.maxLives}
        </p>
        {round.wrongLetters.length > 0 && (
          <p className="wrong">Letras erradas: {round.wrongLetters.join(' ')}</p>
        )}
        {round.wrongWords.length > 0 && (
          <p className="wrong">Palavras erradas: {round.wrongWords.join(', ')}</p>
        )}
      </div>
    </section>
  )
}
