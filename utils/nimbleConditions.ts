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
const ATTACK_DISADVANTAGE: Record<string, string> = {
  Blinded: 'your attacks have disadvantage',
  Prone: 'disadvantage on attacks',
  Poisoned: 'disadvantage on rolls',
}

export interface ConditionMods {
  disadvantage: number
  notes: string[]
  hints: string[]
  incapacitated: string
  speed: number | null
  speedNote: string
}

export function conditionMods(sheet: NimbleSheet): ConditionMods {
  const has = (name: string) => sheet.conditions.includes(name)
  const notes: string[] = []
  let disadvantage = 0
  for (const [name, why] of Object.entries(ATTACK_DISADVANTAGE))
    if (has(name)) {
      disadvantage += 1
      notes.push(`${name}: +1 disadvantage (${why})`)
    }
  if (has('Invisible')) {
    disadvantage -= 1
    notes.push('Invisible: advantage')
  }
  const hints = [
    has('Frightened') ? 'Frightened: disadvantage while the source is nearby' : '',
    has('Taunted') ? 'Taunted: disadvantage unless you attack your taunter' : '',
  ].filter(Boolean)
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
  return { disadvantage, notes, hints, incapacitated, speed, speedNote }
}

export function setConditionEnd(sheet: NimbleSheet, name: string, end: ConditionEnd | 'manual') {
  const ends = { ...sheet.conditionEnds }
  if (end === 'manual') delete ends[name]
  else ends[name] = end
  sheet.conditionEnds = ends
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
  const ending = Object.entries(sheet.conditionEnds ?? {})
    .filter(([name, end]) => end === when && sheet.conditions.includes(name))
    .map(([name]) => name)
  for (const name of ending) removeCondition(sheet, name)
  return ending.length ? ` No longer ${ending.join(' or ')}.` : ''
}

export function dazedAtTurnStart(sheet: NimbleSheet): string {
  if (!sheet.conditions.includes('Dazed')) return ''
  sheet.actionsSpent += 1
  return ' Dazed: you lose 1 action.'
}
