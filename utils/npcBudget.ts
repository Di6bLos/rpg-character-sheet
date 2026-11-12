// Stat budgets for the AI NPC generator, from the Nimble GM's Guide tables
// (data/nimble/monsters.ts). The budget goes into the prompt as fixed numbers,
// and the draft that comes back is checked against it.
import {
  LEGENDARY_TABLE,
  MONSTER_TABLE,
  minionDie,
  type LegendaryRow,
  type MonsterRow,
} from '~/data/nimble/monsters'
import type { GameSystem, StatBlock } from '~/types'

export type Threat = 'Minion' | 'Standard' | 'Elite' | 'Boss'

/** Elite foes are built from the row this many levels up ("1 or 2 levels higher", GM's Guide). */
export const ELITE_STEP = 2
/** How far a draft may stray from the table before it's flagged. */
export const TOLERANCE = 0.25

export const NIMBLE_MONSTER_LEVELS = MONSTER_TABLE.map((r) => r.level)
export const PARTY_LEVELS = Array.from({ length: 20 }, (_, i) => String(i + 1))
const CR_5E = ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))]
const LEVELS_PF2E = Array.from({ length: 27 }, (_, i) => String(i - 1))

/** Minions and legendary monsters are sized by the party's level, not their own. */
export function usesPartyLevel(system: GameSystem, threat: Threat) {
  return system === 'nimble' && (threat === 'Minion' || threat === 'Boss')
}

/** Choices for the generator's level picker. */
export function levelOptions(system: GameSystem, threat: Threat): string[] {
  if (system === 'dnd5e') return CR_5E
  if (system === 'pf2e') return LEVELS_PF2E
  return usesPartyLevel(system, threat) ? PARTY_LEVELS : NIMBLE_MONSTER_LEVELS
}

/** Closest option to a party level, for the picker's default. */
export function defaultLevel(system: GameSystem, threat: Threat, partyLevel: number): string {
  const options = levelOptions(system, threat)
  const want = String(Math.min(20, Math.max(1, Math.round(partyLevel || 1))))
  return options.includes(want) ? want : (options[0] ?? '1')
}

export type NimbleBudget =
  | { threat: 'Minion'; partyLevel: number; die: string }
  | { threat: 'Standard' | 'Elite'; row: MonsterRow; asked: string }
  | { threat: 'Boss'; partyLevel: number; row: LegendaryRow }

export function nimbleBudget(threat: Threat, level: string): NimbleBudget | null {
  if (threat === 'Minion' || threat === 'Boss') {
    const partyLevel = Number(level)
    if (!Number.isInteger(partyLevel) || partyLevel < 1 || partyLevel > 20) return null
    if (threat === 'Minion') return { threat, partyLevel, die: minionDie(partyLevel) }
    const row = LEGENDARY_TABLE[partyLevel - 1]
    return row ? { threat, partyLevel, row } : null
  }
  const i = MONSTER_TABLE.findIndex((r) => r.level === level)
  if (i < 0) return null
  const step = threat === 'Elite' ? ELITE_STEP : 0
  const row = MONSTER_TABLE[Math.min(MONSTER_TABLE.length - 1, i + step)]
  return row ? { threat, row, asked: level } : null
}

/** Targets written into the prompt, one rule per line. */
export function budgetLines(b: NimbleBudget): string[] {
  const src = "Nimble GM's Guide"
  if (b.threat === 'Minion') {
    return [
      `Targets (${src}, minions for a level ${b.partyLevel} party): minions have no HP and die to any damage; they can't crit.`,
      `Each attack is a single ${b.die} with no modifier, e.g. "Stab. 1${b.die} (follows minion rules)."`,
      'Set hp to 0, top "HP" to "–", and put "Minion" in Traits. Level 1/4 to 1/2.',
    ]
  }
  if (b.threat === 'Boss') {
    const r = b.row
    return [
      `Targets (${src}, Legendary Monster Builder, party level ${b.partyLevel}; these don't change with the number of heroes):`,
      `HP ${r.hpMedium} in Medium armor or ${r.hpHeavy} in Heavy armor (use at least Medium, or give an unarmored one another defence). Last Stand: dies after ${r.hpLastStand} more damage.`,
      `Two actions to choose from after each hero's turn: a small attack that moves or repositions for about ${r.attackSmall} damage, and a big attack for about ${r.attackBig} damage. Save DC ${r.saveDc}.`,
      'Add a Bloodied ability at half HP and a Last Stand section. Level is the party level.',
    ]
  }
  const r = b.row
  const elite =
    b.threat === 'Elite'
      ? ` An elite level ${b.asked} foe is built as a level ${r.level} monster; write level "${r.level}".`
      : ` Write level "${r.level}".`
  return [
    `Targets (${src}, Monster Builder, level ${r.level}):${elite}`,
    `HP ${r.hpNone} unarmored, ${r.hpMedium} in Medium armor, or ${r.hpHeavy} in Heavy armor: pick the armor, then use its HP.`,
    `About ${r.damagePerRound} damage per round, e.g. ${r.sampleDice}. Save DC ${r.saveDc}. Default to d8s; any die size is fine if the damage per round holds.`,
    'For each special ability beyond the basic attack, lower HP or damage by one row (about one level), and say so in assumptions.',
  ]
}

/** Short summary shown under the level picker. */
export function budgetSummary(b: NimbleBudget): string {
  if (b.threat === 'Minion') return `No HP, attacks with 1${b.die}`
  if (b.threat === 'Boss')
    return `${b.row.hpMedium} HP (Medium) · attacks ~${b.row.attackSmall} / ~${b.row.attackBig} · Last Stand ${b.row.hpLastStand}`
  const built = b.threat === 'Elite' ? `Built as level ${b.row.level}: ` : ''
  return `${built}${b.row.hpNone} HP (no armor) · ${b.row.hpMedium} (Medium) · ${b.row.hpHeavy} (Heavy) · ~${b.row.damagePerRound} damage a round`
}

// --- Checking a draft ----------------------------------------------------------------

const DICE = /(\d+)\s*d\s*(\d+)(?:\s*([+-])\s*(\d+))?/i
const TIMES = /\((\d+)\s*[×x]\)/i

/** Average damage of one action: the first dice expression, times any "(2×)". */
export function actionAverage(name: string, text: string): number | null {
  const m = DICE.exec(text) ?? DICE.exec(name)
  if (!m) return null
  const count = Number(m[1])
  const sides = Number(m[2])
  const mod = m[4] ? Number(m[4]) * (m[3] === '-' ? -1 : 1) : 0
  const times = Number((TIMES.exec(name) ?? TIMES.exec(text))?.[1] ?? 1)
  return ((count * (sides + 1)) / 2 + mod) * times
}

function armorOf(block: StatBlock): 'none' | 'medium' | 'heavy' {
  const v = (block.top?.find(([k]) => k === 'Armor')?.[1] ?? '').trim().toLowerCase()
  if (v.startsWith('h')) return 'heavy'
  if (v.startsWith('m')) return 'medium'
  return 'none'
}

function hpOf(block: StatBlock): number | null {
  if (typeof block.hp === 'number') return block.hp
  const v = block.top?.find(([k]) => k === 'HP')?.[1]
  const n = v ? parseInt(v, 10) : NaN
  return Number.isFinite(n) ? n : null
}

function actionAverages(block: StatBlock): number[] {
  return (block.sections ?? [])
    .filter((s) => /actions/i.test(s.title))
    .flatMap((s) => s.items.map((i) => actionAverage(i.n, i.t)))
    .filter((n): n is number => n !== null)
}

const off = (actual: number, target: number) =>
  target > 0 && Math.abs(actual - target) / target > TOLERANCE

const ARMOR_LABEL = { none: 'no armor', medium: 'Medium armor', heavy: 'Heavy armor' }

/** Plain-language notes where a Nimble draft strays from the GM's Guide budget. */
export function checkNimbleDraft(block: StatBlock, b: NimbleBudget): string[] {
  const notes: string[] = []
  const hp = hpOf(block)
  const armor = armorOf(block)
  const best = Math.max(0, ...actionAverages(block))

  if (b.threat === 'Minion') {
    if (hp) notes.push(`Minions have no HP in Nimble, but this one has ${hp}.`)
    return notes
  }

  if (b.threat === 'Boss') {
    const r = b.row
    if (armor === 'none')
      notes.push(
        'Legendary monsters usually have at least Medium armor. Without it, give it another defence.',
      )
    const target = armor === 'heavy' ? r.hpHeavy : r.hpMedium
    if (hp !== null && off(hp, target))
      notes.push(
        `HP ${hp} is ${hp > target ? 'above' : 'below'} the ${target} the GM's Guide gives a legendary monster in ${ARMOR_LABEL[armor === 'none' ? 'medium' : armor]} at party level ${b.partyLevel}.`,
      )
    if (best && off(best, r.attackBig))
      notes.push(
        `Its biggest attack averages ${Math.round(best)} damage; the guide suggests about ${r.attackBig} at party level ${b.partyLevel}.`,
      )
    return notes
  }

  const r = b.row
  const target = armor === 'heavy' ? r.hpHeavy : armor === 'medium' ? r.hpMedium : r.hpNone
  if (hp !== null && off(hp, target))
    notes.push(
      `HP ${hp} is ${hp > target ? 'above' : 'below'} the ${target} the GM's Guide gives a level ${r.level} monster with ${ARMOR_LABEL[armor]}.`,
    )
  if (best && off(best, r.damagePerRound))
    notes.push(
      `Its best action averages ${Math.round(best)} damage a round; the guide suggests about ${r.damagePerRound} at level ${r.level}.`,
    )
  return notes
}
