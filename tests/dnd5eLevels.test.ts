// Golden level tables: what each 5e class (with its SRD subclass) gains and is asked at levels
// 1–20, compared with a fixture in tests/fixtures/dnd5e/<class>.levels.json. The hero is a human
// with the Standard Array by Class, levelled with the first valid picks and the fixed Hit Point
// value, so the tables change only when the data or the rules engine does.
//
// To record or refresh one:  DND5E_GOLDEN=wizard npx vitest run tests/dnd5eLevels.test.ts -u
// (comma-separate several slugs, or use DND5E_GOLDEN=all). Classes without a fixture are skipped.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Dnd5eSheet } from '../types/sheets'
import { creationPicks } from '../utils/dnd5eBuild'
import { applyDnd5eLevel, dnd5eLevelPlan } from '../utils/dnd5eLevelUp'
import { build, cls, data, fill } from './helpers/dnd5e'

const fixture = (slug: string) => `./fixtures/dnd5e/${slug}.levels.json`
const hasFixture = (slug: string) =>
  existsSync(fileURLToPath(new URL(fixture(slug), import.meta.url)))
const golden = (process.env.DND5E_GOLDEN ?? '').split(',').filter(Boolean)
const wanted = (slug: string) => golden.includes('all') || golden.includes(slug) || hasFixture(slug)

interface LevelRow {
  level: number
  features: string[]
  picks: string[]
  after: {
    profBonus: number
    hpMax: number
    ac: number
    slots: number[]
    pact: string | null
    cantrips: number
    prepared: number
    resources: string[]
    options: number
    masteries: number
    feats: number
  }
}

function after(sheet: Dnd5eSheet): LevelRow['after'] {
  const c = sheet.castingStats
  return {
    profBonus: sheet.profBonus,
    hpMax: sheet.hpMax,
    ac: sheet.ac,
    slots: c?.slots ?? [],
    pact: c?.pact ? `${c.pact.slots}×${c.pact.level}` : null,
    cantrips: c?.cantrips ?? 0,
    prepared: c?.prepared ?? 0,
    resources: (sheet.resources ?? []).map(
      (r) => `${r.name} ${r.max}${r.dice ? `×${r.dice}` : ''}/${r.recharge}`,
    ),
    options: sheet.options?.length ?? 0,
    masteries: sheet.masteries?.length ?? 0,
    feats: sheet.featsTaken?.length ?? 0,
  }
}

const pickLine = (p: { key: string; kind: string; count: number; optional?: boolean }) =>
  `${p.key} ${p.kind}×${p.count}${p.optional ? '?' : ''}`

/** The SRD subclass of each class (the Artificer, outside the SRD, takes its first). */
function srdSubclass(slug: string) {
  const subs = data.subclasses.filter((s) => s.class === slug)
  return (subs.find((s) => s.srd) ?? subs[0])!.slug
}

function levelTable(slug: string): LevelRow[] {
  const prefer = { abilities: cls(slug).primaryAbility.abilities, subclass: srdSubclass(slug) }
  const { sheet, creation, choices } = build(slug)
  const rows: LevelRow[] = [
    {
      level: 1,
      features: sheet.features.filter((f) => f.from && f.from !== 'Summary').map((f) => `${f.from}: ${f.name}`),
      picks: creationPicks(creation, choices, data).map(pickLine),
      after: after(sheet),
    },
  ]
  for (let level = 2; level <= 20; level++) {
    const picks = fill((p) => dnd5eLevelPlan(sheet, level, data, p)!.picks, prefer)
    const plan = dnd5eLevelPlan(sheet, level, data, picks)!
    applyDnd5eLevel(sheet, level, { hpRoll: plan.hp.fixed, picks }, data)
    rows.push({
      level,
      features: plan.features.map((f) => `${f.from}: ${f.name}`),
      picks: plan.picks.map(pickLine),
      after: after(sheet),
    })
  }
  return rows
}

describe('golden 5e level tables', () => {
  const classes = data.classes.filter((c) => wanted(c.slug))
  if (!classes.length) it.skip('no fixtures yet', () => {})
  for (const c of classes)
    it(`${c.slug} matches its level table`, async () => {
      const table = { [srdSubclass(c.slug)]: levelTable(c.slug) }
      await expect(`${JSON.stringify(table, null, 2)}\n`).toMatchFileSnapshot(fixture(c.slug))
    })
})
