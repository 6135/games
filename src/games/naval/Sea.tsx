/** One sea: the ships (only on your own sea), the shots, and the sunk ships. */

import type { Layout, Sea as SeaState } from './types'

const LETTERS = 'ABCDEFGHIJ'

type Props = {
  size: number
  sea?: SeaState | undefined
  /** Your own fleet. Never set for another player's sea. */
  ships?: Layout | null
  /** The cell waiting for an answer. */
  pendingCell?: number | null
  label: string
  canShoot?: boolean
  onShoot?: (cell: number) => void
  small?: boolean
}

export function Sea({ size, sea, ships, pendingCell, label, canShoot, onShoot, small }: Props) {
  const own = new Set(ships?.flat() ?? [])
  const sunk = new Set(sea?.sunk.flat() ?? [])
  return (
    <div
      className={`sea${small ? ' sea--small' : ''}${canShoot ? ' sea--target' : ''}`}
      style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
      role="grid"
      aria-label={label}
    >
      {Array.from({ length: size * size }, (_, cell) => {
        const mark = sea?.shots[String(cell)]
        const classes = ['sea-cell']
        if (own.has(cell)) classes.push('sea-cell--ship')
        if (mark === 'hit') classes.push('sea-cell--hit')
        if (mark === 'miss') classes.push('sea-cell--miss')
        if (sunk.has(cell)) classes.push('sea-cell--sunk')
        if (cell === pendingCell) classes.push('sea-cell--pending')
        const name = `${LETTERS[Math.floor(cell / size)]}${(cell % size) + 1}`
        return (
          <button
            key={cell}
            type="button"
            className={classes.join(' ')}
            disabled={!canShoot || mark !== undefined}
            aria-label={`${label} ${name}`}
            onClick={() => onShoot?.(cell)}
          >
            {mark === 'hit' ? '✕' : mark === 'miss' ? '•' : ''}
          </button>
        )
      })}
    </div>
  )
}
