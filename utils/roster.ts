import type { GameSystem, RosterEntry } from '~/types'
import type { Pf2eSheet } from '~/types/sheets'
import { PF2E_CONDITION_DEFS, deathAt, isDead } from '~/utils/pf2ePlay'
import { defaultSheet } from '~/utils/sheetDefaults'

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

/**
 * The summary's PF2e numbers on a sheet, for the sheet engine's own death rules: Dying,
 * Doomed and the feats (Diehard), by `featNames` or, for a live sheet, its `feats`.
 */
function pf2eSheetOf(s: (HeroSummary & { feats?: unknown }) | null | undefined): Pf2eSheet {
  const feats = Array.isArray(s?.feats) ? (s.feats as { name?: unknown }[]) : []
  const names = s?.featNames ?? feats.map((f) => (typeof f?.name === 'string' ? f.name : ''))
  return {
    ...defaultSheet('pf2e'),
    dying: pf2eDying(s),
    doomed: typeof s?.doomed === 'number' && s.doomed > 0 ? s.doomed : 0,
    feats: names.map((name) => ({ type: '', level: '', action: '', name, desc: '' })),
  }
}

/** The Dying value at which a PF2e hero dies, as the sheet has it: 4 (5 with Diehard), less Doomed. */
export function pf2eDeathAt(s: HeroSummary | null | undefined): number {
  return deathAt(pf2eSheetOf(s))
}

/**
 * A downed 5e / PF2e hero who is dead: three failed death saves (5e) or, PF2e, Dying at the
 * sheet engine's death value (4, 5 with Diehard, less Doomed).
 */
export function heroDead(s: HeroSummary | null | undefined): boolean {
  if (isDead(pf2eSheetOf(s))) return true
  if (pf2eDying(s)) return false
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

const PF2E_VALUED = new Set(PF2E_CONDITION_DEFS.filter((d) => d.valued).map((d) => d.name))

/**
 * Conditions as the board lists them: PF2e's valued ones with their value ("Frightened 2",
 * 1 when the sheet has none), the rest by name.
 */
export function conditionLabels(
  conditions: readonly string[],
  system: GameSystem | null | undefined,
  values?: Record<string, number> | null,
): string[] {
  if (system !== 'pf2e') return [...conditions]
  return conditions.map((n) => (PF2E_VALUED.has(n) ? `${n} ${Math.max(1, values?.[n] ?? 1)}` : n))
}
