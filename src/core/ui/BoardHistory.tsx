/** Every finished round of a host-run game: who won, and the game's summary. */

import type { BoardRecord } from '../boardRoom'

export function BoardHistory({ history, onClose }: { history: BoardRecord[]; onClose: () => void }) {
  const rows = history.slice().reverse()
  return (
    <section className="card history">
      <div className="history__head">
        <h2>Rondas anteriores</h2>
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
                <strong className="history__word">
                  {row.voided ? 'ronda anulada' : row.draw ? 'empate' : `ganha por ${row.winnerName ?? '—'}`}
                </strong>
                {row.detail && <span className="hint">{row.detail}</span>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
