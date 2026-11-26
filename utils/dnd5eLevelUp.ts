// The data-driven 5e (2024) level-up (SRD 5.2.1 p. 23): what reaching a level grants and asks
// for, read from the same walk as the level 1 build (`utils/dnd5eBuild.ts`), and applying it
// with a level history entry so it can be undone and replayed (Reconfigure).
import type { Dnd5eAbility, Dnd5eFeatureEntry, Dnd5eLevelInput, Dnd5eSheet } from '~/types/sheets'
import {
  type Dnd5eBuildData,
  type Dnd5eBuildState,
  type Dnd5ePick,
  DND5E_ABILITIES,
  dnd5eNumbers,
  fixedHp,
  pickProblem,
  proficiencyBonus,
  walkDnd5e,
  writeBuild,
} from '~/utils/dnd5eBuild'
import { recordLevel } from '~/utils/levelHistory'

/** XP needed for each level (SRD 5.2.1 p. 23), index 0 = level 1. */
export const DND5E_XP = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000,
  195000, 225000, 265000, 305000, 355000,
]

export interface Dnd5eLevelPlan {
  level: number
  /** Hit Points: the Hit Die (its fixed value), CON now and after, and per-level bonuses. */
  hp: { die: number; fixed: number; con: number; perLevel: number; retro: number }
  profBonus: { from: number; to: number }
  /** Features, traits, feats and options that arrive at this level. */
  features: Dnd5eFeatureEntry[]
  picks: Dnd5ePick[]
  /** Spell slot changes, by spell level. */
  slots: { level: number; from: number; to: number }[]
  pact: { from: string; to: string } | null
  /** Resources that are new or change their maximum or die. */
  resources: { name: string; from: string; to: string }[]
  /** Ability increases the picks so far make. */
  increases: Partial<Record<Dnd5eAbility, number>>
}

/** Whether the sheet was built from the 5e data (and so levels up from it). */
export function isBuiltDnd5e(sheet: Dnd5eSheet): boolean {
  return !!sheet.classSlug && !!sheet.creation
}

const earlier = (choices: Record<string, string[]> | undefined, level: number) =>
  Object.fromEntries(
    Object.entries(choices ?? {}).filter(([k]) => Number(/^L(\d+):/.exec(k)?.[1] ?? 0) < level),
  )

function walks(
  sheet: Dnd5eSheet,
  level: number,
  data: Dnd5eBuildData,
  picks: Record<string, string[]>,
) {
  const creation = sheet.creation
  if (!creation) return null
  const before = walkDnd5e({ creation, choices: earlier(sheet.choices, level) }, level - 1, data)
  const after = walkDnd5e(
    { creation, choices: { ...earlier(sheet.choices, level), ...picks } },
    level,
    data,
    sheet.abilities,
  )
  return before && after ? { before, after } : null
}

/** The sheet's abilities after a level's increases. */
function raised(sheet: Dnd5eSheet, st: Dnd5eBuildState): Record<Dnd5eAbility, number> {
  return Object.fromEntries(
    DND5E_ABILITIES.map((a) => [a, sheet.abilities[a] + (st.increases[a] ?? 0)]),
  ) as Record<Dnd5eAbility, number>
}

/**
 * A copy of the sheet as the walk leaves it at `level`, for the plan's before/after numbers. The
 * level history (a snapshot per level) stays out of the copy: the plan never reads it.
 */
function projected(
  sheet: Dnd5eSheet,
  st: Dnd5eBuildState,
  level: number,
  abilities = sheet.abilities,
) {
  const copy = JSON.parse(JSON.stringify({ ...sheet, levelHistory: [] })) as Dnd5eSheet
  copy.abilities = { ...abilities }
  writeBuild(copy, st, level)
  return copy
}

/**
 * What reaching `level` grants and asks for, with `picks` made so far (they change what's asked
 * next: a feat's own choices, a subclass's features). Null for a hand-made sheet or one whose
 * class isn't in the data.
 */
export function dnd5eLevelPlan(
  sheet: Dnd5eSheet,
  level: number,
  data: Dnd5eBuildData,
  picks: Record<string, string[]> = {},
): Dnd5eLevelPlan | null {
  if (!isBuiltDnd5e(sheet) || level < 2 || level > 20) return null
  const w = walks(sheet, level, data, picks)
  if (!w) return null
  const { before, after } = w
  const cls = after.ctx.cls
  const old = dnd5eNumbers(before, sheet, level - 1)
  const nowAbilities = raised(sheet, after)
  const now = dnd5eNumbers(after, { ...sheet, abilities: nowAbilities }, level)
  const seen = new Set(before.features.map((f) => `${f.from}|${f.name}`))
  const features = after.features.filter((f) => !seen.has(`${f.from}|${f.name}`))
  const oldSheet = projected(sheet, before, level - 1)
  const newSheet = projected(sheet, after, level, nowAbilities)
  const slotsBefore = oldSheet.castingStats?.slots ?? []
  const slotsAfter = newSheet.castingStats?.slots ?? []
  const slots = Array.from({ length: 9 }, (_, i) => ({
    level: i + 1,
    from: slotsBefore[i] ?? 0,
    to: slotsAfter[i] ?? 0,
  })).filter((s) => s.from !== s.to)
  const pactText = (p: { slots: number; level: number } | undefined) =>
    p ? `${p.slots} × level ${p.level}` : 'none'
  const pact =
    pactText(oldSheet.castingStats?.pact) !== pactText(newSheet.castingStats?.pact)
      ? { from: pactText(oldSheet.castingStats?.pact), to: pactText(newSheet.castingStats?.pact) }
      : null
  const res = (r: { max: number; dice?: string }) => `${r.max}${r.dice ? ` × ${r.dice}` : ''}`
  const resources = (newSheet.resources ?? []).flatMap((r) => {
    const was = oldSheet.resources?.find((x) => x.name === r.name)
    const from = was ? res(was) : 'new'
    return from === res(r) ? [] : [{ name: r.name, from, to: res(r) }]
  })
  return {
    level,
    hp: {
      die: cls.hitDie,
      fixed: fixedHp(cls.hitDie),
      con: now.con,
      perLevel: now.hpPerLevel,
      retro: (level - 1) * (now.con - old.con + now.hpPerLevel - old.hpPerLevel),
    },
    profBonus: { from: proficiencyBonus(level - 1), to: proficiencyBonus(level) },
    features,
    picks: after.asked,
    slots,
    pact,
    resources,
    increases: { ...after.increases },
  }
}

/** Max HP a level adds: the die (min 1 with CON), per-level bonuses, and earlier levels' change. */
export function levelHpGain(plan: Dnd5eLevelPlan, hpRoll: number): number {
  return Math.max(1, hpRoll + plan.hp.con) + plan.hp.perLevel + plan.hp.retro
}

/** What the level-up still needs, each with the pick it belongs to. */
export function dnd5eLevelProblems(
  plan: Dnd5eLevelPlan,
  input: Dnd5eLevelInput,
): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = []
  if (!Number.isInteger(input.hpRoll) || input.hpRoll < 1 || input.hpRoll > plan.hp.die)
    out.push({
      key: 'hp',
      text: `Hit points: enter a d${plan.hp.die} result from 1 to ${plan.hp.die}`,
    })
  for (const p of plan.picks) {
    const e = pickProblem(p, input.picks[p.key])
    if (e) out.push({ key: p.key, text: `${p.label}: ${e}` })
  }
  return out
}

/**
 * Applies a level-up: records the sheet for undo, stores the picks, raises the scores, rewrites
 * what the build gives, and moves HP, AC, Initiative and Passive Perception by their change (so
 * numbers the player edited by hand keep their edit). A hero at 0 HP stays at 0.
 */
export function applyDnd5eLevel(
  sheet: Dnd5eSheet,
  level: number,
  input: Dnd5eLevelInput,
  data: Dnd5eBuildData,
): void {
  const plan = dnd5eLevelPlan(sheet, level, data, input.picks)
  if (!plan) throw new Error(`Not a 5e sheet built from class data (“${sheet.classSlug ?? ''}”)`)
  const w = walks(sheet, level, data, input.picks)!
  const asked = new Set(plan.picks.map((p) => p.key))
  const kept = Object.fromEntries(
    Object.entries(input.picks).filter(([k, v]) => asked.has(k) && v.length),
  )
  recordLevel(sheet, level, undefined, undefined, { hpRoll: input.hpRoll, picks: kept })
  const old = dnd5eNumbers(w.before, sheet, level - 1)
  sheet.choices = { ...earlier(sheet.choices, level), ...kept }
  sheet.abilities = raised(sheet, w.after)
  writeBuild(sheet, w.after, level)
  const now = dnd5eNumbers(w.after, sheet, level)
  const gain = levelHpGain(plan, input.hpRoll)
  sheet.hpMax += gain
  if (sheet.hp > 0) sheet.hp += gain
  sheet.ac += now.ac - old.ac
  sheet.initMod += now.initMod - old.initMod
  sheet.passivePerception += now.passivePerception - old.passivePerception
  sheet.xpNext = DND5E_XP[level] ?? sheet.xpNext
}
