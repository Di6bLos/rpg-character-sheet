// What a 5e (2024) hero can do about a D20 Test it just rolled, or the next one: reroll it
// (Heroic Inspiration, SRD 5.2.1 p. 8; Indomitable with the Fighter level, p. 48; Disciplined
// Survivor, p. 52; Countercharm with Advantage, p. 34; Fanatical Focus with Rage Damage), add to
// it (an ally's Bardic Inspiration die, p. 33; Peerless Skill; Tactical Mind's 1d10, p. 47;
// Flash of Genius's INT; Dark One's Own Luck's 1d10; Psi-Bolstered Knack; the Battle Master's
// Commanding Presence, Tactical Assessment and Ambush), make it a 20 (Stroke of Luck, p. 63),
// swap in a foretold d20 (Portent), or turn on Advantage before it (a Luck Point, Tides of
// Chaos). `rerollOptions` lists them for the last roll with why not; `useReroll` applies one and
// says the new total. Attack rolls take theirs as miss riders (utils/dnd5eRiders.ts). Pure;
// tests/dnd5eRerolls.test.ts.
import type { Dnd5eSheet } from '~/types/sheets'
import { addEffect, hasEffect, removeEffect } from '~/utils/dnd5eEffects'
import { LUCK } from '~/utils/dnd5eDefense'
import { heldInspiration } from '~/utils/dnd5eRiders'
import {
  type D20Mode,
  type D20Result,
  type Dnd5eD20,
  costWhy,
  dnd5eHero,
  payCost,
  rollD20,
  spendUses,
  usesLeft,
} from '~/utils/dnd5ePlay'
import { type Rng, parseDice, rollDice, sign } from '~/utils/dice'

/** A D20 Test the sheet just rolled, as the panels keep it. */
export interface Dnd5eLastRoll {
  /** Who shows it (`skills:Athletics`, `vit:death`). */
  key: string
  test: Dnd5eD20
  result: D20Result
  mode: D20Mode
  /** What was used on it already (one of each). */
  used?: string[]
}

export interface Dnd5eRerollOption {
  key: string
  name: string
  /** Why it can't be used on this roll, or ''. */
  why: string
  /** What it does, with its numbers. */
  title: string
}

type Kind = Dnd5eD20['kind']

interface RerollDef {
  key: string
  name: string
  /** The sheet feature (or effect) that gives it; '' for one anyone has. */
  feature: string
  kinds: Kind[]
  /** Only checks with these skills (Commanding Presence…), or proficient ones. */
  skills?: string[] | 'proficient'
  how: 'reroll' | 'add' | 'twenty' | 'portent' | 'success'
  /** What it adds: dice, a pool's die by resource name, the held Bardic Inspiration die. */
  dice?: string | { pool: string } | 'bardic'
  plus?: 'level' | 'INT' | 'rage'
  /** Reroll with Advantage (Countercharm). */
  adv?: boolean
  spend?: string
  /** Spent only when the roll now succeeds (Tactical Mind, Peerless Skill). */
  keepOnFail?: boolean
  reaction?: boolean
  needs?: string
  note: string
}

const D20: Kind[] = ['check', 'save', 'attack', 'initiative', 'death']

export const DND5E_REROLLS: RerollDef[] = [
  {
    key: 'heroic',
    name: 'Heroic Inspiration',
    feature: '',
    kinds: D20,
    how: 'reroll',
    note: 'Spend Heroic Inspiration to reroll the d20; you use the new roll.',
  },
  {
    key: 'bardic',
    name: 'Bardic Inspiration',
    feature: '',
    kinds: D20,
    how: 'add',
    dice: 'bardic',
    note: 'Roll the Bardic Inspiration die you hold and add it.',
  },
  {
    key: 'portent',
    name: 'Portent',
    feature: 'Portent',
    kinds: D20,
    how: 'portent',
    note: 'Swap the d20 for a foretold roll (once a turn).',
  },
  {
    key: 'stroke',
    name: 'Stroke of Luck',
    feature: 'Stroke of Luck',
    kinds: D20,
    how: 'twenty',
    spend: 'Stroke of Luck',
    note: 'A failed D20 Test: the d20 becomes a 20.',
  },
  {
    key: 'indomitable',
    name: 'Indomitable',
    feature: 'Indomitable',
    kinds: ['save'],
    how: 'reroll',
    plus: 'level',
    spend: 'Indomitable',
    note: 'A failed save: reroll it with your Fighter level added; the new roll stands.',
  },
  {
    key: 'disciplined',
    name: 'Disciplined Survivor',
    feature: 'Disciplined Survivor',
    kinds: ['save'],
    how: 'reroll',
    spend: 'Monk’s Focus',
    note: 'A failed save: spend 1 Focus Point to reroll it.',
  },
  {
    key: 'fanatical',
    name: 'Fanatical Focus',
    feature: 'Fanatical Focus',
    kinds: ['save'],
    how: 'reroll',
    plus: 'rage',
    needs: 'rage',
    note: 'Once a Rage, reroll a failed save adding your Rage Damage bonus.',
  },
  {
    key: 'countercharm',
    name: 'Countercharm',
    feature: 'Countercharm',
    kinds: ['save'],
    how: 'reroll',
    adv: true,
    reaction: true,
    note: 'A failed save against Charmed or Frightened: reroll it with Advantage.',
  },
  {
    key: 'living-legend',
    name: 'Living Legend',
    feature: 'Living Legend',
    kinds: ['save'],
    how: 'reroll',
    reaction: true,
    needs: 'living-legend',
    note: 'While it lasts, reroll a failed save.',
  },
  {
    key: 'minor-wish',
    name: 'Minor Wish',
    feature: 'Noble Scion',
    kinds: D20,
    how: 'success',
    reaction: true,
    needs: 'noble-scion',
    note: 'While it lasts, a failed D20 Test becomes a success.',
  },
  {
    key: 'flash-of-genius',
    name: 'Flash of Genius',
    feature: 'Flash of Genius',
    kinds: ['check', 'save'],
    how: 'add',
    plus: 'INT',
    spend: 'Flash of Genius',
    reaction: true,
    note: 'A failed check or save: add your INT modifier (min +1).',
  },
  {
    key: 'dark-ones-own-luck',
    name: 'Dark One’s Own Luck',
    feature: 'Dark One’s Own Luck',
    kinds: ['check', 'save'],
    how: 'add',
    dice: '1d10',
    spend: 'Dark One’s Own Luck',
    note: 'Add 1d10 to a check or save, after seeing the roll.',
  },
  {
    key: 'tactical-mind',
    name: 'Tactical Mind',
    feature: 'Tactical Mind',
    kinds: ['check'],
    how: 'add',
    dice: '1d10',
    spend: 'Second Wind',
    keepOnFail: true,
    note: 'A failed check: add 1d10; the Second Wind use is spent only if the check then succeeds (give it back on Resources if not).',
  },
  {
    key: 'peerless-skill',
    name: 'Peerless Skill',
    feature: 'Peerless Skill',
    kinds: ['check', 'attack'],
    how: 'add',
    dice: { pool: 'Bardic Inspiration' },
    spend: 'Bardic Inspiration',
    keepOnFail: true,
    note: 'A failed check: add a Bardic Inspiration die; it’s spent only if that turns it into a success (give it back on Resources if not).',
  },
  {
    key: 'psi-knack',
    name: 'Psi-Bolstered Knack',
    feature: 'Psionic Power',
    kinds: ['check'],
    skills: 'proficient',
    how: 'add',
    dice: { pool: 'Psionic Power' },
    spend: 'Psionic Power',
    keepOnFail: true,
    note: 'A failed check with a proficient skill: add a Psionic Energy Die; it’s spent only if that turns it into a success.',
  },
  {
    key: 'commanding-presence',
    name: 'Commanding Presence',
    feature: 'Commanding Presence',
    kinds: ['check'],
    skills: ['Intimidation', 'Performance', 'Persuasion'],
    how: 'add',
    dice: { pool: 'Combat Superiority' },
    spend: 'Combat Superiority',
    note: 'Add a Superiority Die to the Charisma check.',
  },
  {
    key: 'tactical-assessment',
    name: 'Tactical Assessment',
    feature: 'Tactical Assessment',
    kinds: ['check'],
    skills: ['History', 'Investigation', 'Insight'],
    how: 'add',
    dice: { pool: 'Combat Superiority' },
    spend: 'Combat Superiority',
    note: 'Add a Superiority Die to the check.',
  },
  {
    key: 'ambush',
    name: 'Ambush',
    feature: 'Ambush',
    kinds: ['check', 'initiative'],
    skills: ['Stealth'],
    how: 'add',
    dice: { pool: 'Combat Superiority' },
    spend: 'Combat Superiority',
    note: 'Add a Superiority Die to a Stealth check or to Initiative.',
  },
]

const pool = (s: Dnd5eSheet, name: string) => {
  const m = /(\d*)d(\d+)/.exec(s.resources?.find((r) => r.name === name)?.dice ?? '')
  return m ? `${m[1] || 1}d${m[2]}` : ''
}

function diceOf(s: Dnd5eSheet, d: RerollDef['dice']): string {
  if (!d) return ''
  if (d === 'bardic') return heldInspiration(s)?.dice ?? ''
  return typeof d === 'string' ? d : pool(s, d.pool)
}

function plusOf(s: Dnd5eSheet, level: number, p: RerollDef['plus'], cols?: Record<string, string>) {
  const hero = dnd5eHero(s, level)
  if (p === 'level') return level
  if (p === 'INT') return Math.max(1, hero.mod('INT'))
  if (p === 'rage') return Number(/\d+/.exec(cols?.['Rage Damage'] ?? '')?.[0] ?? 0)
  return 0
}

function has(s: Dnd5eSheet, level: number, d: RerollDef): boolean {
  if (d.key === 'heroic') return !!s.heroicInspiration
  if (d.key === 'bardic') return !!heldInspiration(s)
  if (d.key === 'portent') return dnd5eHero(s, level).has('Portent') && !!s.portent?.length
  return dnd5eHero(s, level).has(d.feature)
}

/** The rerolls and boosts that fit the last roll, each with why not. */
export function rerollOptions(
  s: Dnd5eSheet,
  level: number,
  last: Dnd5eLastRoll,
  cols?: Record<string, string>,
): Dnd5eRerollOption[] {
  const t = last.test
  const out: Dnd5eRerollOption[] = []
  for (const d of DND5E_REROLLS) {
    if (!d.kinds.includes(t.kind) || !has(s, level, d)) continue
    const skill = t.label
    if (Array.isArray(d.skills) && t.kind === 'check' && !d.skills.includes(skill)) continue
    if (
      d.skills === 'proficient' &&
      !(s.proficiencies?.skills.includes(skill) || s.proficiencies?.tools.includes(skill))
    )
      continue
    let why = ''
    if (last.used?.includes(d.key)) why = 'Used on this roll'
    else if (last.result.failed && d.how !== 'success') why = 'It fails without a roll'
    else if (d.reaction) why = costWhy(s, 'reaction')
    if (!why && d.spend && usesLeft(s, d.spend) < 1) why = `No ${d.spend} left`
    if (!why && d.needs && !hasEffect(s, d.needs)) why = 'Not active'
    if (!why && d.key === 'fanatical' && s.used?.['Fanatical Focus']) why = 'Used this Rage'
    if (!why && d.key === 'portent' && s.turn?.once.includes('portent')) why = 'Used this turn'
    const dice = diceOf(s, d.dice)
    const plus = plusOf(s, level, d.plus, cols)
    const numbers = [
      d.how === 'portent' ? `foretold: ${(s.portent ?? []).join(', ')}` : '',
      dice ? `+${dice}` : '',
      plus ? sign(plus) : '',
      d.adv ? 'with Advantage' : '',
      d.spend ? `spends 1 ${d.spend}` : '',
      d.reaction ? 'Reaction' : '',
    ].filter(Boolean)
    out.push({ key: d.key, name: d.name, why, title: [numbers.join(' · '), d.note].join('\n') })
  }
  return out
}

/**
 * Uses a reroll or boost on the last roll: pays it, then rerolls (the same test, or with
 * Advantage), adds its dice and bonus, makes the d20 a 20, swaps in the foretold roll
 * (`portent`: which one), or makes it a success. Returns the new result and the line to say.
 */
export function useReroll(
  s: Dnd5eSheet,
  level: number,
  last: Dnd5eLastRoll,
  key: string,
  o: { rng?: Rng; portent?: number; d20?: number[]; cols?: Record<string, string> } = {},
): { result: D20Result; line: string } | null {
  const d = DND5E_REROLLS.find((x) => x.key === key)
  const opt = rerollOptions(s, level, last, o.cols).find((x) => x.key === key)
  if (!d || !opt || opt.why) return null
  const dice = diceOf(s, d.dice)
  if (d.reaction) payCost(s, level, 'reaction')
  if (d.spend) spendUses(s, d.spend)
  if (d.key === 'heroic') s.heroicInspiration = false
  if (d.key === 'bardic') removeEffect(s, 'bardic-inspiration')
  if (d.key === 'fanatical') s.used = { ...s.used, 'Fanatical Focus': 1 }
  const plus = plusOf(s, level, d.plus, o.cols)
  const r = last.result
  let next: D20Result
  let how: string
  if (d.how === 'reroll') {
    const test = plus ? { ...last.test, bonus: last.test.bonus + plus } : last.test
    next = rollD20(test, {
      mode: d.adv ? 'adv' : last.mode,
      ...(o.d20 ? { d20: o.d20 } : {}),
      ...(o.rng ? { rng: o.rng } : {}),
    })
    how = `rerolled: ${next.total}${plus ? ` (with ${sign(plus)})` : ''}`
  } else if (d.how === 'add') {
    const p = parseDice(dice)
    const n = (p ? rollDice(p, o.rng).total : 0) + plus
    next = { ...r, total: r.total + n }
    how = `+${n}: ${next.total}`
  } else if (d.how === 'twenty') {
    next = { ...r, total: r.total + (20 - r.d20), d20: 20, natural: 20 }
    how = `the d20 is a 20: ${next.total}`
  } else if (d.how === 'portent') {
    const list = [...(s.portent ?? [])]
    const i = Math.max(0, Math.min(list.length - 1, o.portent ?? 0))
    const v = list.splice(i, 1)[0]!
    s.portent = list
    if (s.turn) s.turn.once = [...s.turn.once, 'portent']
    next = {
      ...r,
      total: r.total + (v - r.d20),
      d20: v,
      natural: v === 20 ? 20 : v === 1 ? 1 : null,
    }
    how = `the d20 is a foretold ${v}: ${next.total}`
  } else {
    next = { ...r, failed: false }
    how = 'it succeeds'
  }
  last.used = [...(last.used ?? []), key]
  last.result = next
  return { result: next, line: `${last.test.label}, ${d.name}: ${how}.` }
}

/** Advantage on the next D20 Test, bought before rolling: a Luck Point, or Tides of Chaos. */
export function preRollOptions(s: Dnd5eSheet, level: number): Dnd5eRerollOption[] {
  const hero = dnd5eHero(s, level)
  const out: Dnd5eRerollOption[] = []
  if (hero.feat('lucky'))
    out.push({
      key: 'luck',
      name: 'Luck Point',
      why: hasEffect(s, 'luck') ? 'On' : usesLeft(s, LUCK) < 1 ? 'No Luck Points left' : '',
      title: `${usesLeft(s, LUCK)} left · Advantage on your next D20 Test (Lucky).`,
    })
  if (hero.has('Tides of Chaos'))
    out.push({
      key: 'tides-of-chaos',
      name: 'Tides of Chaos',
      why: hasEffect(s, 'tides-of-chaos')
        ? 'On'
        : usesLeft(s, 'Tides of Chaos') < 1
          ? 'Used: back after a Long Rest or a Sorcerer spell with a slot'
          : '',
      title:
        'Advantage on your next D20 Test; it comes back when you cast a Sorcerer spell with a slot (a Wild Magic Surge).',
    })
  return out
}

/** Spends a Luck Point or Tides of Chaos for Advantage on the next D20 Test. */
export function usePreRoll(s: Dnd5eSheet, level: number, key: string): string {
  const o = preRollOptions(s, level).find((x) => x.key === key)
  if (!o || o.why) return ''
  spendUses(s, key === 'luck' ? LUCK : 'Tides of Chaos')
  addEffect(s, key)
  return `${o.name}: Advantage on your next D20 Test.`
}
