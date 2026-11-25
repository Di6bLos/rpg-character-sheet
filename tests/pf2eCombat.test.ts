import { describe, expect, it } from 'vitest'
import type { Pf2eFeat, Pf2eSheet } from '../types/sheets'
import { type ShownRoll, onDiceShown, rollCheck } from '../utils/dice'
import { readAbility } from '../utils/pf2eAbilityRules'
import { blockedReason, endPf2eTurn, payFor, resolveUse, startPf2eTurn } from '../utils/pf2eActions'
import {
  BRIEF_PANACHE,
  PANACHE,
  bloodMagic,
  bravado,
  bravadoActions,
  championReaction,
  finisherBlock,
  finisherDice,
  strikeAfter,
} from '../utils/pf2eClassActions'
import {
  addPersistent,
  applyDefenses,
  covers,
  critDiceFor,
  deadlyCount,
  defensesOf,
  traitDie,
} from '../utils/pf2eDamage'
import { adjusted } from '../utils/pf2ePlay'
import { effectMods, ownEffects, toggleEffect } from '../utils/pf2eEffects'
import { assistedRecovery, heal, takeDamage, takePersistent } from '../utils/pf2ePlay'
import { defaultSheet } from '../utils/sheetDefaults'
import { buildData, loadSet, named } from './helpers/pf2e'

const feat = (name: string, type = 'Feat', desc = ''): Pf2eFeat => ({
  type,
  level: '1',
  action: '',
  name,
  desc,
})
function hero(feats: Pf2eFeat[] = [], over: Partial<Pf2eSheet> = {}): Pf2eSheet {
  return { ...defaultSheet('pf2e'), hp: 30, hpMax: 30, feats, ...over }
}
/** An rng that returns these in turn: a die of N sides rolls 1 + floor(r × N). */
const seq = (...values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]!
}
/** The rng value that rolls `n` on a die of `sides`. */
const face = (n: number, sides: number) => (n - 0.5) / sides

const subclass = (cls: string, name: string) =>
  named(named(buildData.classes, cls).subclasses, name)
const feature = (cls: string, name: string) => named(named(buildData.classes, cls).features, name)
const action = (name: string) => named(loadSet('actions'), name)

describe('pf2e persistent damage (Player Core p. 445)', () => {
  it('keeps one condition per type, the higher amount overriding the lower', () => {
    const s = hero()
    addPersistent(s, '1d6', 'fire')
    expect(addPersistent(s, '1d4', 'fire')).toMatch(/higher amount stays/)
    addPersistent(s, '2d6', 'fire')
    addPersistent(s, '2', 'bleed')
    expect(s.persistent).toEqual([
      { dice: '2d6', type: 'fire' },
      { dice: '2', type: 'bleed' },
    ])
    expect(addPersistent(s, 'lots', 'acid')).toMatch(/isn’t an amount/)
  })

  it('an immunity to the type keeps it off', () => {
    const s = hero([], { defenses: { resistances: [], weaknesses: [], immunities: ['bleed'] } })
    expect(addPersistent(s, '1d6', 'bleed')).toMatch(/Immune to bleed/)
    expect(s.persistent ?? []).toEqual([])
  })

  it('End turn rolls it anew, then a DC 15 flat check ends it on a success', () => {
    const s = hero()
    addPersistent(s, '1d6', 'fire')
    startPf2eTurn(s)
    // 1d6 → 4, flat check d20 → 15: it ends.
    const out = endPf2eTurn(s, seq(face(4, 6), face(15, 20)))
    expect(s.hp).toBe(26)
    expect(out).toMatch(/Persistent damage 4 fire \(1d6\)/)
    expect(out).toMatch(/Flat check 15 vs DC 15: persistent fire ends/)
    expect(s.persistent).toEqual([])
  })

  it('goes on after a failed flat check and is taken again next turn', () => {
    const s = hero()
    addPersistent(s, '2', 'bleed')
    expect(takePersistent(s, seq(face(14, 20)))).toMatch(/bleed goes on/)
    expect(s.hp).toBe(28)
    expect(s.persistent).toHaveLength(1)
  })

  it('several types are taken at once, so dying rises only once', () => {
    const s = hero([], { hp: 0, dying: 1, conditions: ['Unconscious'] })
    addPersistent(s, '2', 'fire')
    addPersistent(s, '1', 'bleed')
    takePersistent(s, seq(face(2, 20)))
    expect(s.dying).toBe(2)
  })

  it('applies weaknesses and resistances to each type apart', () => {
    const s = hero([], {
      defenses: { resistances: [{ type: 'fire', value: 5 }], weaknesses: [], immunities: [] },
    })
    addPersistent(s, '3', 'fire')
    addPersistent(s, '2', 'bleed')
    const out = takePersistent(s, seq(face(2, 20)))
    expect(s.hp).toBe(28)
    expect(out).toMatch(/persistent fire 3 → 0 \(resistance 5 fire\)/)
  })

  it('assisted recovery: another flat check, DC 10 with apt help, once a round', () => {
    const s = hero()
    addPersistent(s, '1d6', 'fire')
    startPf2eTurn(s)
    expect(assistedRecovery(s, 'fire', true, seq(face(9, 20)))).toMatch(/9 vs DC 10.*goes on/)
    expect(assistedRecovery(s, 'fire', true, seq(face(20, 20)))).toBe('Already helped this round.')
    startPf2eTurn(s)
    expect(assistedRecovery(s, 'fire', true, seq(face(10, 20)))).toMatch(/fire ends/)
  })

  it('bleed ends when healed to full HP (p. 407)', () => {
    const s = hero([], { hp: 20 })
    addPersistent(s, '1d4', 'bleed')
    addPersistent(s, '1d4', 'fire')
    expect(heal(s, 10)).toMatch(/Persistent bleed damage ends/)
    expect(s.persistent?.map((p) => p.type)).toEqual(['fire'])
  })
})

describe('pf2e immunities, weaknesses and resistances (Player Core pp. 407–408)', () => {
  const own = (o: Partial<NonNullable<Pf2eSheet['defenses']>>) =>
    hero([], { defenses: { resistances: [], weaknesses: [], immunities: [], ...o } })

  it('the book’s example: 2d6 fire against weakness 5 to fire takes 2d6 + 5', () => {
    const s = own({ weaknesses: [{ type: 'fire', value: 5 }] })
    expect(applyDefenses(s, 7, { type: 'fire' }).amount).toBe(12)
    expect(applyDefenses(s, 7, { type: 'cold' }).amount).toBe(7)
  })

  it('immunity first, then weakness, then resistance (to 0); only the highest of each', () => {
    const s = own({
      weaknesses: [{ type: 'fire', value: 5 }],
      resistances: [
        { type: 'fire', value: 3 },
        { type: 'energy', value: 8 },
      ],
    })
    expect(applyDefenses(s, 4, { type: 'fire' }).amount).toBe(1)
    expect(applyDefenses(s, 4, { type: 'cold' }).amount).toBe(0)
    const immune = own({ immunities: ['fire'], weaknesses: [{ type: 'fire', value: 5 }] })
    expect(applyDefenses(immune, 9, { type: 'fire' }).amount).toBe(0)
  })

  it('reads categories: physical, energy, all damage, spells, persistent bleed', () => {
    expect(covers('physical', { type: 'slashing' })).toBe(true)
    expect(covers('physical', { type: 'bleed' })).toBe(true)
    expect(covers('physical', { type: 'fire' })).toBe(false)
    expect(covers('energy', { type: 'void' })).toBe(true)
    expect(covers('all damage', {})).toBe(true)
    expect(covers('damage from spells', { type: 'fire', spell: true })).toBe(true)
    expect(covers('damage from spells', { type: 'fire' })).toBe(false)
    expect(covers('slashing, persistent bleed', { type: 'bleed', persistent: true })).toBe(true)
    expect(covers('slashing, persistent bleed', { type: 'bleed' })).toBe(false)
    expect(covers('piercing and slashing', { type: 'piercing' })).toBe(true)
  })

  it('takeDamage applies them by type before Shield Block and HP; the HP steppers don’t', () => {
    const s = own({ resistances: [{ type: 'all damage', value: 2 }] })
    expect(takeDamage(s, 10, { type: 'fire' })).toMatch(/^fire 10 → 8 .*Took 8 fire damage: 22\/30/)
    takeDamage(s, 1)
    expect(s.hp).toBe(21)
  })

  it('Raging Resistance resists the instinct’s types while raging (Player Core 2 pp. 70, 75)', () => {
    const fury = subclass('Barbarian', 'Fury')
    const s = hero(
      [
        feat('Rage', 'Class feature', feature('Barbarian', 'Rage').text),
        feat('Fury', 'Instinct', fury.text),
        feat('Raging Resistance', 'Class feature'),
      ],
      { attrs: { ...defaultSheet('pf2e').attrs, CON: 3 }, level: 9 },
    )
    toggleEffect(s, 'Rage', 9)
    const r = defensesOf(s, 9).resistances.find((x) => x.source === 'Raging Resistance')
    expect(r).toMatchObject({ type: 'physical', value: 6 })
    expect(applyDefenses(s, 10, { type: 'slashing' }, 9).amount).toBe(4)
    expect(applyDefenses(s, 10, { type: 'fire' }, 9).amount).toBe(10)
  })

  it('Selfish Shield’s resistance holds against the triggering damage only (Player Core 2 p. 91)', () => {
    const desecration = subclass('Champion', 'Desecration')
    const s = hero([feat('Desecration', 'Cause', desecration.text)], { class: 'Champion' })
    championReaction(s, 'Selfish Shield', 4)
    expect(defensesOf(s, 4).resistances[0]).toMatchObject({ value: 4, source: 'Selfish Shield' })
    expect(takeDamage(s, 10, { type: 'slashing' })).toMatch(/Selfish Shield ends/)
    expect(s.hp).toBe(24)
    takeDamage(s, 10, { type: 'slashing' })
    expect(s.hp).toBe(14)
  })
})

describe('pf2e deadly and fatal on a critical hit (Player Core p. 282)', () => {
  it('reads the die size from the trait', () => {
    expect(traitDie(['Deadly d10', 'Finesse'], 'deadly')).toBe(10)
    expect(traitDie(['Fatal d12'], 'fatal')).toBe(12)
    expect(traitDie(['Deadly'], 'deadly')).toBeUndefined()
  })

  it('deadly: one die, two with greater striking, three with major striking', () => {
    expect(deadlyCount(1)).toBe(1)
    expect(deadlyCount(2)).toBe(1)
    expect(deadlyCount(3)).toBe(2)
    expect(deadlyCount(4)).toBe(3)
    // "a rapier with a greater striking rune deals 2d8 extra piercing damage on a critical hit"
    expect(critDiceFor(['Deadly d8'], { count: 3, sides: 6 }).after).toEqual([
      { count: 2, sides: 8, label: 'deadly d8' },
    ])
  })

  it('fatal: the weapon’s dice become its size and one more such die is added', () => {
    expect(critDiceFor(['Fatal d10'], { count: 1, sides: 6 })).toEqual({
      sides: 10,
      after: [{ count: 1, sides: 10, label: 'fatal d10' }],
    })
  })

  it('the weapon data keeps the die sizes', () => {
    const weapons = loadSet('weapons')
    expect(named(weapons, 'Rapier').traits).toContain('Deadly d8')
    expect(named(weapons, 'Pick').traits).toContain('Fatal d10')
    expect(weapons.flatMap((w) => w.traits).filter((t) => /^(?:Deadly|Fatal)$/.test(t))).toEqual([])
  })
})

describe('pf2e Strike-modifying actions', () => {
  const rules = (name: string) => {
    const f = [...buildData.feats, ...loadSet('actions')].find((x) => x.name === name)!
    return readAbility({
      name: f.name,
      text: f.text,
      actions: (f as { actions?: 1 | 2 }).actions,
      traits: f.traits,
    })
  }

  it('Double Slice: one Strike with each melee weapon at the current MAP, −2 if not agile (Player Core p. 140)', () => {
    expect(rules('Double Slice').strike).toMatchObject({
      count: 2,
      mapCount: 2,
      melee: true,
      sameMap: true,
      twoWeapons: true,
      secondPenalty: 2,
      combine: true,
    })
  })

  it('Flurry of Blows: two unarmed Strikes at the usual MAP, damage combined (Player Core 2 p. 116)', () => {
    const r = rules('Flurry of Blows')
    expect(r.strike).toMatchObject({ count: 2, unarmed: true, combine: true })
    expect(r.strike?.sameMap).toBeUndefined()
    expect(r.traits).toContain('Flourish')
  })

  it('Bleeding Finisher makes a slashing or piercing Strike (Player Core 2 p. 166)', () => {
    expect(rules('Bleeding Finisher').strike?.damageTypes).toEqual(['slashing', 'piercing'])
  })

  it('Vicious Swing keeps its extra dice and counts as two attacks (Player Core p. 141)', () => {
    expect(rules('Vicious Swing').strike).toMatchObject({
      mapCount: 2,
      extraDice: [
        [1, 1],
        [10, 2],
        [18, 3],
      ],
    })
  })
})

describe('pf2e Rage damage by instinct (Player Core 2 pp. 74–75)', () => {
  const barbarian = (instinct: string, level: number) => {
    const s = hero([feat('Rage', 'Class feature'), feat(instinct, 'Instinct')], { level })
    toggleEffect(s, 'Rage', level)
    return s
  }
  const rage = (s: Pf2eSheet, o: { agile?: boolean; traits?: string[] } = {}) =>
    adjusted(s, 0, { kind: 'damage', melee: true, level: s.level, traits: o.traits ?? [], ...o })
      .value

  it('Fury: 3, then 7 at 7th and 13 at 15th; halved for agile', () => {
    expect(rage(barbarian('Fury', 1))).toBe(3)
    expect(rage(barbarian('Fury', 7))).toBe(7)
    expect(rage(barbarian('Fury', 15))).toBe(13)
    expect(rage(barbarian('Fury', 7), { agile: true })).toBe(3)
  })

  it('Dragon: draconic rage is a choice when raging, 4 / 8 / 16', () => {
    const s = barbarian('Dragon', 7)
    expect(rage(s)).toBe(2)
    toggleEffect(s, 'Dragon (Rage damage)', 7)
    expect(rage(s)).toBe(8)
  })

  it('Animal: 5 at 7th and 12 at 15th, only with the animal’s unarmed attacks', () => {
    expect(rage(barbarian('Animal', 7), { traits: ['unarmed'] })).toBe(5)
    expect(rage(barbarian('Animal', 7))).toBe(2)
    expect(rage(barbarian('Animal', 15), { traits: ['unarmed'] })).toBe(12)
  })

  it('a written instinct entry replaces the one read from the text', () => {
    const s = hero(
      [feat('Rage', 'Class feature'), feat('Fury', 'Instinct', subclass('Barbarian', 'Fury').text)],
      { level: 15 },
    )
    expect(ownEffects(s).filter((e) => e.name === 'Fury (Rage damage)')).toHaveLength(1)
    expect(ownEffects(s).find((e) => e.name === 'Fury (Rage damage)')?.derived).toBeUndefined()
  })

  it('the sorcerer’s Elemental bloodline doesn’t get the Elemental instinct’s Rage damage', () => {
    const s = hero([feat('Elemental', 'Bloodline')])
    expect(ownEffects(s).map((e) => e.name)).not.toContain('Elemental (Rage damage)')
    expect(ownEffects(s).map((e) => e.name)).toContain('Elemental Fury')
  })
})

describe('pf2e panache and finishers (Player Core 2 pp. 158–166)', () => {
  const swash = (over: Partial<Pf2eSheet> = {}) =>
    hero(
      [
        feat('Panache', 'Class feature'),
        feat('Precise Strike', 'Class feature'),
        feat('Gymnast', 'Style', subclass('Swashbuckler', 'Gymnast').text),
      ],
      { class: 'Swashbuckler', ...over },
    )
  const finisher = readAbility({
    name: 'Confident Finisher',
    text: action('Confident Finisher').text,
    actions: 1,
    traits: ['Finisher', 'Swashbuckler'],
  })

  it('a finisher needs panache, spends it and ends the turn’s attacks (p. 163)', () => {
    const s = swash()
    startPf2eTurn(s)
    expect(blockedReason(s, finisher)).toBe('Needs panache')
    toggleEffect(s, PANACHE, 1)
    expect(blockedReason(s, finisher)).toBe('')
    expect(payFor(s, finisher, { name: finisher.name })).toBe('You lose your panache.')
    expect(s.effects?.on).not.toContain(PANACHE)
    const strike = readAbility({ name: 'Strike', text: 'Make a Strike.', actions: 1 })
    expect(finisherBlock(s, strike)).toMatch(/no more attacks/)
    startPf2eTurn(s)
    expect(finisherBlock(s, strike)).toBe('')
  })

  it('bravado: a style’s actions and Tumble Through; success gives panache, failure until your next turn ends', () => {
    const s = swash()
    expect(bravadoActions(s)).toEqual(['Tumble Through', 'Grapple', 'Reposition', 'Shove', 'Trip'])
    startPf2eTurn(s)
    expect(bravado(s, 'Trip', 'failure')).toMatch(/until the end of your next turn/)
    expect(s.effects?.on).toEqual([BRIEF_PANACHE])
    expect(bravado(s, 'Trip', 'success')).toBe('Bravado: you gain panache.')
    expect(s.effects?.on).toEqual([PANACHE])
    expect(bravado(s, 'Demoralize', 'success')).toBe('')
  })

  it('a bravado skill action gives panache from the Actions panel', () => {
    const s = swash()
    const trip = readAbility({
      name: 'Trip',
      text: action('Trip').text,
      actions: 1,
      traits: ['Attack'],
    })
    const lines = resolveUse(s, trip, { name: 'Trip', level: 1, dc: 10, rng: seq(face(18, 20)) })
    expect(lines.join(' ')).toMatch(/Bravado: you gain panache/)
  })

  it('precise strike’s finisher dice: 2d6, +1d6 at 5th, 9th, 13th and 17th', () => {
    expect(finisherDice(swash(), 1)).toBe('2d6')
    expect(finisherDice(swash(), 5)).toBe('3d6')
    expect(finisherDice(swash(), 17)).toBe('6d6')
    expect(finisherDice(hero(), 5)).toBe('')
  })

  it('Confident Finisher on a failure deals half the precise strike dice, all with Precise Finisher', () => {
    const roll = seq(face(5, 6), face(4, 6))
    expect(strikeAfter(swash(), finisher, finisher.name, 1, 'failure', roll).lines[0]).toBe(
      'Failure: 4 precision damage of the weapon’s type (half of 2d6).',
    )
    const full = swash()
    full.feats.push(feat('Precise Finisher'))
    expect(strikeAfter(full, finisher, finisher.name, 1, 'failure', roll).lines[0]).toMatch(
      /^Failure: 9 /,
    )
    expect(strikeAfter(swash(), finisher, finisher.name, 1, 'critical failure').lines).toEqual([])
  })

  it('Bleeding Finisher’s hit rider names the dice', () => {
    const text = named(buildData.feats, 'Bleeding Finisher').text
    const r = readAbility({ name: 'Bleeding Finisher', text, actions: 1, traits: ['Finisher'] })
    expect(strikeAfter(swash(), r, text, 9, 'success').lines).toEqual([
      'If you hit, the target also takes persistent bleed damage equal to your precise strike finisher damage (4d6).',
    ])
  })
})

describe('pf2e champion’s reactions (Player Core 2 pp. 91–93)', () => {
  it('protect an ally with resistance 2 + level against the triggering damage', () => {
    const s = hero([], { class: 'Champion' })
    expect(championReaction(s, 'Retributive Strike', 5)[0]).toBe(
      'Your ally gains resistance 7 to all damage against the triggering damage.',
    )
    expect(championReaction(s, 'Glimpse of Redemption', 3).join(' ')).toMatch(/enfeebled 2/)
  })

  it('Relentless Reaction at 9th: Retributive Strike’s hit deals CHA persistent spirit', () => {
    const s = hero([], { class: 'Champion', attrs: { ...defaultSheet('pf2e').attrs, CHA: 4 } })
    const r = readAbility({ name: 'Retributive Strike', text: action('Retributive Strike').text })
    expect(strikeAfter(s, r, '', 9, 'success').lines).toEqual([
      'Relentless Reaction: the target takes 4 persistent spirit damage.',
    ])
    expect(strikeAfter(s, r, '', 8, 'success').lines).toEqual([])
  })

  it('Selfish Shield: 2 + half level, CHA + half level with Relentless Reaction and CHA +3', () => {
    const cause = feat('Desecration', 'Cause', subclass('Champion', 'Desecration').text)
    const s = hero([cause], { class: 'Champion', attrs: { ...defaultSheet('pf2e').attrs, CHA: 4 } })
    championReaction(s, 'Selfish Shield', 10)
    expect(defensesOf(s, 10).resistances[0]?.value).toBe(9)
    expect(s.effects?.on).toContain('Selfish Shield (Strikes)')
    expect(
      effectMods(s, { kind: 'damage', melee: true, level: 10 }).find(
        (m) => m.source === 'Selfish Shield (Strikes)',
      )?.value,
    ).toBe(2)
  })

  it('Destructive Vengeance adds 2 / 4 / 6 to Strikes against the attacker', () => {
    const cause = feat('Iniquity', 'Cause', subclass('Champion', 'Iniquity').text)
    const s = hero([cause], { class: 'Champion', level: 9 })
    championReaction(s, 'Destructive Vengeance', 9)
    const mod = effectMods(s, { kind: 'damage', melee: true, level: 9 })
    expect(mod.find((m) => m.source === 'Destructive Vengeance (Strikes)')?.value).toBe(4)
  })
})

describe('pf2e blood magic (Player Core 2 p. 144)', () => {
  const sorcerer = (line: string) =>
    hero([feat(line, 'Bloodline', subclass('Sorcerer', line).text)], { class: 'Sorcerer' })

  it('a sorcerous gift or bloodline spell offers the bloodline’s effect', () => {
    const s = sorcerer('Draconic')
    expect(bloodMagic(s, 'Fear', 1)).toMatchObject({ name: 'Scaly Hide', toggles: ['Scaly Hide'] })
    expect(bloodMagic(s, 'Dragon Breath', 3)?.name).toBe('Scaly Hide')
    expect(bloodMagic(s, 'Blazing Bolt', 2)?.name).toBe('Scaly Hide')
    expect(bloodMagic(s, 'Fireball', 3)).toBeNull()
  })

  it('works out a target’s damage per spell rank', () => {
    expect(bloodMagic(sorcerer('Diabolic'), 'Floating Flame', 3)?.damage).toBe('3 fire')
    expect(bloodMagic(sorcerer('Imperial'), 'Force Barrage', 1)?.toggles).toEqual([
      'Imperious Defense (AC)',
      'Imperious Defense (saves)',
    ])
  })

  it('offers each bloodline’s blood magic once, not again as a toggle read from its text', () => {
    const toggles = (line: string) =>
      ownEffects(sorcerer(line))
        .filter((e) => e.mode === 'toggle')
        .map((e) => e.name)
    expect(toggles('Fey')).toEqual([
      'Cloak of Ribbons (Performance)',
      'Cloak of Ribbons (concealed)',
    ])
    expect(toggles('Imperial')).toEqual(['Imperious Defense (AC)', 'Imperious Defense (saves)'])
    expect(toggles('Aesir')).toEqual(['Call the Storm'])
    expect(toggles('Diabolic')).toEqual(['Tongue of Flame'])
    expect(toggles('Elemental')).toEqual(['Elemental Fury'])
  })

  it('Scaly Hide gives +1 status to AC until the start of your next turn', () => {
    const s = sorcerer('Draconic')
    toggleEffect(s, 'Scaly Hide', 1)
    expect(adjusted(s, 18, { kind: 'ac' }).value).toBe(19)
    startPf2eTurn(s)
    expect(adjusted(s, 18, { kind: 'ac' }).value).toBe(18)
  })
})

describe('pf2e rolls in the dice tray', () => {
  it('a check shows its die, modifier and total as one roll', () => {
    const shown: ShownRoll[] = []
    const stop = onDiceShown((r) => shown.push(r))
    const r = rollCheck(7, seq(face(12, 20)))
    stop()
    expect(r.total).toBe(19)
    expect(shown).toEqual([expect.objectContaining({ sides: 20, dice: [12], mod: 7, total: 19 })])
    expect(shown[0]?.bare).toBeUndefined()
  })
})
