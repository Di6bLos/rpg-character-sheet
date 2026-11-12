import type { RosterEntry } from '~/types'

export interface AuthorLabel {
  /** The character's name, or the player's name when they have no character. */
  primary: string
  /** The player's display name, shown smaller beneath; null when it would repeat `primary`. */
  secondary: string | null
}

/**
 * How a campaign member is named next to what they wrote: their character first, with the
 * player's display name beneath. `fallbackName` covers members missing from the roster
 * (they left the campaign) when the row carries its own profile name.
 */
export function authorLabel(
  roster: readonly RosterEntry[],
  userId: string,
  fallbackName?: string | null,
): AuthorLabel {
  const entry = roster.find((r) => r.user_id === userId)
  const player = entry?.display_name ?? fallbackName ?? null
  const character = entry?.character_name?.trim() || null
  if (character)
    return { primary: character, secondary: player && player !== character ? player : null }
  return { primary: player ?? 'Former member', secondary: null }
}
