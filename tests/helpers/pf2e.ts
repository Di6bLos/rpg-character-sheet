// Shared PF2e test helpers: the generated data read from disk, and a level 1 creation
// filled with the first valid picks, so every class can be built.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Pf2eData } from '../../data/pf2e'
import type { Pf2eClassDef } from '../../data/pf2e/types'
import type {
  Pf2eAttr,
  Pf2eCreation,
  Pf2eLevelInput,
  Pf2eRank,
  Pf2eSheet,
} from '../../types/sheets'
import {
  PF2E_ATTRS,
  PF2E_SKILL_NAMES,
  type Pf2eBuildData,
  ancestryBoostPlan,
  backgroundBoostSlots,
  creationFocusSpells,
  focusChoice,
  deityOptions,
  emptyCreation,
  featOptions,
  featSlots,
  keyAttributeOptions,
  needsDeity,
  resolve,
  skillPlan,
  spellOptions,
  spellcastingPlan,
  subclassChoices,
} from '../../utils/pf2eBuild'
import {
  applyPf2eLevel,
  emptyLevelInput,
  featPrerequisites,
  levelFeatOptions,
  levelSpellOptions,
  pf2eLevelPlan,
} from '../../utils/pf2eLevelUp'

const dir = join(import.meta.dirname, '..', '..', 'data', 'pf2e', 'generated')
export const loadSet = <K extends keyof Pf2eData>(set: K): Pf2eData[K] =>
  JSON.parse(readFileSync(join(dir, `${set}.json`), 'utf8'))

export const buildData: Pf2eBuildData = {
  classes: loadSet('classes'),
  ancestries: loadSet('ancestries'),
  heritages: loadSet('heritages'),
  backgrounds: loadSet('backgrounds'),
  feats: loadSet('feats'),
  deities: loadSet('deities'),
  weapons: loadSet('weapons'),
  armor: loadSet('armor'),
  shields: loadSet('shields'),
  spells: loadSet('spells'),
}

export const named = <T extends { name: string }>(list: T[], name: string) => {
  const found = list.find((x) => x.name === name)
  if (!found) throw new Error(`No ${name} in the data`)
  return found
}

/** The first valid boost for each of a background's slots, each to a different attribute. */
export function fillSlots(slots: ReturnType<typeof backgroundBoostSlots>): Pf2eAttr[] {
  const out: Pf2eAttr[] = []
  for (const s of slots) out.push(s.allowed.find((a) => !out.includes(a))!)
  return out
}

/** A human with the first valid pick for everything else, or the named subclass options. */
export function autoCreation(
  cls: Pf2eClassDef,
  data = buildData,
  backgroundName = 'Acolyte',
  subclassNames: string[] = [],
): Pf2eCreation {
  const c = emptyCreation()
  const human = named(data.ancestries, 'Human')
  c.ancestry = human.id
  c.heritage = data.heritages.find((h) => h.ancestry === 'human')!.id
  const background = named(data.backgrounds, backgroundName)
  c.background = background.id
  c.class = cls.id
  const plan = ancestryBoostPlan(human, false)
  c.ancestryBoosts = PF2E_ATTRS.filter((a) => !plan.fixed.includes(a)).slice(0, plan.free)
  for (const ch of subclassChoices(cls)) {
    const wanted = ch.options.filter((o) => subclassNames.includes(o.name))
    c.subclasses[ch.key] = (wanted.length ? wanted : ch.options)
      .slice(0, ch.count.min)
      .map((o) => o.id)
  }
  const { subclassPicks } = resolve(c, data)
  if (needsDeity(cls, subclassPicks) || background.deitySkill) c.deity = deityOptions(data)[0]!.id
  c.backgroundBoosts = fillSlots(backgroundBoostSlots(background, resolve(c, data).deity))
  c.keyAttribute = keyAttributeOptions(cls, subclassPicks)[0]!
  c.freeBoosts = pickFour(c.keyAttribute)
  const plan2 = skillPlan(c, data)
  const picks: string[] = []
  for (const g of plan2.groups)
    picks.push(
      ...g.options.filter((o) => !plan2.fixed.includes(o) && !picks.includes(o)).slice(0, g.count),
    )
  picks.push(
    ...PF2E_SKILL_NAMES.filter((s) => !plan2.fixed.includes(s) && !picks.includes(s)).slice(
      0,
      plan2.free,
    ),
  )
  c.skills = picks
  c.lores = plan2.lores.map(() => 'Local')
  for (const slot of featSlots(resolve(c, data).cls))
    c.feats[slot] = featOptions(slot, c, data)[0]!.id
  if (spellcastingPlan(c, data)?.traditionChoice) c.tradition = 'Arcane'
  const casting = spellcastingPlan(c, data)
  const choice = focusChoice(c, data)
  if (choice) c.focus = [...creationFocusSpells(c, data), choice.options[0]!].map((s) => s.id)
  if (casting) {
    c.spells = {
      cantrips: spellOptions('cantrip', c, data)
        .slice(0, casting.cantrips)
        .map((s) => s.id),
      rank1: spellOptions('spell', c, data)
        .slice(0, casting.rank1)
        .map((s) => s.id),
    }
    if (casting.fonts.length > 1) c.font = casting.fonts[0]
  }
  return c
}

function pickFour(key: Pf2eAttr): Pf2eAttr[] {
  return [key, ...PF2E_ATTRS.filter((a) => a !== key)].slice(0, 4)
}

/** The first valid picks for a level-up: boosts to the key attribute first, common feats whose
 * prerequisites the hero meets, the first skills that can rise, the first spells. */
export function autoLevelPicks(
  sheet: Pf2eSheet,
  level: number,
  data = buildData,
  boosts?: Pf2eAttr[],
): Pf2eLevelInput {
  const picks = emptyLevelInput()
  let plan = pf2eLevelPlan(sheet, level, data, picks)!
  if (plan.boosts)
    picks.boosts =
      boosts ??
      [sheet.keyAttr, ...(['CON', 'DEX', 'WIS', 'STR'] as const)]
        .filter((a, i, all) => all.indexOf(a) === i)
        .slice(0, 4)
  for (const c of plan.choices) picks.choices[c.key] = c.options.slice(0, c.count).map((o) => o.id)
  plan = pf2eLevelPlan(sheet, level, data, picks)!
  for (const slot of plan.feats) {
    const taken = Object.values(picks.feats)
    const f = levelFeatOptions(slot.kind, sheet, level, data).find(
      (x) =>
        x.rarity === 'common' &&
        !taken.includes(x.id) &&
        !featPrerequisites(x, sheet, data).unmet.length,
    )
    if (f) picks.feats[slot.key] = f.id
  }
  const ranks = Object.fromEntries(sheet.skills.map((s) => [s.name, s.rank]))
  const order = ['U', 'T', 'E', 'M', 'L']
  for (let i = 0; i < plan.skillIncreases; i++) {
    const s = sheet.skills.find((x) => {
      const now = ranks[x.name] ?? 'U'
      return now !== 'L' && order.indexOf(now) + 1 <= order.indexOf(plan.skillMax)
    })
    if (!s) break
    ranks[s.name] = order[order.indexOf(ranks[s.name] ?? 'U') + 1] as Pf2eRank
    picks.skills.push(s.name)
  }
  picks.trained = sheet.skills
    .filter((s) => (ranks[s.name] ?? 'U') === 'U')
    .slice(0, plan.trained)
    .map((s) => s.name)
  for (const sp of plan.spells) {
    if (sp.optional) continue
    picks.spells[sp.key] = levelSpellOptions(sp, sheet, data)
      .filter((s) => !Object.values(picks.spells).flat().includes(s.id))
      .slice(0, sp.count)
      .map((s) => s.id)
  }
  return picks
}

/** A builder-made hero levelled from 1 to `to` with `autoLevelPicks`. */
export function levelTo(sheet: Pf2eSheet, to: number, data = buildData) {
  for (let l = 2; l <= to; l++) applyPf2eLevel(sheet, l, autoLevelPicks(sheet, l, data), data)
  return sheet
}
