import { describe, expect, it } from 'vitest'
import type { NimbleSheet } from '../types/sheets'
import {
  abilityRoll,
  applyCastEffect,
  applyEffect,
  effectAttacks,
  endEffect,
  endEffects,
  splitMishap,
} from '../utils/nimbleEffects'
import { classBySlug } from '../data/nimble/classes'
import {
  abilityCounters,
  castSpell,
  endTurn,
  newEncounter,
  operateInvention,
  resourceOnAttack,
  safeRest,
  startTurn,
  takeDamage,
} from '../utils/nimblePlay'
import { addSummon, afterSummonedAttack, summonedWeapons } from '../utils/nimbleSummons'
import { defaultSheet } from '../utils/sheetDefaults'

function faces(sides: number, ...values: number[]) {
  let i = 0
  return () => ((values[i++ % values.length] ?? 1) - 1) / sides + 0.0001
}

function dice(...rolls: [sides: number, value: number][]) {
  let i = 0
  return () => {
    const [sides, value] = rolls[i++ % rolls.length]!
    return (value - 0.5) / sides
  }
}

function hero(abilities: string[], patch: Partial<NimbleSheet> = {}): NimbleSheet {
  return {
    ...defaultSheet('nimble'),
    stats: { STR: 2, DEX: 3, INT: 3, WIL: 0 },
    abilities: abilities.map((name) => ({ name, src: 'Class', desc: '' })),
    ...patch,
  }
}

describe('conditions from abilities', () => {
  it('turns you Invisible until you attack', () => {
    const sheet = hero(['One with Shadows'])
    expect(applyEffect(sheet, 5, 'One with Shadows')).toBe(
      'Invisible (One with Shadows) until you move or attack.',
    )
    expect(sheet.conditions).toEqual(['Invisible'])
    expect(endEffects(sheet, 'turn')).toBe('')
    expect(endEffects(sheet, 'attack')).toBe(' No longer Invisible.')
    expect(sheet.conditions).toEqual([])
  })

  it('ends Amidst All This Commotion on your next turn and Escape Plan with the encounter', () => {
    const sheet = hero(['Amidst All This Commotion…', 'Escape Plan'])
    applyEffect(sheet, 5, 'Amidst All This Commotion…')
    applyEffect(sheet, 5, 'Escape Plan')
    startTurn(sheet, 5)
    expect(sheet.conditions).toEqual(['Invisible'])
    expect(newEncounter(sheet, 5)).toMatch(/No longer Invisible\./)
    expect(sheet.conditions).toEqual([])
  })

  it('needs the ability, and keeps a condition the player set by hand', () => {
    const sheet = hero([], { conditions: ['Prone'] })
    expect(applyEffect(sheet, 5, 'One with Shadows')).toBe('')
    safeRest(sheet, 1)
    expect(sheet.conditions).toEqual(['Prone'])
  })

  it('knocks you Prone when the Thunder Gauntlets mishap', () => {
    const sheet = hero(['Mana Accumulator'], { classSlug: 'artificer' })
    sheet.resource.count = 3
    const hit = { miss: false, crit: false, total: 6, bonus: 0, dice: [5] }
    const gauntlets = { name: 'Thunder Gauntlets', melee: true, props: '+ Mana Dice' }
    expect(resourceOnAttack(sheet, 2, gauntlets, hit, 2, faces(4, 1, 4)).note).toMatch(
      /Mishap! .* You are Prone \(Thunder Gauntlets\) Recoil/,
    )
    expect(sheet.conditions).toEqual(['Prone'])
  })
})

describe('gadget rolls', () => {
  it('rolls INT+STR Scrapbots, with Dense Swarm and Sharpened Scrap', () => {
    expect(abilityRoll(hero(['Scrapbot Swarm']), 'Scrapbot Swarm', faces(6, 3))).toBe(
      ' Scrapbot Swarm: 15 damage (5d6: 3, 3, 3, 3, 3). Each construct hits any target within Reach 4.',
    )
    const upgraded = hero([
      'Scrapbot Swarm',
      'Scrapbot Swarm: Dense Swarm',
      'Scrapbot Swarm: Sharpened Scrap',
    ])
    expect(abilityRoll(upgraded, 'Scrapbot Swarm', faces(8, 2))).toMatch(/14 damage \(7d8:/)
  })

  it('heals INT d8 with a Stim Pack, doubled by Enhanced Stimulants, with the save DC', () => {
    const sheet = hero([
      'Stim Pack',
      'Stim Pack: Enhanced Stimulants',
      'Stim Pack: Reduced Side Effects',
    ])
    expect(abilityRoll(sheet, 'Stim Pack', faces(8, 4))).toBe(
      ' Stim Pack: 24 HP healed (3d8: 4 + 4 + 4 ×2). The target gains 1 action; at the end of their turn, DC 12 STR save or Dazed. The target gains 1 Wound.',
    )
  })

  it('rolls the Homing Missile with advantage when upgraded', () => {
    const sheet = hero(['Homing Missile', 'Homing Missile: Reliable Explosives'])
    expect(abilityRoll(sheet, 'Homing Missile', faces(20, 3, 17))).toMatch(
      /17 damage \(1d20 with advantage: 17\)/,
    )
    expect(abilityRoll(sheet, 'Rage')).toBe('')
  })

  it('explodes a Homing Missile that rolls 20, like any Primary Die', () => {
    expect(abilityRoll(hero(['Homing Missile']), 'Homing Missile', faces(20, 20, 6))).toMatch(
      /26 damage · critical \(1d20: 20 \+ 6\)/,
    )
  })

  it('rolls Explosive Framework only once Safety Buddy has it', () => {
    expect(abilityRoll(hero(['Safety Buddy']), 'Safety Buddy')).toBe('')
    const sheet = hero(['Safety Buddy', 'Safety Buddy: Explosive Framework'])
    expect(abilityRoll(sheet, 'Safety Buddy', faces(6, 4))).toMatch(
      /Safety Buddy: 12 damage \(3d6: 4 \+ 4 \+ 4\)/,
    )
  })

  it('gives every gadget +1 use per Safe Rest with Tinkermaster', () => {
    const sheet = defaultSheet('nimble')
    sheet.classSlug = 'artificer'
    sheet.abilities = [
      { name: 'Homing Missile', src: 'Artificer', desc: '(2/Safe Rest) Range 8.' },
      { name: 'Cheer Bot', src: 'Gadgeteer', desc: '(1/Safe Rest) Gadget. Action: place it.' },
      {
        name: 'Tinkermaster',
        src: 'Gadgeteer',
        desc: '+1 use/Safe Rest to all gadgets you have invented.',
      },
    ]
    const max = (name: string) =>
      abilityCounters(sheet, 15).find((e) => e.ability.name === name)?.counters[0]?.max
    expect(max('Homing Missile')).toBe(3)
    expect(max('Cheer Bot')).toBe(2)
  })
})

describe('Bonescythe', () => {
  it('is an attack while summoned, with DEX on every die and a die per 5 levels', () => {
    const sheet = hero([])
    addSummon(sheet, 10, 'bonescythe')
    expect(summonedWeapons(sheet, 10)).toEqual([
      expect.objectContaining({ name: 'Bonescythe', dmg: '4d12+12', melee: true }),
    ])
  })

  it('shatters on a hit, not a miss, and Reap summons a minion on a crit', () => {
    const sheet = hero(['Reap'], { classSlug: 'shadowmancer' })
    addSummon(sheet, 5, 'bonescythe')
    expect(afterSummonedAttack(sheet, 5, 'Bonescythe', { miss: true, crit: false })).toBe('')
    expect(afterSummonedAttack(sheet, 5, 'Bonescythe', { miss: false, crit: true })).toBe(
      ' Bonescythe shatters. Reap: Shadow minion A summoned (1/3).',
    )
    expect(summonedWeapons(sheet, 5)).toEqual([])
  })

  it('shatters when combat ends', () => {
    const sheet = hero([])
    addSummon(sheet, 1, 'bonescythe')
    newEncounter(sheet, 1)
    expect(sheet.summons).toEqual([])
  })
})

describe('mishap text', () => {
  it('pulls a single mishap out of an ability and leaves the rest', () => {
    expect(
      splitMishap(
        'Armor: 8+STR. Mishap: Armor Lockup! Restrained (escape DC 10). Only 1 kind of armor can be worn at a time.',
      ),
    ).toEqual({
      text: 'Armor: 8+STR. Only 1 kind of armor can be worn at a time.',
      mishap: { name: 'Armor Lockup', text: 'Restrained (escape DC 10).' },
    })
    expect(splitMishap('Tether. Mishap: A. x. Coil. Mishap: B. y.').mishap).toBe(null)
    expect(splitMishap('No mishaps here.')).toEqual({ text: 'No mishaps here.', mishap: null })
  })
})

describe('Artificer inventions', () => {
  function artificer(inventions: string[], dice = 3): NimbleSheet {
    const sheet = hero(['Mana Accumulator', ...inventions], {
      classSlug: 'artificer',
      hp: 20,
      hpMax: 20,
    })
    sheet.resource.count = dice
    expect(classBySlug('artificer')).toBeDefined()
    return sheet
  }

  it('fires the Manabolt Cannon: d12 plus each Mana Die + INT, and its d12 counts for a mishap', () => {
    const sheet = artificer(['Manabolt Cannon'])
    expect(operateInvention(sheet, 5, 'Manabolt Cannon', 2, dice([6, 4], [6, 3], [12, 5]))).toMatch(
      /^Manabolt Cannon: 18 damage to the target and 13 to ALL creatures between/,
    )
    expect(sheet.resource.count).toBe(1)
    const risky = artificer(['Manabolt Cannon'])
    const line = operateInvention(risky, 5, 'Manabolt Cannon', 2, dice([6, 5], [6, 6], [12, 2]))
    expect(line).toMatch(/Mishap! .*You take 4 damage\..*Manabolt Cannon: Inoperable/)
    expect(risky.hp).toBe(16)
    expect(operateInvention(risky, 5, 'Manabolt Cannon', 1)).toBe(
      'Manabolt Cannon is inoperable: repair it first.',
    )
  })

  it('uses the Tethercoil as a Tether or a Coil, each with its own mishap', () => {
    const sheet = artificer(['Tethercoil'])
    expect(operateInvention(sheet, 5, 'Tethercoil', 2, dice([6, 5], [6, 6]), 'coil')).toMatch(
      /^Tethercoil: Coil: Restrain all creatures fully in a 2×2 area, Range \+8/,
    )
    const risky = artificer(['Tethercoil'])
    expect(operateInvention(risky, 5, 'Tethercoil', 1, dice([6, 1]), 'tether')).toMatch(
      /Tether: pull a creature.*Mishap!.*Mistether!/,
    )
  })

  it('swings the Manablade for 2 × (Mana Dice + STR) and needs at least 1 die', () => {
    const sheet = artificer(['Manablade'])
    expect(operateInvention(sheet, 5, 'Manablade', 0)).toBe('Manablade needs at least 1 Mana Die.')
    expect(operateInvention(sheet, 5, 'Manablade', 2, faces(6, 4, 5))).toMatch(
      /^Manablade: 22 damage \[2 × \(2d6 \(4, 5\) \+ STR\)\]\. 1 Mana Dice left\.$/,
    )
  })

  it('locks up Manaforged Plate (Restrained) and tumbles the Jerkin (Prone) on a mishap', () => {
    const plate = artificer(['Manaforged Plate'])
    expect(operateInvention(plate, 5, 'Manaforged Plate', 2, faces(6, 1, 6))).toMatch(
      /Defend with \+8 Armor.*Mishap!.*Locked up/,
    )
    expect(plate.conditions).toContain('Restrained')
    expect(plate.malfunctions).toEqual(['Manaforged Plate'])
    const jerkin = artificer(['Aethertuned Jerkin'])
    operateInvention(jerkin, 5, 'Aethertuned Jerkin', 1, faces(6, 1))
    expect(jerkin.conditions).toEqual(['Prone'])
  })
})

describe('transformations and other statuses', () => {
  function shifter(...abilities: string[]): NimbleSheet {
    return hero(['Beastshift', ...abilities], { classSlug: 'stormshifter', hp: 30, hpMax: 30 })
  }

  it('shifts into a Fearsome Beast: temp HP, Gore, its portrait; a spell or switching ends it', () => {
    const sheet = shifter('Direbeast Form', 'Creature of the Fey')
    sheet.formPortraits = { 'Fearsome Beast': 'u/bear.png' }
    expect(applyEffect(sheet, 4, 'Beast of the Pack')).toBe('')
    expect(applyEffect(sheet, 4, 'Fearsome Beast')).toMatch(
      /Beastshifted \(Fearsome Beast\): 7 temp HP/,
    )
    expect(sheet).toMatchObject({
      tempHp: 7,
      portraitOverride: 'u/bear.png',
      conditions: ['Beastshifted'],
    })
    expect(effectAttacks(sheet, 4)).toEqual([
      expect.objectContaining({ name: 'Gore', dmg: '1d6+4', melee: true }),
    ])
    expect(endEffects(sheet, 'spell')).toBe('')
    applyEffect(sheet, 4, 'Harmless beast')
    expect(sheet.effects.map((e) => e.source)).toEqual(['Harmless beast'])
    expect(sheet).toMatchObject({ tempHp: 0, portraitOverride: '' })
    sheet.abilities = sheet.abilities.filter((a) => a.name !== 'Creature of the Fey')
    expect(endEffects(sheet, 'spell')).toBe(' No longer Beastshifted.')
  })

  it('ends a Tiny form on ANY damage, and every form at 0 HP', () => {
    const tiny = shifter('Direbeast Form (3)')
    applyEffect(tiny, 5, 'Beast of Nightmares')
    expect(effectAttacks(tiny, 5)[0]).toMatchObject({ name: 'Sting', dmg: '1d4+15' })
    takeDamage(tiny, 1)
    expect(tiny.effects).toEqual([])
    const big = shifter('Direbeast Form (2)')
    applyEffect(big, 5, 'Beast of the Pack')
    takeDamage(big, 1)
    expect(big.effects).toHaveLength(1)
    expect(takeDamage(big, 99)).toMatch(/No longer Beastshifted/)
  })

  it('casts Dragonform: 10×LVL temp HP and Tooth & Claw; you drop to 0 HP when they run out', () => {
    const sheet = hero([], { hp: 40, hpMax: 40 })
    expect(applyCastEffect(sheet, 17, 'Dragonform')).toMatch(/Dragonform: 170 temp HP/)
    expect(effectAttacks(sheet, 17)[0]).toMatchObject({ name: 'Tooth & Claw', dmg: '1d20+17' })
    expect(takeDamage(sheet, 170)).toMatch(/Dragonform ends: you drop to 0 HP/)
    expect(sheet).toMatchObject({ hp: 0, dying: true, tempHp: 0 })
  })

  it('ends Dragonform before a Safe Rest restores HP', () => {
    const sheet = hero([], { hp: 40, hpMax: 40, woundsMax: 6, wounds: 1 })
    applyCastEffect(sheet, 17, 'Dragonform')
    expect(safeRest(sheet, 17)).toMatch(/restored.*First: .*Dragonform ends: you drop to 0 HP/)
    expect(sheet).toMatchObject({ hp: 40, dying: false, wounds: 1, tempHp: 0 })
    expect(sheet.effects).toEqual([])
  })

  it('keeps a concentration spell’s status when it replaces another concentration', () => {
    const sheet = hero([], { concentration: 'Shadow Trap' })
    castSpell(sheet, 'Boisterous Winds', 1, 5)
    expect(sheet.concentration).toBe('Boisterous Winds')
    expect(sheet.effects.map((e) => e.source)).toEqual(['Boisterous Winds'])
    castSpell(sheet, 'Boisterous Winds', 1, 5)
    expect(sheet.effects.map((e) => e.source)).toEqual(['Boisterous Winds'])
  })

  it('lets Dragonform take the rest of the hit that ends it: 1 Wound, not 3', () => {
    const sheet = hero([], { hp: 40, hpMax: 40, concentration: 'Fly' })
    applyCastEffect(sheet, 10, 'Dragonform')
    expect(takeDamage(sheet, 110)).toMatch(/Dragonform ends.*Concentration broken/)
    expect(sheet).toMatchObject({ hp: 0, dying: true, wounds: 1, concentration: '' })
  })

  it('keeps Dragonform’s temp HP when a shorter temp HP effect ends', () => {
    const sheet = hero([], { stats: { STR: 0, DEX: 0, INT: 3, WIL: 1 }, classSlug: 'mage' })
    applyCastEffect(sheet, 10, 'Dragonform')
    applyCastEffect(sheet, 10, 'Frost Shield')
    startTurn(sheet, 10)
    expect(sheet.tempHp).toBe(100)
    expect(sheet.effects.map((e) => e.source)).toEqual(['Dragonform'])
  })

  it('melts Frost Shield’s temp HP when your next turn starts, upcast included', () => {
    const sheet = hero([], { stats: { STR: 0, DEX: 0, INT: 3, WIL: 1 }, classSlug: 'mage' })
    applyCastEffect(sheet, 5, 'Frost Shield', 1)
    expect(sheet.tempHp).toBe(12)
    startTurn(sheet, 5)
    expect(sheet.tempHp).toBe(0)
  })

  it('keeps I’m Outta Here! through the turn you use it, until the end of your next', () => {
    const sheet = hero(['I’m Outta Here!'], { turnActive: true })
    applyEffect(sheet, 5, 'I’m Outta Here!')
    endTurn(sheet, 5)
    expect(sheet.conditions).toEqual(['Invisible'])
    endTurn(sheet, 5)
    expect(sheet.conditions).toEqual([])
  })

  it('ends an effect used on another creature’s turn at the end of your next turn', () => {
    const sheet = hero(['I’m Outta Here!'], { turnActive: false })
    applyEffect(sheet, 5, 'I’m Outta Here!')
    endTurn(sheet, 5)
    expect(sheet.conditions).toEqual([])
  })

  it('clears negative conditions with Glacial Resilience, and Ending it by hand drops its temp HP', () => {
    const sheet = hero(['Glacial Resilience'], { conditions: ['Prone', 'Invisible', 'Dazed'] })
    applyEffect(sheet, 5, 'Glacial Resilience')
    expect(sheet.conditions).toEqual(['Invisible', 'Glacial Resilience'])
    expect(sheet.tempHp).toBe(50)
    endEffect(sheet, 'Glacial Resilience')
    expect(sheet.tempHp).toBe(0)
  })
})
