import { describe, expect, it } from 'vitest'
import { classBySlug } from '../data/nimble/classes'
import type { NimbleSheet } from '../types/sheets'
import { summonChoices, syncCompanions } from '../utils/nimbleBuild'
import {
  castSpell,
  endTurn,
  newEncounter,
  startTurn,
  safeRest,
  spendActions,
} from '../utils/nimblePlay'
import {
  addSummon,
  availableSummons,
  commandMinions,
  companionAttack,
  dismissSummon,
  minionCount,
  setSummonLook,
  summonModifiers,
  summonOptions,
  switchSummonOption,
  sacrificeMinions,
  sacrificeSummon,
  slaySummon,
  spiritAct,
  summonFromAbility,
} from '../utils/nimbleSummons'
import { defaultSheet } from '../utils/sheetDefaults'
import { build } from './helpers/nimble'

function faces(sides: number, ...values: number[]) {
  let i = 0
  return () => ((values[i++ % values.length] ?? 1) - 1) / sides + 0.0001
}

const ability = (name: string) => ({ name, src: 'Class', desc: '' })

function shadowmancer(abilities: string[] = [], INT = 3): NimbleSheet {
  const sheet = defaultSheet('nimble')
  sheet.classSlug = 'shadowmancer'
  sheet.stats = { STR: 0, DEX: 1, INT, WIL: 0 }
  sheet.spells.learned = ['Summon Shadows', 'Shadow Blast']
  sheet.abilities = abilities.map(ability)
  return sheet
}

function shepherd(abilities: string[] = []): NimbleSheet {
  const sheet = defaultSheet('nimble')
  sheet.classSlug = 'shepherd'
  sheet.stats = { STR: 2, DEX: 0, INT: 0, WIL: 3 }
  sheet.abilities = [ability('Lifebinding Spirit'), ...abilities.map(ability)]
  return sheet
}

describe('shadow minions', () => {
  it('caps Summon Shadows at INT or LVL, whichever is lower', () => {
    const sheet = shadowmancer()
    expect(availableSummons(sheet).map((d) => d.id)).toContain('shadow-minion')
    expect(addSummon(sheet, 2, 'shadow-minion')).toBe('Shadow minion A summoned (1/2).')
    addSummon(sheet, 2, 'shadow-minion')
    expect(addSummon(sheet, 2, 'shadow-minion')).toMatch(/already at the max of 2/)
    expect(sheet.summons.map((s) => s.name)).toEqual(['Shadow minion A', 'Shadow minion B'])
    expect(sheet.summons[0]).toMatchObject({ hp: 1, hpMax: 1 })
  })

  it('summons two at a time with Eldritch Usurper, still within the cap', () => {
    const sheet = shadowmancer(['Eldritch Usurper'])
    expect(addSummon(sheet, 9, 'shadow-minion')).toBe('2 shadow minions summoned (2/3).')
    addSummon(sheet, 9, 'shadow-minion')
    expect(minionCount(sheet)).toBe(3)
  })

  it('adds a minion when Summon Shadows is cast', () => {
    const sheet = shadowmancer()
    expect(castSpell(sheet, 'Summon Shadows', 1, 3)).toMatch(/Shadow minion A summoned/)
    expect(minionCount(sheet)).toBe(1)
  })

  it('rolls each minion with no bonus: a 1 misses, Shadow Magus makes them d10 with +4 Reach', () => {
    const sheet = shadowmancer(['Shadow Magus'])
    addSummon(sheet, 5, 'shadow-minion')
    addSummon(sheet, 5, 'shadow-minion')
    expect(commandMinions(sheet, 5, faces(10, 7, 1))).toBe(
      'Minions attack (Reach 6, d10): 7, miss = 7 damage.',
    )
  })

  it('summons another on a max roll with Swarming Shadows, even past the cap', () => {
    const sheet = shadowmancer(['Swarming Shadows', 'Hungering Shadows'])
    addSummon(sheet, 3, 'shadow-minion')
    expect(commandMinions(sheet, 3, faces(12, 12))).toMatch(
      /12 = 12 damage\. Swarming Shadows: \+1 shadow minion\. Hungering Shadows/,
    )
    addSummon(sheet, 3, 'shadow-minion')
    expect(minionCount(sheet)).toBe(3)
    expect(commandMinions(sheet, 3, faces(12, 12))).toBe(
      'You already commanded your minions this turn.',
    )
    endTurn(sheet, 3)
    startTurn(sheet, 3)
    commandMinions(sheet, 3, faces(12, 12))
    expect(minionCount(sheet)).toBe(6)
  })

  it('explodes into exactly 5 minions with Eldritch Usurper, and Shadow Magus makes it d10s', () => {
    const sheet = shadowmancer(['Eldritch Usurper', 'Shadow Magus'])
    addSummon(sheet, 9, 'greater-shadow')
    expect(commandMinions(sheet, 9, faces(10, 4))).toBe(
      'Minions attack (Reach 6, d10): Greater Shadow 20 = 20 damage.',
    )
    slaySummon(sheet, 9, sheet.summons[0]!.id)
    expect(minionCount(sheet)).toBe(5)
  })

  it('explodes a slain Greater Shadow into 5 minions, plus 1 per tier upcast', () => {
    const sheet = shadowmancer(['Vengeful Blast'])
    sheet.spells.schools = ['necrotic']
    sheet.spells.tier = 5
    expect(castSpell(sheet, 'Greater Shadow', 2, 9, 5)).toMatch(/Greater Shadow summoned/)
    const greater = sheet.summons.find((s) => s.def === 'greater-shadow')!
    expect(greater.tier).toBe(5)
    expect(slaySummon(sheet, 9, greater.id)).toBe(
      'Greater Shadow is slain. It explodes into 6 shadow minions. Vengeful Blast: you may cast Shadow Blast as a reaction.',
    )
    expect(sheet.summons.filter((s) => s.def === 'shadow-minion')).toHaveLength(6)
  })

  it('pays Shadow Exploit with minions from the pool and says when it runs short', () => {
    const sheet = shadowmancer()
    addSummon(sheet, 3, 'shadow-minion')
    expect(sacrificeMinions(sheet, 1)).toBe('')
    expect(minionCount(sheet)).toBe(0)
    expect(sacrificeMinions(sheet, 2)).toBe(' Only 0 shadow minions to sacrifice (2 short).')
  })

  it('lets Martyr Spawn sacrifice a minion when Defending', () => {
    const sheet = shadowmancer(['Martyr Spawn'])
    addSummon(sheet, 3, 'shadow-minion')
    expect(sacrificeSummon(sheet, 3, sheet.summons[0]!.id)).toBe(
      'Shadow minion A sacrificed. Martyr Spawn: when you Defend, take no damage.',
    )
  })

  it('clears minions on a new encounter (keeping a favored pet) and adds the Patron’s two', () => {
    const sheet = shadowmancer(['My Favored Pet', 'I’m the Patron Now!'])
    syncCompanions(sheet)
    addSummon(sheet, 9, 'shadow-minion')
    addSummon(sheet, 9, 'shadow-minion')
    expect(newEncounter(sheet, 9)).toMatch(
      /Shadow minion A, Shadow minion B are gone\. 2 shadow minions join you for free\./,
    )
    expect(minionCount(sheet)).toBe(3)
    addSummon(sheet, 9, 'shadow-minion')
    addSummon(sheet, 9, 'shadow-minion')
    newEncounter(sheet, 9)
    expect(minionCount(sheet)).toBe(3)
  })

  it('finishes a multi-action summoning spell on the next turn', () => {
    const sheet = shadowmancer()
    sheet.spells.schools = ['necrotic']
    sheet.spells.tier = 4
    spendActions(sheet, 2)
    castSpell(sheet, 'Greater Shadow', 2, 9, 4)
    expect(sheet.summons).toHaveLength(0)
    endTurn(sheet, 9)
    expect(startTurn(sheet, 9)).toMatch(/Greater Shadow takes effect.*Greater Shadow summoned/)
    expect(sheet.summons).toHaveLength(1)
  })
})

describe('Lifebinding Spirit', () => {
  it('heals as many times as the mana spent, then fades; recasting replaces it', () => {
    const sheet = shepherd()
    addSummon(sheet, 3, 'lifebinding-spirit', { tier: 2 })
    expect(sheet.summons[0]).toMatchObject({ tier: 2, charges: 2 })
    expect(spiritAct(sheet, 3, 'heal', faces(8, 5))).toBe(
      'Lifebinding Spirit heals 8 HP [1d8 (5) + 3]. 1 heals left.',
    )
    expect(spiritAct(sheet, 3, 'heal', faces(8, 5))).toMatch(/Its last heal: it fades\./)
    expect(sheet.summons).toHaveLength(0)
    addSummon(sheet, 3, 'lifebinding-spirit')
    addSummon(sheet, 3, 'lifebinding-spirit')
    expect(sheet.summons).toHaveLength(1)
  })

  it('applies Empowered Companion, Twilight Sage and Deathbringer’s Touch', () => {
    const sheet = shepherd(['Empowered Companion', 'Twilight Sage', 'Deathbringer’s Touch'])
    addSummon(sheet, 10, 'lifebinding-spirit', { tier: 5 })
    expect(sheet.summons[0]).toMatchObject({ tier: 6, charges: 6 })
    expect(spiritAct(sheet, 10, 'attack', faces(20, 10, 4))).toBe(
      'Lifebinding Spirit attacks: 19 radiant damage, ignoring armor [2d20 (10, 4) + 5].',
    )
    expect(spiritAct(sheet, 10, 'attack', faces(20, 1, 9))).toMatch(/miss/)
    expect(spiritAct(sheet, 10, 'attack', faces(20, 20, 3, 20, 5))).toBe(
      'Lifebinding Spirit attacks: 53 radiant damage · critical!, ignoring armor [2d20 (20, 3, 20, 5) + 5].',
    )
  })

  it('ends on a Safe Rest', () => {
    const sheet = shepherd()
    addSummon(sheet, 3, 'lifebinding-spirit')
    expect(safeRest(sheet, 3)).toMatch(/Lifebinding Spirit is gone\./)
  })
})

describe('other summons', () => {
  it('adds a Songweaver friend or Artificer gadget when the ability is used', () => {
    const sheet = defaultSheet('nimble')
    sheet.abilities = [ability('Stompy'), ability('Cheer Bot')]
    expect(summonFromAbility(sheet, 5, 'Stompy')).toBe('Stompy summoned.')
    expect(summonFromAbility(sheet, 5, 'Cheer Bot')).toBe('Cheer Bot summoned.')
    expect(summonFromAbility(sheet, 5, 'Rage')).toBe('')
    safeRest(sheet, 5)
    expect(sheet.summons.map((s) => s.name)).toEqual(['Cheer Bot'])
  })

  it('keeps a Beastmaster’s companion on the sheet for as long as the hero has it', () => {
    const sheet = build(classBySlug('hunter')!)
    sheet.abilities.push(ability('Medium Companion'))
    syncCompanions(sheet)
    syncCompanions(sheet)
    expect(sheet.summons).toEqual([expect.objectContaining({ def: 'medium-companion', hp: 0 })])
    safeRest(sheet, 3)
    newEncounter(sheet, 3)
    expect(sheet.summons).toHaveLength(1)
    sheet.abilities = sheet.abilities.filter((a) => a.name !== 'Medium Companion')
    syncCompanions(sheet)
    expect(sheet.summons).toHaveLength(0)
  })
})

describe('class options on summons', () => {
  it('gives Master of Nightfrost INT+LVL temp HP when a minion would crit', () => {
    const sheet = shadowmancer(['Master of Nightfrost'])
    addSummon(sheet, 5, 'shadow-minion')
    expect(commandMinions(sheet, 5, faces(12, 12))).toMatch(/Master of Nightfrost: 8 temp HP\./)
    expect(sheet.tempHp).toBe(8)
  })

  it('makes Go for the Throat! unmissable and spends its Thrill of the Hunt charges', () => {
    const sheet = defaultSheet('nimble')
    sheet.abilities = [ability('Large Companion')]
    syncCompanions(sheet)
    sheet.resource.count = 1
    expect(companionAttack(sheet, 5, faces(12, 1))).toBe(
      'Go for the Throat! costs 2 Thrill of the Hunt charges; you have 1.',
    )
    sheet.resource.count = 3
    expect(companionAttack(sheet, 5, faces(12, 1))).toMatch(
      /21 damage, ignoring armor; it can't miss .*1 charge left\./,
    )
  })

  it('counts Go for the Throat! against its uses and spends its actions', () => {
    const sheet = build(classBySlug('hunter')!)
    sheet.abilities.push({
      name: 'Medium Companion',
      src: 'Class',
      desc: classBySlug('hunter')!
        .subclasses.flatMap((s) => Object.values(s.levels).flatMap((l) => l?.abilities ?? []))
        .concat(classBySlug('hunter')!.pools.flatMap((p) => p.options))
        .find((a) => a.name === 'Medium Companion')!.desc,
    })
    syncCompanions(sheet)
    sheet.resource.count = 3
    expect(companionAttack(sheet, 5, faces(8, 1))).toMatch(/Go for the Throat!: 16 damage/)
    expect(sheet.actionsSpent).toBe(1)
    expect(sheet.resource.count).toBe(2)
    expect(companionAttack(sheet, 5, faces(8, 1))).toBe(
      'Go for the Throat!: no uses left per encounter.',
    )
  })

  it('lists every option of a companion from its ability', () => {
    const sheet = build(classBySlug('hunter')!)
    const large = classBySlug('hunter')!
      .pools.flatMap((p) => p.options)
      .find((o) => o.name === 'Large Companion')!
    sheet.abilities.push({ name: large.name, src: 'Animal Companion', desc: large.desc })
    syncCompanions(sheet)
    expect(summonOptions(sheet, 'large-companion').map((o) => [o.name, o.passive])).toEqual([
      ['Alpha Protector', true],
      ['Protect Me!', false],
      ['Go for the Throat!', false],
    ])
    expect(summonOptions(sheet, 'large-companion')[0]!.text).toBe(
      'damage from the first attack against you each round is halved.',
    )
    expect(summonOptions(sheet, 'shadow-minion')).toEqual([])
  })

  it('counts the favored pet against the shadow minion cap', () => {
    const sheet = shadowmancer(['My Favored Pet'], 3)
    syncCompanions(sheet)
    expect(addSummon(sheet, 5, 'shadow-minion', { count: 5 })).toBe(
      '2 shadow minions summoned (2/2).',
    )
  })

  it('sacrifices the favored pet like any shadow minion', () => {
    const sheet = shadowmancer(['My Favored Pet', 'Martyr Spawn'])
    syncCompanions(sheet)
    const pet = sheet.summons.find((m) => m.def === 'favored-pet')!
    expect(sacrificeSummon(sheet, 5, pet.id)).toMatch(
      /Favored pet sacrificed\. Martyr Spawn: when you Defend, take no damage\./,
    )
    expect(sheet.summons).toEqual([])
  })

  it('lists the class options and lines that upgrade a summon', () => {
    const sheet = shadowmancer(['Swarming Shadows', 'Armor of Shadows', 'My Favored Pet'])
    sheet.abilities = sheet.abilities.map((a) =>
      a.name === 'Armor of Shadows'
        ? { ...a, desc: 'Take 1 less damage from every hit for each minion you have.' }
        : a,
    )
    const names = summonModifiers(sheet, 'shadow-minion').map((m) => m.name)
    expect(names).toContain('Swarming Shadows')
    expect(names).toContain('Armor of Shadows')
    expect(names).not.toContain('My Favored Pet')
  })

  it('gives a new minion the first free letter', () => {
    const sheet = shadowmancer()
    addSummon(sheet, 5, 'shadow-minion', { count: 3, ignoreCap: true })
    dismissSummon(sheet, sheet.summons[0]!.id)
    addSummon(sheet, 5, 'shadow-minion', { count: 2, ignoreCap: true })
    expect(sheet.summons.map((s) => s.name)).toEqual([
      'Shadow minion B',
      'Shadow minion C',
      'Shadow minion A',
      'Shadow minion D',
    ])
  })

  it('renames a summon kind and gives it an animal and image, now and when summoned again', () => {
    const sheet = shadowmancer()
    addSummon(sheet, 5, 'shadow-minion', { count: 2, ignoreCap: true })
    setSummonLook(sheet, 'shadow-minion', { name: 'Gloom', portrait: 'u/gloom.png' })
    expect(sheet.summons.map((s) => [s.name, s.portrait])).toEqual([
      ['Gloom A', 'u/gloom.png'],
      ['Gloom B', 'u/gloom.png'],
    ])
    addSummon(sheet, 5, 'shadow-minion', { ignoreCap: true })
    expect(sheet.summons.at(-1)).toMatchObject({ name: 'Gloom C', portrait: 'u/gloom.png' })
    setSummonLook(sheet, 'shadow-minion', {})
    expect(sheet.summons.map((s) => s.name)).toEqual([
      'Shadow minion A',
      'Shadow minion B',
      'Shadow minion C',
    ])
    expect(sheet.summonLooks).toEqual({})

    const hunter = defaultSheet('nimble')
    hunter.abilities = [ability('Small Companion')]
    syncCompanions(hunter)
    setSummonLook(hunter, 'small-companion', { beast: 'hawk' })
    expect(hunter.summons[0]).toMatchObject({ name: 'Hawk', beast: 'hawk' })
    setSummonLook(hunter, 'small-companion', { beast: 'hawk', name: 'Talon' })
    expect(hunter.summons[0]).toMatchObject({ name: 'Talon', beast: 'hawk' })
  })

  it('switches the companion to another size, everywhere the pick is remembered', () => {
    const hunter = classBySlug('hunter')!
    const option = (name: string) =>
      hunter.pools.flatMap((p) => p.options).find((o) => o.name === name)!
    const sheet = defaultSheet('nimble')
    sheet.classSlug = 'hunter'
    sheet.abilities = [
      { name: 'Small Companion', src: 'Animal Companion', desc: option('Small Companion').desc },
    ]
    sheet.choices = { 'L3:beast-companion': ['Small Companion'] }
    sheet.levelHistory = [
      {
        level: 3,
        before: { abilities: [] },
        nimble: { hpGain: 5, statBumps: {}, picks: { 'L3:beast-companion': ['Small Companion'] } },
      },
    ]
    syncCompanions(sheet)
    setSummonLook(sheet, 'small-companion', { name: 'Biscuit', beast: 'cat', portrait: 'u/b.png' })
    expect(summonChoices(sheet)).toEqual([
      {
        held: 'Small Companion',
        options: [
          { name: 'Small Companion', level: 1 },
          { name: 'Medium Companion', level: 3 },
          { name: 'Large Companion', level: 3 },
        ],
      },
    ])

    expect(switchSummonOption(sheet, 'Small Companion', 'Medium Companion')).toBe(
      'Biscuit is now your medium companion.',
    )
    expect(sheet.abilities.map((a) => a.name)).toEqual(['Medium Companion'])
    expect(sheet.choices['L3:beast-companion']).toEqual(['Medium Companion'])
    expect(sheet.levelHistory[0]!.nimble!.picks['L3:beast-companion']).toEqual(['Medium Companion'])
    expect(sheet.levelHistory[0]!.before).toEqual({ abilities: [] })
    expect(sheet.summons).toEqual([
      expect.objectContaining({ def: 'medium-companion', name: 'Biscuit', portrait: 'u/b.png' }),
    ])
    expect(sheet.summons[0]!.beast).toBeUndefined()
    expect(sheet.summonLooks).toEqual({
      'medium-companion': { name: 'Biscuit', portrait: 'u/b.png' },
    })
  })

  it('keeps a favored pet minion through a Safe Rest and sends Stompy home after a round', () => {
    const sheet = shadowmancer(['My Favored Pet', 'Stompy'])
    syncCompanions(sheet)
    addSummon(sheet, 5, 'shadow-minion')
    safeRest(sheet, 5)
    expect(sheet.summons.map((m) => [m.def, m.hpMax])).toEqual([['favored-pet', 1]])
    expect(minionCount(sheet)).toBe(1)
    expect(commandMinions(sheet, 5, faces(12, 7))).toMatch(/7/)
    summonFromAbility(sheet, 5, 'Stompy')
    expect(startTurn(sheet, 5)).toMatch(/Stompy is gone\./)
  })

  it('adds Revitalizing Blessing to a 6+ heal and Harbinger of Decay’s necrotic option', () => {
    const sheet = shepherd(['Revitalizing Blessing', 'Harbinger of Decay'])
    addSummon(sheet, 5, 'lifebinding-spirit', { tier: 3 })
    expect(spiritAct(sheet, 5, 'heal', faces(10, 7))).toMatch(/Revitalizing Blessing \(1\/round\)/)
    expect(spiritAct(sheet, 5, 'attack', faces(10, 4))).toMatch(/radiant or necrotic damage/)
  })

  it('reminds of Vengeful Blast when Shadow Exploit sacrifices minions', () => {
    const sheet = shadowmancer(['Vengeful Blast'])
    addSummon(sheet, 3, 'shadow-minion')
    expect(sacrificeMinions(sheet, 1, 3)).toBe(
      ' Vengeful Blast: you may cast Shadow Blast as a reaction.',
    )
  })
})
