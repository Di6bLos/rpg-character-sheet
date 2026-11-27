// The Artificer's items (utils/dnd5eArtificer.ts) and what magic items add to the numbers
// (utils/dnd5eMagicItems.ts): replicated plans, the attunement limit, Spell-Storing Item.
import { describe, expect, it } from 'vitest'
import { unarmedAttack, weaponAttack } from '../utils/dnd5eAttacks'
import {
  attunementLimit,
  knownPlans,
  planKind,
  replicate,
  storableSpells,
  storeSpell,
  useStoredSpell,
} from '../utils/dnd5eArtificer'
import { chargesOf, gearAc, itemPlus } from '../utils/dnd5eMagicItems'
import { acNow, initiativeTest, saveRow } from '../utils/dnd5ePlay'
import { spellNumbers } from '../utils/dnd5eSpells'
import { build, data, levelTo } from './helpers/dnd5e'

const plans = data.options.find((g) => g.slug === 'plans')!.entries
const plan = (slug: string) => plans.find((p) => p.slug === slug)!

describe('Replicate Magic Item', () => {
  it('makes an item from a known plan, up to the Magic Items column', () => {
    const { sheet } = build('artificer')
    levelTo(sheet, 1, 2)
    const known = knownPlans(sheet, plans)
    expect(known.length).toBe(4)
    const cols = { 'Magic Items': '2' }
    expect(replicate(sheet, known[0]!, cols)).toMatch(/Replicate Magic Item:/)
    expect(replicate(sheet, known[0]!, cols)).toMatch(/different plan/)
    replicate(sheet, known[1]!, cols)
    const third = replicate(sheet, known[2]!, cols)
    expect(third).toMatch(new RegExp(`${known[0]!.name} vanishes`))
    expect(sheet.inventory.filter((i) => i.replicated)).toHaveLength(2)
  })

  it('enchants a weapon with Weapon +1: +1 to attack and damage, gone when it vanishes', () => {
    const { sheet } = build('artificer')
    levelTo(sheet, 1, 2)
    const i = sheet.weapons.findIndex((w) => w.slug === 'quarterstaff')
    const def = data.weapons.find((w) => w.slug === 'quarterstaff')
    const before = weaponAttack(sheet, 2, sheet.weapons[i]!, def, { key: 'w' }).test.bonus
    expect(planKind('weapon-1')).toBe('weapon')
    replicate(sheet, plan('weapon-1'), { 'Magic Items': '1' }, i)
    const w = sheet.weapons[i]!
    expect(w).toMatchObject({ name: 'Quarterstaff +1', magic: 1 })
    const p = weaponAttack(sheet, 2, w, def, { key: 'w' })
    expect(p.test.bonus).toBe(before + 1)
    expect(p.flat).toContainEqual({ label: 'Quarterstaff +1', value: 1 })
    replicate(sheet, plan('bag-of-holding'), { 'Magic Items': '1' })
    expect(sheet.weapons[i]!.magic).toBeUndefined()
    expect(sheet.weapons[i]!.name).toBe('Quarterstaff')
  })

  it('wears Armor +1 in place of the armor, adding 1 AC', () => {
    const { sheet } = build('artificer')
    levelTo(sheet, 1, 6)
    const ac = acNow(sheet, 6).value
    replicate(sheet, plan('armor-1'), { 'Magic Items': '3' })
    expect(sheet.inventory.find((i) => i.worn && i.tag === 'Armor')?.name).toMatch(/\+1$/)
    expect(acNow(sheet, 6).value).toBe(ac + 1)
  })
})

describe('magic items on the numbers', () => {
  it('reads +N, Rings of Protection, a War Mage wand, Wraps and a Sentinel Shield', () => {
    const { sheet } = build('artificer')
    levelTo(sheet, 1, 10)
    expect(itemPlus('Shield +2')).toBe(2)
    sheet.inventory.push(
      { name: 'Ring of Protection', qty: '1', attuned: true },
      { name: 'Wand of the War Mage +2', qty: '1', attuned: true },
      { name: 'Wraps of Unarmed Power +1', qty: '1' },
      { name: 'Sentinel Shield', qty: '1', tag: 'Shield', worn: true },
    )
    expect(gearAc(sheet)).toContainEqual({ label: 'Ring of Protection', value: 1 })
    expect(saveRow(sheet, 10, 'WIS').test.lines).toContain('Ring of Protection +1')
    const ref = { ability: 'INT' as const }
    expect(spellNumbers(sheet, 10, ref).attack).toBe(
      Math.floor((sheet.abilities.INT - 10) / 2) + 4 + 2,
    )
    expect(unarmedAttack(sheet, 10).flat).toContainEqual({
      label: 'Wraps of Unarmed Power +1',
      value: 1,
    })
    expect(initiativeTest(sheet, 10).adv).toContain('Sentinel Shield')
  })

  it('reads charges from an item’s text', () => {
    const wand = {
      text: 'This wand has 7 charges. It regains 1d6 + 1 expended charges daily at dawn.',
    }
    expect(chargesOf(wand.text)).toEqual({ max: 7, regain: '1d6 + 1' })
  })

  it('raises the attunement limit with Magic Item Adept, Savant and Master', () => {
    const { sheet } = build('artificer')
    levelTo(sheet, 1, 9)
    expect(attunementLimit(sheet, 9)).toBe(3)
    levelTo(sheet, 9, 10)
    expect(attunementLimit(sheet, 10)).toBe(4)
    levelTo(sheet, 10, 18)
    expect(attunementLimit(sheet, 18)).toBe(6)
  })
})

describe('Spell-Storing Item', () => {
  it('stores a level 1–3 action spell for twice INT uses', () => {
    const { sheet } = build('artificer')
    levelTo(sheet, 1, 11)
    const ok = storableSpells(data.spells)
    expect(ok.every((d) => d.level >= 1 && d.level <= 3 && d.classes.includes('artificer'))).toBe(
      true,
    )
    const cure = ok.find((d) => d.slug === 'cure-wounds')!
    expect(storeSpell(sheet, 11, cure)).toMatch(/Cure Wounds stored/)
    const uses = sheet.storedSpell!.uses
    expect(uses).toBe(2 * Math.max(1, Math.floor((sheet.abilities.INT - 10) / 2)))
    expect(useStoredSpell(sheet)).toMatch(new RegExp(`${uses - 1} use`))
  })
})
