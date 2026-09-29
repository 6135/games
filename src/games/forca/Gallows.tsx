/** The gallows. The drawing follows the share of the life pool that is spent. */

type Props = { livesRemaining: number; maxLives: number }

const PARTS = 6

export function Gallows({ livesRemaining, maxLives }: Props) {
  const lost = Math.max(0, maxLives - livesRemaining)
  const drawn = maxLives <= 0 ? 0 : Math.min(PARTS, Math.round((lost / maxLives) * PARTS))
  const show = (part: number) => (drawn >= part ? 1 : 0)

  return (
    <svg className="gallows" viewBox="0 0 120 140" role="img" aria-label={`Forca: ${lost} erros`}>
      <g stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round">
        <line x1="10" y1="132" x2="70" y2="132" />
        <line x1="30" y1="132" x2="30" y2="10" />
        <line x1="30" y1="10" x2="80" y2="10" />
        <line x1="80" y1="10" x2="80" y2="26" />
        <circle cx="80" cy="38" r="12" opacity={show(1)} />
        <line x1="80" y1="50" x2="80" y2="86" opacity={show(2)} />
        <line x1="80" y1="58" x2="64" y2="72" opacity={show(3)} />
        <line x1="80" y1="58" x2="96" y2="72" opacity={show(4)} />
        <line x1="80" y1="86" x2="66" y2="108" opacity={show(5)} />
        <line x1="80" y1="86" x2="94" y2="108" opacity={show(6)} />
      </g>
    </svg>
  )
}
