// Spell effects read from the spell text (Nimble Core pp. 46–51): what a spell
// needs before it can be cast (Overload: you are Charged; Ignite: a Smoldering
// target), what casting does to the caster's own Charged, and what a hit or crit
// puts on the target (Flame Dart's Smoldering, Ice Lance's Slowed). The target's
// statuses live in the attack target (`useAttackTarget`), since the app doesn't
// track enemies.
import type { SpellDef } from '~/data/nimble/types'
import type { NimbleSheet } from '~/types/sheets'
import { addCondition, removeCondition } from '~/utils/nimbleConditions'

/** The parts of the attack target a spell can need or change. */
export interface SpellTarget {
  smoldering: boolean
  hampered: boolean
}

const NEEDS_CHARGED = /\bCastable only if you are Charged\b/
const SMOLDERING_TARGET = /\bto a Smoldering target\b/
const CHARGED_COST = /\bCosts (\d+) Actions? while Charged, ending the condition\b/
const GAINS_CHARGED = /\byou gain the Charged condition\b/
const ENDS_SMOLDERING = /\bending the condition on hit\b/
const ON_HIT = /\bOn hit: ([^.]+)\./
const ON_CRIT = /\bOn crit: ([^.]+)\./
const CRIT_BONUS = /\bOn crit: \+(\d+) damage\b/
const UPCAST_CRIT_BONUS = /\+(\d+) damage on crit\b/
const MAX_CRITS_HAMPERED =
  /\bIf any die rolls the max against a Hampered target, this counts as a crit\b/
/** Conditions that make a creature Hampered (Core p. 47 sidebar). */
const HAMPERING = /\b(Slowed|Dazed|Grappled|Restrained|Prone)\b/

const charged = (sheet: NimbleSheet) => sheet.conditions.includes('Charged')

/** Why the spell can't be cast right now, or '' when nothing stops it. */
export function spellNeeds(sheet: NimbleSheet, spell: SpellDef, target: SpellTarget): string {
  if (NEEDS_CHARGED.test(spell.desc) && !charged(sheet)) return 'Needs you Charged'
  if (SMOLDERING_TARGET.test(spell.desc) && !target.smoldering) return 'Target isn’t Smoldering'
  return ''
}

/** Electrickery's action cost while Charged, or null when the spell's own cost stands. */
export function chargedActions(sheet: NimbleSheet, spell: SpellDef): number | null {
  const n = CHARGED_COST.exec(spell.desc)?.[1]
  return n && charged(sheet) ? Number(n) : null
}

/** What casting does to the caster's own Charged: spent (Overload, Electrickery) or gained (Alacrity). */
export function spellSelfEffects(sheet: NimbleSheet, spell: SpellDef): string {
  if ((NEEDS_CHARGED.test(spell.desc) || chargedActions(sheet, spell) !== null) && charged(sheet)) {
    removeCondition(sheet, 'Charged')
    return ' No longer Charged.'
  }
  if (GAINS_CHARGED.test(spell.desc) && !charged(sheet)) {
    addCondition(sheet, 'Charged')
    return ' You are Charged.'
  }
  return ''
}

/** Shatter: a max on any die against a Hampered target counts as a crit. */
export function critsOnAnyMax(spell: SpellDef, target: SpellTarget, dice: number[], sides: number) {
  return MAX_CRITS_HAMPERED.test(spell.desc) && target.hampered && dice.some((d) => d === sides)
}

/** Extra damage a crit adds (Shatter: +20, +5 per upcast tier). */
export function critBonus(spell: SpellDef, at: number): number {
  const base = Number(CRIT_BONUS.exec(spell.desc)?.[1] ?? 0)
  const upcast = Number(UPCAST_CRIT_BONUS.exec(spell.desc)?.[1] ?? 0)
  return base ? base + upcast * Math.max(0, at - spell.tier) : 0
}

/**
 * What a hit or crit puts on the target: a note for the result line and the
 * target's statuses after it (Smoldering from Flame Dart's crit, ended by Ignite;
 * Hampered from Ice Lance's Slowed).
 */
export function spellOnHit(
  spell: SpellDef,
  out: { miss: boolean; crit: boolean },
  target: SpellTarget,
): { note: string; target: SpellTarget } {
  if (out.miss) return { note: '', target }
  const next = { ...target }
  const notes: string[] = []
  const hit = ON_HIT.exec(spell.desc)?.[1]
  if (hit) {
    notes.push(`On hit: ${hit}.`)
    if (HAMPERING.test(hit)) next.hampered = true
  }
  const crit = out.crit ? ON_CRIT.exec(spell.desc)?.[1] : undefined
  if (crit && !CRIT_BONUS.test(spell.desc)) {
    notes.push(`On crit: ${crit}.`)
    if (/\bSmoldering\b/.test(crit)) next.smoldering = true
  }
  if (ENDS_SMOLDERING.test(spell.desc) && target.smoldering) {
    next.smoldering = false
    notes.push('Its Smoldering ends.')
  }
  return { note: notes.length ? ` ${notes.join(' ')}` : '', target: next }
}
