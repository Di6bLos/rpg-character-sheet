// Reconfigure from level 1 for a 5e hero made in the builder: the builder page
// (`/characters/new/dnd5e?reconfigure=<id>`) reopens the level 1 picks and hands the rebuilt
// level 1 sheet to the hero's sheet page, whose Reconfigure dialog puts it in place and replays
// the later levels with their recorded picks. The hand-off lives in sessionStorage, for this
// tab only, and is read once.
import type { Dnd5eSheet } from '~/types/sheets'

const KEY = 'lantern-dnd5e-rebuild'

export function useDnd5eRebuild() {
  /** Keeps the rebuilt level 1 sheet for the character's sheet page. */
  function hand(id: string, sheet: Dnd5eSheet) {
    sessionStorage.setItem(KEY, JSON.stringify({ id, sheet }))
  }

  /** The rebuilt level 1 sheet waiting for this character, taken out so it applies once. */
  function take(id: string): Dnd5eSheet | null {
    try {
      const raw = sessionStorage.getItem(KEY)
      if (!raw) return null
      const saved = JSON.parse(raw) as { id: string; sheet: Dnd5eSheet }
      if (saved.id !== id) return null
      sessionStorage.removeItem(KEY)
      return saved.sheet
    } catch {
      return null
    }
  }

  return { hand, take }
}
