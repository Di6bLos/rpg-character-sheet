import type { GameSystem } from '~/types'

export interface LevelUpRules {
  /** Whether hit points are rolled (or averaged) rather than fixed per level. */
  roll: boolean
  keys: string[]
  points: number
  perStat: number
  boostTitle: string
  boostRule: string
  featLabel: string
  feat2Label: string
  /** Label of the stat added to the hit point gain, when the system has one. */
  hpStat: string | null
}

export const LEVEL_UP_RULES: Record<GameSystem, LevelUpRules> = {
  dnd5e: {
    roll: true,
    keys: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'],
    points: 2,
    perStat: 2,
    boostTitle: 'Ability score improvement',
    boostRule:
      'Spend 2 points: +2 to one score or +1 to two. Only at levels that grant an improvement; otherwise leave unassigned.',
    featLabel: 'Class feature',
    feat2Label: 'Subclass feature or feat',
    hpStat: 'CON',
  },
  pf2e: {
    roll: false,
    keys: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'],
    points: 4,
    perStat: 1,
    boostTitle: 'Attribute boosts',
    boostRule: 'At levels 5, 10, 15 and 20: four boosts, each to a different attribute.',
    featLabel: 'Class feat',
    feat2Label: 'Skill, general or ancestry feat',
    hpStat: 'CON',
  },
  nimble: {
    roll: true,
    keys: ['STR', 'DEX', 'INT', 'WIL'],
    points: 1,
    perStat: 1,
    boostTitle: 'Stat increase',
    boostRule: 'Add +1 to one stat when your class table grants an increase.',
    featLabel: 'Class ability',
    feat2Label: 'Subclass ability',
    hpStat: null,
  },
}

export function averageHp(die: number): number {
  return Math.floor(die / 2) + 1
}

/**
 * Hit points gained on level-up. `base` is the rolled die, its average, or the
 * fixed per-level amount (PF2e); the stat modifier is added, minimum 1.
 */
export function hpGain(base: number, statMod: number): number {
  return Math.max(1, base + statMod)
}

export function pointsUsed(bumps: Record<string, number>): number {
  return Object.values(bumps).reduce((a, b) => a + b, 0)
}

export function canBump(rules: LevelUpRules, bumps: Record<string, number>, key: string): boolean {
  return pointsUsed(bumps) < rules.points && (bumps[key] ?? 0) < rules.perStat
}

export const MAX_LEVEL = 20
