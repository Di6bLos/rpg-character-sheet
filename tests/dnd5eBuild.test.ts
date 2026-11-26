// The 5e (2024) builder and level-up (utils/dnd5eBuild.ts, utils/dnd5eLevelUp.ts): every class
// and subclass builds and levels 1→20 with every pick answerable, and the build follows the
// SRD 5.2.1's numbers (Proficiency Bonus, slots, Hit Points, the ASI levels) and the 2024 rules'
// picks (no skill twice, feat prerequisites, choices per the class table's columns).
import { describe, expect, it } from 'vitest'
import type { Dnd5eSheet } from '../types/sheets'
import {
  type Dnd5ePick,
  CUSTOM_BACKGROUND,
  bonusProblem,
  buildDnd5eSheet,
  clashPicks,
  customGearOptions,
  customProblem,
  columnNumber,
  creationPicks,
  creationProblems,
  emptyCreation,
  parseEquipment,
  pickProblem,
  pickStep,
  proficiencyBonus,
  scoresProblem,
  walkDnd5e,
} from '../utils/dnd5eBuild'
import {
  applyDnd5eLevel,
  dnd5eLevelPlan,
  dnd5eLevelProblems,
  levelHpGain,
} from '../utils/dnd5eLevelUp'
import { canRestore, restoreLevel } from '../utils/levelHistory'
import { abilityMod } from '../utils/dice'
import { build, cls, creation, data, fill, levelTo } from './helpers/dnd5e'

const prefer = (slug: string, subclass?: string) => ({
  abilities: cls(slug).primaryAbility.abilities,
  subclass,
})

/** Levels a sheet one level and returns that level's plan (before the picks are applied). */
function levelOnce(sheet: Dnd5eSheet, level: number, subclass?: string) {
  const picks = fill(
    (p) => dnd5eLevelPlan(sheet, level, data, p)!.picks,
    prefer(sheet.classSlug!, subclass),
  )
  const plan = dnd5eLevelPlan(sheet, level, data, picks)!
  const hpRoll = cls(sheet.classSlug!).hitDie / 2 + 1
  expect(dnd5eLevelProblems(plan, { hpRoll, picks }), `${sheet.class} level ${level}`).toEqual([])
  applyDnd5eLevel(sheet, level, { hpRoll, picks }, data)
  return plan
}

describe('5e build: every class and subclass', () => {
  for (const c of data.classes)
    for (const sub of data.subclasses.filter((s) => s.class === c.slug))
      it(`${c.slug} / ${sub.slug} builds and levels 1→20 with every pick answerable`, () => {
        const { sheet, choices, creation: made } = build(c.slug, undefined, undefined, sub.slug)
        expect(creationProblems(made, choices, data)).toEqual([])
        for (let level = 2; level <= 20; level++) levelOnce(sheet, level, sub.slug)
        expect(sheet.subclassSlug).toBe(sub.slug)
        expect(sheet.profBonus).toBe(6)
        expect(sheet.levelHistory).toHaveLength(19)
        const skills = sheet.proficiencies!.skills
        expect(new Set(skills).size).toBe(skills.length)
      })
})

describe('5e level 1', () => {
  it('HP is the Hit Die maximum + CON; abilities add the background increases', () => {
    const { sheet, creation: c } = build('fighter')
    expect(sheet.abilities.STR).toBe(c.base.STR + (c.bonus.STR ?? 0))
    expect(sheet.hpMax).toBe(10 + abilityMod(sheet.abilities.CON))
    expect(sheet.hp).toBe(sheet.hpMax)
    expect(sheet.profBonus).toBe(2)
    expect(sheet.saveProfs).toEqual(['STR', 'CON'])
  })

  it('Dwarven Toughness adds 1 HP per level', () => {
    const { sheet } = build('wizard', 'dwarf')
    expect(sheet.hpMax).toBe(6 + abilityMod(sheet.abilities.CON) + 1)
  })

  it('class skills skip the background’s; a duplicate tool asks for another', () => {
    const c = creation('rogue', 'human', 'criminal')
    const asked = creationPicks(c, {}, data)
    const skills = asked.find((p) => p.key === 'L1:class:skills')!
    expect(skills.count).toBe(4)
    expect(skills.options.find((o) => o.id === 'Stealth')?.disabled).toBe('Already proficient')
    // Criminal and Rogue both give Thieves' Tools: the second asks for another tool.
    const dup = asked.find((p) => p.key.includes('>dup-thieves'))!
    expect(dup.kind).toBe('tool')
    expect(dup.options.some((o) => o.id === 'Thieves’ Tools')).toBe(false)
  })

  it('class skills skip a species skill picked first; a later clash is asked where it appears', () => {
    const skillful = { 'L1:species:skillful:0': ['Stealth'] }
    const sage = creation('rogue', 'human', 'sage')
    const skills = creationPicks(sage, skillful, data).find((p) => p.key === 'L1:class:skills')!
    expect(skills.options.find((o) => o.id === 'Stealth')?.disabled).toBe('Already proficient')
    const choices = fill((p) => creationPicks(sage, p, data), prefer('rogue'), skillful)
    expect(choices['L1:class:skills']).not.toContain('Stealth')
    expect(creationProblems(sage, choices, data)).toEqual([])
    // Criminal gives Stealth too: Skillful's pick breaks on the Background step, which asks it.
    const criminal = creation('rogue', 'human', 'criminal')
    const made = fill((p) => creationPicks(criminal, p, data), prefer('rogue'), skillful)
    const asked = creationPicks(criminal, made, data)
    const steps = ['class', 'species', 'background', 'abilities', 'choices']
    const at = (s: string) => steps.indexOf(s)
    const broken = asked.find((p) => p.key === 'L1:species:skillful:0')!
    expect(pickStep(broken)).toBe('species')
    expect(clashPicks(asked, made, at, at('species'))).toEqual([])
    expect(clashPicks(asked, made, at, at('background')).map((p) => p.key)).toEqual([
      'L1:species:skillful:0',
    ])
  })

  it('Rogue Expertise offers only skills the rogue is proficient in, after the skill picks', () => {
    const c = creation('rogue', 'human', 'criminal')
    const choices = fill((p) => creationPicks(c, p, data), prefer('rogue'))
    const exp = creationPicks(c, choices, data).find((p) => p.kind === 'expertise')!
    const sheet = buildDnd5eSheet(c, choices, data)
    expect(exp.options.map((o) => o.id).sort()).toEqual([...sheet.proficiencies!.skills].sort())
    expect(sheet.proficiencies!.expertise).toHaveLength(2)
  })

  it('the background increases and scores are checked', () => {
    const c = emptyCreation()
    const acolyte = data.backgrounds.find((b) => b.slug === 'acolyte')!
    c.bonus = { WIS: 2, CHA: 1 }
    expect(bonusProblem(c, acolyte)).toBeNull()
    c.bonus = { WIS: 1, CHA: 1, INT: 1 }
    expect(bonusProblem(c, acolyte)).toBeNull()
    c.bonus = { STR: 2, WIS: 1 }
    expect(bonusProblem(c, acolyte)).toMatch(/INT, WIS, CHA/)
    c.bonus = { WIS: 2, CHA: 2 }
    expect(bonusProblem(c, acolyte)).toMatch(/\+2 and \+1/)
    c.method = 'standard'
    c.base = { STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 }
    expect(scoresProblem(c)).toBeNull()
    c.base.CHA = 15
    expect(scoresProblem(c)).toMatch(/Standard Array/)
    c.method = 'pointBuy'
    c.base = { STR: 15, DEX: 15, CON: 15, INT: 8, WIS: 8, CHA: 8 }
    expect(scoresProblem(c)).toBeNull()
    c.base.INT = 10
    expect(scoresProblem(c)).toMatch(/29 of 27/)
  })

  it('starting equipment goes into the inventory, gold into coins; armor is worn', () => {
    const { sheet } = build('fighter')
    const names = sheet.inventory.map((i) => i.name)
    expect(names).toContain('Chain Mail')
    expect(sheet.inventory.find((i) => i.name === 'Javelin')?.qty).toBe('8')
    expect(sheet.inventory.find((i) => i.name === 'Chain Mail')?.worn).toBe(true)
    expect(sheet.ac).toBe(16)
    expect(sheet.coins?.gp).toBe(4 + 14)
    expect(sheet.weapons.map((w) => w.name)).toContain('Greatsword')
    const gs = sheet.weapons.find((w) => w.name === 'Greatsword')!
    expect(gs.atk).toBe(abilityMod(sheet.abilities.STR) + 2)
    const parsed = parseEquipment(
      'Spear, 5 Daggers, Artisan’s Tools or Musical Instrument chosen for the tool proficiency above, Explorer’s Pack and 11 GP',
      data,
      { cls: 'Lute' },
    )
    expect(parsed.gp).toBe(11)
    expect(parsed.items.map((i) => `${i.qty} ${i.name}`)).toEqual([
      '1 Spear',
      '5 Dagger',
      '1 Lute',
      '1 Explorer’s Pack',
    ])
  })

  it('Unarmored Defense: Monk 10 + DEX + WIS, Barbarian 10 + DEX + CON', () => {
    const monk = build('monk').sheet
    const m = monk.abilities
    expect(monk.ac).toBe(10 + abilityMod(m.DEX) + abilityMod(m.WIS))
    const c = creation('barbarian')
    c.equipment.class = 'B'
    const choices = fill((p) => creationPicks(c, p, data), prefer('barbarian'))
    const barb = buildDnd5eSheet(c, choices, data)
    const b = barb.abilities
    expect(barb.ac).toBe(10 + abilityMod(b.DEX) + abilityMod(b.CON))
  })

  it('casters get their cantrips, prepared spells and slots; the wizard prepares from a spellbook', () => {
    const wiz = build('wizard').sheet
    expect(wiz.castingStats).toMatchObject({ ability: 'INT', cantrips: 3, prepared: 4 })
    expect(wiz.castingStats!.slots[0]).toBe(2)
    expect(wiz.spells!.filter((s) => s.book)).toHaveLength(2)
    expect(wiz.castingStats!.saveDc).toBe(8 + 2 + abilityMod(wiz.abilities.INT))
    const lock = build('warlock').sheet
    expect(lock.castingStats!.pact).toEqual({ slots: 1, level: 1 })
    expect(lock.options).toHaveLength(1)
  })

  it('Magic Initiate (Cleric) from the Acolyte asks for the ability, two cantrips and a spell', () => {
    const c = creation('fighter', 'human', 'acolyte')
    const asked = creationPicks(c, {}, data).filter((p) => p.key.startsWith('L1:background:feat'))
    expect(asked.map((p) => [p.kind, p.count])).toEqual([
      ['ability', 1],
      ['cantrip', 2],
      ['spell', 1],
    ])
    expect(
      asked[1]!.options.every((o) =>
        data.spells.find((s) => s.slug === o.id)!.classes.includes('cleric'),
      ),
    ).toBe(true)
  })

  it('a custom background (SRD 5.2.1 p. 193): name, three abilities, Origin feat, two skills, a tool, 50 GP', () => {
    const c = creation('fighter', 'human', 'acolyte')
    c.backgroundSlug = CUSTOM_BACKGROUND
    c.custom = {
      name: 'Lighthouse Keeper',
      abilities: ['STR', 'CON', 'WIS'],
      gear: ['rope', 'lamp'],
    }
    c.bonus = { STR: 2, CON: 1 }
    expect(customProblem(c, data)).toBeNull()
    const asked = creationPicks(c, {}, data).filter((p) => p.key.startsWith('L1:background'))
    expect(asked.map((p) => [p.key, p.kind, p.count])).toEqual([
      ['L1:background:feat', 'feat', 1],
      ['L1:background:skills', 'skill', 2],
      ['L1:background:tool', 'tool', 1],
    ])
    const feat = asked[0]!
    expect(
      feat.options.every((o) => data.feats.find((f) => f.slug === o.id)?.category === 'origin'),
    ).toBe(true)
    const choices = fill((p) => creationPicks(c, p, data), prefer('fighter'), {
      'L1:background:feat': ['tough'],
      'L1:background:skills': ['Athletics', 'Survival'],
      'L1:background:tool': ['Navigator’s Tools'],
    })
    expect(creationProblems(c, choices, data)).toEqual([])
    const sheet = buildDnd5eSheet(c, choices, data)
    expect(sheet.background).toBe('Lighthouse Keeper')
    expect(sheet.backgroundSlug).toBe('custom')
    expect(sheet.creation?.custom?.name).toBe('Lighthouse Keeper')
    expect(sheet.proficiencies!.skills).toEqual(expect.arrayContaining(['Athletics', 'Survival']))
    expect(sheet.proficiencies!.tools).toContain('Navigator’s Tools')
    expect(sheet.featsTaken!.map((f) => f.slug)).toContain('tough')
    expect(sheet.abilities.STR).toBe(c.base.STR + 2)
    const spent = customGearOptions(data)
      .filter((g) => ['rope', 'lamp'].includes(g.slug))
      .reduce((n, g) => n + g.cost, 0)
    expect(sheet.inventory.map((i) => i.name)).toEqual(expect.arrayContaining(['Rope', 'Lamp']))
    expect(sheet.coins!.gp).toBe(4 + Math.floor((5000 - spent) / 100))
    // Level-ups and undo replay it from the sheet's creation and picks.
    levelTo(sheet, 1, 4)
    restoreLevel(sheet, 3)
    expect(sheet.background).toBe('Lighthouse Keeper')
    expect(sheet.featsTaken!.map((f) => f.slug)).toContain('tough')
    c.custom.abilities = ['STR', 'CON']
    expect(customProblem(c, data)).toMatch(/three abilities/)
    c.custom.name = ' '
    expect(customProblem(c, data)).toMatch(/Name/)
  })

  it('a hand-made sheet has no plan', () => {
    const sheet = build('fighter').sheet
    delete sheet.classSlug
    expect(dnd5eLevelPlan(sheet, 2, data)).toBeNull()
  })
})

describe('5e level-up', () => {
  it('Proficiency Bonus follows the Character Advancement table', () => {
    expect([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(proficiencyBonus)).toEqual([
      2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
    ])
  })

  it('HP: the fixed value + CON, and a CON increase raises every earlier level', () => {
    const sheet = build('fighter').sheet
    levelTo(sheet, 1, 3, 'champion')
    const plan = dnd5eLevelPlan(sheet, 4, data, {
      'L4:asi': ['ability-score-improvement'],
      'L4:asi>asi': ['CON', 'CON'],
    })!
    const before = sheet.abilities.CON
    expect(plan.increases).toEqual({ CON: 2 })
    const con = abilityMod(before + 2)
    expect(plan.hp.con).toBe(con)
    expect(plan.hp.retro).toBe(3 * (con - abilityMod(before)))
    const max = sheet.hpMax
    applyDnd5eLevel(
      sheet,
      4,
      {
        hpRoll: 6,
        picks: { 'L4:asi': ['ability-score-improvement'], 'L4:asi>asi': ['CON', 'CON'] },
      },
      data,
    )
    expect(sheet.hpMax).toBe(max + levelHpGain(plan, 6))
    expect(sheet.abilities.CON).toBe(before + 2)
  })

  it('a hero at 0 HP stays at 0 when levelling', () => {
    const sheet = build('fighter').sheet
    sheet.hp = 0
    levelTo(sheet, 1, 2)
    expect(sheet.hp).toBe(0)
  })

  it('asks for a feat at each ASI level and the Epic Boon once each, never twice', () => {
    for (const c of data.classes) {
      const sheet = build(c.slug).sheet
      const featLevels: number[] = []
      for (let level = 2; level <= 20; level++) {
        const plan = levelOnce(sheet, level)
        const top = plan.picks.filter((p) => p.kind === 'feat' && /^L\d+:(asi|boon)$/.test(p.key))
        expect(top.length, `${c.slug} ${level}`).toBeLessThanOrEqual(1)
        if (top.length) featLevels.push(level)
      }
      expect(featLevels, c.slug).toEqual([...c.asiLevels, c.epicBoonLevel])
    }
  })

  it('feat prerequisites: ability scores, Fighting Style, level', () => {
    const sheet = build('wizard').sheet
    levelTo(sheet, 1, 3)
    const asi = dnd5eLevelPlan(sheet, 4, data)!.picks.find((p) => p.key === 'L4:asi')!
    const opt = (id: string) => asi.options.find((o) => o.id === id)
    expect(opt('great-weapon-master')?.disabled).toMatch(/Strength 13\+/)
    expect(opt('archery')?.disabled).toMatch(/Fighting Style/)
    expect(opt('boon-of-fate')).toBeUndefined()
    expect(opt('war-caster')?.disabled).toBeUndefined()
    expect(opt('alert')?.disabled).toBe('Already taken')
    expect(opt('magic-initiate')?.disabled).toBeUndefined()
    const fighter = levelTo(build('fighter').sheet, 1, 3)
    const f = dnd5eLevelPlan(fighter, 4, data)!.picks.find((p) => p.key === 'L4:asi')!
    expect(f.options.find((o) => o.id === 'defense')?.disabled).toBeUndefined()
  })

  it('an ASI is +2 to one or +1 to two, capped at 20', () => {
    const sheet = build('fighter').sheet
    levelTo(sheet, 1, 3)
    sheet.abilities.STR = 19
    const picks = { 'L4:asi': ['ability-score-improvement'], 'L4:asi>asi': ['STR', 'STR'] }
    applyDnd5eLevel(sheet, 4, { hpRoll: 6, picks }, data)
    expect(sheet.abilities.STR).toBe(20)
    const p = dnd5eLevelPlan(sheet, 5, data)!
    expect(p.level).toBe(5)
  })

  it('choice counts follow the class table columns', () => {
    const lock = build('warlock').sheet
    const fighter = build('fighter').sheet
    for (let level = 2; level <= 20; level++) {
      const plan = levelOnce(lock, level)
      const inv = plan.picks.find((p) => p.key === `L${level}:eldritch-invocations:0`)
      const delta =
        columnNumber(cls('warlock'), level, 'Eldritch Invocations') -
        columnNumber(cls('warlock'), level - 1, 'Eldritch Invocations')
      expect(inv?.count ?? 0, `invocations at ${level}`).toBe(delta)
      const fp = levelOnce(fighter, level, 'battle-master')
      const wm = fp.picks.find((p) => p.kind === 'weaponMastery' && !p.key.includes('swap'))
      const wDelta =
        columnNumber(cls('fighter'), level, 'Weapon Mastery') -
        columnNumber(cls('fighter'), level - 1, 'Weapon Mastery')
      expect(wm?.count ?? 0, `masteries at ${level}`).toBe(wDelta)
    }
    expect(lock.options).toHaveLength(10)
    expect(fighter.masteries).toHaveLength(6)
    expect(fighter.options?.filter((o) => o.group === 'maneuvers')).toHaveLength(9)
    expect(fighter.resources?.find((r) => r.name === 'Combat Superiority')).toMatchObject({
      max: 6,
      dice: '1d12',
    })
  })

  it('features the table lists again grant their choices again (Expertise, Metamagic, Mystic Arcanum)', () => {
    const count = (slug: string, test: (p: Dnd5ePick) => boolean) => {
      const sheet = build(slug).sheet
      const levels: number[] = []
      for (let level = 2; level <= 20; level++)
        if (levelOnce(sheet, level).picks.some(test)) levels.push(level)
      return levels
    }
    expect(count('bard', (p) => p.kind === 'expertise')).toEqual([2, 9])
    expect(count('rogue', (p) => p.kind === 'expertise')).toEqual([6])
    expect(count('sorcerer', (p) => /^L\d+:metamagic:/.test(p.key))).toEqual([2, 10, 17])
    const arcanum = build('warlock').sheet
    const exact: number[] = []
    for (let level = 2; level <= 20; level++) {
      const p = levelOnce(arcanum, level).picks.find((x) => x.label.startsWith('Mystic Arcanum'))
      if (p)
        exact.push(
          Math.max(...p.options.map((o) => data.spells.find((s) => s.slug === o.id)!.level)),
        )
    }
    expect(exact).toEqual([6, 7, 8, 9])
    expect(arcanum.spells!.filter((s) => s.from.startsWith('Mystic Arcanum'))).toHaveLength(4)
  })

  it('slots and resources follow the class tables', () => {
    const sheet = build('cleric').sheet
    levelTo(sheet, 1, 5, 'life-domain')
    expect(sheet.castingStats!.slots.slice(0, 3)).toEqual([4, 3, 2])
    expect(sheet.resources?.find((r) => r.name === 'Channel Divinity')?.max).toBe(2)
    expect(
      sheet
        .spells!.filter((s) => s.from === 'Life Domain')
        .map((s) => s.slug)
        .sort(),
    ).toEqual(
      ['aid', 'bless', 'cure-wounds', 'lesser-restoration', 'mass-healing-word', 'revivify'].sort(),
    )
    const barb = levelTo(build('barbarian').sheet, 1, 9)
    expect(barb.resources?.find((r) => r.name === 'Rage')?.max).toBe(4)
    const paladin = levelTo(build('paladin').sheet, 1, 5)
    expect(paladin.castingStats!.slots.slice(0, 2)).toEqual([4, 2])
  })

  it('subclass spells: Moon and Sea read as one set, Stars from grants, Land by its type', () => {
    const spellsOf = (sub: string, level: number, start: Record<string, string[]> = {}) => {
      const sheet = build('druid').sheet
      for (let l = 2; l <= level; l++) {
        const picks = fill(
          (p) => dnd5eLevelPlan(sheet, l, data, p)!.picks,
          prefer('druid', sub),
          l === 3 ? start : {},
        )
        applyDnd5eLevel(sheet, l, { hpRoll: 5, picks }, data)
      }
      return sheet.spells!.filter((s) => s.always && s.from !== 'Magic Initiate').map((s) => s.slug)
    }
    expect(spellsOf('circle-of-the-moon', 5)).toEqual(
      expect.arrayContaining(['cure-wounds', 'moonbeam', 'starry-wisp', 'conjure-animals']),
    )
    expect(spellsOf('circle-of-the-stars', 3)).toEqual(
      expect.arrayContaining(['guidance', 'guiding-bolt']),
    )
    const land = spellsOf('circle-of-the-land', 5, {
      'L3:subclass': ['circle-of-the-land'],
      'L3:circle-of-the-land:circle-of-the-land-spells:0': ['Polar Land'],
    })
    expect(land).toEqual(
      expect.arrayContaining(['fog-cloud', 'hold-person', 'ray-of-frost', 'sleet-storm']),
    )
    expect(land).not.toContain('fireball')
  })

  it('records each level so it can be undone, and Reconfigure can replay its picks', () => {
    const sheet = levelTo(build('sorcerer').sheet, 1, 4, 'draconic-sorcery')
    const at3 = sheet.levelHistory!.find((e) => e.level === 4)!
    expect(at3.dnd5e?.picks['L4:asi']).toEqual(['ability-score-improvement'])
    const before = JSON.parse(JSON.stringify(at3.before)) as Dnd5eSheet
    expect(canRestore(sheet, 3)).toBe(true)
    restoreLevel(sheet, 3)
    expect(sheet.abilities).toEqual(before.abilities)
    expect(sheet.featsTaken).toEqual(before.featsTaken)
    expect(Object.keys(sheet.choices!).some((k) => k.startsWith('L4:'))).toBe(false)
    // Replaying the recorded picks gives the same level 4.
    const plan = dnd5eLevelPlan(sheet, 4, data, at3.dnd5e!.picks)!
    expect(dnd5eLevelProblems(plan, at3.dnd5e!)).toEqual([])
    applyDnd5eLevel(sheet, 4, at3.dnd5e!, data)
    expect(sheet.featsTaken?.at(-1)?.slug).toBe('ability-score-improvement')
  })

  it('a recorded pick that no longer fits is a problem', () => {
    const sheet = levelTo(build('fighter').sheet, 1, 3)
    const plan = dnd5eLevelPlan(sheet, 4, data, { 'L4:asi': ['great-weapon-master'] })!
    const asi = plan.picks.find((p) => p.key === 'L4:asi')!
    sheet.abilities.STR = 10
    const low = dnd5eLevelPlan(sheet, 4, data, { 'L4:asi': ['great-weapon-master'] })!
    const lowAsi = low.picks.find((p) => p.key === 'L4:asi')!
    expect(pickProblem(asi, ['great-weapon-master'])).toBeNull()
    expect(pickProblem(lowAsi, ['great-weapon-master'])).toMatch(/Strength 13\+/)
    expect(pickProblem(lowAsi, ['no-such-feat'])).toMatch(/no longer/)
  })

  it('swaps are optional and replace one invocation', () => {
    const sheet = levelTo(build('warlock').sheet, 1, 2)
    const first = sheet.options![0]!.slug
    const plan = dnd5eLevelPlan(sheet, 3, data, { 'L3:swap:eldritch-invocations:out': [first] })!
    const inn = plan.picks.find((p) => p.key === 'L3:swap:eldritch-invocations:in')!
    const pick = inn.options.find((o) => !o.disabled)!.id
    const picks = fill((p) => dnd5eLevelPlan(sheet, 3, data, p)!.picks, prefer('warlock'), {
      'L3:swap:eldritch-invocations:out': [first],
      'L3:swap:eldritch-invocations:in': [pick],
    })
    applyDnd5eLevel(sheet, 3, { hpRoll: 5, picks }, data)
    expect(sheet.options!.map((o) => o.slug)).not.toContain(first)
    expect(sheet.options!.map((o) => o.slug)).toContain(pick)
    expect(
      walkDnd5e({ creation: sheet.creation!, choices: sheet.choices! }, 3, data)!.options,
    ).toHaveLength(3)
  })
})

describe('5e: the later 2024 books', () => {
  const ask = (c: ReturnType<typeof creation>, picks: Record<string, string[]> = {}) =>
    creationPicks(c, picks, data)

  it('a background with a featChoice offers its feat or any feat of the category', () => {
    const c = creation('fighter', 'human', 'haunted-one')
    const pick = ask(c).find((p) => p.key === 'L1:background:feat')!
    expect(pick.kind).toBe('feat')
    const ids = pick.options.map((o) => o.id)
    expect(ids).toContain('survivor')
    expect(ids).toContain('mist-walker')
    expect(pick.options.find((o) => o.id === 'mist-walker')?.disabled).toBeUndefined()
    expect(ids).not.toContain('alert')
    const choices = fill((p) => creationPicks(c, p, data), prefer('fighter'), {
      'L1:background:feat': ['mist-walker'],
    })
    const sheet = buildDnd5eSheet(c, choices, data)
    expect(sheet.featsTaken!.map((f) => f.slug)).toContain('mist-walker')
    expect(sheet.featsTaken!.map((f) => f.slug)).not.toContain('survivor')
  })

  it('“Can’t have another” feats and feat prerequisites read the feats taken', () => {
    const c = creation('fighter', 'human', 'pact-seeker')
    const choices = fill((p) => creationPicks(c, p, data), prefer('fighter'), {
      'L1:background:feat': ['infernal-pact'],
    })
    const sheet = levelTo(buildDnd5eSheet(c, choices, data), 1, 3)
    const asi = dnd5eLevelPlan(sheet, 4, data, {})!.picks.find((p) => p.key === 'L4:asi')!
    expect(asi.options.some((o) => o.id === 'fey-pact')).toBe(false)
    expect(asi.options.find((o) => o.id === 'infernal-bulwark')?.disabled).toBeUndefined()
    expect(asi.options.find((o) => o.id === 'fey-sentinel')?.disabled).toMatch(/Fey Pact Feat/)
    const healer = levelTo(build('cleric', 'human', 'house-jorasco-heir').sheet, 1, 3)
    const marks = dnd5eLevelPlan(healer, 4, data, {})!.picks.find((p) => p.key === 'L4:asi')!
    expect(marks.options.find((o) => o.id === 'greater-mark-of-healing')?.disabled).toBeUndefined()
    expect(marks.options.find((o) => o.id === 'greater-mark-of-storm')?.disabled).toBeTruthy()
  })

  it('Portal Jumper is an Origin feat: a background’s and a Versatile pick', () => {
    const { sheet } = build('wizard', 'human', 'horizon-weaver-initiate')
    expect(sheet.featsTaken!.map((f) => f.slug)).toContain('portal-jumper')
    const versatile = ask(creation('wizard', 'human', 'sage')).find((p) =>
      p.key.startsWith('L1:species:versatile'),
    )!
    expect(versatile.options.find((o) => o.id === 'portal-jumper')?.meta).toMatch(
      /Origin.*Arcana Unleashed/,
    )
  })

  it('pick options carry their book for the source filter', () => {
    const versatile = ask(creation('wizard')).find((p) => p.key.startsWith('L1:species:versatile'))!
    expect(versatile.options.find((o) => o.id === 'portal-jumper')?.source).toBe('Arcana Unleashed')
    expect(versatile.options.find((o) => o.id === 'alert')?.source).toBe('SRD 5.2.1')
  })

  it('an Arcane Archer knows 2 Arcane Shots at 3 and one more at 7, its die grows', () => {
    const sheet = levelTo(build('fighter').sheet, 1, 3, 'arcane-archer')
    const shots = () => sheet.options!.filter((o) => o.group === 'arcane-shot').length
    expect(shots()).toBe(2)
    expect(sheet.resources?.find((r) => r.name === 'Arcane Shot')?.dice).toBe('1d6')
    levelTo(sheet, 3, 10, 'arcane-archer')
    expect(shots()).toBe(4)
    expect(sheet.resources?.find((r) => r.name === 'Arcane Shot')?.dice).toBe('1d8')
  })

  it('a Vestige Patron’s domain lends that domain’s spells, row by row', () => {
    const sheet = levelTo(build('warlock').sheet, 1, 2)
    const picks = fill((p) => dnd5eLevelPlan(sheet, 3, data, p)!.picks, prefer('warlock'), {
      'L3:subclass': ['vestige-patron'],
      'L3:vestige-patron:vestige-spells:0': ['Life Domain'],
    })
    applyDnd5eLevel(sheet, 3, { hpRoll: 5, picks }, data)
    const always = () => sheet.spells!.filter((s) => s.always).map((s) => s.slug)
    expect(always()).toEqual(expect.arrayContaining(['aid', 'bless', 'cure-wounds']))
    expect(always()).not.toContain('revivify')
    levelTo(sheet, 3, 5, 'vestige-patron')
    expect(always()).toContain('revivify')
  })

  it('a subclass with level 1 features is chosen at level 1 and replaces class features', () => {
    const c = creation('paladin')
    const early = ask(c).find((p) => p.key === 'L1:subclass')!
    expect(early.optional).toBe(true)
    expect(early.options.map((o) => o.id)).toEqual(['oath-of-the-ebon-blade'])
    const { sheet } = build('paladin', undefined, undefined, 'oath-of-the-ebon-blade')
    const names = () => sheet.features.map((f) => f.name)
    expect(sheet.subclassSlug).toBe('oath-of-the-ebon-blade')
    expect(names()).toContain('Death Coil')
    expect(names()).not.toContain('Lay on Hands')
    expect(sheet.resources?.some((r) => r.name === 'Lay on Hands')).toBe(false)
    levelTo(sheet, 1, 3, 'oath-of-the-ebon-blade')
    expect(names()).toContain('Runic Smite')
    expect(names()).not.toContain('Paladin’s Smite')
    expect(sheet.spells!.some((s) => s.slug === 'divine-smite')).toBe(false)
    expect(sheet.spells!.some((s) => s.slug === 'rune-strike')).toBe(true)
    const plan = dnd5eLevelPlan(sheet, 4, data, {})!
    expect(plan.picks.some((p) => p.kind === 'subclass')).toBe(false)
    // Without it, the paladin keeps Lay on Hands and picks a subclass at level 3.
    const plain = build('paladin').sheet
    expect(plain.subclassSlug).toBe('')
    expect(plain.features.map((f) => f.name)).toContain('Lay on Hands')
  })

  it('a subclass chosen at level 3 still gets its level 1 and 2 features', () => {
    const sheet = levelTo(build('paladin').sheet, 1, 3, 'oath-of-the-ebon-blade')
    expect(sheet.features.map((f) => f.name)).toEqual(
      expect.arrayContaining(['Death Coil', 'Runic Smite']),
    )
    expect(sheet.features.map((f) => f.name)).not.toContain('Lay on Hands')
  })

  it('a subclass’s option joins the class feature’s pick (Void Warrior)', () => {
    const sheet = build('ranger', undefined, undefined, 'demon-hunter').sheet
    const plan = dnd5eLevelPlan(sheet, 2, data, {})!
    const style = plan.picks.find((p) => p.label === 'Fighting Style')!
    expect(style.options.map((o) => o.id)).toEqual(
      expect.arrayContaining(['Fighting Style feat', 'Druidic Warrior', 'Void Warrior']),
    )
    const warrior = dnd5eLevelPlan(sheet, 2, data, { [style.key]: ['Void Warrior'] })!
    expect(warrior.picks.some((p) => p.kind === 'cantrip' && p.label === 'Void Warrior')).toBe(true)
  })

  it('a spell column follows its pick: Demon Hunter’s column, Ebon Blade’s rune', () => {
    const always = (c: string, sub: string, key: string, column: string) => {
      const sheet = levelTo(build(c, undefined, undefined, sub).sheet, 1, 2, sub)
      const plan = dnd5eLevelPlan(sheet, 3, data, { 'L3:subclass': [sub] })!
      expect(plan.picks.find((p) => p.key === key)?.options.map((o) => o.id)).toHaveLength(3)
      for (let l = 3; l <= 5; l++) {
        const picks = fill(
          (p) => dnd5eLevelPlan(sheet, l, data, p)!.picks,
          prefer(c, sub),
          l === 3 ? { 'L3:subclass': [sub], [key]: [column] } : {},
        )
        applyDnd5eLevel(sheet, l, { hpRoll: 6, picks }, data)
      }
      return sheet.spells!.filter((s) => s.always).map((s) => s.slug)
    }
    const havoc = always('ranger', 'demon-hunter', 'L3:demon-hunter:demon-hunter-spells:0', 'Havoc')
    expect(havoc).toEqual(
      expect.arrayContaining(['throw-glaive', 'sigil-of-flame', 'fel-rush', 'eye-beam']),
    )
    expect(havoc).not.toContain('consume-soul')
    expect(havoc).not.toContain('infernal-strike')
    const frost = always(
      'paladin',
      'oath-of-the-ebon-blade',
      'L3:oath-of-the-ebon-blade:runeforging:0',
      'Frost',
    )
    expect(frost).toEqual(
      expect.arrayContaining(['death-grip', 'death-and-decay', 'chains-of-ice', 'frostscythe']),
    )
    expect(frost).not.toContain('vampiric-blood')
    expect(frost).not.toContain('scourge-strike')
  })

  it('a subclass’s own list joins its class list (Paladin [Death Knight])', () => {
    const pool = (sub: string) => {
      const sheet = levelTo(build('paladin', undefined, undefined, sub).sheet, 1, 4, sub)
      const plan = dnd5eLevelPlan(sheet, 5, data, {})!
      return plan.picks.find((p) => p.key === 'L5:spells:prepared')?.options.map((o) => o.id)
    }
    expect(pool('oath-of-the-ebon-blade')).toContain('frostscythe')
    expect(pool('oath-of-devotion')).not.toContain('frostscythe')
  })
})
