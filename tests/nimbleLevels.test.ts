// Golden level tables: what each Nimble class (with each subclass) gains at levels 1–20,
// compared with a fixture in tests/fixtures/nimble/<class>.levels.json.
//
// A fixture is only written after the rules-auditor agent has checked that class against
// the book, so a fixture means "verified". Classes without one are skipped. To record or
// refresh one:  NIMBLE_GOLDEN=berserker npx vitest run tests/nimbleLevels.test.ts -u
// (comma-separate several slugs, or use NIMBLE_GOLDEN=all).
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { NIMBLE_CLASSES } from '../data/nimble/classes'
import type { ClassDef, SubclassDef } from '../data/nimble/types'
import type { NimbleStat } from '../types/sheets'
import { applyNimbleLevel, nimbleLevelPlan, sheetResource } from '../utils/nimbleBuild'
import { build, pickLevel } from './helpers/nimble'

const fixture = (slug: string) => `./fixtures/nimble/${slug}.levels.json`
const hasFixture = (slug: string) =>
  existsSync(fileURLToPath(new URL(fixture(slug), import.meta.url)))

const golden = (process.env.NIMBLE_GOLDEN ?? '').split(',').filter(Boolean)
const wanted = (slug: string) => golden.includes('all') || golden.includes(slug) || hasFixture(slug)

interface LevelRow {
  level: number
  abilities: string[]
  choices: string[]
  statIncrease: string | null
  subclassChoice: boolean
  spellTier: number | null
  after: {
    hitDie: number
    woundsMax: number
    speed: string
    manaMax: number
    schools: string[]
    resourceDie: number | null
  }
}

function snapshotAfter(sheet: ReturnType<typeof build>, level: number): LevelRow['after'] {
  return {
    hitDie: sheet.hitDie,
    woundsMax: sheet.woundsMax,
    speed: sheet.speed,
    manaMax: sheet.mana.max,
    schools: [...sheet.spells.schools],
    resourceDie: sheetResource(sheet, level)?.die ?? null,
  }
}

/** Levels a hero 1→20 with first-valid picks and records each level's plan. */
function levelTable(cls: ClassDef, sub: SubclassDef): LevelRow[] {
  const sheet = build(cls)
  const rows: LevelRow[] = [
    {
      level: 1,
      abilities: (cls.levels[1]?.abilities ?? []).map((a) => `${cls.name}: ${a.name}`),
      choices: (cls.levels[1]?.choices ?? []).map((c) => `${c.id} ×${c.count}`),
      statIncrease: null,
      subclassChoice: false,
      spellTier: cls.levels[1]?.spellTier ?? null,
      after: snapshotAfter(sheet, 1),
    },
  ]
  for (let level = 2; level <= 20; level++) {
    const asks = nimbleLevelPlan(sheet, level)!.subclassChoice
    const subSlug = asks ? sub.slug : undefined
    const picks = pickLevel(sheet, level, subSlug)
    const plan = nimbleLevelPlan(sheet, level, { subclassSlug: subSlug, pending: picks })!
    const inc = plan.statIncrease
    const bumps: Partial<Record<NimbleStat, number>> = {}
    inc?.stats.slice(0, inc.count).forEach((s) => (bumps[s] = 1))
    applyNimbleLevel(sheet, level, { hpGain: 5, statBumps: bumps, subclassSlug: subSlug, picks })
    rows.push({
      level,
      abilities: plan.abilities.map((a) => `${a.src}: ${a.ability.name}`),
      choices: plan.choices.map((c) => `${c.def.id} ×${c.text ? 'text' : c.count}`),
      statIncrease: inc ? `${inc.stats.join('/')} ×${inc.count}` : null,
      subclassChoice: asks,
      spellTier: plan.spellTier,
      after: snapshotAfter(sheet, level),
    })
  }
  return rows
}

describe('golden Nimble level tables', () => {
  const classes = NIMBLE_CLASSES.filter((c) => wanted(c.slug))
  if (!classes.length) it.skip('no verified fixtures yet', () => {})
  for (const cls of classes)
    it(`${cls.slug} matches its verified level table`, async () => {
      const table = Object.fromEntries(cls.subclasses.map((s) => [s.slug, levelTable(cls, s)]))
      await expect(`${JSON.stringify(table, null, 2)}\n`).toMatchFileSnapshot(fixture(cls.slug))
    })
})
