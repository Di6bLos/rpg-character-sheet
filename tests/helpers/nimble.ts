// Shared Nimble test helpers: build a hero and level it with first-valid picks.
import { expect } from 'vitest'
import { ancestryBySlug } from '../../data/nimble/ancestries'
import { backgroundBySlug } from '../../data/nimble/backgrounds'
import { STAT_ARRAYS } from '../../data/nimble/core'
import type { ClassDef } from '../../data/nimble/types'
import type { NimbleSheet, NimbleStat } from '../../types/sheets'
import {
  applyNimbleLevel,
  buildNimbleSheet,
  creationChoices,
  nimbleLevelPlan,
  recommendedStats,
  validatePicks,
  type Picks,
  type ResolvedChoice,
} from '../../utils/nimbleBuild'

export const human = ancestryBySlug('human')!
export const survivalist = backgroundBySlug('survivalist')!
export const standard = STAT_ARRAYS[0]!.values

/** Picks the first valid options for every choice, as a player in a hurry would. */
export function autoPick(choices: ResolvedChoice[]): Picks {
  const picks: Picks = {}
  for (const c of choices) {
    if (c.text) {
      picks[c.key] = ['Test boon']
      continue
    }
    if (c.perGroup) {
      const seen = new Set<string | undefined>()
      picks[c.key] = c.options
        .filter((o) => !seen.has(o.group) && seen.add(o.group))
        .map((o) => o.value)
      continue
    }
    picks[c.key] = c.options.slice(0, c.count).map((o) => o.value)
  }
  return picks
}

/** Resolves choices one at a time so picks never collide, then returns all picks. */
export function pickLevel(sheet: NimbleSheet, level: number, subclassSlug?: string): Picks {
  const picks: Picks = {}
  const plan = nimbleLevelPlan(sheet, level, { subclassSlug })!
  for (let i = 0; i < plan.choices.length; i++) {
    const fresh = nimbleLevelPlan(sheet, level, { subclassSlug, pending: picks })!
    const choice = fresh.choices[i]!
    Object.assign(picks, autoPick([choice]))
  }
  return picks
}

export function build(cls: ClassDef, ancestry = human, background = survivalist) {
  const stats = recommendedStats(cls, standard)
  const picks = autoPick(creationChoices(cls, background))
  return buildNimbleSheet({ cls, ancestry, background, stats, skillPoints: { Might: 2 }, picks })
}

export function levelTo(sheet: NimbleSheet, target: number, subclassSlug: string) {
  for (let level = 2; level <= target; level++) {
    const plan = nimbleLevelPlan(sheet, level)!
    const sub = plan.subclassChoice ? subclassSlug : undefined
    const picks = pickLevel(sheet, level, sub)
    const full = nimbleLevelPlan(sheet, level, { subclassSlug: sub, pending: picks })!
    for (const c of full.choices) expect(validatePicks(c, picks[c.key]), `${c.key}`).toBeNull()
    const bumps: Partial<Record<NimbleStat, number>> = {}
    if (plan.statIncrease)
      plan.statIncrease.stats.slice(0, plan.statIncrease.count).forEach((s) => (bumps[s] = 1))
    applyNimbleLevel(sheet, level, { hpGain: 5, statBumps: bumps, subclassSlug: sub, picks })
  }
}
