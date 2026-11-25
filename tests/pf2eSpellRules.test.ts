import { describe, expect, it } from 'vitest'
import type { Pf2eSpellDef } from '../data/pf2e/types'
import type { Pf2eSheet } from '../types/sheets'
import { activeEffects } from '../utils/pf2eEffects'
import {
  SPELL_PATTERNS,
  castRolls,
  diceText,
  effectValue,
  partsAt,
  pieces,
  spellRules,
  spellSummary,
} from '../utils/pf2eSpellRules'
import { castEffect, castWentOff, heightenedRank } from '../utils/pf2eSpells'
import { defaultSheet } from '../utils/sheetDefaults'
import { buildData as data, named } from './helpers/pf2e'

const spell = (name: string) => named(data.spells, name)
/** The rolls at a rank (and action count), as "dice role type" strings. */
const rolls = (name: string, rank: number, extra: { actions?: number; melee?: boolean } = {}) => {
  const s = spell(name)
  return partsAt(s, spellRules(s), { rank, ...extra })
    .filter((p) => !p.later)
    .map((p) =>
      `${diceText(p.dice)} ${p.role === 'damage' ? '' : `${p.role} `}${p.persistent ? 'persistent ' : ''}${p.type}${p.degree ? ` (${p.degree})` : ''}`.trim(),
    )
}
/** Every die lands on its middle: d4 → 3, d6 → 4, d8 → 5, d20 → 11. */
const middle = () => 0.5

describe('pf2e spell rules: Player Core spells', () => {
  it('Force Barrage: 1d4+1 per shard, a shard per action, one more per action every 2 ranks (p. 332)', () => {
    const s = spell('Force Barrage')
    const r = spellRules(s)
    expect(r.actionOptions).toEqual([1, 2, 3])
    expect(r.attack).toBe(false)
    expect(r.saves).toEqual([])
    expect(rolls('Force Barrage', 1, { actions: 1 })).toEqual(['1d4+1 force'])
    expect(rolls('Force Barrage', 1, { actions: 3 })).toEqual(['3d4+3 force'])
    expect(rolls('Force Barrage', 2, { actions: 3 })).toEqual(['3d4+3 force'])
    expect(pieces(s, r, { rank: 3, actions: 3 })).toBe(6)
    expect(rolls('Force Barrage', 3, { actions: 3 })).toEqual(['6d4+6 force'])
    expect(rolls('Force Barrage', 5, { actions: 2 })).toEqual(['6d4+6 force'])
  })

  it('Fireball: 6d6 fire, basic Reflex, +2d6 per rank above 3rd (p. 331)', () => {
    const r = spellRules(spell('Fireball'))
    expect(r.saves).toEqual([{ save: 'Reflex', basic: true }])
    expect(r.heighten.every).toBe(1)
    expect(rolls('Fireball', 3)).toEqual(['6d6 fire'])
    expect(rolls('Fireball', 4)).toEqual(['8d6 fire'])
    expect(rolls('Fireball', 9)).toEqual(['18d6 fire'])
  })

  it('Electric Arc: cantrip 2d4 electricity, basic Reflex, +1d4 per rank, at half the level (p. 328)', () => {
    const r = spellRules(spell('Electric Arc'))
    expect(r.saves).toEqual([{ save: 'Reflex', basic: true }])
    expect(rolls('Electric Arc', 1)).toEqual(['2d4 electricity'])
    expect(heightenedRank(5)).toBe(3)
    expect(rolls('Electric Arc', heightenedRank(5))).toEqual(['4d4 electricity'])
    expect(rolls('Electric Arc', heightenedRank(20))).toEqual(['11d4 electricity'])
  })

  it('Heal: 1d8 per rank, +8 per rank for the 2-action version, an emanation for 3 (p. 335)', () => {
    const r = spellRules(spell('Heal'))
    expect(r.actionOptions).toEqual([1, 2, 3])
    expect(rolls('Heal', 1, { actions: 1 })).toEqual(['1d8 healing', '1d8 vitality'])
    expect(rolls('Heal', 1, { actions: 2 })).toEqual(['1d8 healing', '1d8 vitality', '8 healing'])
    expect(rolls('Heal', 3, { actions: 2 })).toEqual(['3d8 healing', '3d8 vitality', '24 healing'])
    expect(rolls('Heal', 3, { actions: 3 })).toEqual(['3d8 healing', '3d8 vitality'])
    expect(r.variants.find((v) => v.actions === 3)?.text).toMatch(/30-foot emanation/)
    // Undead it damages get a basic Fortitude save.
    expect(r.saves).toEqual([{ save: 'Fortitude', basic: true }])
  })

  it('Harm: the same with void damage to the living and healing for undead (p. 334)', () => {
    expect(rolls('Harm', 2, { actions: 2 })).toEqual(['2d8 void', '2d8 healing', '16 healing'])
  })

  it('Ignition: spell attack, 2d4 fire, d6s in melee, 1d4 persistent fire on a crit (p. 336)', () => {
    const r = spellRules(spell('Ignition'))
    expect(r.attack).toBe(true)
    expect(r.meleeDie).toBe(6)
    expect(rolls('Ignition', 1)).toEqual(['2d4 fire', '1d4 persistent fire (critical success)'])
    expect(rolls('Ignition', 3)).toEqual(['4d4 fire', '3d4 persistent fire (critical success)'])
    expect(rolls('Ignition', 3, { melee: true })).toEqual([
      '4d6 fire',
      '3d6 persistent fire (critical success)',
    ])
  })

  it('Fear: no dice, frightened by degree, fleeing on a critical failure (p. 331)', () => {
    const r = spellRules(spell('Fear'))
    expect(r.saves).toEqual([{ save: 'Will', basic: false }])
    expect(r.parts).toEqual([])
    expect(r.conditions).toEqual({
      success: [{ name: 'frightened', value: 1 }],
      failure: [{ name: 'frightened', value: 2 }],
      'critical failure': [{ name: 'frightened', value: 3 }, { name: 'fleeing' }],
    })
    expect(r.heighten.fixed.map((f) => f.rank)).toEqual([3])
  })

  it('Breathe Fire: 2d6 fire in a cone, basic Reflex, +2d6 per rank (p. 319)', () => {
    expect(rolls('Breathe Fire', 1)).toEqual(['2d6 fire'])
    expect(rolls('Breathe Fire', 3)).toEqual(['6d6 fire'])
  })

  it('Thunderstrike: 1d12 electricity and 1d4 sonic, each heightening (p. 363)', () => {
    expect(rolls('Thunderstrike', 1)).toEqual(['1d12 electricity', '1d4 sonic'])
    expect(rolls('Thunderstrike', 4)).toEqual(['4d12 electricity', '4d4 sonic'])
  })

  it('Heroism: the Heroism effect, +1, +2 from 6th, +3 from 9th, on a target (p. 335)', () => {
    const s = spell('Heroism')
    const r = spellRules(s)
    expect(r.effect?.def.name).toBe('Heroism')
    expect(r.effect?.self).toBe(false)
    expect([3, 5, 6, 8, 9].map((rank) => effectValue(s, r.effect!.def, rank))).toEqual([
      1, 1, 2, 2, 3,
    ])
  })

  it('Shield: the Shield toggle, always on yourself (p. 356)', () => {
    const r = spellRules(spell('Shield'))
    expect(r.effect?.def.name).toBe('Shield')
    expect(r.effect?.self).toBe(true)
    expect(r.parts).toEqual([])
  })

  it('Gouging Claw: slashing or piercing, plus persistent bleed that heightens by 1 (p. 333)', () => {
    expect(rolls('Gouging Claw', 1)).toEqual(['2d6 slashing or piercing', '2 persistent bleed'])
    expect(rolls('Gouging Claw', 3)).toEqual(['4d6 slashing or piercing', '4 persistent bleed'])
  })

  it('Live Wire: a list of parts that each heighten (Player Core 2 p. 248)', () => {
    expect(rolls('Live Wire', 3)).toEqual([
      '2d4 slashing',
      '2d4 electricity',
      '2d4 persistent electricity (critical success)',
    ])
  })

  it('Blazing Bolt: 4d6 with 2 or more actions, heightened 1d6 or 2d6 by version (p. 318)', () => {
    expect(rolls('Blazing Bolt', 2, { actions: 1 })).toEqual(['2d6 fire'])
    expect(rolls('Blazing Bolt', 4, { actions: 1 })).toEqual(['4d6 fire'])
    expect(rolls('Blazing Bolt', 4, { actions: 3 })).toEqual(['8d6 fire'])
  })

  it('Chilling Darkness: the extra spirit damage against holy creatures is noted, not rolled (p. 320)', () => {
    const s = spell('Chilling Darkness')
    const later = partsAt(s, spellRules(s), { rank: 5 }).filter((p) => p.later)
    expect(rolls('Chilling Darkness', 5)).toEqual(['9d6 cold'])
    expect(later.map((p) => `${diceText(p.dice)} ${p.type}`)).toEqual(['9d6 spirit'])
  })

  it('Daze: a basic Will save in its text, stunned 1 on a critical failure (p. 322)', () => {
    const r = spellRules(spell('Daze'))
    expect(r.saves).toEqual([{ save: 'Will', basic: true }])
    expect(r.conditions).toEqual({ 'critical failure': [{ name: 'stunned', value: 1 }] })
    const cast = castRolls(spell('Daze'), { rank: 3, attackBonus: 9, dc: 21, rng: middle })
    expect(cast.text).toBe(
      'DC 21 basic Will. Damage 2d6: crit success 0, success 4 mental, failure 8 mental, crit failure 16 mental. Conditions: crit failure stunned 1.',
    )
  })

  it('Harm heals undead, not the caster; Heal hurts undead', () => {
    const harm = castRolls(spell('Harm'), {
      rank: 1,
      actions: 2,
      attackBonus: 7,
      dc: 17,
      rng: middle,
    })
    expect(harm.healing).toBeUndefined()
    expect(harm.text).toMatch(/^Heals undead 13 HP \(1d8 \+ 8\)\. DC 17 basic Fortitude\./)
    const heal = castRolls(spell('Heal'), {
      rank: 1,
      actions: 1,
      attackBonus: 7,
      dc: 17,
      rng: middle,
    })
    expect(heal.text).toBe(
      'Heals 5 HP (1d8). Against undead: DC 17 basic Fortitude. Damage 1d8: crit success 0, success 2 vitality, failure 5 vitality, crit failure 10 vitality.',
    )
  })

  it('summarises a spell for its row', () => {
    expect(spellSummary(spell('Fireball'), { rank: 5 })).toBe('basic Reflex · 10d6 fire')
    expect(spellSummary(spell('Ignition'), { rank: 2 })).toBe('spell attack · 3d4 fire')
    expect(spellSummary(spell('Heroism'), { rank: 6 })).toBe('Heroism +2')
  })
})

describe('pf2e spell rules: rolling a cast', () => {
  it('a basic save rolls once and lists none, half, full and double (p. 302)', () => {
    const r = castRolls(spell('Fireball'), { rank: 3, attackBonus: 9, dc: 19, rng: middle })
    expect(r.text).toBe(
      'DC 19 basic Reflex. Damage 6d6: crit success 0, success 12 fire, failure 24 fire, crit failure 48 fire.',
    )
  })

  it('a spell attack hits, crits (double, plus the crit’s persistent damage) or misses', () => {
    const hit = castRolls(spell('Ignition'), {
      rank: 1,
      attackBonus: 7,
      dc: 17,
      targetAc: 18,
      rng: middle,
    })
    expect(hit.degree).toBe('success')
    expect(hit.text).toBe('Spell attack 18 (11 +7) vs AC 18: success. Hit: 6 fire damage.')
    const crit = castRolls(spell('Ignition'), {
      rank: 1,
      attackBonus: 7,
      dc: 17,
      targetAc: 8,
      rng: middle,
    })
    expect(crit.text).toBe(
      'Spell attack 18 (11 +7) vs AC 8: crit success. Critical hit: 12 fire plus 3 persistent fire damage.',
    )
    const miss = castRolls(spell('Ignition'), {
      rank: 1,
      attackBonus: 7,
      dc: 17,
      targetAc: 25,
      rng: middle,
    })
    expect(miss.text).toMatch(/: failure\. /)
  })

  it('without a target AC, the attack says what a hit and a crit would deal', () => {
    const r = castRolls(spell('Ignition'), { rank: 1, attackBonus: 7, dc: 17, rng: middle })
    expect(r.text).toBe(
      'Spell attack 18 (11 +7). Damage 6 fire (2d4) on a hit; critical hit 12 fire plus 3 persistent fire.',
    )
  })

  it('other saves list each degree as written', () => {
    const r = castRolls(spell('Fear'), { rank: 1, attackBonus: 7, dc: 17, rng: middle })
    expect(r.text).toBe(
      'DC 17 Will. crit success: The target is unaffected. success: The target is frightened 1. failure: The target is frightened 2. crit failure: The target is frightened 3 and fleeing for 1 round.',
    )
  })

  it('healing rolls the healing to apply (Heal, 2 actions: 1d8+8)', () => {
    const r = castRolls(spell('Heal'), { rank: 1, actions: 2, attackBonus: 7, dc: 17, rng: middle })
    expect(r.healing).toBe(13)
    expect(r.text).toMatch(/^Heals 13 HP \(1d8 \+ 8\)\./)
  })

  it('Force Barrage rolls every shard together', () => {
    const r = castRolls(spell('Force Barrage'), {
      rank: 1,
      actions: 3,
      attackBonus: 7,
      dc: 17,
      rng: middle,
    })
    expect(r.text).toBe('Damage 12 force (3 shards) (3d4+3).')
  })
})

const caster = (): Pf2eSheet => {
  const s = defaultSheet('pf2e') as Pf2eSheet
  s.attrs.CHA = 4
  s.spellcasting = {
    tradition: 'Divine',
    kind: 'spontaneous',
    attr: 'CHA',
    rank: 'T',
    cantrips: [],
    spells: [],
    slots: [],
  }
  return s
}

describe('pf2e casting from the sheet', () => {
  it('rolls with the spell attack after MAP, and the spell DC', () => {
    const s = caster()
    // Level 1: CHA +4, trained +3 → attack +7, DC 17.
    const first = castEffect(s, spell('Ignition'), 1, 1, { rng: middle })
    expect(first.text).toMatch(/^Spell attack 18 \(11 \+7\)/)
    const second = castEffect(s, spell('Ignition'), 1, 1, { attackNumber: 1, rng: middle })
    expect(second.text).toMatch(/^Spell attack 13 \(11 \+2\)/)
    expect(castEffect(s, spell('Fireball'), 3, 1, { rng: middle }).text).toMatch(/^DC 17 basic/)
  })

  it('a spell only on yourself turns on its effect; one cast on a target leaves it to you', () => {
    const s = caster()
    s.spellcasting!.cantrips = [{ id: spell('Shield').id, name: 'Shield', rank: 1 }]
    const shield = castEffect(s, spell('Shield'), 1, 1)
    expect(shield.selfEffect).toBe('Shield is on.')
    expect(activeEffects(s).map((a) => a.def.name)).toContain('Shield')
    expect(castEffect(s, spell('Shield'), 1, 1).selfEffect).toBe('Shield is already on.')
    expect(castEffect(s, spell('Heroism'), 6, 11).selfEffect).toBeUndefined()
    const bless = castEffect(s, spell('Bless'), 1, 1)
    expect(bless.selfEffect).toBe('Bless is on you.')
  })

  it('knows when a cast went off', () => {
    expect(castWentOff('Cast Fear at rank 1: 1 rank 1 slot left.')).toBe(true)
    expect(castWentOff('No rank 1 slots left today.')).toBe(false)
    expect(
      castWentOff('Cast Fear at rank 1. Stupefied flat check 3 vs DC 6: the spell is disrupted.'),
    ).toBe(false)
  })
})

/** Main text and heightened blocks, as the parser splits them (amps on their own). */
const blocksOf = (s: Pf2eSpellDef) => {
  const [text, amp = ''] = s.text.split('**Amp**')
  const heads = [...text!.matchAll(/\*\*Heightened \(([^)]+)\)\*\*/g)]
  return {
    main: heads[0] ? text!.slice(0, heads[0].index) : text!,
    amp,
    blocks: heads.map((h, i) => ({
      head: h[1]!,
      text: text!.slice(h.index + h[0].length, heads[i + 1]?.index ?? text!.length),
    })),
  }
}

const HAS_DICE = /\d+d\d+/

/**
 * Spells whose dice aren't damage, healing, a duration, a table roll or a battle form's
 * Strike: they change something else the GM tracks.
 */
const NOT_ROLLED: Record<string, string> = {
  'Conductive Weapon': 'sets a shock rune’s damage die to 1d12; the Strike rolls it',
  'Interplanar Teleport': 'how far off target you arrive (1d20×25 miles)',
}

/** Defenses the text decides ("see text"): who rolls what is in the rules text. */
const DEFENSE_IN_TEXT = new Set(['Summon Warden of the Wild', 'Theatrical Throwdown'])

describe('pf2e spell rules: every spell in the data', () => {
  const spells = data.spells

  it('reads damage or healing wherever the text has dice', () => {
    const counts = { withDice: 0, rolls: 0, otherDice: 0, notRolled: 0 }
    const missing: string[] = []
    for (const s of spells) {
      if (!HAS_DICE.test(s.text)) continue
      counts.withDice += 1
      const r = spellRules(s)
      const joins = r.heighten.fixed.some((f) => f.sets.some((x) => x.part < 0))
      if (r.parts.length || joins || r.amp?.parts.length) counts.rolls += 1
      else if (r.forms.length || r.durationDice.length || r.tableDice.length) counts.otherDice += 1
      else if (NOT_ROLLED[s.name]) counts.notRolled += 1
      else missing.push(s.name)
    }
    console.info(
      `PF2e spells: ${spells.length}; with dice ${counts.withDice}: ${counts.rolls} roll damage or healing, ${counts.otherDice} only durations, tables or battle forms, ${counts.notRolled} allowlisted`,
    )
    expect(missing).toEqual([])
    expect(counts.rolls).toBeGreaterThan(430)
    expect(Object.keys(NOT_ROLLED).every((name) => spells.some((s) => s.name === name))).toBe(true)
  })

  it('reads every defense', () => {
    const unread = spells.filter((s) => {
      if (!s.defense) return false
      const r = spellRules(s)
      return !r.attack && !r.saves.length && !DEFENSE_IN_TEXT.has(s.name)
    })
    const withDefense = spells.filter((s) => s.defense).length
    console.info(`PF2e spells with a defense: ${withDefense}, read: ${withDefense - unread.length}`)
    expect(unread.map((s) => s.name)).toEqual([])
  })

  it('turns every heightened block with dice into a heightening rule', () => {
    let blocks = 0
    const unread: string[] = []
    for (const s of spells) {
      const r = spellRules(s)
      for (const b of blocksOf(s).blocks) {
        if (!HAS_DICE.test(b.text)) continue
        blocks += 1
        const step = b.head.startsWith('+')
        const ok = step
          ? r.heighten.adds.length > 0
          : r.heighten.fixed.some((f) => f.rank === Number.parseInt(b.head, 10) && f.sets.length)
        if (!ok) unread.push(`${s.name} (${b.head})`)
      }
    }
    console.info(`PF2e heightened blocks with dice: ${blocks}, read: ${blocks - unread.length}`)
    expect(unread).toEqual([])
    expect(blocks).toBeGreaterThan(350)
  })

  it('parses the action versions of every spell cast with 1 to 3 actions', () => {
    const variable = spells.filter(
      (s) =>
        typeof s.actions === 'string' &&
        /^(?:single|two|three) actions? (?:to|or) /.test(s.actions),
    )
    const unread = variable.filter((s) => !spellRules(s).actionOptions.length)
    expect(unread.map((s) => `${s.name}: ${s.actions}`)).toEqual([])
  })

  it.each(Object.entries(SPELL_PATTERNS))('%s matches some spell', (_name, pattern) => {
    const source = pattern.source.replace(/^\^/, '').replace(/(?:\\s\*)?\$$/, '')
    const regex = new RegExp(source, pattern.flags.replace('g', ''))
    const found = spells.some((s) =>
      [s.text, s.defense ?? '', typeof s.actions === 'string' ? s.actions : ''].some((t) =>
        regex.test(t),
      ),
    )
    expect(found).toBe(true)
  })
})
