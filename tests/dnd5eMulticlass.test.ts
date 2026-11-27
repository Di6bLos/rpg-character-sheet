// Multiclassing in the 5e (2024) builder and level-up (SRD 5.2.1 pp. 24–26): the ability
// prerequisites, what a new class gives, class levels and subclasses kept per class, the
// Multiclass Spellcaster table with Pact Magic apart, Extra Attack and Unarmored Defense once,
// and replaying multiclass levels from the level history. The golden table records four builds
// level by level in tests/fixtures/dnd5e/multiclass.levels.json.
//
// To record or refresh it:  npx vitest run tests/dnd5eMulticlass.test.ts -u
import { describe, expect, it } from 'vitest'
import type { Dnd5eAbility, Dnd5eSheet } from '../types/sheets'
import { buildDnd5eSheet, casterLevel, creationPicks, multiclassGains } from '../utils/dnd5eBuild'
import { applyDnd5eLevel, dnd5eLevelPlan, dnd5eLevelProblems } from '../utils/dnd5eLevelUp'
import { restoreLevel } from '../utils/levelHistory'
import { cls, creation, data, fill } from './helpers/dnd5e'

/** A level 1 hero with these base scores (a Standard Array order) and the class's background. */
function hero(slug: string, base: Record<Dnd5eAbility, number>, subclass?: string) {
  const c = creation(slug)
  c.base = base
  const prefer = { abilities: cls(slug).primaryAbility.abilities, subclass }
  const choices = fill((p) => creationPicks(c, p, data), prefer)
  return buildDnd5eSheet(c, choices, data)
}

/** Levels the sheet once in `slug` with first-valid picks and the fixed Hit Point value. */
function levelIn(sheet: Dnd5eSheet, level: number, slug: string, subclass?: string) {
  const start = { [`L${level}:class`]: [slug] }
  const prefer = { abilities: cls(slug).primaryAbility.abilities, subclass }
  const picks = fill((p) => dnd5eLevelPlan(sheet, level, data, p)!.picks, prefer, start)
  const plan = dnd5eLevelPlan(sheet, level, data, picks)!
  const input = { hpRoll: plan.hp.fixed, picks }
  expect(dnd5eLevelProblems(plan, input), `${slug} at level ${level}`).toEqual([])
  applyDnd5eLevel(sheet, level, input, data)
  return plan
}

interface Build {
  name: string
  first: string
  base: Record<Dnd5eAbility, number>
  /** The class of each level after the first, with the subclass to pick. */
  levels: [string, string?][]
}

const BUILDS: Build[] = [
  {
    name: 'Paladin 2 / Warlock 3',
    first: 'paladin',
    base: { STR: 15, DEX: 10, CON: 13, INT: 8, WIS: 12, CHA: 14 },
    levels: [['paladin'], ['warlock'], ['warlock'], ['warlock', 'fiend-patron']],
  },
  {
    name: 'Fighter 1 / Wizard 5',
    first: 'fighter',
    base: { STR: 15, DEX: 12, CON: 14, INT: 13, WIS: 10, CHA: 8 },
    levels: [['wizard'], ['wizard'], ['wizard', 'evoker'], ['wizard'], ['wizard']],
  },
  {
    name: 'Rogue 3 (Arcane Trickster) / Ranger 2',
    first: 'rogue',
    base: { STR: 10, DEX: 15, CON: 13, INT: 12, WIS: 14, CHA: 8 },
    levels: [['rogue'], ['rogue', 'arcane-trickster'], ['ranger'], ['ranger']],
  },
  {
    name: 'Cleric 1 / Druid 4 / Artificer 2',
    first: 'cleric',
    base: { STR: 12, DEX: 10, CON: 13, INT: 14, WIS: 15, CHA: 8 },
    levels: [
      ['druid'],
      ['druid'],
      ['druid', 'circle-of-the-land'],
      ['druid'],
      ['artificer'],
      ['artificer'],
    ],
  },
]

function play(b: Build) {
  const sheet = hero(b.first, b.base)
  b.levels.forEach(([slug, sub], i) => levelIn(sheet, i + 2, slug, sub))
  return sheet
}

function row(sheet: Dnd5eSheet, plan?: ReturnType<typeof levelIn>) {
  const c = sheet.castingStats
  return {
    class: sheet.class,
    features: plan
      ? plan.features.map((f) => `${f.from}: ${f.name}`)
      : sheet.features
          .filter((f) => f.from && f.from !== 'Summary')
          .map((f) => `${f.from}: ${f.name}`),
    picks: plan?.picks.map((p) => `${p.key} ${p.kind}×${p.count}${p.optional ? '?' : ''}`) ?? [],
    profBonus: sheet.profBonus,
    hpMax: sheet.hpMax,
    hitDice: (sheet.hitDice ?? []).map((d) => `${d.count}d${d.die}`),
    slots: c?.slots ?? [],
    pact: c?.pact ? `${c.pact.slots}×${c.pact.level}` : null,
    casting: (sheet.castingClasses ?? []).map(
      (k) =>
        `${k.className} ${k.level}: DC ${k.saveDc}, ${k.cantrips} cantrips, ${k.prepared} prepared to level ${k.maxSpellLevel}`,
    ),
    weapons: sheet.proficiencies?.weapons ?? [],
    armor: sheet.proficiencies?.armor ?? [],
    saves: sheet.saveProfs,
  }
}

describe('5e multiclassing: golden builds', () => {
  it('Paladin 2/Warlock 3, Fighter 1/Wizard 5, Rogue 3/Ranger 2, Cleric 1/Druid 4/Artificer 2', async () => {
    const table = Object.fromEntries(
      BUILDS.map((b) => {
        const sheet = hero(b.first, b.base)
        const rows = [row(sheet)]
        b.levels.forEach(([slug, sub], i) =>
          rows.push(row(sheet, levelIn(sheet, i + 2, slug, sub))),
        )
        return [b.name, rows]
      }),
    )
    await expect(`${JSON.stringify(table, null, 2)}\n`).toMatchFileSnapshot(
      './fixtures/dnd5e/multiclass.levels.json',
    )
  })
})

describe('5e multiclassing: the rules', () => {
  it('a new class needs 13+ in its primary ability and the current class’s (SRD 5.2.1 p. 24)', () => {
    const sheet = hero('fighter', { STR: 15, DEX: 14, CON: 13, INT: 8, WIS: 12, CHA: 10 })
    const pick = dnd5eLevelPlan(sheet, 2, data)!.picks.find((p) => p.kind === 'class')!
    expect(pick.optional).toBe(true)
    expect(pick.options.find((o) => o.id === 'fighter')?.disabled).toBeUndefined()
    expect(pick.options.find((o) => o.id === 'wizard')?.disabled).toBe(
      'Needs Intelligence 13+ (Wizard)',
    )
    expect(pick.options.find((o) => o.id === 'paladin')?.disabled).toBe(
      'Needs Strength and Charisma 13+ (Paladin)',
    )
    expect(pick.options.find((o) => o.id === 'barbarian')?.disabled).toBeUndefined()
    const weak = hero('wizard', { STR: 8, DEX: 14, CON: 13, INT: 15, WIS: 12, CHA: 10 })
    weak.abilities.INT = 12
    const wpick = dnd5eLevelPlan(weak, 2, data)!.picks.find((p) => p.kind === 'class')!
    expect(wpick.options.find((o) => o.id === 'rogue')?.disabled).toBe(
      'Needs Intelligence 13+ (Wizard)',
    )
  })

  it('a picked class whose prerequisites fail is a problem; an empty pick goes on in the first class', () => {
    const sheet = hero('fighter', { STR: 15, DEX: 14, CON: 13, INT: 8, WIS: 12, CHA: 10 })
    const picks = { 'L2:class': ['wizard'] }
    const plan = dnd5eLevelPlan(sheet, 2, data, picks)!
    const problems = dnd5eLevelProblems(plan, { hpRoll: 4, picks })
    expect(problems.map((p) => p.key)).toContain('L2:class')
    const same = dnd5eLevelPlan(sheet, 2, data)!
    expect(same.hp.die).toBe(10)
    expect(same.features.map((f) => f.name)).toContain('Action Surge')
  })

  it('a new class gives only its multiclass proficiencies and its Hit Die', () => {
    expect(multiclassGains(cls('rogue'))).toMatchObject({
      armor: ['Light armor'],
      weapons: [],
      skill: cls('rogue').skills.options,
      instrument: false,
    })
    expect(multiclassGains(cls('fighter')).armor).toEqual([
      'Light armor',
      'Medium armor',
      'Shields',
    ])
    expect(multiclassGains(cls('bard'))).toMatchObject({ armor: ['Light armor'], instrument: true })
    expect(multiclassGains(cls('wizard'))).toMatchObject({ armor: [], weapons: [], skill: null })
    expect(multiclassGains(cls('artificer')).tools).toEqual(['Tinker’s Tools'])

    const sheet = hero('rogue', { STR: 10, DEX: 15, CON: 13, INT: 12, WIS: 14, CHA: 8 })
    const plan = levelIn(sheet, 2, 'ranger')
    expect(plan.hp.die).toBe(10)
    expect(plan.picks.some((p) => p.key === 'L2:multiclass:skill')).toBe(true)
    expect(sheet.saveProfs).toEqual(['DEX', 'INT'])
    expect(sheet.proficiencies!.weapons).toContain('Martial weapons')
    expect(sheet.proficiencies!.armor).toEqual(
      expect.arrayContaining(['Light armor', 'Medium armor', 'Shields']),
    )
    expect(sheet.proficiencies!.armor).not.toContain('Heavy armor')
    expect(plan.features.map((f) => f.name)).toEqual(
      expect.arrayContaining(['Spellcasting', 'Favored Enemy', 'Weapon Mastery']),
    )
  })

  it('levels, subclasses and ASIs are per class; the Proficiency Bonus is the total level’s', () => {
    const sheet = hero('cleric', { STR: 12, DEX: 10, CON: 13, INT: 14, WIS: 15, CHA: 8 })
    const asked = (level: number, slug: string, sub?: string) =>
      levelIn(sheet, level, slug, sub).picks.map((p) => p.key)
    expect(asked(2, 'druid')).not.toContain('L2:subclass')
    expect(asked(3, 'druid')).not.toContain('L3:subclass')
    expect(asked(4, 'druid', 'circle-of-the-land')).toContain('L4:subclass')
    expect(asked(5, 'druid')).toContain('L5:asi')
    expect(sheet.classes).toEqual([
      { slug: 'cleric', name: 'Cleric', level: 1, hitDie: 8 },
      {
        slug: 'druid',
        name: 'Druid',
        level: 4,
        hitDie: 8,
        subclassSlug: 'circle-of-the-land',
        subclass: 'Circle of the Land',
      },
    ])
    expect(sheet.classSlug).toBe('cleric')
    expect(sheet.subclassSlug).toBe('')
    expect(sheet.profBonus).toBe(3)
    expect(sheet.hitDice).toEqual([{ die: 8, count: 5 }])
    expect(asked(6, 'cleric')).not.toContain('L6:asi')
  })

  it('slots come from the Multiclass Spellcaster table; Pact Magic stays apart', () => {
    expect([casterLevel('full', 5), casterLevel('half', 3), casterLevel('third', 5)]).toEqual([
      5, 2, 1,
    ])
    const [pw, fw, rr, cda] = BUILDS.map(play)
    // Paladin 2 has the only Spellcasting feature: its own table. Warlock 3: two level 2 slots.
    expect(pw!.castingStats!.slots.slice(0, 3)).toEqual([2, 0, 0])
    expect(pw!.castingStats!.pact).toEqual({ slots: 2, level: 2 })
    expect(pw!.castingClasses!.map((c) => c.classSlug)).toEqual(['paladin', 'warlock'])
    // Fighter 1 / Wizard 5: the wizard's own table.
    expect(fw!.castingStats!.slots.slice(0, 4)).toEqual([4, 3, 2, 0])
    // Arcane Trickster 3 (a third, 1) + Ranger 2 (half up, 1): level 2 on the table.
    expect(rr!.castingStats!.slots.slice(0, 2)).toEqual([3, 0])
    // Cleric 1 + Druid 4 + Artificer 2 (half up, 1): level 6.
    expect(cda!.castingStats!.slots.slice(0, 4)).toEqual([4, 3, 3, 0])
    const druid = cda!.castingClasses!.find((c) => c.classSlug === 'druid')!
    expect(druid.maxSpellLevel).toBe(2)
    expect(cda!.castingClasses!.find((c) => c.classSlug === 'artificer')!.ability).toBe('INT')
    expect(
      cda!.spells!.filter((s) => s.from === 'Artificer').every((s) => s.ability === 'INT'),
    ).toBe(true)
    expect(pw!.spells!.filter((s) => s.from === 'Warlock' && s.level === 0)).toHaveLength(2)
  })

  it('Extra Attack doesn’t stack; Unarmored Defense stays the first class’s', () => {
    const fp = hero('fighter', { STR: 15, DEX: 10, CON: 13, INT: 8, WIS: 12, CHA: 14 })
    for (let l = 2; l <= 5; l++) levelIn(fp, l, 'fighter')
    for (let l = 6; l <= 10; l++) levelIn(fp, l, 'paladin')
    expect(fp.features.filter((f) => f.name === 'Extra Attack')).toHaveLength(1)

    const bm = hero('barbarian', { STR: 15, DEX: 14, CON: 12, INT: 10, WIS: 13, CHA: 8 })
    const plan = levelIn(bm, 2, 'monk')
    expect(plan.features.map((f) => f.name)).not.toContain('Unarmored Defense')
    expect(bm.features.filter((f) => f.name === 'Unarmored Defense').map((f) => f.from)).toEqual([
      'Barbarian 1',
    ])
  })

  it('a single-class sheet still names its class and subclass the old way', () => {
    const sheet = hero('fighter', { STR: 15, DEX: 14, CON: 13, INT: 8, WIS: 12, CHA: 10 })
    for (let l = 2; l <= 3; l++) levelIn(sheet, l, 'fighter', 'champion')
    expect(sheet.class).toBe('Fighter (Champion)')
    expect(sheet.classes).toHaveLength(1)
    expect(sheet.castingClasses).toBeUndefined()
  })

  it('lowering a level and Reconfigure replay multiclass levels from the history', () => {
    const sheet = play(BUILDS[0]!)
    const after = JSON.parse(JSON.stringify(sheet)) as Dnd5eSheet
    const recorded = (sheet.levelHistory ?? []).filter((e) => e.level > 2).map((e) => e.dnd5e!)
    expect(restoreLevel(sheet, 2)).toBe(true)
    expect(sheet.classes).toEqual([{ slug: 'paladin', name: 'Paladin', level: 2, hitDie: 10 }])
    expect(sheet.castingStats!.pact).toBeUndefined()
    recorded.forEach((input, i) => {
      const plan = dnd5eLevelPlan(sheet, i + 3, data, input.picks)!
      expect(dnd5eLevelProblems(plan, input)).toEqual([])
      applyDnd5eLevel(sheet, i + 3, input, data)
    })
    const strip = (s: Dnd5eSheet) => ({ ...s, levelHistory: undefined })
    expect(strip(sheet)).toEqual(strip(after))
  })
})
