import type { ConditionEnd, NimbleSheet } from '~/types/sheets'

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
    name: 'Distracted',
    desc: 'Adjacent to or Taunted by an enemy’s ally, or can’t see them. Ends when combat does.',
  },
  { name: 'Stunned', desc: 'Incapacitated: can’t do anything.' },
  { name: 'Paralyzed', desc: 'Incapacitated: can’t do anything.' },
  { name: 'Unconscious', desc: 'Incapacitated: can’t do anything.' },
]

export const CONDITION_ENDS: Partial<Record<string, ConditionEnd>> = {
  Dazed: 'turnStart',
  Slowed: 'turnEnd',
  Taunted: 'turnEnd',
  Smoldering: 'encounter',
  Charged: 'encounter',
  Distracted: 'encounter',
}

export const END_LABELS: Record<ConditionEnd | 'manual', string> = {
  turnStart: 'at the start of your next turn',
  turnEnd: 'at the end of your next turn',
  round: 'at the next round',
  encounter: 'when combat ends',
  manual: 'when you remove it',
}

const INCAPACITATED = ['Incapacitated', 'Petrified', 'Stunned', 'Paralyzed', 'Unconscious']
const ATTACK_DISADVANTAGE = ['Blinded', 'Prone', 'Poisoned']

/** Conditions whose attack disadvantage depends on the target; the player says when they apply. */
export const SITUATIONAL = [
  { name: 'Taunted', when: 'not your taunter', hint: 'disadvantage except vs. your taunter' },
  { name: 'Frightened', when: 'source nearby', hint: 'disadvantage near its source' },
]

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

export function conditionMods(sheet: NimbleSheet, applies: string[] = []): ConditionMods {
  const has = (name: string) => sheet.conditions.includes(name)
  const present = SITUATIONAL.filter((s) => has(s.name))
  const against = [
    ...ATTACK_DISADVANTAGE.filter(has),
    ...present.filter((s) => applies.includes(s.name)).map((s) => s.name),
  ]
  const notes = [
    against.length ? `+${against.length} disadvantage: ${against.join(', ')}` : '',
    has('Invisible') ? 'Advantage: Invisible' : '',
  ].filter(Boolean)
  const disadvantage = against.length - (has('Invisible') ? 1 : 0)
  const reasons = [...against, ...(has('Invisible') ? ['Invisible (advantage)'] : [])]
  const hints = present.filter((s) => !applies.includes(s.name)).map((s) => `${s.name}: ${s.hint}`)
  const base = Number.parseInt(sheet.speed, 10)
  let speed: number | null = null
  let speedNote = ''
  if (has('Grappled') || has('Restrained')) {
    speed = 0
    speedNote = has('Grappled') ? 'Grappled: can’t move' : 'Restrained: can’t move'
  } else if (has('Slowed') && Number.isFinite(base)) {
    speed = Math.floor(base / 2)
    speedNote = 'Slowed: halved'
  }
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
  // Set during your own turn, "the end of your next turn" is not this turn's end.
  const held = (sheet.conditionHold ?? []).filter((n) => n !== name)
  sheet.conditionHold = end === 'turnEnd' && sheet.turnActive ? [...held, name] : held
}

export function addCondition(sheet: NimbleSheet, name: string) {
  if (sheet.conditions.includes(name)) return
  sheet.conditions = [...sheet.conditions, name]
  const end = CONDITION_ENDS[name]
  if (end) setConditionEnd(sheet, name, end)
}

export function removeCondition(sheet: NimbleSheet, name: string) {
  sheet.conditions = sheet.conditions.filter((c) => c !== name)
  setConditionEnd(sheet, name, 'manual')
}

export function clearConditionsAt(sheet: NimbleSheet, when: ConditionEnd): string {
  const held = new Set(when === 'turnEnd' ? (sheet.conditionHold ?? []) : [])
  const ending = Object.entries(sheet.conditionEnds ?? {})
    .filter(([name, end]) => end === when && sheet.conditions.includes(name) && !held.has(name))
    .map(([name]) => name)
  if (when === 'turnEnd') sheet.conditionHold = []
  for (const name of ending) removeCondition(sheet, name)
  return ending.length ? ` No longer ${ending.join(' or ')}.` : ''
}

export function dazedAtTurnStart(sheet: NimbleSheet): string {
  if (!sheet.conditions.includes('Dazed')) return ''
  sheet.actionsSpent += 1
  return ' Dazed: you lose 1 action.'
}
