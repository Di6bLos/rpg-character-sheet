// Casting 5e (2024) spells: options, slots and pact slots, one slot a turn, Concentration,
// attacks and saves, scaling, healing and the slot features (utils/dnd5eSpells.ts).
import { describe, expect, it } from 'vitest'
import type { Dnd5eSheet, Dnd5eSpellRef } from '../types/sheets'
import { hasEffect } from '../utils/dnd5eEffects'
import { beginEncounter, startTurn } from '../utils/dnd5ePlay'
import {
  arcaneRecovery,
  castOptions,
  castSpell,
  castWhy,
  damageLine,
  magicalCunning,
  pointsToSlot,
  slotToPoints,
  slotsLeft,
  spellHealing,
} from '../utils/dnd5eSpells'
import { build, data, levelTo } from './helpers/dnd5e'

const spell = (slug: string) => data.spells.find((s) => s.slug === slug)!
const ref = (s: Dnd5eSheet, slug: string): Dnd5eSpellRef =>
  s.spells!.find((x) => x.slug === slug) ?? {
    slug,
    name: spell(slug).name,
    level: spell(slug).level,
    from: 'Wizard',
    ability: s.castingStats?.ability ?? 'INT',
  }

function wizard(level = 5) {
  const { sheet } = build('wizard')
  return levelTo(sheet, 1, level)
}

describe('casting', () => {
  it('offers the slots of the spell’s level and up, and the Ritual', () => {
    const s = wizard()
    const book = ref(s, 'detect-magic')
    expect(book.book).toBe(true)
    expect(castOptions(s, 5, book, spell('detect-magic')).map((o) => o.key)).toEqual(['ritual'])
    const opts = castOptions(s, 5, { ...book, book: false }, spell('detect-magic'))
    expect(opts.map((o) => o.key)).toEqual(['slot1', 'slot2', 'slot3', 'ritual'])
  })

  it('upcasts Fireball by 1d6 a level and spends that slot', () => {
    const s = wizard()
    const fb = spell('fireball')
    const r = ref(s, 'fireball')
    expect(damageLine(s, 5, r, fb, 3)).toBe('8d6 Fire')
    expect(damageLine(s, 5, r, fb, 4)).toBe('9d6 Fire')
    const opt = castOptions(s, 5, r, fb).find((o) => o.key === 'slot3')!
    const out = castSpell(s, 5, r, fb, opt)
    expect(out.line).toMatch(/DC 15 DEX save: \d+ damage .*half on a success/)
    expect(slotsLeft(s)[2]).toBe(1)
  })

  it('scales cantrips at 5 and makes Eldritch Blast beams, with Agonizing Blast', () => {
    const s = wizard()
    expect(damageLine(s, 5, ref(s, 'fire-bolt'), spell('fire-bolt'), 0)).toBe('2d10 Fire')
    const { sheet: w } = build('warlock')
    levelTo(w, 1, 5)
    const eb = ref(w, 'eldritch-blast')
    expect(damageLine(w, 5, eb, spell('eldritch-blast'), 0)).toMatch(/^1d10\+\d Force ×2 beams$/)
  })

  it('allows one spell slot a turn in an encounter', () => {
    const s = wizard()
    beginEncounter(s)
    startTurn(s)
    const mm = spell('magic-missile')
    const opt = castOptions(s, 5, ref(s, 'magic-missile'), mm)[0]!
    castSpell(s, 5, ref(s, 'magic-missile'), mm, opt)
    expect(
      castWhy(s, spell('shield'), castOptions(s, 5, ref(s, 'shield'), spell('shield'))[0]),
    ).toBe('One spell slot a turn')
  })

  it('a new Concentration spell ends the last, and its effect goes with it', () => {
    const { sheet: s } = build('cleric')
    const bless = spell('bless')
    castSpell(s, 1, ref(s, 'bless'), bless, castOptions(s, 1, ref(s, 'bless'), bless)[0]!)
    expect(hasEffect(s, 'bless')).toBe(true)
    const sof = {
      slug: 'shield-of-faith',
      name: 'Shield of Faith',
      level: 1,
      from: 'Cleric',
      ability: 'WIS' as const,
    }
    const out = castSpell(s, 1, sof, spell('shield-of-faith'), {
      key: 'slot1',
      label: '',
      level: 1,
      kind: 'slot',
    })
    expect(out.line).toMatch(/Bless ends/)
    expect(hasEffect(s, 'bless')).toBe(false)
    expect(s.concentration?.slug).toBe('shield-of-faith')
  })

  it('heals with the spellcasting modifier and Disciple of Life', () => {
    const { sheet: s } = build('cleric')
    levelTo(s, 1, 3, 'life-domain')
    const h = spellHealing(s, 3, ref(s, 'cure-wounds'), spell('cure-wounds'), 2)!
    expect(h.dice).toBe('4d8')
    expect(h.flat.map((f) => f.label)).toEqual(['WIS', 'Disciple of Life'])
  })

  it('rolls a spell attack against the target and misses on a natural 1', () => {
    const s = wizard()
    const out = castSpell(
      s,
      5,
      ref(s, 'fire-bolt'),
      spell('fire-bolt'),
      castOptions(s, 5, ref(s, 'fire-bolt'), spell('fire-bolt'))[0]!,
      {
        target: { ac: 10 },
        rng: () => 0,
      },
    )
    expect(out.line).toMatch(/miss/)
  })
})

describe('slot features', () => {
  it('turns slots into Sorcery Points and back', () => {
    const { sheet: s } = build('sorcerer')
    levelTo(s, 1, 3)
    s.used = { 'Font of Magic': 3 }
    expect(slotToPoints(s, 2)).toMatch(/2 Sorcery Points/)
    expect(pointsToSlot(s, 1)).toMatch(/2 Sorcery Points into a 1st-level slot/)
    expect(slotsLeft(s)[0]).toBe(5)
  })

  it('Arcane Recovery regains slots up to half the Wizard level', () => {
    const s = wizard()
    s.slotsUsed = [2, 1, 0]
    expect(arcaneRecovery(s, 5, [2, 2])).toMatch(/add up to 4; you can regain 3/)
    expect(arcaneRecovery(s, 5, [2, 1])).toMatch(/regained a 2nd-level slot, a 1st-level slot/)
  })

  it('Magical Cunning brings back half the pact slots', () => {
    const { sheet: w } = build('warlock')
    levelTo(w, 1, 5)
    w.pactUsed = 2
    expect(magicalCunning(w)).toMatch(/1 Pact Magic slot back/)
  })
})
