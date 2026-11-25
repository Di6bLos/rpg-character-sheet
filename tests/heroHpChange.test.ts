import { describe, expect, it } from 'vitest'
import type { Dnd5eSheet, NimbleSheet, Pf2eSheet } from '../types/sheets'
import { applyHpChange, applyHpChangeFor, freshChanges } from '../utils/heroHpChange'
import { defaultSheet, normalizeSheet } from '../utils/sheetDefaults'

function hero(patch: Partial<NimbleSheet> = {}): NimbleSheet {
  return { ...defaultSheet('nimble'), hp: 20, hpMax: 20, ...patch }
}

describe('GM hero HP changes', () => {
  it('applies damage through takeDamage (temp HP first)', () => {
    const sheet = hero({ tempHp: 3 })
    const message = applyHpChange(sheet, 3, { id: 'a', amount: -5, crit: false })
    expect(sheet.tempHp).toBe(0)
    expect(sheet.hp).toBe(18)
    expect(message).toBe('GM: took 5 damage: 18/20 HP.')
  })

  it('drops to 0 HP and marks the crit', () => {
    const sheet = hero({ hp: 4 })
    const message = applyHpChange(sheet, 3, { id: 'a', amount: -9, crit: true })
    expect(sheet.hp).toBe(0)
    expect(message).toMatch(/^GM: took 9 damage \(crit\): 0\/20 HP\./)
  })

  it('halves a hit while Warded, naming the warder’s share', () => {
    const sheet = hero({ conditions: ['Warded'] })
    expect(applyHpChange(sheet, 3, { id: 'a', amount: -9, crit: false })).toBe(
      'GM: took 4 damage: 16/20 HP. Warded: you take 4, your warder 5.',
    )
  })

  it('heals up to max', () => {
    const sheet = hero({ hp: 15 })
    expect(applyHpChange(sheet, 3, { id: 'a', amount: 8, crit: false })).toBe(
      'GM: healed 8: 20/20 HP.',
    )
    expect(sheet.hp).toBe(20)
  })

  it('applies each row once, oldest first', () => {
    const taken = new Set<string>()
    const rows = [
      { id: 'b', amount: -1, crit: false, created_at: '2026-01-02' },
      { id: 'a', amount: -2, crit: false, created_at: '2026-01-01' },
    ]
    expect(freshChanges(rows, taken).map((r) => r.id)).toEqual(['a', 'b'])
    expect(
      freshChanges([...rows, { id: 'c', amount: 1, crit: false }], taken).map((r) => r.id),
    ).toEqual(['c'])
  })
})

describe('GM hero HP changes, D&D 5e', () => {
  function corin(patch: Partial<Dnd5eSheet> = {}): Dnd5eSheet {
    return { ...defaultSheet('dnd5e'), hp: 20, hpMax: 20, ...patch }
  }

  it('starts a 5e sheet with no temp HP and no conditions', () => {
    expect(defaultSheet('dnd5e').tempHp).toBe(0)
    expect(defaultSheet('dnd5e').conditions).toEqual([])
    const old = normalizeSheet('dnd5e', { hp: 7, hpMax: 12 })
    expect(old.tempHp).toBe(0)
    expect(old.conditions).toEqual([])
  })

  it('takes temp HP first, then HP', () => {
    const sheet = corin({ tempHp: 3 })
    expect(applyHpChangeFor('dnd5e', sheet, 3, { id: 'a', amount: -5, crit: false })).toBe(
      'GM: took 5 damage: 18/20 HP.',
    )
    expect(sheet.tempHp).toBe(0)
    expect(sheet.hp).toBe(18)
  })

  it('keeps leftover temp HP when the hit is smaller', () => {
    const sheet = corin({ tempHp: 8 })
    applyHpChangeFor('dnd5e', sheet, 3, { id: 'a', amount: -5, crit: false })
    expect(sheet.tempHp).toBe(3)
    expect(sheet.hp).toBe(20)
  })

  it('stops at 0 HP, says Down, and a crit changes nothing but the note', () => {
    const sheet = corin({ hp: 4 })
    expect(applyHpChangeFor('dnd5e', sheet, 3, { id: 'a', amount: -9, crit: true })).toBe(
      'GM: took 9 damage (crit): 0/20 HP. Down: roll death saves.',
    )
    expect(sheet.hp).toBe(0)
  })

  it('damage while already at 0 fails a death save, 2 on a crit, up to 3', () => {
    const sheet = corin({ hp: 0, deathSaves: { successes: 1, failures: 0 } })
    expect(applyHpChangeFor('dnd5e', sheet, 3, { id: 'a', amount: -3, crit: false })).toBe(
      'GM: took 3 damage: 0/20 HP. Death save failed (1/3).',
    )
    applyHpChangeFor('dnd5e', sheet, 3, { id: 'b', amount: -3, crit: true })
    expect(sheet.deathSaves).toEqual({ successes: 1, failures: 3 })
    applyHpChangeFor('dnd5e', sheet, 3, { id: 'c', amount: -3, crit: true })
    expect(sheet.deathSaves.failures).toBe(3)
  })

  it('massive damage (the rest after 0 reaches max HP) kills outright', () => {
    const sheet = corin({ hp: 5 })
    expect(applyHpChangeFor('dnd5e', sheet, 3, { id: 'a', amount: -25, crit: false })).toBe(
      'GM: took 25 damage: 0/20 HP. Massive damage: dead.',
    )
    expect(sheet.deathSaves.failures).toBe(3)
    const down = corin({ hp: 0, tempHp: 2 })
    expect(applyHpChangeFor('dnd5e', down, 3, { id: 'b', amount: -21, crit: false })).toMatch(
      /Death save failed \(1\/3\)\.$/,
    )
    expect(applyHpChangeFor('dnd5e', down, 3, { id: 'c', amount: -20, crit: false })).toMatch(
      /Massive damage: dead\.$/,
    )
  })

  it('heals up to max', () => {
    const sheet = corin({ hp: 15 })
    expect(applyHpChangeFor('dnd5e', sheet, 3, { id: 'a', amount: 8, crit: false })).toBe(
      'GM: healed 8: 20/20 HP.',
    )
    expect(sheet.hp).toBe(20)
  })

  it('healing from 0 resets the death saves', () => {
    const sheet = corin({ hp: 0, deathSaves: { successes: 2, failures: 1 } })
    expect(applyHpChangeFor('dnd5e', sheet, 3, { id: 'a', amount: 4, crit: false })).toBe(
      'GM: healed 4: 4/20 HP. Death saves reset.',
    )
    expect(sheet.deathSaves).toEqual({ successes: 0, failures: 0 })
  })

  it('healing above 0 leaves the death saves alone', () => {
    const sheet = corin({ hp: 3, deathSaves: { successes: 1, failures: 0 } })
    applyHpChangeFor('dnd5e', sheet, 3, { id: 'a', amount: 4, crit: false })
    expect(sheet.deathSaves).toEqual({ successes: 1, failures: 0 })
  })
})

describe('GM hero HP changes, Pathfinder 2e', () => {
  function mira(patch: Partial<Pf2eSheet> = {}): Pf2eSheet {
    return { ...defaultSheet('pf2e'), hp: 20, hpMax: 20, ...patch }
  }

  it('takes temp HP first, then HP', () => {
    const sheet = mira({ tempHp: 2 })
    expect(applyHpChangeFor('pf2e', sheet, 3, { id: 'a', amount: -5, crit: false })).toBe(
      'GM: took 5 damage: 17/20 HP.',
    )
    expect(sheet.tempHp).toBe(0)
    expect(sheet.hp).toBe(17)
  })

  it('dropping to 0 sets Dying 1 + Wounded', () => {
    const sheet = mira({ hp: 4, wounded: 1 })
    expect(applyHpChangeFor('pf2e', sheet, 3, { id: 'a', amount: -10, crit: false })).toBe(
      'GM: took 10 damage: 0/20 HP. Dying 2.',
    )
    expect(sheet.hp).toBe(0)
    expect(sheet.dying).toBe(2)
  })

  it('a crit to 0 sets Dying 2 + Wounded', () => {
    const sheet = mira({ hp: 4 })
    expect(applyHpChangeFor('pf2e', sheet, 3, { id: 'a', amount: -6, crit: true })).toBe(
      'GM: took 6 damage (crit): 0/20 HP. Dying 2.',
    )
    expect(sheet.dying).toBe(2)
  })

  it('damage that leaves HP above 0 leaves Dying alone', () => {
    const sheet = mira()
    applyHpChangeFor('pf2e', sheet, 3, { id: 'a', amount: -6, crit: true })
    expect(sheet.dying).toBe(0)
  })

  it('damage while already at 0 raises Dying by 1, or 2 on a crit', () => {
    const sheet = mira({ hp: 0, dying: 1 })
    expect(applyHpChangeFor('pf2e', sheet, 3, { id: 'a', amount: -3, crit: false })).toBe(
      'GM: took 3 damage: 0/20 HP. Dying 2.',
    )
    expect(sheet.dying).toBe(2)
    applyHpChangeFor('pf2e', sheet, 3, { id: 'b', amount: -3, crit: true })
    expect(sheet.dying).toBe(4)
  })

  it('healing a stabilised hero (0 HP, Dying 0) adds no Wounded', () => {
    const sheet = mira({ hp: 0, dying: 0, wounded: 1 })
    expect(applyHpChangeFor('pf2e', sheet, 3, { id: 'a', amount: 5, crit: false })).toBe(
      'GM: healed 5: 5/20 HP.',
    )
    expect(sheet.dying).toBe(0)
    expect(sheet.wounded).toBe(1)
  })

  it('healing from 0 ends Dying and raises Wounded by 1', () => {
    const sheet = mira({ hp: 0, dying: 1, wounded: 0 })
    expect(applyHpChangeFor('pf2e', sheet, 3, { id: 'a', amount: 30, crit: false })).toBe(
      'GM: healed 30: 20/20 HP. Wounded 1.',
    )
    expect(sheet.hp).toBe(20)
    expect(sheet.dying).toBe(0)
    expect(sheet.wounded).toBe(1)
  })
})

describe('GM hero HP changes dispatch', () => {
  it('sends 5e to its own rules (temp HP first)', () => {
    const sheet = { ...defaultSheet('dnd5e'), hp: 10, hpMax: 10, tempHp: 4 }
    applyHpChangeFor('dnd5e', sheet, 3, { id: 'a', amount: -5, crit: false })
    expect([sheet.tempHp, sheet.hp]).toEqual([0, 9])
  })

  it('sends PF2e to its own rules (Dying at 0)', () => {
    const sheet = { ...defaultSheet('pf2e'), hp: 3, hpMax: 10 }
    applyHpChangeFor('pf2e', sheet, 3, { id: 'a', amount: -5, crit: false })
    expect(sheet.dying).toBe(1)
  })

  it('sends Nimble to its own rules', () => {
    const sheet = hero({ conditions: ['Warded'] })
    expect(applyHpChangeFor('nimble', sheet, 3, { id: 'a', amount: -9, crit: false })).toBe(
      'GM: took 4 damage: 16/20 HP. Warded: you take 4, your warder 5.',
    )
  })
})
