// What the battle board's hero stats dialog shows for D&D 5e and Pathfinder 2e heroes,
// worked out from `campaign_hero_card` (and the roster for the GM's party cards).
import type { Dnd5eHeroCard, RosterEntry } from '~/types'
import type { Dnd5eAbility, Pf2eRank, Pf2eSkill } from '~/types/sheets'
import { abilityMod, sign } from '~/utils/dice'

export const DND5E_ABILITIES: Dnd5eAbility[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']

/** PF2e proficiency ranks by their letter (the sheet and the stats dialog). */
export const PF2E_RANK_NAME: Record<Pf2eRank, string> = {
  U: 'Untrained',
  T: 'Trained',
  E: 'Expert',
  M: 'Master',
  L: 'Legendary',
}

/** The rank's name, "Untrained" for anything the sheet doesn't know. */
export function pf2eRankName(rank: string): string {
  return PF2E_RANK_NAME[rank as Pf2eRank] ?? PF2E_RANK_NAME.U
}

export interface Dnd5eAbilityRow {
  k: Dnd5eAbility
  score: number
  /** "+2" */
  mod: string
  /** The saving throw: the modifier, plus proficiency when proficient. */
  save: string
  prof: boolean
}

/** A 5e hero's six abilities with modifier and saving throw. */
export function dnd5eAbilityRows(
  card: Pick<Dnd5eHeroCard, 'abilities' | 'saveProfs' | 'profBonus'>,
): Dnd5eAbilityRow[] {
  return DND5E_ABILITIES.map((k) => {
    const score = card.abilities[k] ?? 10
    const mod = abilityMod(score)
    const prof = card.saveProfs.includes(k)
    return { k, score, mod: sign(mod), save: sign(mod + (prof ? card.profBonus : 0)), prof }
  })
}

/** PF2e skills, trained ones first by total, then the untrained in sheet order. */
export function pf2eSkillRows(skills: Pf2eSkill[]): Pf2eSkill[] {
  const named = skills.filter((s) => s.name)
  const trained = named.filter((s) => s.rank !== 'U').sort((a, b) => b.value - a.value)
  return [...trained, ...named.filter((s) => s.rank === 'U')]
}

/**
 * A PF2e hero's points for the GM's party card, where Nimble shows mana:
 * "hero 1 · focus 1/2" (focus only with a pool); empty when there is nothing to show.
 */
export function pf2ePointsLine(s: RosterEntry['summary']): string {
  if (!s) return ''
  const parts: string[] = []
  if (typeof s.heroPoints === 'number') parts.push(`hero ${s.heroPoints}`)
  const f = s.focus
  if (f && f.max > 0) parts.push(`focus ${f.current}/${f.max}`)
  return parts.join(' · ')
}

/** A text's first sentence, for the one-line Key abilities (the whole text is on hover). */
export function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const end = flat.search(/[.!?](\s|$)/)
  return end > 0 ? flat.slice(0, end + 1) : flat
}

/** A PF2e feat's source line: "Class 2", "Skill", "Ancestry 1". */
export function featSource(f: { type: string; level: string }): string {
  return [f.type.trim(), f.level.trim()].filter(Boolean).join(' ')
}

/** A downed 5e hero's death-save state: dead at 3 failures, stable at 3 successes. */
export function deathSaveState(
  down: boolean,
  saves: { successes: number; failures: number },
): string {
  if (!down) return 'Not dying.'
  if (saves.failures >= 3) return 'Dead.'
  if (saves.successes >= 3) return 'Down: stable.'
  return 'Down: rolling death saves.'
}
