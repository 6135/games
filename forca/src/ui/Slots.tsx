/** The word. A hidden letter shows an empty slot. */

import type { Slot } from '../game/types'

/**
 * Splits the slots at every space.
 * A line break must fall between two words, never inside one.
 */
function splitWords(slots: Slot[]): Slot[][] {
  const words: Slot[][] = [[]]
  for (const slot of slots) {
    if (slot.kind === 'fixed' && slot.char === ' ') {
      words.push([])
      continue
    }
    words[words.length - 1]!.push(slot)
  }
  return words.filter((word) => word.length > 0)
}

function className(slot: Slot): string {
  if (slot.kind === 'fixed') return 'slot slot--fixed'
  return slot.char ? 'slot slot--filled' : 'slot slot--empty'
}

export function Slots({ slots }: { slots: Slot[] }) {
  return (
    <p className="slots">
      {splitWords(slots).map((word, wordIndex) => (
        <span className="word" key={wordIndex}>
          {word.map((slot, index) => (
            <span key={index} className={className(slot)}>
              {/* A plain space collapses, which leaves the slot with no
                  height. The non-breaking space keeps every slot equal. */}
              {slot.kind === 'fixed' ? slot.char : (slot.char ?? '\u00A0')}
            </span>
          ))}
        </span>
      ))}
    </p>
  )
}
