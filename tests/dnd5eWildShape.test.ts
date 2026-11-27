// Wild Shape (utils/dnd5eWildShape.ts): the Beast Shapes limits, Circle Forms, taking and
// leaving a form, its AC, Speed and attacks, and Beast Spells.
import { describe, expect, it } from 'vitest'
import type { Dnd5eBeastForm } from '../types/sheets'
import { rollAttack5e } from '../utils/dnd5eAttacks'
import { acNow, beginEncounter, speedNow, startTurn, usesLeft } from '../utils/dnd5ePlay'
import { attackRiders } from '../utils/dnd5eRiders'
import { castWhy } from '../utils/dnd5eSpells'
import {
  activeForm,
  assumeForm,
  beastAttack,
  beastShapes,
  formWhy,
  leaveForm,
  learnForm,
} from '../utils/dnd5eWildShape'
import { build, data, levelTo } from './helpers/dnd5e'

const wolf: Dnd5eBeastForm = {
  name: 'Wolf',
  cr: '1/4',
  ac: 12,
  speed: '40 ft',
  attacks: [{ name: 'Bite', bonus: 4, damage: '1d6+2', type: 'Piercing' }],
}
const bear: Dnd5eBeastForm = {
  ...wolf,
  name: 'Brown Bear',
  cr: '1',
  ac: 11,
  speed: '40 ft, climb 30 ft',
}
const owl: Dnd5eBeastForm = { ...wolf, name: 'Giant Owl', cr: '1/4', fly: true }

describe('Wild Shape', () => {
  it('follows the Beast Shapes table: known forms, CR, Fly Speed', () => {
    const { sheet } = build('druid')
    levelTo(sheet, 1, 2)
    expect(beastShapes(sheet, 2)).toMatchObject({ known: 4, maxCrText: '1/4', fly: false })
    expect(beastShapes(sheet, 4)).toMatchObject({ known: 6, maxCrText: '1/2' })
    expect(beastShapes(sheet, 8)).toMatchObject({ known: 8, maxCrText: '1', fly: true })
    expect(formWhy(sheet, 2, bear)).toBe('CR 1 is above 1/4')
    expect(formWhy(sheet, 2, owl)).toBe('No Fly Speed before Druid level 8')
  })

  it('lets a Moon druid take CR 1 forms at level 3 with three times the temp HP and 13 + WIS AC', () => {
    const { sheet } = build('druid')
    levelTo(sheet, 1, 3, 'circle-of-the-moon')
    expect(beastShapes(sheet, 3).maxCrText).toBe('1')
    expect(learnForm(sheet, 3, bear)).toMatch(/known form/)
    beginEncounter(sheet)
    sheet.awaitingInitiative = false
    startTurn(sheet, 3)
    expect(assumeForm(sheet, 3, 'Brown Bear')).toMatch(/become a Brown Bear/)
    expect(sheet.tempHp).toBe(9)
    expect(usesLeft(sheet, 'Wild Shape')).toBe(1)
    expect(activeForm(sheet)?.name).toBe('Brown Bear')
    const wis = Math.floor((sheet.abilities.WIS - 10) / 2)
    expect(acNow(sheet, 3).value).toBe(Math.max(11, 13 + wis))
    expect(speedNow(sheet, 3)).toMatchObject({ value: 40, others: 'climb 30 ft' })
    const spell = data.spells.find((s) => s.slug === 'thunderwave')!
    expect(
      castWhy(sheet, spell, { key: 'slot1', label: '', level: 1, kind: 'slot', left: 1 }),
    ).toBe('No spells while in Wild Shape')
    leaveForm(sheet, 3)
    expect(activeForm(sheet)).toBeNull()
  })

  it('attacks with the form’s stat block and takes Primal Strike and Lunar Form', () => {
    const { sheet } = build('druid')
    levelTo(sheet, 1, 14, 'circle-of-the-moon')
    sheet.choices = { ...sheet.choices }
    sheet.features.push({ name: 'Elemental Fury: Primal Strike', desc: '', from: 'Druid 7' })
    learnForm(sheet, 14, wolf)
    sheet.used = {}
    assumeForm(sheet, 14, 'Wolf')
    const p = beastAttack(sheet, 14, wolf, 0)
    expect(p).toMatchObject({ kind: 'beast', dice: '1d6', mod: 2, test: { bonus: 4 } })
    const keys = attackRiders(sheet, 14, p).map((o) => o.def.key)
    expect(keys).toEqual(expect.arrayContaining(['primal-strike', 'lunar-form']))
    expect(rollAttack5e(sheet, p, { target: { ac: 5 }, rng: () => 0.7 }).hit).toBe(true)
  })
})

describe('Circle of the Moon spells', () => {
  it('casts its Circle spells in Wild Shape', () => {
    const { sheet } = build('druid')
    levelTo(sheet, 1, 3, 'circle-of-the-moon')
    learnForm(sheet, 3, wolf)
    assumeForm(sheet, 3, 'Wolf')
    const moonbeam = data.spells.find((s) => s.slug === 'moonbeam')!
    expect(
      sheet.spells?.some((r) => r.slug === 'moonbeam' && r.from.startsWith('Circle of the Moon')),
    ).toBe(true)
    expect(
      castWhy(sheet, moonbeam, { key: 'slot2', label: '', level: 2, kind: 'slot', left: 1 }),
    ).toBe('')
  })
})
