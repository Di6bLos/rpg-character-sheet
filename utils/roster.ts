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

type HeroSummary = NonNullable<RosterEntry['summary']>

/** A hero is down at 0 HP or less, once they have a max HP to be down from. */
export function heroDown(hp: number | undefined, hpMax: number | undefined): boolean {
  return (hpMax ?? 0) > 0 && hp !== undefined && hp <= 0
}

/** PF2e's Dying value, when the hero is dying (the sheet keeps 0 otherwise). */
function pf2eDying(s: HeroSummary | null | undefined): number {
  return typeof s?.dying === 'number' && s.dying > 0 ? s.dying : 0
}

/** A downed 5e / PF2e hero's short status: "Dying 2" (PF2e) or "Down". */
export function downStatus(s: HeroSummary | null | undefined): string {
  const dying = pf2eDying(s)
  return dying ? `Dying ${dying}` : 'Down'
}

/**
 * A downed 5e hero's death saves: "1 saved · 2 failed" (shown after "Down"), or worded for an
 * aria-label with `spoken`; empty when the sheet has none or PF2e's Dying value says it instead.
 */
export function deathSavesLine(s: HeroSummary | null | undefined, spoken = false): string {
  const ds = s?.deathSaves
  if (!ds || pf2eDying(s)) return ''
  if (!spoken) return `${ds.successes} saved · ${ds.failures} failed`
  const won = `${ds.successes} ${ds.successes === 1 ? 'success' : 'successes'}`
  const lost = `${ds.failures} ${ds.failures === 1 ? 'failure' : 'failures'}`
  return `Death saves ${won}, ${lost}`
}

/**
 * What a downed 5e / PF2e hero is rolling: "1 saved · 2 failed" (5e) or "Dying 2" (PF2e);
 * empty when the sheet has neither.
 */
export function dyingLine(s: HeroSummary | null | undefined, spoken = false): string {
  return pf2eDying(s) ? downStatus(s) : deathSavesLine(s, spoken)
}

/**
 * The HP bar's band, as the hero column's bar (`NimbleHpBar`'s `tone`) has it: secondary
 * (teal) while above half, accent at half or less, danger at 0. Pairs with `.meter--accent`
 * and `.meter--danger`.
 */
export function hpTone(hp: number, hpMax: number): '' | 'accent' | 'danger' {
  if (hpMax <= 0) return ''
  if (hp <= 0) return 'danger'
  return hp * 2 <= hpMax ? 'accent' : ''
}
