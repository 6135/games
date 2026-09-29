/** The dots board: dots at the corners, lines to draw, boxes that fill with a colour. */

import type { Player } from '../../core/types'
import { seatColor } from '../../core/ui/seats'
import type { RoundState } from './types'

type Props = {
  round: RoundState
  players: Player[]
  order: string[]
  canPlay: boolean
  onPlay: (line: number) => void
}

export function Board({ round, players, order, canPlay, onPlay }: Props) {
  const { size } = round
  const horizontal = (size + 1) * size
  const last = round.moves[round.moves.length - 1]
  const byId = new Map(players.map((player) => [player.id, player]))
  const color = (id: string | null) => (id ? seatColor(order.indexOf(id)) : undefined)
  const cells = []

  for (let r = 0; r <= 2 * size; r += 1) {
    for (let c = 0; c <= 2 * size; c += 1) {
      const key = `${r}-${c}`
      if (r % 2 === 0 && c % 2 === 0) {
        cells.push(<span key={key} className="dot-point" />)
      } else if (r % 2 === 0 || c % 2 === 0) {
        const line =
          r % 2 === 0
            ? (r / 2) * size + (c - 1) / 2
            : horizontal + ((r - 1) / 2) * (size + 1) + c / 2
        const owner = round.lines[line] ?? null
        const kind = r % 2 === 0 ? 'h' : 'v'
        cells.push(
          <button
            key={key}
            type="button"
            className={`edge edge--${kind}${owner ? ' edge--drawn' : ''}${line === last ? ' edge--last' : ''}`}
            style={owner ? { background: color(owner) } : undefined}
            disabled={!canPlay || owner !== null}
            aria-label={`Linha ${kind === 'h' ? 'horizontal' : 'vertical'} ${line}`}
            onClick={() => onPlay(line)}
          />,
        )
      } else {
        const box = ((r - 1) / 2) * size + (c - 1) / 2
        const owner = round.boxes[box] ?? null
        cells.push(
          <span
            key={key}
            className={owner ? 'box box--taken' : 'box'}
            style={owner ? { background: color(owner) } : undefined}
            title={owner ? byId.get(owner)?.name : undefined}
          >
            {owner ? (byId.get(owner)?.name.slice(0, 1).toUpperCase() ?? '') : ''}
          </span>,
        )
      }
    }
  }

  const track = `repeat(${size}, 10px 1fr) 10px`
  return (
    <div
      className={canPlay ? 'dots dots--mine' : 'dots'}
      style={{ gridTemplateColumns: track, gridTemplateRows: track }}
    >
      {cells}
    </div>
  )
}
