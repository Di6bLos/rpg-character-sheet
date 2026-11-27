// The 2024 conditions (SRD 5.2.1 pp. 177–181) as rules the 5e play engine reads: what each does
// to your attack rolls, to attacks against you, to checks, saves, Speed and actions, and the
// conditions it brings with it (Unconscious → Incapacitated and Prone). Exhaustion is valued:
// `sheet.exhaustion` 1–6. When a condition ends (`sheet.conditionEnds`) is the player's choice,
// cleared by the turn steps. Pure; utils/dnd5ePlay.ts and the Vitals panel use it.
import type { Dnd5eAbility, Dnd5eConditionEnd, Dnd5eSheet } from '~/types/sheets'

export interface Dnd5eConditionRule {
  name: string
  /** The rules in a line, as the chip's tooltip says them. */
  effect: string
  attackAdv?: boolean
  attackDis?: boolean
  /** Attack rolls against you have Advantage or Disadvantage. */
  against?: 'adv' | 'dis'
  checkDis?: boolean
  /** Automatically fails these saving throws. */
  failSaves?: Dnd5eAbility[]
  saveDis?: Dnd5eAbility[]
  speedZero?: boolean
  /** No actions, Bonus Actions or Reactions; Concentration ends (Incapacitated). */
  incapacitated?: boolean
  initiative?: 'adv' | 'dis'
  resistAll?: boolean
  /** Conditions it gives too. */
  implies?: string[]
}

const STR_DEX: Dnd5eAbility[] = ['STR', 'DEX']

export const DND5E_CONDITION_RULES: Dnd5eConditionRule[] = [
  {
    name: 'Blinded',
    effect:
      'You can’t see and fail checks that need sight. Attack rolls against you have Advantage; yours have Disadvantage.',
    attackDis: true,
    against: 'adv',
  },
  {
    name: 'Charmed',
    effect:
      'You can’t attack the charmer or target it with damaging effects; it has Advantage on checks to interact socially with you.',
  },
  {
    name: 'Deafened',
    effect: 'You can’t hear and fail checks that need hearing.',
  },
  {
    name: 'Exhaustion',
    effect:
      'Each level: −2 to D20 Tests and −5 ft Speed. Level 6 kills. A Long Rest removes 1 level.',
  },
  {
    name: 'Frightened',
    effect:
      'Disadvantage on ability checks and attack rolls while the source is in sight; you can’t willingly move closer to it.',
    attackDis: true,
    checkDis: true,
  },
  {
    name: 'Grappled',
    effect:
      'Speed 0. Disadvantage on attack rolls against any target but the grappler, who can move you.',
    speedZero: true,
  },
  {
    name: 'Incapacitated',
    effect:
      'No actions, Bonus Actions or Reactions; Concentration ends; you can’t speak; Disadvantage on Initiative.',
    incapacitated: true,
    initiative: 'dis',
  },
  {
    name: 'Invisible',
    effect:
      'Advantage on Initiative. Attack rolls against you have Disadvantage; yours have Advantage (unless the target sees you).',
    attackAdv: true,
    against: 'dis',
    initiative: 'adv',
  },
  {
    name: 'Paralyzed',
    effect:
      'Incapacitated, Speed 0, Strength and Dexterity saves fail. Attacks against you have Advantage; a hit from within 5 ft is a Critical Hit.',
    speedZero: true,
    failSaves: STR_DEX,
    against: 'adv',
    implies: ['Incapacitated'],
  },
  {
    name: 'Petrified',
    effect:
      'Turned to stone: Incapacitated, Speed 0, Strength and Dexterity saves fail, Resistance to all damage, immune to Poisoned. Attacks against you have Advantage.',
    speedZero: true,
    failSaves: STR_DEX,
    against: 'adv',
    resistAll: true,
    implies: ['Incapacitated'],
  },
  {
    name: 'Poisoned',
    effect: 'Disadvantage on attack rolls and ability checks.',
    attackDis: true,
    checkDis: true,
  },
  {
    name: 'Prone',
    effect:
      'You can only crawl, or stand up for half your Speed. Disadvantage on your attack rolls. Attacks against you have Advantage within 5 ft, Disadvantage beyond.',
    attackDis: true,
  },
  {
    name: 'Restrained',
    effect:
      'Speed 0. Attack rolls against you have Advantage; yours have Disadvantage. Disadvantage on Dexterity saves.',
    speedZero: true,
    attackDis: true,
    against: 'adv',
    saveDis: ['DEX'],
  },
  {
    name: 'Stunned',
    effect:
      'Incapacitated, Strength and Dexterity saves fail. Attack rolls against you have Advantage.',
    failSaves: STR_DEX,
    against: 'adv',
    implies: ['Incapacitated'],
  },
  {
    name: 'Unconscious',
    effect:
      'Incapacitated and Prone, Speed 0, you drop what you hold, Strength and Dexterity saves fail. Attacks against you have Advantage; a hit from within 5 ft is a Critical Hit.',
    speedZero: true,
    failSaves: STR_DEX,
    against: 'adv',
    implies: ['Incapacitated', 'Prone'],
  },
]

export const DND5E_CONDITION_RULE: Record<string, Dnd5eConditionRule> = Object.fromEntries(
  DND5E_CONDITION_RULES.map((c) => [c.name, c]),
)

/** When a condition ends, as the end select offers it. */
export const DND5E_END_LABELS: Record<Dnd5eConditionEnd | 'manual', string> = {
  manual: 'When removed',
  turnStart: 'Start of your next turn',
  turnEnd: 'End of your next turn',
  round: 'Next round',
  encounter: 'End of combat',
}

export const exhaustionOf = (s: Pick<Dnd5eSheet, 'exhaustion' | 'conditions'>) =>
  Math.max(0, Math.min(6, s.exhaustion ?? (s.conditions?.includes('Exhaustion') ? 1 : 0)))

/** The hero's conditions, those another gives included (Unconscious → Incapacitated, Prone). */
export function activeConditions(s: Pick<Dnd5eSheet, 'conditions'>): Set<string> {
  const on = new Set(s.conditions ?? [])
  for (const c of s.conditions ?? [])
    for (const i of DND5E_CONDITION_RULE[c]?.implies ?? []) on.add(i)
  return on
}

/** The rules of the conditions on the hero. */
export function conditionRules(s: Pick<Dnd5eSheet, 'conditions'>): Dnd5eConditionRule[] {
  return [...activeConditions(s)].flatMap((c) =>
    DND5E_CONDITION_RULE[c] ? [DND5E_CONDITION_RULE[c]!] : [],
  )
}

/** Sets Exhaustion's level (0 takes it off), keeping "Exhaustion" in the condition names in step. */
export function setExhaustion(s: Dnd5eSheet, level: number) {
  const n = Math.max(0, Math.min(6, Math.floor(level)))
  s.exhaustion = n
  const has = s.conditions.includes('Exhaustion')
  if (n > 0 && !has) s.conditions = [...s.conditions, 'Exhaustion']
  else if (n === 0 && has) s.conditions = s.conditions.filter((c) => c !== 'Exhaustion')
}

export function setConditionEnd(s: Dnd5eSheet, name: string, end: Dnd5eConditionEnd | 'manual') {
  const ends = { ...s.conditionEnds }
  if (end === 'manual') delete ends[name]
  else ends[name] = end
  s.conditionEnds = ends
}

/** Turns a condition on or off; off also forgets its end, and Exhaustion goes to 0 or 1. */
export function toggleCondition(s: Dnd5eSheet, name: string, on?: boolean): boolean {
  if (!Array.isArray(s.conditions)) s.conditions = []
  const has = s.conditions.includes(name)
  const want = on ?? !has
  if (want === has) return false
  if (name === 'Exhaustion') {
    setExhaustion(s, want ? Math.max(1, s.exhaustion ?? 0) : 0)
    return true
  }
  s.conditions = want ? [...s.conditions, name] : s.conditions.filter((c) => c !== name)
  if (!want && s.conditionEnds?.[name]) setConditionEnd(s, name, 'manual')
  return true
}

/** Ends the conditions whose end is `when`; returns their names. */
export function endConditions(s: Dnd5eSheet, when: Dnd5eConditionEnd): string[] {
  const due = Object.entries(s.conditionEnds ?? {})
    .filter(([name, end]) => (end === when || when === 'encounter') && s.conditions.includes(name))
    .map(([name]) => name)
  for (const name of due) toggleCondition(s, name, false)
  if (when === 'encounter') s.conditionEnds = {}
  return due
}

/** What the conditions on the hero do to its numbers, a line each, for the Vitals panel. */
export function conditionSummary(s: Pick<Dnd5eSheet, 'conditions' | 'exhaustion'>): string[] {
  const rules = conditionRules(s)
  const out: string[] = []
  const from = (pick: (r: Dnd5eConditionRule) => unknown) =>
    rules
      .filter(pick)
      .map((r) => r.name)
      .join(', ')
  const ex = exhaustionOf(s)
  if (ex) out.push(`−${2 * ex} to every D20 Test and −${5 * ex} ft Speed (Exhaustion ${ex})`)
  if (from((r) => r.attackDis))
    out.push(`Disadvantage on your attack rolls (${from((r) => r.attackDis)})`)
  if (from((r) => r.attackAdv))
    out.push(`Advantage on your attack rolls (${from((r) => r.attackAdv)})`)
  if (from((r) => r.against === 'adv'))
    out.push(`Attack rolls against you have Advantage (${from((r) => r.against === 'adv')})`)
  if (from((r) => r.checkDis))
    out.push(`Disadvantage on ability checks (${from((r) => r.checkDis)})`)
  if (from((r) => r.failSaves))
    out.push(`Strength and Dexterity saves fail (${from((r) => r.failSaves)})`)
  if (from((r) => r.speedZero)) out.push(`Speed 0 (${from((r) => r.speedZero)})`)
  if (from((r) => r.incapacitated))
    out.push(`No actions, Bonus Actions or Reactions (${from((r) => r.incapacitated)})`)
  if (from((r) => r.resistAll)) out.push(`Resistance to all damage (${from((r) => r.resistAll)})`)
  return out
}
