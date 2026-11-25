import { describe, expect, it } from 'vitest'
import { PF2E_EFFECTS } from '../data/pf2e/effects'
import type { Pf2eFeat, Pf2eSheet } from '../types/sheets'
import {
  PF2E_RULE_PATTERNS,
  type Pf2eAbilityInput,
  type Pf2eAbilityKind,
  type Pf2eAbilityRules,
  abilityKind,
  bonusSubjects,
  clean,
  diceAt,
  readAbility,
  readCost,
  readFrequency,
  usedAction,
} from '../utils/pf2eAbilityRules'
import {
  blockedReason,
  endPf2eEncounter,
  endPf2eTurn,
  featStatLines,
  inEncounter,
  newTurn,
  mapIndex,
  payFor,
  resolveUse,
  startPf2eTurn,
  strikeCountAs,
  timePasses,
  uncounted,
  usesLeft,
} from '../utils/pf2eActions'
import {
  activeEffects,
  derivedEffects,
  ownEffects,
  resistancesNow,
  shiftedDegree,
  toggleEffect,
} from '../utils/pf2eEffects'
import { adjusted } from '../utils/pf2ePlay'
import { defaultSheet } from '../utils/sheetDefaults'
import { buildData, loadSet } from './helpers/pf2e'

const actions = loadSet('actions')
const feats = buildData.feats
const classes = buildData.classes
const heritages = buildData.heritages

type Ability = Pf2eAbilityInput
const find = (list: Ability[], name: string) => {
  const x = list.find((a) => a.name === name)
  if (!x) throw new Error(`No ${name}`)
  return x
}
const feat = (name: string) => readAbility(find(feats, name))
const action = (name: string) => readAbility(find(actions, name))
const feature = (name: string) =>
  readAbility(
    find(
      classes.flatMap((c) => c.features),
      name,
    ),
  )

/** A level-1 hero with these abilities, by data name, as the builder writes them. */
function hero(names: string[], over: Partial<Pf2eSheet> = {}): Pf2eSheet {
  const all = [...feats, ...actions, ...classes.flatMap((c) => c.features)] as (Ability & {
    frequency?: string
    traits?: string[]
  })[]
  const list: Pf2eFeat[] = names.map((n) => {
    const a = all.find((x) => x.name === n)!
    return {
      type: 'Feat',
      level: '1',
      action: { 1: '◆', 2: '◆◆', 3: '◆◆◆', reaction: '↺', free: '◇' }[String(a.actions)] ?? '',
      name: n,
      desc: a.text,
      ...(a.trigger ? { trigger: a.trigger } : {}),
      ...(a.frequency ? { frequency: a.frequency } : {}),
      traits: a.traits ?? [],
    }
  })
  return { ...defaultSheet('pf2e'), hp: 20, hpMax: 20, feats: list, ...over }
}

/** A d20 that rolls `n` (and every other die its lowest). */
const d20 = (n: number) => {
  let first = true
  return () => {
    const v = first ? (n - 1) / 20 : 0
    first = false
    return v
  }
}

describe('pf2e ability rules: Player Core abilities', () => {
  it('Sudden Charge: two actions, Stride twice, then a melee Strike (p. 141)', () => {
    const r = feat('Sudden Charge')
    expect(r.cost).toEqual({ kind: 'actions', min: 2, max: 2 })
    expect(r.strike).toMatchObject({ count: 1, strides: 2, melee: true, mapCount: 1 })
    expect(r.traits).toContain('Flourish')
  })

  it('Vicious Swing (was Power Attack): counts as two attacks, an extra die, 2 at 10th, 3 at 18th', () => {
    const r = feat('Vicious Swing')
    expect(r.strike).toMatchObject({ mapCount: 2, melee: true })
    expect(r.strike?.extraDice).toEqual([
      [1, 1],
      [10, 2],
      [18, 3],
    ])
  })

  it('Demoralize: Intimidation vs Will DC, frightened 2 / 1, immune for 10 minutes per target', () => {
    const r = action('Demoralize')
    expect(r.cost).toEqual({ kind: 'actions', min: 1, max: 1 })
    expect(r.check).toMatchObject({ skills: ['Intimidation'], against: 'Will DC' })
    expect(r.conditions).toContainEqual({
      name: 'Frightened',
      value: 2,
      self: false,
      degree: 'critical success',
    })
    expect(r.frequency).toMatchObject({ period: '10min', perTarget: true })
  })

  it('Treat Wounds: 10 minutes, DC by proficiency with its extra healing, 1 hour per target', () => {
    const r = action('Treat Wounds')
    expect(r.cost).toEqual({ kind: 'time', text: '10 minutes' })
    expect(r.check?.skills).toEqual(['Medicine'])
    expect(r.check?.tiers).toEqual([
      { rank: 'T', dc: 15, bonus: 0 },
      { rank: 'E', dc: 20, bonus: 10 },
      { rank: 'M', dc: 30, bonus: 30 },
      { rank: 'L', dc: 40, bonus: 50 },
    ])
    expect(r.frequency).toMatchObject({ period: 'hour', perTarget: true })
    expect(r.damage).toContainEqual({ dice: '1d8', degree: 'critical failure' })
  })

  it('Battle Medicine: one action, Treat Wounds’ DCs, once per day per target', () => {
    const r = feat('Battle Medicine')
    expect(r.cost).toEqual({ kind: 'actions', min: 1, max: 1 })
    expect(r.check?.tiers?.map((t) => t.dc)).toEqual([15, 20, 30, 40])
    expect(r.frequency).toMatchObject({ period: 'day', times: 1, perTarget: true })
  })

  it('Shield Block and Reactive Strike are reactions; Reactive Strike ignores the MAP', () => {
    expect(feat('Shield Block').cost).toEqual({ kind: 'reaction' })
    expect(feat('Shield Block').trigger).toMatch(/shield raised/)
    const r = feat('Reactive Strike')
    expect(r.cost).toEqual({ kind: 'reaction' })
    expect(r.strike).toMatchObject({ melee: true, mapCount: 0, ignoreMap: true })
  })

  it('Nimble Dodge: +2 circumstance to AC against the triggering attack, as a reaction', () => {
    const r = feat('Nimble Dodge')
    expect(r.cost).toEqual({ kind: 'reaction' })
    expect(r.selfMods).toMatchObject([
      {
        selector: 'ac',
        value: 2,
        type: 'circumstance',
        qualifier: 'against the triggering attack',
      },
    ])
    expect(r.ends).toBe('trigger')
    const [def] = derivedEffects(r)
    expect(def).toMatchObject({ name: 'Nimble Dodge', mode: 'toggle', ends: 'trigger' })
  })

  it('Fleet, Toughness and Incredible Initiative read as numbers', () => {
    expect(feat('Fleet').speed).toBe(5)
    expect(feat('Toughness').maxHp).toBe('level')
    expect(feat('Incredible Initiative').selfMods).toMatchObject([
      { selector: 'initiative', value: 2, type: 'circumstance', conditional: false },
    ])
  })

  it('Juggernaut: Fortitude to master, a success becomes a critical success', () => {
    const r = feature('Juggernaut')
    expect(r.proficiency).toEqual([{ stat: 'Fortitude', rank: 'M' }])
    expect(r.degreeShifts).toEqual([{ save: 'Fortitude', from: 'success', to: 'critical success' }])
  })

  it('Evasion-type features: Reflex to master, success becomes a critical success', () => {
    const evasive = classes
      .flatMap((c) => c.features)
      .filter((f) =>
        /When you roll a success on a Reflex save, you get a critical success/.test(f.text),
      )
    expect(evasive.length).toBeGreaterThan(3)
    for (const f of evasive)
      expect(readAbility(f).degreeShifts).toContainEqual({
        save: 'Reflex',
        from: 'success',
        to: 'critical success',
      })
  })

  it('Bravery’s upgrade holds only against fear, so it is a note', () => {
    const r = feature('Bravery')
    expect(r.degreeShifts).toEqual([
      { save: 'Will', from: 'success', to: 'critical success', against: 'a fear effect' },
    ])
  })

  it('reads action costs, ranges and frequencies', () => {
    expect(readCost('◆◆◆')).toEqual({ kind: 'actions', min: 3, max: 3 })
    expect(readCost('single action to three actions')).toEqual({ kind: 'actions', min: 1, max: 3 })
    expect(readCost('↺')).toEqual({ kind: 'reaction' })
    expect(readCost('◇')).toEqual({ kind: 'free' })
    expect(readCost('free or 1')).toEqual({ kind: 'actions', min: 1, max: 1 })
    expect(readCost('1 to 3')).toEqual({ kind: 'actions', min: 1, max: 3 })
    expect(readCost('reaction or 2')).toEqual({ kind: 'reaction' })
    expect(readFrequency('once per 10 minutes')).toMatchObject({ period: '10min', times: 1 })
    expect(readFrequency('three times per day')).toMatchObject({ period: 'day', times: 3 })
    expect(readFrequency('once per round')).toMatchObject({ period: 'round' })
    expect(readFrequency('once per Crimson Shroud')).toBeUndefined()
  })

  it('keeps the data’s Cost and Usage lines (Channel Smite expends a spell)', () => {
    expect(feat('Channel Smite').costNote).toBe('Expend a harm or heal spell')
    const usage = feats.find((f) => f.usage)!
    expect(readAbility(usage).usage).toBe(usage.usage)
  })

  it('finds a sheet feat’s Cost and Usage lines in the data by id, else by name', () => {
    const smite = find(feats, 'Channel Smite') as Ability & { id: string }
    const sheetFeats: Pf2eFeat[] = [
      { type: 'Feat', level: '1', action: '◆◆', name: 'Renamed by hand', desc: '', id: smite.id },
      { type: 'Feat', level: '1', action: '', name: 'Toughness', desc: '' },
    ]
    const lines = featStatLines(sheetFeats, feats)
    expect(lines.get(0)).toEqual({ cost: 'Expend a harm or heal spell' })
    expect(lines.has(1)).toBe(false)
  })

  it('scales dice by level: increases by 1d6 at 5th and every 4 levels, or a listed table', () => {
    expect(diceAt({ dice: '1d6', every: { from: 5, step: 4, add: '1d6' } }, 4)).toBe('1d6')
    expect(diceAt({ dice: '1d6', every: { from: 5, step: 4, add: '1d6' } }, 9)).toBe('3d6')
    expect(diceAt({ dice: '1d6', perLevels: 2 }, 7)).toBe('3d6')
    const steps: [number, string][] = [
      [5, '2d6'],
      [9, '3d6'],
    ]
    expect(diceAt({ dice: '1d6', steps }, 9)).toBe('3d6')
    const destructive = readAbility(
      find(
        classes.flatMap((c) => c.subclasses),
        'Iniquity',
      ),
    ).embedded.find((e) => e.name === 'Destructive Vengeance')
    expect(destructive?.cost).toEqual({ kind: 'reaction' })
    const spirit = destructive?.damage.find((d) => d.type === 'spirit')
    expect(spirit && diceAt(spirit, 12)).toBe('4d6')
  })

  it('reads the actions written inside an ability (Rage ◆ in the barbarian’s Rage)', () => {
    const rage = feature('Rage')
    const inner = rage.embedded.find((e) => e.name === 'Rage')
    expect(inner?.cost).toEqual({ kind: 'actions', min: 1, max: 1 })
    expect(inner?.tempHp).toEqual({ amount: 'levelPlusCon' })
    expect(inner?.requirements).toMatch(/fatigued/)
  })

  it('reads a barbarian instinct’s Rage damage by level (Dragon: +2, +6 from 7th)', () => {
    const dragon = readAbility(
      find(
        classes.flatMap((c) => c.subclasses),
        'Dragon',
      ),
    )
    expect(dragon.rageDamage).toEqual([
      [1, 2],
      [7, 6],
    ])
  })
})

describe('pf2e abilities in play', () => {
  it('Start turn: 3 actions, quickened 4, slowed 1 and stunned 2 take theirs (pp. 436, 446)', () => {
    const s = hero([])
    expect(startPf2eTurn(s)).toMatch(/3 actions/)
    s.conditions = ['Quickened', 'Slowed']
    s.conditionValues = { Slowed: 1 }
    startPf2eTurn(s)
    expect(s.turn?.actions).toBe(3)
    s.conditions = ['Stunned', 'Slowed']
    s.conditionValues = { Stunned: 2, Slowed: 1 }
    startPf2eTurn(s)
    expect(s.turn?.actions).toBe(1)
    expect(s.conditions).not.toContain('Stunned')
  })

  it('End turn lowers frightened by 1 (p. 444)', () => {
    const s = hero([], { conditions: ['Frightened'], conditionValues: { Frightened: 2 } })
    startPf2eTurn(s)
    expect(endPf2eTurn(s)).toMatch(/Frightened 1/)
    endPf2eTurn(s)
    expect(s.conditions).not.toContain('Frightened')
  })

  it('pays actions and the reaction, one flourish a turn, and spends frequencies', () => {
    const s = hero(['Sudden Charge', 'Shield Block'])
    startPf2eTurn(s)
    const charge = feat('Sudden Charge')
    payFor(s, charge, { name: 'Sudden Charge' })
    expect(s.turn?.actions).toBe(1)
    expect(blockedReason(s, charge, { name: 'Sudden Charge' })).toMatch(/Needs 2 actions/)
    s.turn!.actions = 3
    expect(blockedReason(s, charge, { name: 'Sudden Charge' })).toMatch(/flourish/)
    const block = feat('Shield Block')
    payFor(s, block, { name: 'Shield Block' })
    expect(blockedReason(s, block, { name: 'Shield Block' })).toMatch(/Reaction already used/)
    startPf2eTurn(s)
    expect(blockedReason(s, block, { name: 'Shield Block' })).toBe('')
  })

  it('counts uses per period and per target, refilled by turns, time and daily preparations', () => {
    const s = hero(['Battle Medicine'])
    const r = feat('Battle Medicine')
    payFor(s, r, { name: 'Battle Medicine', target: 'Bram' })
    expect(usesLeft(s, 'Battle Medicine', r.frequency!, 'Bram')).toBe(0)
    expect(usesLeft(s, 'Battle Medicine', r.frequency!, 'Wren')).toBe(1)
    timePasses(s, 'hour')
    expect(usesLeft(s, 'Battle Medicine', r.frequency!, 'Bram')).toBe(0)
    const demoralize = action('Demoralize')
    payFor(s, demoralize, { name: 'Demoralize', target: 'Goblin' })
    expect(usesLeft(s, 'Demoralize', demoralize.frequency!, 'Goblin')).toBe(0)
    timePasses(s, '10min')
    expect(usesLeft(s, 'Demoralize', demoralize.frequency!, 'Goblin')).toBe(1)
  })

  it('Demoralize rolls Intimidation through adjusted against the target’s Will DC', () => {
    const s = hero([])
    const row = s.skills.find((x) => x.name === 'Intimidation')!
    row.rank = 'T'
    row.value = 5
    s.conditions = ['Frightened']
    const lines = resolveUse(s, action('Demoralize'), {
      name: 'Demoralize',
      level: 1,
      dc: 15,
      rng: d20(12),
    })
    expect(lines[0]).toMatch(
      /^Intimidation \+4: 16 \(12\) vs Will DC 15: Success\. The target becomes frightened 1\./,
    )
  })

  it('Trip has the attack trait: the multiple attack penalty applies and counts', () => {
    const s = hero([])
    startPf2eTurn(s)
    s.turn!.attacks = 1
    const lines = resolveUse(s, action('Trip'), { name: 'Trip', level: 1, dc: 15, rng: d20(10) })
    expect(lines[0]).toMatch(/−5 multiple attack penalty/)
    expect(mapIndex(s)).toBe(2)
  })

  it('Treat Wounds at expert DC 20 heals 2d8+10 on a success, on yourself if chosen', () => {
    const s = hero([], { hp: 5 })
    const row = s.skills.find((x) => x.name === 'Medicine')!
    row.rank = 'E'
    row.value = 12
    const lines = resolveUse(s, action('Treat Wounds'), {
      name: 'Treat Wounds',
      level: 3,
      tier: 'E',
      onSelf: true,
      rng: d20(10),
    })
    expect(lines[0]).toMatch(/vs DC 20: Success/)
    expect(lines[1]).toMatch(/^Healed 12: 17\/20 HP\. \(2d8\+10\)$/)
  })

  it('Nimble Dodge’s use turns on its +2 AC until the triggering attack is over', () => {
    const s = hero(['Nimble Dodge'])
    const r = feat('Nimble Dodge')
    resolveUse(s, r, { name: 'Nimble Dodge', level: 1 })
    expect(adjusted(s, 16, { kind: 'ac' }).value).toBe(18)
    startPf2eTurn(s)
    expect(adjusted(s, 16, { kind: 'ac' }).value).toBe(16)
  })

  it('Incredible Initiative adds +2 to initiative, not to other Perception checks', () => {
    const s = hero(['Incredible Initiative'])
    expect(adjusted(s, 5, { kind: 'perception', initiative: true }).value).toBe(7)
    expect(adjusted(s, 5, { kind: 'perception' }).value).toBe(5)
  })

  it('Juggernaut raises Fortitude from expert to master (+2) and upgrades its success', () => {
    const s = hero(['Juggernaut'])
    s.saves.find((x) => x.label === 'Fortitude')!.rank = 'E'
    expect(adjusted(s, 9, { kind: 'save', save: 'Fortitude' }).value).toBe(11)
    expect(shiftedDegree(s, 'Fortitude', 'success')).toMatchObject({
      degree: 'critical success',
      by: 'Juggernaut',
    })
    expect(shiftedDegree(s, 'Fortitude', 'failure').degree).toBe('failure')
  })

  it('a later benefit waits for its level: Warpriest’s fifth doctrine at 15th', () => {
    const doctrine = classes.flatMap((c) => c.subclasses).find((x) => x.name === 'Warpriest')!
    const r = readAbility(doctrine)
    expect(r.degreeShifts).toEqual([
      { save: 'Fortitude', from: 'success', to: 'critical success', level: 15 },
    ])
    const s = hero([])
    s.feats = [{ type: 'Doctrine', level: '1', action: '', name: 'Warpriest', desc: doctrine.text }]
    expect(shiftedDegree(s, 'Fortitude', 'success').degree).toBe('success')
    s.level = 15
    expect(shiftedDegree(s, 'Fortitude', 'success').degree).toBe('critical success')
  })

  it('Bravery’s against-fear upgrade comes back as a note', () => {
    const s = hero(['Bravery'])
    const out = shiftedDegree(s, 'Will', 'success')
    expect(out.degree).toBe('success')
    expect(out.notes[0]).toMatch(/Bravery: critical success instead against a fear effect/)
  })

  it('Guardian’s Armor: physical resistance 1 + half your level', () => {
    const s = hero(["Guardian's Armor"])
    expect(resistancesNow(s, 6)).toEqual([
      { type: 'physical', value: 4, source: "Guardian's Armor" },
    ])
  })

  it('Rage’s Use turns on the curated Rage, whose temp HP aren’t given twice', () => {
    const s = hero(['Rage'], { attrs: { ...defaultSheet('pf2e').attrs, CON: 2 } })
    const inner = feature('Rage').embedded.find((e) => e.name === 'Rage')!
    const lines = resolveUse(s, inner, { name: 'Rage', level: 3 })
    expect(lines).toEqual([
      'Rage: 5 temporary Hit Points (you keep the higher of these and any you had).',
    ])
    expect(activeEffects(s).map((a) => a.def.name)).toContain('Rage')
  })

  it('a written effect wins over the one read from text', () => {
    const s = hero(['Fleet', 'Nimble Dodge'])
    const names = ownEffects(s).map((e) => e.name)
    expect(names.filter((n) => n === 'Fleet')).toHaveLength(1)
    expect(ownEffects(s).find((e) => e.name === 'Fleet')?.derived).toBeUndefined()
    expect(toggleEffect(s, 'Nimble Dodge', 1)).toBe('Nimble Dodge is on.')
  })
})

// --- Coverage over every ability in the data -------------------------------------

const SIGNALS: Record<string, RegExp> = {
  bonus:
    /[+]\d+(?:-foot)? (?:status|circumstance|item) bonus|[–−-]\d+ (?:status|circumstance|item) penalty/,
  dice: /\b\d+d\d+\b/,
  frequency: /\bonce (?:per|every) (?:day|hour|minute|round|turn|10 minutes)\b/i,
  action: /[◆↺◇]/,
}

/**
 * Text-only abilities may still mention numbers the hero doesn't use: each reason says why
 * the sheet has nothing to apply. Anything else that matches a signal fails the test.
 */
const REASONS: [reason: string, test: (text: string) => boolean][] = [
  [
    'bonus or penalty for someone else (an ally, a target, a companion): the sheet tracks the hero',
    (t) => {
      const b = bonusSubjects(t)
      return b.others > 0 && b.self === 0 && !SIGNALS.dice!.test(t) && !SIGNALS.action!.test(t)
    },
  ],
  [
    'dice of a duration or a random table ("1d4 hours", "roll 1d12 and consult")',
    (t) =>
      SIGNALS.dice!.test(t) &&
      [...t.matchAll(/\b\d+d\d+\b/g)].every(
        (m) =>
          /^\s*(?:rounds?|minutes?|hours?|days?|weeks?|times?|twice|for each)|^ (?:and|to) consult/i.test(
            t.slice((m.index ?? 0) + m[0].length),
          ) || /\b[Rr]oll $/.test(t.slice(0, m.index)),
      ),
  ],
  [
    'stat block of a form, avatar or companion (**Melee** ◆ … **Damage**), not the hero’s own attack',
    (t) => /\*\*(?:Melee|Ranged|Damage)\*\*|\*\*Avatar\*\*|Damage \d+d\d+/.test(t),
  ],
  [
    'changes another ability’s dice ("increases to 1d8", "increases by 2d6"): the change is on that ability',
    (t) =>
      SIGNALS.dice!.test(t) &&
      [...t.matchAll(/\b\d+d\d+\b/g)].every((m) =>
        /(?:increases?|changes?|becomes?|improves?)(?: to| by)?(?: a)? $|instead of (?:by )?$|to (?:a )?$|from $/.test(
          t.slice(Math.max(0, (m.index ?? 0) - 40), m.index),
        ),
      ),
  ],
]

/** Abilities whose numbers are left to the player, each with why. */
const ALLOWED: Record<string, string> = {
  'Channeling Block':
    'adds rolled dice to Shield Block’s Hardness for one block; Shield Block is applied by hand',
  'Unstable Concoction':
    'raises an alchemical item’s dice by a step; items aren’t rolled by the sheet',
  'Read Psychometric Resonance': 'damage the GM may deal to the hero, not a roll the hero makes',
  'Light Mortar': 'the innovation’s own statistics block (Aim, Load, Launch)',
  Water: 'the kineticist element’s Elemental Blast dice, rolled with the Elemental Blast action',
  Sunwrecker:
    'a mythic transcendence action written with its traits before the glyph; used as text',
  Undead: 'a sorcerer bloodline: its blood magic comes with casting a bloodline spell',
  'Incredible Luck': 'changes how Charmed Life is rolled; its +2 is Charmed Life’s own',
  'Fresh Ingredients':
    'grants Natural Medicine’s +2 for fresh herbs; applied by hand with that feat',
}

const ALL = [
  ...feats.map((x) => ['feats', x] as const),
  ...actions.map((x) => ['actions', x] as const),
  ...heritages.map((x) => ['heritages', x] as const),
  ...classes.flatMap((c) => [
    ...c.features.map((x) => ['class features', { ...x, traits: [] as string[] }] as const),
    ...c.subclasses.map((x) => ['subclass options', x] as const),
  ]),
]
const CURATED = new Set(PF2E_EFFECTS.map((e) => e.name))
const checkActions = new Set(
  actions
    .map((a) => [a.name, readAbility(a)] as const)
    .filter(([, r]) => r.check && r.outcomes.length)
    .map(([n]) => n),
)

function classify(x: Ability & { traits?: string[] }): {
  kind: Pf2eAbilityKind
  rules: Pf2eAbilityRules
} {
  const rules = readAbility(x)
  const effect = CURATED.has(x.name) || derivedEffects(rules).length > 0
  return { kind: abilityKind(rules, effect), rules }
}

describe('pf2e ability rules: coverage of every ability in the data', () => {
  const counts: Record<string, Record<Pf2eAbilityKind, number>> = {}
  const unexplained: string[] = []
  const reasons: Record<string, number> = {}
  for (const [set, x] of ALL) {
    const { kind } = classify(x)
    const c = (counts[set] ??= { effect: 0, roll: 0, use: 0, text: 0 })
    c[kind] += 1
    if (kind !== 'text') continue
    const text = clean(x.text)
    const hits = Object.entries(SIGNALS).filter(([, re]) => re.test(text))
    if (!hits.length) continue
    if (ALLOWED[x.name]) {
      reasons.allowlist = (reasons.allowlist ?? 0) + 1
      continue
    }
    const why = REASONS.find(([, test]) => test(text))
    if (why) reasons[why[0]] = (reasons[why[0]] ?? 0) + 1
    else unexplained.push(`${set}: ${x.name} (${hits.map(([k]) => k).join(', ')})`)
  }

  it('classifies every ability as effect, roll, use or text', () => {
    console.table(counts)
    console.table(reasons)
    const total = Object.values(counts).reduce((n, c) => n + c.effect + c.roll + c.use + c.text, 0)
    expect(total).toBe(ALL.length)
    const wired = Object.values(counts).reduce((n, c) => n + c.effect + c.roll + c.use, 0)
    expect(wired / total).toBeGreaterThan(0.55)
  })

  it('leaves no text-only ability with a bonus, dice, a frequency or an action unexplained', () => {
    expect(unexplained.length, unexplained.join('\n')).toBe(0)
  })

  it('every allowlisted ability still exists, is text-only and still mentions numbers', () => {
    for (const name of Object.keys(ALLOWED)) {
      const records = ALL.filter(([, a]) => a.name === name).map(([, a]) => a)
      expect(records.length, `${name} is gone from the data`).toBeGreaterThan(0)
      const held = records.some(
        (x) =>
          classify(x).kind === 'text' &&
          Object.values(SIGNALS).some((re) => re.test(clean(x.text))),
      )
      expect(held, `${name} is no longer a text-only ability with numbers`).toBe(true)
    }
  })

  it('finds the actions with a check other abilities can make (Demoralize, Trip, Treat Wounds)', () => {
    for (const n of ['Demoralize', 'Trip', 'Grapple', 'Shove', 'Treat Wounds', 'Feint', 'Seek'])
      expect(checkActions, n).toContain(n)
  })
})

describe('pf2e ability rules: every pattern still matches the data', () => {
  const texts = ALL.map(([, x]) => x.text)
  const cleaned = texts.map(clean)
  it.each(Object.entries(PF2E_RULE_PATTERNS))('%s matches some ability', (_name, re) => {
    const flags = re.flags.replace('g', '')
    const source = flags.includes('m') ? re.source : re.source.replace(/^\^/, '')
    const one = new RegExp(source, flags)
    expect(texts.some((t) => one.test(t)) || cleaned.some((t) => one.test(t))).toBe(true)
  })
})

describe('pf2e ability rules: review fixes', () => {
  const pool = [
    ...feats,
    ...actions,
    ...classes.flatMap((c) => [...c.features, ...c.subclasses]),
  ] as Ability[]
  const ability = (name: string) => {
    const r = readAbility(find(pool, name))
    return r.strike ? r : (r.embedded.find((e) => e.strike) ?? r)
  }

  it('counts a Strike as the two or three attacks its text says, however it words it (p. 402)', () => {
    const two = [
      'Swipe',
      'Spellstrike',
      'Penetrating Shot',
      'Piston Punch',
      'Stab and Blast',
      'Demolish Defenses',
      'Beast Gunner Dedication',
      'History of Violence',
      'Finish Their Story!',
      'Penetrating Fire',
      'Swiping Trace',
      'Vicious Swing',
    ]
    for (const name of two) expect([name, ability(name).strike?.mapCount]).toEqual([name, 2])
    expect(ability('Overwhelming Blow').strike?.mapCount).toBe(3)
    expect(strikeCountAs(ability('Overwhelming Blow').strike!)).toBe(3)
    expect(strikeCountAs(ability('Reactive Strike').strike!)).toBe(0)
  })

  it('Exacting Strike: only a failure is left out of the multiple attack penalty (Player Core p. 140)', () => {
    const strike = ability('Exacting Strike').strike!
    expect(strike).toMatchObject({ mapCount: 1, mapNoneOn: 'failure' })
    const s = hero([])
    startPf2eTurn(s)
    s.turn!.attacks = 2
    expect(uncounted(s, strike, 'success', 1)).toBe(false)
    expect(s.turn!.attacks).toBe(2)
    expect(uncounted(s, strike, 'failure', 1)).toBe(true)
    expect(s.turn!.attacks).toBe(1)
    expect(uncounted(s, strike, 'critical failure', 1)).toBe(false)
  })
  it('spends a reaction only in an encounter; time passing gives it back (p. 434)', () => {
    const r = readAbility(find(feats, 'Reactive Shield'))
    expect(r.cost).toEqual({ kind: 'reaction' })
    const s = hero(['Reactive Shield'])
    payFor(s, r, { name: r.name })
    expect(s.turn?.reaction ?? true).toBe(true)
    startPf2eTurn(s)
    endPf2eTurn(s)
    payFor(s, r, { name: r.name })
    expect(s.turn?.reaction).toBe(false)
    expect(blockedReason(s, r)).toBe('Reaction already used this round')
    endPf2eEncounter(s)
    s.turn!.reaction = false
    timePasses(s, 'minute')
    expect(s.turn?.reaction).toBe(true)
  })

  it('stunned for a duration, with no value, takes every action (Player Core p. 446)', () => {
    const s = hero([])
    s.conditions = ['Stunned', 'Quickened']
    expect(startPf2eTurn(s)).toContain('can’t act while it lasts')
    expect(s.turn?.actions).toBe(0)
    expect(s.conditions).toContain('Stunned')
  })

  it('an end-of-next-turn toggle turned on by hand during your turn lasts through your next', () => {
    const s = hero(['Panache'])
    startPf2eTurn(s)
    toggleEffect(s, 'Panache (until your next turn ends)', 1)
    endPf2eTurn(s)
    expect(s.effects?.on).toContain('Panache (until your next turn ends)')
    startPf2eTurn(s)
    endPf2eTurn(s)
    expect(s.effects?.on).not.toContain('Panache (until your next turn ends)')
  })

  it('Devise a Stratagem costs 1 action, free only for a lead’s subject (Player Core 2 p. 103)', () => {
    const r = action('Devise a Stratagem')
    expect(r.cost).toEqual({ kind: 'actions', min: 1, max: 1 })
    expect(r.costNote).toMatch(/as a free action if you're aware that creature could help answer/)
    expect(readCost('free')).toEqual({ kind: 'free' })
    // The investigator's class feature writes it as "## Devise a Stratagem ◇ or ◆".
    const inner = feature('Devise a Stratagem').embedded
    expect(inner.map((e) => [e.name, e.cost])).toEqual([
      ['Devise a Stratagem', { kind: 'actions', min: 1, max: 1 }],
    ])
    expect(inner[0]?.costNote).toMatch(/as a free action if/)
    expect(feature('Impulses').embedded.find((e) => e.name === 'Elemental Blast')?.cost).toEqual({
      kind: 'actions',
      min: 1,
      max: 2,
    })
  })

  it('keeps the rolled initiative on the sheet through the turns, until the encounter ends', () => {
    const s = hero([])
    expect(inEncounter(s)).toBe(false)
    s.turn = { ...newTurn(), initiative: 17 }
    expect(inEncounter(s)).toBe(true)
    startPf2eTurn(s)
    endPf2eTurn(s)
    expect(s.turn.initiative).toBe(17)
    endPf2eEncounter(s)
    expect(s.turn.initiative).toBeUndefined()
    expect(inEncounter(s)).toBe(false)
  })

  it('scales “for every level you have beyond 6th” from that level, as one roll', () => {
    for (const name of ['Storming Breath', 'Enervating Wail']) {
      const damage = feat(name).damage
      expect(damage.map((d) => d.dice)).toEqual(['4d6'])
      expect([6, 9, 20].map((l) => diceAt(damage[0]!, l))).toEqual(['4d6', '7d6', '18d6'])
    }
  })

  it('a hero who can’t act can’t use anything, reactions and free actions included (pp. 444–446)', () => {
    const reaction = readAbility(find(feats, 'Reactive Shield'))
    const strike = action('Strike')
    const free = action('Release')
    expect(free.cost).toEqual({ kind: 'free' })
    for (const c of ['Unconscious', 'Paralyzed', 'Petrified', 'Stunned']) {
      const s = hero([])
      s.conditions = [c]
      const why = `You can’t act while ${c.toLowerCase()}.`
      for (const r of [reaction, strike, free]) expect(blockedReason(s, r)).toBe(why)
    }
    const dead = hero([], { dying: 4 })
    expect(blockedReason(dead, reaction)).toBe('Your hero is dead.')
    expect(blockedReason(hero([]), reaction)).toBe('')
  })

  it('Rage rolls nothing: “You can Seek while raging” only allows Seek (Player Core 2 p. 72)', () => {
    const checks = actions
      .filter((a) => {
        const r = readAbility(a)
        return r.check && r.outcomes.length
      })
      .map((a) => a.name)
    const rage = feature('Rage').embedded.find((e) => e.name === 'Rage')!
    expect(rage.check).toBeUndefined()
    expect(usedAction(rage.body ?? '', checks)).toBeUndefined()
    const s = hero(['Rage'])
    const lines = resolveUse(s, rage, { name: 'Rage', level: 1, rng: () => 0.5 })
    expect(lines.join(' ')).not.toMatch(/Perception|\(\d+/)
    expect(usedAction('You can Seek the hidden door.', checks)).toBe('Seek')
  })

  it('reads Hammer Quake, Spell Swipe and Rejoin in Flight as Strikes, and Wing Buffet as 2 attacks', () => {
    expect(ability('Hammer Quake').strike).toMatchObject({ count: 1, mapCount: 3 })
    expect(ability('Spell Swipe').strike).toMatchObject({
      count: 2,
      mapCount: 2,
      melee: true,
      sameMap: true,
    })
    // "the penalty doesn't increase until after you've made both attacks": both at the
    // current penalty, then counted as two.
    const rejoin = ability('Mated Birds in Paired Flight').strike!
    expect(rejoin).toMatchObject({ count: 2, mapCount: 2, sameMap: true })
    expect(strikeCountAs(rejoin)).toBe(0)
    const wing = readAbility(find(feats, 'Wing Buffet'))
    expect(wing.check).toMatchObject({ skills: ['Athletics'], attack: true, mapCount: 2 })
    const s = hero([])
    s.skills = [{ name: 'Athletics', attr: 'STR', rank: 'T', value: 5 }]
    startPf2eTurn(s)
    resolveUse(s, wing, { name: 'Wing Buffet', level: 1, rng: () => 0.5 })
    expect(s.turn?.attacks).toBe(2)
  })

  it('“Both attacks count toward your multiple attack penalty” counts 2, after both are made', () => {
    for (const name of ['Rebounding Toss', 'Slam Down', 'Tandem Strike', 'Bat Around']) {
      const strike = ability(name).strike!
      expect([name, strike.mapCount]).toEqual([name, 2])
    }
    expect(ability('Slam Down').strike).toMatchObject({ sameMap: true })
  })
})
