/** Every finished round: the word, who wrote it and who won it. */

import type { RoomState } from '../game/types'

export function History({ roster, onClose }: { roster: RoomState; onClose: () => void }) {
  const rows = roster.history.slice().reverse()

  return (
    <section className="card history">
      <div className="history__head">
        <h2>Palavras anteriores</h2>
        <button type="button" onClick={onClose}>
          Fechar
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="hint">Ainda não terminou nenhuma ronda.</p>
      ) : (
        <ol className="history__list">
          {rows.map((row, index) => (
            <li key={`${row.n}-${index}`} className="history__row">
              <span className="history__n">{row.n}</span>
              <div className="history__main">
                <strong className="history__word">{row.voided ? 'ronda anulada' : row.word}</strong>
                <span className="hint">
                  escrita por {row.masterName}
                  {row.voided
                    ? ''
                    : row.winnerName
                      ? ` · ganha por ${row.winnerName}`
                      : ' · ninguém acertou'}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
