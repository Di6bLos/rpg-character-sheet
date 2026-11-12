import { describe, expect, it } from 'vitest'
import { blankNpcForm, firstInt, fromStatBlock, toStatBlock } from '../utils/npcStatBlock'

describe('firstInt', () => {
  it('reads the first number of a field', () => {
    expect(firstInt('22 (5d8)')).toBe(22)
    expect(firstInt('+6; darkvision')).toBe(6)
    expect(firstInt('−2')).toBe(-2)
    expect(firstInt('None')).toBeUndefined()
  })
})

describe('toStatBlock', () => {
  it('builds a 5e ghoul with the numbers initiative needs', () => {
    const f = blankNpcForm('dnd5e')
    f.name = 'Ghoul'
    f.type = 'Undead'
    f.top['Armor Class'] = '12'
    f.top['Hit Points'] = '22 (5d8)'
    f.top.Speed = '30 ft.'
    f.stats.DEX = '15'
    f.lines = [
      ['Senses', 'darkvision 60 ft.'],
      ['', 'dropped'],
    ]
    f.sections[1]!.items = [
      { n: 'Claws', t: '+4 to hit' },
      { n: '', t: '' },
    ]
    const b = toStatBlock(f, 'dnd5e')
    expect(b).toMatchObject({ hp: 22, ac: 12, initMod: 2, type: 'Undead' })
    expect(b.top).toEqual([
      ['Armor Class', '12'],
      ['Hit Points', '22 (5d8)'],
      ['Speed', '30 ft.'],
    ])
    expect(b.lines).toEqual([['Senses', 'darkvision 60 ft.']])
    expect(b.sections).toEqual([{ title: 'Actions', items: [{ n: 'Claws', t: '+4 to hit' }] }])
  })

  it('takes PF2e initiative from Perception and Nimble needs no stats', () => {
    const p = blankNpcForm('pf2e')
    p.top.Perception = '+6; darkvision'
    p.top.HP = '20'
    expect(toStatBlock(p, 'pf2e')).toMatchObject({ initMod: 6, hp: 20 })
    const n = blankNpcForm('nimble')
    n.top.Armor = 'Medium'
    n.top.HP = '60'
    const nb = toStatBlock(n, 'nimble')
    expect(nb).toMatchObject({ hp: 60, stats: [] })
    expect(nb.ac).toBeUndefined()
  })
})

describe('fromStatBlock', () => {
  it('round-trips a stat block through the form', () => {
    const f = blankNpcForm('nimble', 'humanoid')
    f.name = 'Old Hesketh'
    f.type = 'Human'
    f.top.HP = '6'
    f.sections[1]!.items = [{ n: 'Axe', t: '1d6' }]
    const block = toStatBlock(f, 'nimble')
    const back = fromStatBlock(block, 'nimble', {
      name: 'Old Hesketh',
      kind: 'humanoid',
      level: '0',
    })
    expect(toStatBlock(back, 'nimble')).toEqual(block)
    expect(back.kind).toBe('humanoid')
  })

  const meta = { name: 'Ghoul', kind: 'monster' as const, level: '1' }

  it('keeps the tracker numbers of a numeric-only block', () => {
    const back = fromStatBlock({ hp: 22, ac: 12, initMod: 2 }, 'dnd5e', meta)
    expect(back.top['Hit Points']).toBe('22')
    expect(back.top['Armor Class']).toBe('12')
    const block = toStatBlock(back, 'dnd5e')
    expect([block.hp, block.ac, block.initMod]).toEqual([22, 12, 2])
  })

  it('keeps an explicit initiative until its source input changes', () => {
    const back = fromStatBlock({ stats: [['DEX', '14']], hp: 9, initMod: 5 }, 'dnd5e', meta)
    expect(toStatBlock(back, 'dnd5e').initMod).toBe(5)
    back.stats.DEX = '18'
    expect(toStatBlock(back, 'dnd5e').initMod).toBe(4)
    const nimble = fromStatBlock({ top: [['HP', '30']], hp: 30, initMod: 3 }, 'nimble', meta)
    expect(toStatBlock(nimble, 'nimble').initMod).toBe(3)
  })
})
