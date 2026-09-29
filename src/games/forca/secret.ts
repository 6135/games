/** The word of the open round. Session storage only, so a reload recovers it. */
export const secretStore = {
  save(roundId: string, word: string): void {
    sessionStorage.setItem('forca.round', JSON.stringify({ roundId, word }))
  },
  load(roundId: string): string | null {
    const raw = sessionStorage.getItem('forca.round')
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as { roundId?: string; word?: string }
      return parsed.roundId === roundId && typeof parsed.word === 'string' ? parsed.word : null
    } catch {
      return null
    }
  },
  clear(): void {
    sessionStorage.removeItem('forca.round')
  },
}
