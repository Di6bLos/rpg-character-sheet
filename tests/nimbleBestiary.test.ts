import { describe, expect, it } from 'vitest'
import { BESTIARY } from '../data/nimble/bestiary'
import { bestiaryRows } from '../utils/bestiary'

const monsters = BESTIARY.flatMap((f) => f.monsters.map((m) => ({ family: f, m })))
const rows = bestiaryRows(BESTIARY)

describe('Nimble GM’s Guide bestiary', () => {
  it('has every monster from the book', () => {
    const count = (section: string) =>
      monsters.filter(({ family }) => family.section === section).length
    expect(count('bestiary')).toBe(69)
    expect(count('legendary')).toBe(18)
    expect(count('adventure')).toBe(2)
  })

  it('has unique, well-formed slugs and names the database accepts', () => {
    const slugs = rows.map((r) => r.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const r of rows) {
      expect(r.slug).toMatch(/^nimble-gmg-[a-z0-9-]+$/)
      expect(r.name.length).toBeGreaterThan(0)
      expect(r.name.length).toBeLessThanOrEqual(80)
    }
  })

  it('uses printed levels', () => {
    for (const { m } of monsters) expect(m.level, m.name).toMatch(/^(1\/[234]|[1-9]\d?)$/)
  })

  it('gives minions no HP and everyone else a positive HP', () => {
    for (const { m } of monsters) {
      if (m.name.endsWith('Minion')) expect(m.hp, m.name).toBeNull()
      else expect(m.hp, m.name).toBeGreaterThan(0)
    }
  })

  it('gives legendary monsters saves, a Bloodied or team note, and a Last Stand', () => {
    for (const { family, m } of monsters) {
      if (family.section === 'bestiary') continue
      expect(m.saves, m.name).toBeTruthy()
      // Poppy's Last Stand lives on Kelebek (the team shares one).
      if (m.name.startsWith('Poppy')) continue
      expect(m.lastStand?.length, m.name).toBeGreaterThan(0)
    }
  })

  it('gives every monster something to do', () => {
    for (const { family, m } of monsters) {
      const things = m.actions.length + (m.traits?.length ?? 0) + family.traits.length
      expect(things, m.name).toBeGreaterThan(0)
    }
  })

  it('stores the tracker HP that the stat block shows', () => {
    for (const r of rows) {
      const shown = r.stat_block.top?.find(([k]) => k === 'HP')?.[1]
      if (shown === 'Minion') expect(r.stat_block.hp).toBeUndefined()
      else expect(String(r.stat_block.hp)).toBe(shown)
      expect(r.source_ref).toMatch(/^Nimble GM's Guide p\. \d+$/)
    }
  })
})
