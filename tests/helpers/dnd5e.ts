// Shared 5e test helpers: the generated data read from disk, and picks filled in with the first
// valid options (the class's primary ability for increases, the SRD subclass), so every class
// can be built and levelled 1→20.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Dnd5eClassDef } from '../../data/dnd5e/types'
import type { Dnd5eAbility, Dnd5eCreation, Dnd5eSheet } from '../../types/sheets'
import {
  DND5E_BUILD_SETS,
  type Dnd5eBuildData,
  type Dnd5ePick,
  SUGGESTED_ARRAY,
  buildDnd5eSheet,
  creationPicks,
  emptyCreation,
} from '../../utils/dnd5eBuild'
import { applyDnd5eLevel, dnd5eLevelPlan } from '../../utils/dnd5eLevelUp'

const dir = join(import.meta.dirname, '..', '..', 'data', 'dnd5e', 'generated')
export const data = Object.fromEntries(
  DND5E_BUILD_SETS.map((s) => [s, JSON.parse(readFileSync(join(dir, `${s}.json`), 'utf8'))]),
) as Dnd5eBuildData

export const cls = (slug: string): Dnd5eClassDef => data.classes.find((c) => c.slug === slug)!

/** First valid values for a pick; increases go to the class's primary ability first. */
/**
 * SRD records first, then the Player's Handbook and Forge of the Artificer ones, so the tables
 * don't move when other books' entries join the data.
 */
const ranks = new Map(
  [
    ...data.feats,
    ...data.spells,
    ...data.subclasses,
    ...data.options.flatMap((g) => g.entries),
  ].map((r) => [
    r.slug,
    r.srd ? 0 : ['PHB 2024', 'Eberron: Forge of the Artificer'].includes(r.source) ? 1 : 2,
  ]),
)
const rank = (id: string) => ranks.get(id) ?? 0

function firstValues(p: Dnd5ePick, prefer: { abilities: Dnd5eAbility[]; subclass?: string }) {
  const ok = p.options.filter((o) => !o.disabled).sort((a, b) => rank(a.id) - rank(b.id))
  if (p.kind === 'subclass' && prefer.subclass && ok.some((o) => o.id === prefer.subclass))
    return [prefer.subclass]
  if (p.kind === 'asi') {
    const order = [...prefer.abilities, 'CON', 'DEX', 'WIS', 'STR', 'INT', 'CHA']
    const pool = order.filter((a) => ok.some((o) => o.id === a))
    return p.repeat ? [pool[0]!, pool[0]!] : pool.slice(0, 1)
  }
  if (p.kind === 'feat' && ok.some((o) => o.id === 'ability-score-improvement'))
    return ['ability-score-improvement']
  return ok.slice(0, p.count).map((o) => o.id)
}

/** Fills every unanswered pick, repeating while picks reveal more (a feat's own choices). */
export function fill(
  ask: (picks: Record<string, string[]>) => Dnd5ePick[],
  prefer: { abilities: Dnd5eAbility[]; subclass?: string },
  start: Record<string, string[]> = {},
): Record<string, string[]> {
  const picks = { ...start }
  // One pick at a time: each changes what later picks offer (a cantrip known, a skill taken).
  for (let round = 0; round < 200; round++) {
    const next = ask(picks).find((p) => !picks[p.key]?.length && !p.optional)
    const v = next ? firstValues(next, prefer) : []
    if (!next || !v.length) break
    picks[next.key] = v
  }
  return picks
}

const BACKGROUND: Record<string, string> = {
  artificer: 'sage',
  barbarian: 'soldier',
  bard: 'entertainer',
  cleric: 'acolyte',
  druid: 'guide',
  fighter: 'soldier',
  monk: 'hermit',
  paladin: 'noble',
  ranger: 'guide',
  rogue: 'criminal',
  sorcerer: 'noble',
  warlock: 'charlatan',
  wizard: 'sage',
}

/** A level 1 creation: the suggested array, the background's +2/+1, a human. */
export function creation(
  slug: string,
  species = 'human',
  background = BACKGROUND[slug]!,
): Dnd5eCreation {
  const c = emptyCreation()
  c.classSlug = slug
  c.speciesSlug = species
  c.backgroundSlug = background
  c.base = { ...SUGGESTED_ARRAY[slug]! }
  const bg = data.backgrounds.find((b) => b.slug === background)!
  const order = [...cls(slug).primaryAbility.abilities, 'CON', 'DEX', 'WIS']
  const ranked = [...bg.abilities].sort((a, b) => {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  c.bonus = { [ranked[0]!]: 2, [ranked[1]!]: 1 }
  return c
}

export function build(slug: string, species?: string, background?: string) {
  const c = creation(slug, species, background)
  const prefer = { abilities: cls(slug).primaryAbility.abilities }
  const choices = fill((p) => creationPicks(c, p, data), prefer)
  return { sheet: buildDnd5eSheet(c, choices, data), choices, creation: c }
}

/** Levels a built sheet up to `to` with first-valid picks and the fixed HP value. */
export function levelTo(sheet: Dnd5eSheet, from: number, to: number, subclass?: string) {
  const prefer = { abilities: cls(sheet.classSlug!).primaryAbility.abilities, subclass }
  for (let level = from + 1; level <= to; level++) {
    const picks = fill((p) => dnd5eLevelPlan(sheet, level, data, p)!.picks, prefer)
    const die = cls(sheet.classSlug!).hitDie
    applyDnd5eLevel(sheet, level, { hpRoll: die / 2 + 1, picks }, data)
  }
  return sheet
}
