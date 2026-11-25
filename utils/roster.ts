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

/** PF2e's Dying value at which the hero dies (Player Core p. 411; Doomed isn't tracked). */
export const PF2E_DEAD_AT = 4

/** PF2e's Dying value, when the hero is dying (the sheet keeps 0 otherwise). */
function pf2eDying(s: HeroSummary | null | undefined): number {
  return typeof s?.dying === 'number' && s.dying > 0 ? s.dying : 0
}

/** A downed 5e / PF2e hero who is dead: three failed death saves (5e) or Dying 4 (PF2e). */
export function heroDead(s: HeroSummary | null | undefined): boolean {
  const dying = pf2eDying(s)
  if (dying) return dying >= PF2E_DEAD_AT
  return (s?.deathSaves?.failures ?? 0) >= 3
}

/** A 5e hero stabilised by three successful death saves (and not dead). */
export function heroStable(s: HeroSummary | null | undefined): boolean {
  return !pf2eDying(s) && !heroDead(s) && (s?.deathSaves?.successes ?? 0) >= 3
}

/** A downed 5e / PF2e hero's short status: "Dying 2" (PF2e), "Dead" or "Down". */
export function downStatus(s: HeroSummary | null | undefined): string {
  if (heroDead(s)) return 'Dead'
  const dying = pf2eDying(s)
  return dying ? `Dying ${dying}` : 'Down'
}

/**
 * A downed 5e hero's death saves: "1 saved · 2 failed" (shown after "Down"), "Stable" at three
 * successes, or worded for an aria-label with `spoken`; empty when the sheet has none, the
 * hero is dead, or PF2e's Dying value says it instead.
 */
export function deathSavesLine(s: HeroSummary | null | undefined, spoken = false): string {
  const ds = s?.deathSaves
  if (!ds || pf2eDying(s) || heroDead(s)) return ''
  if (heroStable(s)) return 'Stable'
  if (!spoken) return `${ds.successes} saved · ${ds.failures} failed`
  const won = `${ds.successes} ${ds.successes === 1 ? 'success' : 'successes'}`
  const lost = `${ds.failures} ${ds.failures === 1 ? 'failure' : 'failures'}`
  return `Death saves ${won}, ${lost}`
}

/**
 * What a downed 5e / PF2e hero is rolling: "1 saved · 2 failed" or "Stable" (5e), "Dying 2"
 * (PF2e); empty when the hero is dead or the sheet has neither.
 */
export function dyingLine(s: HeroSummary | null | undefined, spoken = false): string {
  if (heroDead(s)) return ''
  return pf2eDying(s) ? downStatus(s) : deathSavesLine(s, spoken)
}

export type HpTone = '' | 'accent' | 'danger'

/**
 * Every HP bar's band, on every system: secondary (teal) above half, accent (amber) at
 * half or less, danger (red) at 0. `.meter--accent` / `.meter--danger`, or `hpClass` with
 * a fill that reads `var(--hp-fill)`.
 */
export function hpTone(hp: number, hpMax: number): HpTone {
  if (hpMax <= 0) return ''
  if (hp <= 0) return 'danger'
  return hp * 2 <= hpMax ? 'accent' : ''
}

/** `hpTone` as a class (`hp--accent`, `hp--danger` in main.scss set `--hp-fill`); '' above half. */
export function hpClass(hp: number, hpMax: number): string {
  const tone = hpTone(hp, hpMax)
  return tone ? `hp--${tone}` : ''
}
