import { describe, expect, it } from 'vitest'
import { ANCESTRIES, ancestryBySlug } from '../data/nimble/ancestries'
import { BACKGROUNDS, backgroundBySlug } from '../data/nimble/backgrounds'
import { NIMBLE_CLASSES, classBySlug } from '../data/nimble/classes'
import { STAT_ARRAYS, weaponByName } from '../data/nimble/core'
import { SPELLS } from '../data/nimble/spells'
import type { ClassDef } from '../data/nimble/types'
import type { NimbleSheet, NimbleStat } from '../types/sheets'
import { parseDice } from '../utils/dice'
import {
  applyNimbleLevel,
  buildNimbleSheet,
  changeSubclass,
  creationChoices,
  keyStatValue,
  knownSpells,
  nimbleLevelPlan,
  recommendedStats,
  subclassChangeChoices,
  validatePicks,
  type Picks,
  type ResolvedChoice,
} from '../utils/nimbleBuild'
import { restoreLevel } from '../utils/levelHistory'

const human = ancestryBySlug('human')!
const survivalist = backgroundBySlug('survivalist')!
const standard = STAT_ARRAYS[0]!.values

/** Picks the first valid options for every choice, as a player in a hurry would. */
function autoPick(choices: ResolvedChoice[]): Picks {
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
function pickLevel(sheet: NimbleSheet, level: number, subclassSlug?: string): Picks {
  const picks: Picks = {}
  const plan = nimbleLevelPlan(sheet, level, { subclassSlug })!
  for (let i = 0; i < plan.choices.length; i++) {
    const fresh = nimbleLevelPlan(sheet, level, { subclassSlug, pending: picks })!
    const choice = fresh.choices[i]!
    Object.assign(picks, autoPick([choice]))
  }
  return picks
}

function build(cls: ClassDef, ancestry = human, background = survivalist) {
  const stats = recommendedStats(cls, standard)
  const picks = autoPick(creationChoices(cls, background))
  return buildNimbleSheet({ cls, ancestry, background, stats, skillPoints: { Might: 2 }, picks })
}

function levelTo(sheet: NimbleSheet, target: number, subclassSlug: string) {
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

describe('nimble data', () => {
  it('has the 11 classes, each with 2 regular subclasses', () => {
    expect(NIMBLE_CLASSES).toHaveLength(11)
    for (const cls of NIMBLE_CLASSES)
      expect(
        cls.subclasses.filter((s) => !s.story),
        cls.slug,
      ).toHaveLength(2)
  })

  it('includes the 4 story subclasses', () => {
    const story = NIMBLE_CLASSES.flatMap((c) =>
      c.subclasses.filter((s) => s.story).map((s) => s.slug),
    )
    expect(story.sort()).toEqual(['beastmaster', 'oathbreaker', 'reaver', 'spellblade'])
  })

  it('defines every level 1–20 for every class', () => {
    for (const cls of NIMBLE_CLASSES)
      for (let l = 1; l <= 20; l++) expect(cls.levels[l], `${cls.slug} L${l}`).toBeDefined()
  })

  it('grants key stat increases at 4/8/12/16 and secondary at 5/9/13/17', () => {
    for (const cls of NIMBLE_CLASSES) {
      for (const l of [4, 8, 12, 16])
        expect(cls.levels[l]?.statIncrease?.stats, `${cls.slug} L${l}`).toEqual(cls.keyStats)
      for (const l of [5, 9, 13, 17])
        expect(cls.levels[l]?.statIncrease?.count, `${cls.slug} L${l}`).toBe(1)
      expect(cls.levels[20]?.statIncrease?.count).toBe(2)
    }
  })

  it('only references weapons and spells that exist', () => {
    for (const cls of NIMBLE_CLASSES) {
      for (const w of cls.startingWeapons) expect(weaponByName(w), w).toBeDefined()
      const named = [
        ...Object.values(cls.levels).flatMap((d) => [
          ...(d?.spells?.learn ?? []),
          ...(d?.spells?.lose ?? []),
        ]),
        ...cls.subclasses.flatMap((s) => [
          ...(s.introSpells?.learn ?? []),
          ...(s.introSpells?.lose ?? []),
        ]),
      ]
      for (const n of named)
        expect(
          SPELLS.some((s) => s.name === n),
          n,
        ).toBe(true)
    }
  })

  it('has unique slugs', () => {
    const slugs = (list: { slug: string }[]) =>
      new Set(list.map((x) => x.slug)).size === list.length
    expect(slugs(ANCESTRIES)).toBe(true)
    expect(slugs(BACKGROUNDS)).toBe(true)
    expect(slugs(NIMBLE_CLASSES)).toBe(true)
  })
})

describe('buildNimbleSheet', () => {
  it('places the array’s best values in the key stats', () => {
    expect(recommendedStats(classBySlug('cheat')!, [3, 1, -1, -1])).toEqual({
      DEX: 3,
      INT: 1,
      STR: -1,
      WIL: -1,
    })
  })

  it.each(NIMBLE_CLASSES.map((c) => [c.slug, c] as const))('builds a level 1 %s', (_slug, cls) => {
    const sheet = build(cls)
    expect(sheet.classSlug).toBe(cls.slug)
    expect(sheet.hpMax).toBe(cls.startingHp)
    expect(sheet.hitDie).toBe(cls.hitDie)
    expect(sheet.hitDice).toBe(2) // Survivalist: +1 max Hit Die
    expect(sheet.saveAdv).toBe(cls.saveAdv)
    expect(sheet.inventory).toHaveLength(cls.startingGear.length)
    for (const a of sheet.attacks) expect(parseDice(a.dmg), a.dmg).not.toBeNull()
    for (const a of cls.levels[1]!.abilities)
      expect(sheet.abilities.map((x) => x.name)).toContain(a.name)
    expect(sheet.mana.max).toBe(0) // mana unlocks at level 2
  })

  it('works out armor from starting gear', () => {
    expect(build(classBySlug('commander')!).ac).toBe(6 - 1) // Rusty Mail, DEX −1
    expect(build(classBySlug('oathsworn')!).ac).toBe(6 - 1 + 2) // + Wooden Buckler
    expect(build(classBySlug('zephyr')!).ac).toBe(2 + 2) // Iron Defense DEX+STR
    expect(build(classBySlug('mage')!).ac).toBe(2 + 0) // Adventurer’s Garb
  })

  it('applies ancestry and background bonuses', () => {
    const dwarf = build(
      classBySlug('berserker')!,
      ancestryBySlug('dwarf')!,
      backgroundBySlug('fearless')!,
    )
    expect(dwarf.speed).toBe('5')
    expect(dwarf.woundsMax).toBe(7)
    expect(dwarf.hitDice).toBe(3)
    const human = build(classBySlug('berserker')!)
    expect(human.skills.find((s) => s.name === 'Might')!.points).toBe(3) // 2 placed + Tenacious
    expect(human.initMod).toBe(human.stats.DEX + 1)
    const celestial = build(classBySlug('mage')!, ancestryBySlug('celestial')!)
    expect(celestial.saveDis).toBe('')
    const ooze = build(classBySlug('mage')!, ancestryBySlug('oozeling')!)
    expect(ooze.hitDie).toBe(8)
  })

  it('gives casters their level 1 cantrips', () => {
    const mage = knownSpells(build(classBySlug('mage')!)).map((s) => s.name)
    expect(mage).toEqual(
      expect.arrayContaining([
        'Flame Dart',
        'Heart’s Fire',
        'Ice Lance',
        'Snowblind',
        'Zap',
        'Overload',
      ]),
    )
    expect(mage.every((n) => SPELLS.find((s) => s.name === n)!.tier === 0)).toBe(true)
    const shadow = knownSpells(build(classBySlug('shadowmancer')!)).map((s) => s.name)
    expect(shadow).toEqual(['Shadow Blast', 'Summon Shadows'])
  })

  it('asks a Songweaver for a second school and teaches Vicious Mockery', () => {
    const cls = classBySlug('songweaver')!
    const [choice] = creationChoices(cls, survivalist)
    expect(choice?.options.map((o) => o.value)).not.toContain('wind')
    const sheet = build(cls)
    expect(sheet.spells.schools).toHaveLength(2)
    expect(knownSpells(sheet).map((s) => s.name)).toContain('Vicious Mockery')
  })

  it('offers a Songweaver’s Windbag a utility spell from each known school', () => {
    const sheet = build(classBySlug('songweaver')!)
    levelTo(sheet, 2, 'snark')
    const windbag = nimbleLevelPlan(sheet, 3)!.choices.find((c) => c.def.id === 'windbag')!
    expect(windbag.perGroup).toBe(true)
    expect(windbag.count).toBe(2)
    expect(new Set(windbag.options.map((o) => o.group)).size).toBe(2)
  })

  it('lets Academy Dropouts pick a utility spell', () => {
    const sheet = build(classBySlug('cheat')!, human, backgroundBySlug('academy-dropout')!)
    expect(sheet.spells.utility).toHaveLength(1)
  })
})

describe('levelling', () => {
  for (const cls of NIMBLE_CLASSES)
    for (const sub of cls.subclasses.filter((s) => !s.story))
      it(`levels a ${cls.slug} (${sub.slug}) from 1 to 20`, () => {
        const sheet = build(cls)
        levelTo(sheet, 20, sub.slug)
        expect(sheet.subclassSlug).toBe(sub.slug)
        expect(sheet.hitDice).toBe(21)
        expect(sheet.hpMax).toBeGreaterThan(cls.startingHp + 19 * 5 - 1)
        expect(sheet.abilities.some((a) => a.name === 'Epic Boon')).toBe(true)
        // Level 15 adds a subclass ability, or upgrades one ("Master of Forms (2)").
        expect(
          sheet.abilities.some(
            (a) => a.src === sub.name && (a.level === 15 || a.desc.includes('Level 15:')),
          ),
        ).toBe(true)
        if (cls.mana) expect(sheet.mana.max).toBeGreaterThan(20)
      })

  it('upgrades numbered abilities instead of duplicating them', () => {
    const sheet = build(classBySlug('cheat')!)
    levelTo(sheet, 9, 'scoundrel')
    const sneak = sheet.abilities.filter((a) => a.name.startsWith('Sneak Attack'))
    expect(sneak).toHaveLength(1)
    expect(sneak[0]!.name).toBe('Sneak Attack (4)')
    expect(sneak[0]!.desc).toContain('Level 9: Your Sneak Attack becomes 2d10.')
  })

  it('asks for a subclass at level 3 and offers story subclasses', () => {
    const sheet = build(classBySlug('oathsworn')!)
    levelTo(sheet, 2, 'vengeance')
    expect(nimbleLevelPlan(sheet, 3)!.subclassChoice).toBe(true)
    const withSub = nimbleLevelPlan(sheet, 3, { subclassSlug: 'oathbreaker' })!
    expect(withSub.abilities.map((a) => a.ability.name)).toContain('Dark Benediction')
  })

  it('raises Fury dice and mana as the table says', () => {
    const berserker = build(classBySlug('berserker')!)
    levelTo(berserker, 9, 'red-mist')
    expect(berserker.resource.die).toBe(8)
    const mage = build(classBySlug('mage')!)
    levelTo(mage, 2, 'chaos')
    expect(mage.mana.max).toBe(mage.stats.INT * 3 + 2)
    expect(mage.spells.tier).toBe(1)
  })

  it('does not offer the same pool option twice', () => {
    const sheet = build(classBySlug('berserker')!)
    levelTo(sheet, 16, 'red-mist')
    const arsenal = sheet.abilities.filter((a) => a.src === 'Savage Arsenal').map((a) => a.name)
    expect(arsenal).toHaveLength(7)
    expect(new Set(arsenal).size).toBe(7)
  })

  it('gives the Swift Fists exemption to Zephyrs only', () => {
    const zephyr = build(classBySlug('zephyr')!)
    const fists = zephyr.attacks.find((a) => a.name === 'Unarmed Strike')
    expect(fists?.props).toMatch(/no rushed/i)

    const berserker = build(classBySlug('berserker')!)
    berserker.attacks.push({ name: 'Unarmed Strike', props: '', dmg: '1d4', melee: true })
    levelTo(berserker, 2, 'red-mist')
    const punch = berserker.attacks.find((a) => a.name === 'Unarmed Strike')
    expect(punch?.props).not.toMatch(/no rushed/i)
  })

  it('swaps Spellblade’s tactic picks for orders and spells', () => {
    const sheet = build(classBySlug('commander')!)
    levelTo(sheet, 5, 'spellblade')
    const fit = nimbleLevelPlan(sheet, 6)!.choices.find(
      (c) => c.def.id === 'fit-for-any-battlefield',
    )!
    const groups = new Set(fit.options.map((o) => o.group))
    expect(groups.has('Combat Tactics')).toBe(false)
    expect(groups.has('Commander’s Orders')).toBe(true)
    expect(groups.has('Fire')).toBe(true)
  })
})

describe('changeSubclass', () => {
  it('turns an Oathsworn into an Oathbreaker mid-campaign', () => {
    const sheet = build(classBySlug('oathsworn')!)
    levelTo(sheet, 9, 'refuge')
    const wounds = sheet.woundsMax
    changeSubclass(sheet, 9, 'oathbreaker', {})
    expect(sheet.subclass).toBe('Oathbreaker')
    const names = sheet.abilities.map((a) => a.name)
    expect(names).not.toContain('Aura of Refuge')
    expect(names).not.toContain('Paragon of Virtue')
    expect(names).toEqual(expect.arrayContaining(['Paragon of Power', 'We All Suffer', 'Torment']))
    expect(sheet.woundsMax).toBe(wounds + 2)
    const spells = knownSpells(sheet).map((s) => s.name)
    expect(spells).not.toContain('Heal')
    expect(spells).toContain('Entice')
  })

  it('asks a Beastmaster to choose a companion', () => {
    const sheet = build(classBySlug('hunter')!)
    levelTo(sheet, 5, 'wild-heart')
    const { choices } = subclassChangeChoices(sheet, 5, 'beastmaster')
    expect(choices).toHaveLength(1)
    const picks = autoPick(choices)
    changeSubclass(sheet, 5, 'beastmaster', picks)
    expect(sheet.abilities.some((a) => a.name === 'Small Companion')).toBe(true)
  })
})

describe('changeSubclass leaves nothing of the old subclass behind', () => {
  const keys = (sub: ClassDef['subclasses'][number]) =>
    new Set([
      ...(sub.introChoices ?? []).map((c) => `L3:${c.id}`),
      ...Object.entries(sub.levels).flatMap(
        ([l, d]) => d?.choices?.map((c) => `L${l}:${c.id}`) ?? [],
      ),
    ])
  const hpBonus = (sub: ClassDef['subclasses'][number]) =>
    Object.entries(sub.levels).reduce(
      (n, [l, d]) => n + (Number(l) <= 7 ? (d?.hpBonus ?? 0) : 0),
      0,
    )

  for (const cls of NIMBLE_CLASSES)
    for (const from of cls.subclasses.filter((s) => !s.story))
      for (const to of cls.subclasses.filter((s) => s.slug !== from.slug))
        for (const history of [true, false])
          it(`${cls.slug}: ${from.slug} → ${to.slug}${history ? '' : ' (no history)'}`, () => {
            const sheet = build(cls)
            levelTo(sheet, 7, from.slug)
            if (!history) delete sheet.levelHistory
            const hpMax = sheet.hpMax
            const own = new Set([
              ...(from.intro ?? []).map((a) => a.name),
              ...Object.values(from.levels).flatMap((d) => d?.abilities.map((a) => a.name) ?? []),
            ])
            const fromSchools = Object.values(from.levels).flatMap((d) => d?.schools ?? [])
            const { choices } = subclassChangeChoices(sheet, 7, to.slug)
            changeSubclass(sheet, 7, to.slug, autoPick(choices))

            expect(sheet.subclassSlug).toBe(to.slug)
            expect(sheet.abilities.filter((a) => a.src === from.name)).toEqual([])
            expect(sheet.abilities.filter((a) => own.has(a.name) && a.src !== to.name)).toEqual([])
            const stale = Object.keys(sheet.choices).filter(
              (k) => keys(from).has(k) && !keys(to).has(k),
            )
            expect(stale).toEqual([])
            const toSchools = Object.values(to.levels).flatMap((d) => d?.schools ?? [])
            const classSchools = Object.values(cls.levels).flatMap((d) => d?.schools ?? [])
            for (const s of fromSchools)
              if (!toSchools.includes(s) && !classSchools.includes(s))
                expect(sheet.spells.schools).not.toContain(s)
            expect(sheet.hpMax).toBe(hpMax - hpBonus(from) + hpBonus(to))
          })
})

describe('Reaver', () => {
  it('lists the Bonescythe as a spell and gives Shadow Blast back on leaving', () => {
    const sheet = build(classBySlug('shadowmancer')!)
    levelTo(sheet, 5, 'red-dragon')
    changeSubclass(sheet, 5, 'reaver', {})
    let spells = knownSpells(sheet).map((s) => s.name)
    expect(spells).toContain('Bonescythe')
    expect(spells).not.toContain('Shadow Blast')
    expect(sheet.abilities.map((a) => a.name)).not.toContain('Bonescythe')
    expect(sheet.abilities.map((a) => a.name)).not.toContain('Draconic Crimson Rite')
    expect(sheet.spells.schools).not.toContain('fire')

    changeSubclass(sheet, 5, 'abyssal-depths', {})
    spells = knownSpells(sheet).map((s) => s.name)
    expect(spells).toContain('Shadow Blast')
    expect(spells).not.toContain('Bonescythe')
    expect(sheet.abilities.map((a) => a.name)).not.toContain('Hollow One')
  })

  it('does not hand the Bonescythe to other Shadowmancers', () => {
    const sheet = build(classBySlug('shadowmancer')!)
    levelTo(sheet, 5, 'red-dragon')
    expect(knownSpells(sheet).map((s) => s.name)).not.toContain('Bonescythe')
  })
})

describe('lowering the level', () => {
  const strip = (s: NimbleSheet) => {
    const { levelHistory: _h, ...rest } = JSON.parse(JSON.stringify(s)) as NimbleSheet
    return rest
  }

  for (const cls of NIMBLE_CLASSES)
    it(`puts a ${cls.slug} back exactly as it was at level 4`, () => {
      const sub = cls.subclasses[0]!.slug
      const atFour = build(cls)
      levelTo(atFour, 4, sub)
      const atNine = build(cls)
      levelTo(atNine, 9, sub)
      expect(restoreLevel(atNine, 4)).toBe(true)
      expect(strip(atNine)).toEqual(strip(atFour))
      expect(atNine.levelHistory?.map((e) => e.level)).toEqual([2, 3, 4])
    })

  it('keeps play state and hand-written abilities', () => {
    const sheet = build(classBySlug('berserker')!)
    levelTo(sheet, 6, 'mountainheart')
    sheet.inventory.push({ name: 'Lucky coin', qty: '1' })
    sheet.notes = 'Owes the innkeeper'
    sheet.wounds = 2
    sheet.abilities.push({ name: 'Homebrew trick', src: 'GM', desc: 'Custom' })
    restoreLevel(sheet, 2)
    expect(sheet.inventory.map((i) => i.name)).toContain('Lucky coin')
    expect(sheet.notes).toBe('Owes the innkeeper')
    expect(sheet.wounds).toBe(2)
    expect(sheet.abilities.map((a) => a.name)).toContain('Homebrew trick')
    expect(sheet.abilities.every((a) => !a.level || a.level <= 2)).toBe(true)
    expect(sheet.hp).toBeLessThanOrEqual(sheet.hpMax)
    expect(sheet.subclassSlug).toBe('')
  })

  it('keeps live mana and class resource state while restoring their maximums', () => {
    const sheet = build(classBySlug('shadowmancer')!)
    levelTo(sheet, 6, 'red-dragon')
    sheet.mana.temp = 3
    sheet.resource.count = 2
    sheet.resource.active = true
    restoreLevel(sheet, 4)
    expect(sheet.mana.temp).toBe(3)
    expect(sheet.resource).toMatchObject({ count: 2, active: true })
  })

  it('keeps spent Pilfered Power uses through a subclass change', () => {
    const sheet = build(classBySlug('shadowmancer')!)
    levelTo(sheet, 5, 'red-dragon')
    sheet.resource.count = 2
    changeSubclass(sheet, 5, 'abyssal-depths', {})
    expect(sheet.resource.count).toBe(2)
  })

  it('falls back to dropping level-tagged abilities when there is no history', () => {
    const sheet = build(classBySlug('berserker')!)
    levelTo(sheet, 6, 'mountainheart')
    delete sheet.levelHistory
    expect(restoreLevel(sheet, 2)).toBe(false)
    expect(sheet.abilities.every((a) => !a.level || a.level <= 2)).toBe(true)
    expect(Object.keys(sheet.choices).every((k) => Number(k.slice(1, k.indexOf(':'))) <= 2)).toBe(
      true,
    )
  })
})

describe('keyStatValue', () => {
  it('uses the higher of the two Key Stats', () => {
    const sheet = build(classBySlug('shadowmancer')!)
    sheet.stats.INT = 1
    sheet.stats.DEX = 3
    expect(keyStatValue(sheet)).toEqual({ value: 3, stats: ['INT', 'DEX'] })
  })
})
