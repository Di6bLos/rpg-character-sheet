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

  it('dropping to 0 adds Unconscious, and healing from 0 removes it', () => {
    const sheet = corin({ hp: 4, conditions: ['Prone'] })
    applyHpChangeFor('dnd5e', sheet, 3, { id: 'a', amount: -6, crit: false })
    expect(sheet.conditions).toEqual(['Prone', 'Unconscious'])
    applyHpChangeFor('dnd5e', sheet, 3, { id: 'b', amount: 2, crit: false })
    expect(sheet.conditions).toEqual(['Prone'])
  })

  it('temp HP that soaks a hit at 0 fails no death save', () => {
    const sheet = corin({ hp: 0, tempHp: 5, deathSaves: { successes: 1, failures: 1 } })
    expect(applyHpChangeFor('dnd5e', sheet, 3, { id: 'a', amount: -4, crit: false })).toBe(
      'GM: took 4 damage: 0/20 HP.',
    )
    expect(sheet.tempHp).toBe(1)
    expect(sheet.deathSaves).toEqual({ successes: 1, failures: 1 })
  })

  it('a hit ends Stable: the successes start over', () => {
    const sheet = corin({ hp: 0, deathSaves: { successes: 3, failures: 1 } })
    expect(applyHpChangeFor('dnd5e', sheet, 3, { id: 'a', amount: -2, crit: false })).toBe(
      'GM: took 2 damage: 0/20 HP. Death save failed (2/3).',
    )
    expect(sheet.deathSaves).toEqual({ successes: 0, failures: 2 })
  })

  it('the third failure says dead, and a dead hero cannot be healed', () => {
    const sheet = corin({ hp: 0, deathSaves: { successes: 0, failures: 2 } })
    expect(applyHpChangeFor('dnd5e', sheet, 3, { id: 'a', amount: -2, crit: false })).toBe(
      'GM: took 2 damage: 0/20 HP. Death save failed (3/3): dead.',
    )
    expect(applyHpChangeFor('dnd5e', sheet, 3, { id: 'b', amount: 10, crit: false })).toBe(
      'GM: healing has no effect: the hero is dead.',
    )
    expect(sheet.hp).toBe(0)
    expect(sheet.deathSaves).toEqual({ successes: 0, failures: 3 })
  })
})

describe('GM hero HP changes, Pathfinder 2e (the sheet engine)', () => {
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

  it('dropping to 0 knocks out with Dying 1 + Wounded', () => {
    const sheet = mira({ hp: 4, wounded: 1 })
    expect(applyHpChangeFor('pf2e', sheet, 3, { id: 'a', amount: -10, crit: false })).toBe(
      'GM: took 10 damage: 0/20 HP. Knocked out: Dying 2.',
    )
    expect(sheet.hp).toBe(0)
    expect(sheet.dying).toBe(2)
    expect(sheet.conditions).toContain('Unconscious')
  })

  it('a crit to 0 sets Dying 2 + Wounded', () => {
    const sheet = mira({ hp: 4 })
    expect(applyHpChangeFor('pf2e', sheet, 3, { id: 'a', amount: -6, crit: true })).toBe(
      'GM: took 6 damage (crit): 0/20 HP. Knocked out: Dying 2.',
    )
    expect(sheet.dying).toBe(2)
  })

  it('damage that leaves HP above 0 leaves Dying alone', () => {
    const sheet = mira()
    applyHpChangeFor('pf2e', sheet, 3, { id: 'a', amount: -6, crit: true })
    expect(sheet.dying).toBe(0)
  })

  it('damage while already dying raises Dying by 1, or 2 on a crit', () => {
    const sheet = mira({ hp: 0, dying: 1 })
    expect(applyHpChangeFor('pf2e', sheet, 3, { id: 'a', amount: -3, crit: false })).toBe(
      'GM: took 3 damage: 0/20 HP. Dying 2.',
    )
    expect(sheet.dying).toBe(2)
    applyHpChangeFor('pf2e', sheet, 3, { id: 'b', amount: -3, crit: true })
    expect(sheet.dying).toBe(4)
  })

  it('Doomed lowers the Dying value that kills', () => {
    const sheet = mira({ hp: 0, dying: 2, doomed: 1 })
    expect(applyHpChangeFor('pf2e', sheet, 3, { id: 'a', amount: -3, crit: false })).toBe(
      'GM: took 3 damage: 0/20 HP. Dying 3: your hero dies.',
    )
    expect(applyHpChangeFor('pf2e', sheet, 3, { id: 'b', amount: 10, crit: false })).toBe(
      'GM: healing has no effect: the hero is dead.',
    )
    expect(sheet.hp).toBe(0)
  })

  it('massive damage (double max HP in one blow) kills outright', () => {
    const sheet = mira()
    expect(applyHpChangeFor('pf2e', sheet, 3, { id: 'a', amount: -40, crit: false })).toBe(
      'GM: took 40 damage, double your max HP or more: massive damage, your hero dies instantly.',
    )
    expect(sheet.hp).toBe(0)
    expect(sheet.dying).toBe(4)
  })

  it('healing a stabilised hero (0 HP, Dying 0) adds no Wounded and wakes them', () => {
    const sheet = mira({ hp: 0, dying: 0, wounded: 1, conditions: ['Unconscious'] })
    expect(applyHpChangeFor('pf2e', sheet, 3, { id: 'a', amount: 5, crit: false })).toBe(
      'GM: healed 5: 5/20 HP.',
    )
    expect(sheet.dying).toBe(0)
    expect(sheet.wounded).toBe(1)
    expect(sheet.conditions).toEqual([])
  })

  it('healing from 0 ends Dying and raises Wounded by 1', () => {
    const sheet = mira({ hp: 0, dying: 1, wounded: 0 })
    expect(applyHpChangeFor('pf2e', sheet, 3, { id: 'a', amount: 30, crit: false })).toBe(
      'GM: healed 20: 20/20 HP. No longer dying; wounded 1.',
    )
    expect(sheet.hp).toBe(20)
    expect(sheet.dying).toBe(0)
    expect(sheet.wounded).toBe(1)
  })

  it('dropping to 0 adds Unconscious, and healing from 0 removes it', () => {
    const sheet = mira({ hp: 3, conditions: [] })
    applyHpChangeFor('pf2e', sheet, 3, { id: 'a', amount: -3, crit: false })
    expect(sheet.conditions).toEqual(['Unconscious'])
    applyHpChangeFor('pf2e', sheet, 3, { id: 'b', amount: 1, crit: false })
    expect(sheet.conditions).toEqual([])
  })

  it('a stabilised hero (0 HP, Dying 0) who is hit starts again at 1 + Wounded', () => {
    const sheet = mira({ hp: 0, dying: 0, wounded: 1 })
    expect(applyHpChangeFor('pf2e', sheet, 3, { id: 'a', amount: -2, crit: false })).toBe(
      'GM: took 2 damage: 0/20 HP. Knocked out: Dying 2.',
    )
    const crit = mira({ hp: 0, dying: 0, wounded: 1 })
    applyHpChangeFor('pf2e', crit, 3, { id: 'b', amount: -2, crit: true })
    expect(crit.dying).toBe(3)
  })

  it('Dying 4 is dead: it says so, and healing has no effect', () => {
    const sheet = mira({ hp: 0, dying: 3 })
    expect(applyHpChangeFor('pf2e', sheet, 3, { id: 'a', amount: -2, crit: false })).toBe(
      'GM: took 2 damage: 0/20 HP. Dying 4: your hero dies.',
    )
    expect(applyHpChangeFor('pf2e', sheet, 3, { id: 'b', amount: 10, crit: false })).toBe(
      'GM: healing has no effect: the hero is dead.',
    )
    expect(sheet.hp).toBe(0)
    expect(sheet.dying).toBe(4)
  })
})

describe('GM hero HP changes, PF2e damage type, spell and Shield Block', () => {
  const mira = (patch: Partial<Pf2eSheet> = {}): Pf2eSheet => ({
    ...defaultSheet('pf2e'),
    hp: 20,
    hpMax: 20,
    ...patch,
  })
  const BLOCK = { type: 'General', level: '1', action: '↺', name: 'Shield Block', desc: '' }
  const shield = {
    name: 'Steel Shield',
    ac: 2,
    hardness: 5,
    hp: 20,
    hpMax: 20,
    bt: 10,
    raised: true,
  }

  it('applies resistances and weaknesses to the GM’s typed damage (Player Core p. 408)', () => {
    const sheet = mira({
      defenses: {
        resistances: [{ type: 'fire', value: 5 }],
        weaknesses: [{ type: 'cold', value: 3 }],
        immunities: [],
      },
    })
    const fire = { id: 'a', amount: -8, crit: false, damage_type: 'fire' }
    expect(applyHpChangeFor('pf2e', sheet, 3, fire)).toMatch(/^GM: .*resistance 5 fire/)
    expect(sheet.hp).toBe(17)
    applyHpChangeFor('pf2e', sheet, 3, { id: 'b', amount: -2, crit: false, damage_type: 'cold' })
    expect(sheet.hp).toBe(12)
    // Untyped, as before: no defenses.
    applyHpChangeFor('pf2e', sheet, 3, { id: 'c', amount: -2, crit: false })
    expect(sheet.hp).toBe(10)
  })

  it('counts "from a spell" for a resistance to spells', () => {
    const sheet = mira({
      defenses: { resistances: [{ type: 'spells', value: 2 }], weaknesses: [], immunities: [] },
    })
    applyHpChangeFor('pf2e', sheet, 3, { id: 'a', amount: -6, crit: false, damage_type: 'fire' })
    expect(sheet.hp).toBe(14)
    applyHpChangeFor('pf2e', sheet, 3, {
      id: 'b',
      amount: -6,
      crit: false,
      damage_type: 'fire',
      spell: true,
    })
    expect(sheet.hp).toBe(10)
  })

  it('Shield Blocks physical damage, spending the reaction (Player Core p. 262)', () => {
    const sheet = mira({ shield: { ...shield }, feats: [BLOCK] })
    const line = applyHpChangeFor('pf2e', sheet, 3, {
      id: 'a',
      amount: -8,
      crit: false,
      damage_type: 'slashing',
      shield_block: true,
    })
    expect(line).toBe('GM: Steel Shield blocks 5, takes 3. Took 3 slashing damage: 17/20 HP.')
    expect(sheet.shield.hp).toBe(17)
  })

  it('says why Shield Block didn’t apply: fire isn’t physical, or no feat', () => {
    const sheet = mira({ shield: { ...shield }, feats: [BLOCK] })
    const fire = { id: 'a', amount: -4, crit: false, damage_type: 'fire', shield_block: true }
    expect(applyHpChangeFor('pf2e', sheet, 3, fire)).toMatch(/^GM: No Shield Block: .*physical/)
    expect([sheet.hp, sheet.shield.hp]).toEqual([16, 20])
    const plain = mira({ shield: { ...shield } })
    const cut = { id: 'b', amount: -4, crit: false, damage_type: 'slashing', shield_block: true }
    expect(applyHpChangeFor('pf2e', plain, 3, cut)).toMatch(/Shield Block feat/)
    expect(plain.hp).toBe(16)
  })

  it('Nimble and 5e ignore the type and Shield Block', () => {
    const nimble = hero()
    const typed = { id: 'a', amount: -5, crit: false, damage_type: 'fire', shield_block: true }
    applyHpChangeFor('nimble', nimble, 3, typed)
    expect(nimble.hp).toBe(15)
    const dnd = { ...defaultSheet('dnd5e'), hp: 10, hpMax: 10 }
    applyHpChangeFor('dnd5e', dnd, 3, typed)
    expect(dnd.hp).toBe(5)
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
