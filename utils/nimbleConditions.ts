import { spellByName } from '~/data/nimble/spells'
import type { ConditionEnd, NimbleSheet, NimbleStat } from '~/types/sheets'

export const SPELL_STATUSES = [
  {
    name: 'Smoldering',
    desc: 'Does nothing on its own; some spells and abilities do more against Smoldering creatures. Ends when combat does.',
  },
  {
    name: 'Charged',
    desc: 'From taking lightning damage, for 1 minute; some spells (Overload) need it. Ends when combat does.',
  },
  {
    name: 'Electrocharge',
    desc: 'From the Electrocharge spell: Charged, +1 max action, +5 armor, 2× speed and advantage on DEX saves while its caster concentrates. Ends when combat does.',
  },
  {
    name: 'Flying',
    desc: 'A flying speed: 12 from Fly or Boisterous Winds, your speed otherwise.',
  },
  {
    name: 'True Strike',
    desc: 'From True Strike: advantage on your next attack. Ends at the end of your next turn.',
  },
  {
    name: 'Warded',
    desc: 'From Warding Bond: you take half damage from attacks and your warder takes the other half. Damage on your HP bar and from the GM is halved while it is on. Ends when combat does.',
  },
  {
    name: 'Distracted',
    desc: 'Adjacent to or Taunted by an enemy’s ally, or can’t see them. Ends when combat does.',
  },
  { name: 'Stunned', desc: 'Incapacitated: can’t do anything.' },
  { name: 'Paralyzed', desc: 'Incapacitated: can’t do anything.' },
  { name: 'Unconscious', desc: 'Incapacitated: can’t do anything.' },
  {
    name: 'Helped',
    desc: 'An ally used Help: advantage on your next roll. Your next attack or skill check uses it. Ends at the end of your next turn.',
  },
]

export const CONDITION_ENDS: Partial<Record<string, ConditionEnd>> = {
  Dazed: 'turnStart',
  Slowed: 'turnEnd',
  Taunted: 'turnEnd',
  Smoldering: 'encounter',
  Charged: 'encounter',
  Electrocharge: 'encounter',
  Distracted: 'encounter',
  Helped: 'turnEnd',
  'True Strike': 'turnEnd',
  Warded: 'encounter',
}

export const END_LABELS: Record<ConditionEnd | 'manual', string> = {
  turnStart: 'at the start of your next turn',
  turnEnd: 'at the end of your next turn',
  round: 'at the next round',
  encounter: 'when combat ends',
  manual: 'when you remove it',
}

export const INCAPACITATED = ['Incapacitated', 'Petrified', 'Stunned', 'Paralyzed', 'Unconscious']
const ATTACK_DISADVANTAGE = ['Blinded', 'Prone', 'Poisoned']

/** Conditions whose attack disadvantage depends on the target; the player says when they apply. */
export const SITUATIONAL = [
  { name: 'Taunted', when: 'not your taunter', hint: 'disadvantage except vs. your taunter' },
  { name: 'Frightened', when: 'source nearby', hint: 'disadvantage near its source' },
]

/** A status whose numbers come from another spell's text (Flying set by hand: Fly). */
const STATUS_SPELL: Partial<Record<string, string>> = { Flying: 'Fly' }
const ARMOR_PLUS = /\+(\d+) armor\b/
const LVL_ARMOR = /\bLVL Armor\b/
const MAX_ACTIONS = /\+(\d+) max actions?\b/
const SPEED_TIMES = /\b(\d+)× speed\b/
const FLY_SPEED = /\bfly(?:ing)? speed of (\d+)\b/
const CAN_FLY = /\byou can fly\b/
const SAVE_ADVANTAGE = /\badvantage on (STR|DEX|INT|WIL) saves\b/

/** The status a spell gives the creature it touches (Electrocharge, Fly → Flying), or ''. */
export function statusFromSpell(spell: string): string {
  if (SPELL_STATUSES.some((s) => s.name === spell)) return spell
  return Object.entries(STATUS_SPELL).find(([, from]) => from === spell)?.[0] ?? ''
}

export interface StatusStats {
  armor: number
  actions: number
  speedTimes: number
  /** Fly speed: spaces, 'speed' (equal to your speed) or null. */
  fly: number | 'speed' | null
  saveAdvantage: NimbleStat[]
  /** "Electrocharge +5", for the tiles' tooltips. */
  armorNotes: string[]
  /** "2× (Electrocharge)". */
  speedNotes: string[]
}

/**
 * What the hero's active spell statuses change, read from the spell that caused each
 * one (its effect's source, or the spell of the same name): Electrocharge's armor,
 * max action, speed and DEX saves, Dragonform's LVL Armor and fly speed, Flying.
 */
export function statusStats(
  sheet: Pick<NimbleSheet, 'conditions' | 'effects'>,
  level = 0,
): StatusStats {
  const out: StatusStats = {
    armor: 0,
    actions: 0,
    speedTimes: 1,
    fly: null,
    saveAdvantage: [],
    armorNotes: [],
    speedNotes: [],
  }
  for (const c of sheet.conditions) {
    const source = sheet.effects.find((e) => e.condition === c)?.source ?? STATUS_SPELL[c] ?? c
    const text = spellByName(source)?.desc.split(/\bUpcast:/)[0] ?? ''
    const armor = LVL_ARMOR.test(text) ? level : Number(ARMOR_PLUS.exec(text)?.[1] ?? 0)
    if (armor) {
      out.armor += armor
      out.armorNotes.push(`${source} +${armor}`)
    }
    out.actions += Number(MAX_ACTIONS.exec(text)?.[1] ?? 0)
    const times = Number(SPEED_TIMES.exec(text)?.[1] ?? 1)
    if (times !== 1) {
      out.speedTimes *= times
      out.speedNotes.push(`${times}× (${source})`)
    }
    const fly = FLY_SPEED.exec(text)?.[1]
    if (fly) out.fly = Math.max(typeof out.fly === 'number' ? out.fly : 0, Number(fly))
    else if ((c === 'Flying' || CAN_FLY.test(text)) && out.fly === null) out.fly = 'speed'
    const save = SAVE_ADVANTAGE.exec(text)?.[1] as NimbleStat | undefined
    if (save && !out.saveAdvantage.includes(save)) out.saveAdvantage.push(save)
  }
  return out
}

/**
 * A hero's armor as the party and GM see it (roster, cards, hero stats): the saved
 * base plus their spell statuses' armor (Electrocharge, Dragonform).
 */
export function heroArmor(
  ac: number | undefined,
  conditions: string[] = [],
  level: number | null = 0,
): number | undefined {
  return ac === undefined
    ? undefined
    : ac + statusStats({ conditions, effects: [] }, level ?? 0).armor
}

export interface ConditionMods {
  disadvantage: number
  /** Conditions behind `disadvantage`, by name ("Invisible (advantage)" counts against it). */
  reasons: string[]
  notes: string[]
  hints: string[]
  incapacitated: string
  speed: number | null
  speedNote: string
}

/** Odds the attack takes from outside the hero: the GM's calls, the target's cover, Condemn. */
export interface AttackOdds {
  /** Disadvantage the GM calls for. */
  disadvantage?: number
  /** Advantage the GM calls for. */
  advantage?: number
  /** The target is behind cover: +1 disadvantage. */
  covered?: boolean
  /** Condemn: advantage on the next attack against the target. */
  condemned?: number
}

export function conditionMods(
  sheet: NimbleSheet,
  applies: string[] = [],
  odds: AttackOdds = {},
): ConditionMods {
  const called = odds.disadvantage ?? 0
  const cover = odds.covered ? 1 : 0
  const granted = odds.advantage ?? 0
  const targetAdvantage = odds.condemned ?? 0
  const has = (name: string) => sheet.conditions.includes(name)
  const present = SITUATIONAL.filter((s) => has(s.name))
  const helped = has('Helped') ? 1 : 0
  const strike = has('True Strike') ? 1 : 0
  const condemned =
    targetAdvantage > 1
      ? [`Condemned (${targetAdvantage}× advantage)`]
      : targetAdvantage
        ? ['Condemned (advantage)']
        : []
  const against = [
    ...ATTACK_DISADVANTAGE.filter(has),
    ...present.filter((s) => applies.includes(s.name)).map((s) => s.name),
  ]
  const notes = [
    against.length ? `+${against.length} disadvantage: ${against.join(', ')}` : '',
    has('Invisible') ? 'Advantage: Invisible' : '',
    helped ? 'Advantage: Helped' : '',
    strike ? 'Advantage: True Strike' : '',
  ].filter(Boolean)
  const disadvantage =
    against.length +
    called +
    cover -
    (has('Invisible') ? 1 : 0) -
    helped -
    strike -
    targetAdvantage -
    granted
  const reasons = [
    ...against,
    ...(has('Invisible') ? ['Invisible (advantage)'] : []),
    ...(helped ? ['Helped (advantage)'] : []),
    ...(strike ? ['True Strike (advantage)'] : []),
    ...condemned,
    ...(cover ? ['Covered'] : []),
    ...(called ? [called > 1 ? `Disadvantage (${called})` : 'Disadvantage'] : []),
    ...(granted ? [granted > 1 ? `Advantage (${granted})` : 'Advantage'] : []),
  ]
  const hints = present.filter((s) => !applies.includes(s.name)).map((s) => `${s.name}: ${s.hint}`)
  const stats = statusStats(sheet)
  const walk = Number.parseInt(sheet.speed, 10)
  const base = Number.isFinite(walk) ? walk * stats.speedTimes : walk
  let speed: number | null = stats.speedTimes !== 1 && Number.isFinite(base) ? base : null
  let speedNote = stats.speedNotes.join(' · ')
  if (has('Grappled') || has('Restrained')) {
    speed = 0
    speedNote = has('Grappled') ? 'Grappled: can’t move' : 'Restrained: can’t move'
  } else if (has('Slowed') && Number.isFinite(base)) {
    speed = Math.floor(base / 2)
    speedNote = [speedNote, 'Slowed: halved'].filter(Boolean).join(' · ')
  }
  if (stats.fly !== null)
    speedNote = [speedNote, `Fly ${stats.fly === 'speed' ? 'at your speed' : stats.fly}`]
      .filter(Boolean)
      .join(' · ')
  if (has('Prone'))
    speedNote = [speedNote, 'Prone: moving costs double; standing costs 3']
      .filter(Boolean)
      .join(' · ')
  const incapacitated = INCAPACITATED.find(has) ?? ''
  return { disadvantage, reasons, notes, hints, incapacitated, speed, speedNote }
}

/** Why an attack rolls with disadvantage or advantage, shown on hover: "Rushed (2), Blinded". */
export function oddsReasons(rushed: number, cond: ConditionMods, extra = ''): string {
  return [rushed ? (rushed > 1 ? `Rushed (${rushed})` : 'Rushed') : '', ...cond.reasons, extra]
    .filter(Boolean)
    .join(', ')
}

export function setConditionEnd(sheet: NimbleSheet, name: string, end: ConditionEnd | 'manual') {
  const ends = { ...sheet.conditionEnds }
  if (end === 'manual') delete ends[name]
  else ends[name] = end
  sheet.conditionEnds = ends
  // Set during the hero's own turn, "the end of your next turn" skips this turn's end.
  const held = (sheet.conditionHold ?? []).filter((n) => n !== name)
  if (end === 'turnEnd' && sheet.turnActive) held.push(name)
  sheet.conditionHold = held
}

const GAINS_CONDITION = /\bgains the (\w+) condition\b/g

export function addCondition(sheet: NimbleSheet, name: string) {
  if (sheet.conditions.includes(name)) return
  sheet.conditions = [...sheet.conditions, name]
  const end = CONDITION_ENDS[name]
  if (end) setConditionEnd(sheet, name, end)
  // A spell status brings the conditions its spell gives (Electrocharge: Charged), which
  // end on their own (Overload spends Charged; the armor and action stay).
  if (!statusFromSpell(STATUS_SPELL[name] ?? name)) return
  const text = spellByName(STATUS_SPELL[name] ?? name)?.desc ?? ''
  for (const m of text.matchAll(GAINS_CONDITION)) if (m[1] !== name) addCondition(sheet, m[1]!)
}

export function removeCondition(sheet: NimbleSheet, name: string) {
  sheet.conditions = sheet.conditions.filter((c) => c !== name)
  setConditionEnd(sheet, name, 'manual')
}

export function clearConditionsAt(sheet: NimbleSheet, when: ConditionEnd): string {
  const held = when === 'turnEnd' ? new Set(sheet.conditionHold ?? []) : new Set<string>()
  if (held.size) sheet.conditionHold = []
  const ending = Object.entries(sheet.conditionEnds ?? {})
    .filter(([name, end]) => end === when && sheet.conditions.includes(name) && !held.has(name))
    .map(([name]) => name)
  for (const name of ending) removeCondition(sheet, name)
  return ending.length ? ` No longer ${ending.join(' or ')}.` : ''
}

/** Warding Bond: a Warded hero takes half of an attack's damage; the warder takes the rest. */
export function wardedDamage(sheet: NimbleSheet, amount: number): { taken: number; note: string } {
  if (!sheet.conditions.includes('Warded')) return { taken: amount, note: '' }
  const taken = Math.floor(amount / 2)
  return { taken, note: ` Warded: you take ${taken}, your warder ${amount - taken}.` }
}

/** An attack spends Helped and True Strike, the advantage they gave it. */
export function spendHelp(sheet: NimbleSheet): string {
  const spent = ['Helped', 'True Strike'].filter((c) => sheet.conditions.includes(c))
  for (const c of spent) removeCondition(sheet, c)
  return spent.map((c) => (c === 'Helped' ? ' Help used.' : ' True Strike used.')).join('')
}

export function dazedAtTurnStart(sheet: NimbleSheet): string {
  if (!sheet.conditions.includes('Dazed')) return ''
  sheet.actionsSpent += 1
  return ' Dazed: you lose 1 action.'
}
