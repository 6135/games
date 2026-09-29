/** Letter pad for the round master. A used letter is disabled. */

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

type Props = {
  used: string[]
  wrong: string[]
  disabled: boolean
  onPick: (letter: string) => void
}

export function Keyboard({ used, wrong, disabled, onPick }: Props) {
  return (
    <div className="keyboard">
      {LETTERS.map((letter) => {
        const isUsed = used.includes(letter)
        const isWrong = wrong.includes(letter)
        return (
          <button
            key={letter}
            type="button"
            className={isWrong ? 'key key--wrong' : isUsed ? 'key key--hit' : 'key'}
            disabled={disabled || isUsed}
            onClick={() => onPick(letter)}
          >
            {letter}
          </button>
        )
      })}
    </div>
  )
}
