// Spell effects read from the spell text (Nimble Core pp. 46–51): what a spell
// needs before it can be cast (Overload: you are Charged; Ignite: a Smoldering
// target), what casting does to the caster's own Charged, and what a hit or crit
// puts on the target (Flame Dart's Smoldering, Ice Lance's Slowed). The target's
// statuses live in the attack target (`useAttackTarget`), since the app doesn't
// track enemies.
import type { SpellDef } from '~/data/nimble/types'
import type { NimbleSheet } from '~/types/sheets'
import { spellByName } from '~/data/nimble/spells'
import type { NimbleRollRules } from '~/utils/dice'
import { keyStatValue } from '~/utils/nimbleBuild'
import { addCondition, removeCondition } from '~/utils/nimbleConditions'

/** The parts of the attack target a spell can need or change. */
export interface SpellTarget {
  smoldering: boolean
  hampered: boolean
  /** Hampered only by a spell's Slowed: it ends at the start of your next turn. */
  hamperedUntilTurn?: boolean
  /** Condemn: advantage on the next attack against it. */
  condemned?: number
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
const CONDEMNS = /\bThe next attack against that enemy is made with advantage\b/
const UPCAST_ADVANTAGE = /\bUpcast:[^.]*\+1 advantage\b/
const DIE_BUMP = /\bUpcast: Increase the result of ANY die by (\d+)\b/
const MAX_CRITS_HAMPERED =
  /\bIf any die rolls the max against a Hampered target, this counts as a crit\b/
/** Conditions that make a creature Hampered (Core p. 47 sidebar). */
const HAMPERING = /\b(Slowed|Dazed|Grappled|Restrained|Prone)\b/

const ENCHANTED = /\bA weapon you touch is enchanted\b[^.]*\. It deals \+KEY damage\b/
const ENCHANT_UPCAST = /\bUpcast: \+KEY damage\b/
const ENCHANT_SMOLDERS = /\binflicts Smoldering on crit\b/

const charged = (sheet: NimbleSheet) => sheet.conditions.includes('Charged')

const DEFENDS_FREE = /\bDefend for free\b/
const UPCAST_ARMOR = /\bUpcast:[^.]*\+(\d+) [Aa]rmor\b/
const UPCAST_RETALIATION = /\bUpcast:[^.]*\+(\d+) damage\b/
const RETALIATION = /\bsuffer (\d+d\d+) damage\b/
const DYING_DISCOUNT = /\bCosts (\d+) mana less while Dying\b/

/**
 * A reaction spell that Defends for free (Barrier of Wind, Shield of Justice, Dread
 * Visage, Frost Shield): what the block takes off, with the upcast's armor, and Dread
 * Visage's damage to melee attackers with its upcast.
 */
export function freeDefend(spell: SpellDef, at: number, armor: number): string {
  if (!DEFENDS_FREE.test(spell.desc)) return ''
  const tiers = Math.max(0, at - spell.tier)
  const extra = Number(UPCAST_ARMOR.exec(spell.desc)?.[1] ?? 0) * tiers
  const block = ` Defend for free: block ${armor + extra} damage${extra ? ` (Armor ${armor} +${extra} upcast)` : ''}.`
  const dice = RETALIATION.exec(spell.desc)?.[1]
  const more = Number(UPCAST_RETALIATION.exec(spell.desc)?.[1] ?? 0) * tiers
  return dice && more ? `${block} Melee attackers who attack you suffer ${dice}+${more}.` : block
}

/** Dread Visage: mana off while Dying. */
export function dyingDiscount(sheet: NimbleSheet, spell: SpellDef): number {
  return sheet.dying ? Number(DYING_DISCOUNT.exec(spell.desc)?.[1] ?? 0) : 0
}

const HEAL_DICE = /\bHeal a creature (\d+)d(\d+)\+KEY HP\b/
const HEAL_UPCAST = /\bUpcast:[^.]*\+1d\d+ healing\b/
const HEAL_CONDITION = /\bIf (\d+)\+ mana is spent, you may also heal 1 negative condition\b/
const DRAIN =
  /\bGain (\d+) Wounds?\. Deal (\d+)d(\d+) to all adjacent creatures and heal HP equal to the damage done\b/
const WARDS = /\bDesignate a willing creature as your ward\b/

/**
 * Heal's dice: 1d6+KEY, +1d6 per upcast tier (taking the +1d6 healing upcast), and
 * whether the mana spent also heals a condition or Wound.
 */
export function healDice(
  sheet: NimbleSheet,
  spell: SpellDef,
  at: number,
  mana: number,
): { count: number; sides: number; mod: number; cleanse: boolean } | null {
  const m = HEAL_DICE.exec(spell.desc)
  if (!m) return null
  const tiers = HEAL_UPCAST.test(spell.desc) ? Math.max(0, at - spell.tier) : 0
  const min = Number(HEAL_CONDITION.exec(spell.desc)?.[1] ?? Infinity)
  return {
    count: Number(m[1]) + tiers,
    sides: Number(m[2]),
    mod: keyStatValue(sheet)?.value ?? 0,
    cleanse: mana >= min,
  }
}

/** Vampiric Greed: the Wounds it costs and the damage it deals and heals. */
export function lifeDrain(
  spell: SpellDef,
): { wounds: number; count: number; sides: number } | null {
  const m = DRAIN.exec(spell.desc)
  return m ? { wounds: Number(m[1]), count: Number(m[2]), sides: Number(m[3]) } : null
}

/** Warding Bond, cast: what the caster and the ward do with damage from now on. */
export function wardNote(spell: SpellDef): string {
  return WARDS.test(spell.desc)
    ? ' Your ward turns on Warded: they take half damage from attacks, and you take the other half when they are hit.'
    : ''
}

const MISS_HITS_YOU = /\bOn miss: [^.]*\bstrikes you instead\b/

/** Zap, Arc Lightning: a miss strikes the caster instead. */
export function missHitsCaster(spell: SpellDef): boolean {
  return MISS_HITS_YOU.test(spell.desc)
}

/** Why the spell can't be cast right now, or '' when nothing stops it. */
export function spellNeeds(sheet: NimbleSheet, spell: SpellDef, target: SpellTarget): string {
  if (NEEDS_CHARGED.test(spell.desc) && !charged(sheet)) return 'Needs you Charged'
  if (SMOLDERING_TARGET.test(spell.desc) && !target.smoldering) return 'Target isn’t Smoldering'
  return ''
}

/** The target status a spell needs, for a checkbox on its card (Ignite: Smoldering). */
export function targetNeed(spell: SpellDef): { key: 'smoldering'; label: string } | null {
  return SMOLDERING_TARGET.test(spell.desc) ? { key: 'smoldering', label: 'Smoldering' } : null
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

/**
 * The roll's own crit rules (Shatter): against a Hampered target a max on any die
 * counts as a crit, a full one (the Primary Die rolls again); its upcast raises a
 * die by 1 per tier, first towards that max.
 */
export function spellRollRules(spell: SpellDef, at: number, target: SpellTarget): NimbleRollRules {
  const perTier = Number(DIE_BUMP.exec(spell.desc)?.[1] ?? 0)
  return {
    critOnAnyMax: MAX_CRITS_HAMPERED.test(spell.desc) && target.hampered,
    bump: perTier * Math.max(0, at - spell.tier),
  }
}

/** Extra damage a crit adds (Shatter: +20, +5 per upcast tier). */
export function critBonus(spell: SpellDef, at: number): number {
  const base = Number(CRIT_BONUS.exec(spell.desc)?.[1] ?? 0)
  const upcast = Number(UPCAST_CRIT_BONUS.exec(spell.desc)?.[1] ?? 0)
  return base ? base + upcast * Math.max(0, at - spell.tier) : 0
}

/** What a crit alone puts on the target (Flame Dart: Smoldering), for the app's roll and "It crit". */
export function spellOnCrit(
  spell: SpellDef,
  target: SpellTarget,
): { note: string; target: SpellTarget; chips: string[] } {
  const crit = ON_CRIT.exec(spell.desc)?.[1]
  if (!crit || CRIT_BONUS.test(spell.desc)) return { note: '', target, chips: [] }
  const sets = /\bSmoldering\b/.test(crit) && !target.smoldering
  return {
    note: ` On crit: ${crit}.`,
    target: sets ? { ...target, smoldering: true } : target,
    chips: sets ? ['turn on Smoldering'] : [],
  }
}

/**
 * What a hit or crit puts on the target: a note for the result line, the target's
 * statuses after it (Smoldering from Flame Dart's crit, ended by Ignite; Hampered
 * from Ice Lance's Slowed, until your next turn), and the Target row chips that
 * changed, for players who roll their own dice to set by hand.
 */
export function spellOnHit(
  spell: SpellDef,
  out: { miss: boolean; crit: boolean },
  target: SpellTarget,
  at = spell.tier,
): { note: string; target: SpellTarget; chips: string[] } {
  if (out.miss) return { note: '', target, chips: [] }
  let next = { ...target }
  const notes: string[] = []
  const chips: string[] = []
  const hit = ON_HIT.exec(spell.desc)?.[1]
  if (hit) {
    notes.push(`On hit: ${hit}.`)
    if (HAMPERING.test(hit) && !target.hampered) {
      next.hampered = true
      // Slowed lasts through the target's next turn, which has passed by yours.
      next.hamperedUntilTurn = /\bSlowed\b/.test(hit)
      chips.push('turn on Hampered')
    }
  }
  if (out.crit) {
    const crit = spellOnCrit(spell, next)
    next = crit.target
    if (crit.note) notes.push(crit.note.trim())
    chips.push(...crit.chips)
  }
  if (CONDEMNS.test(spell.desc)) {
    const n = 1 + (UPCAST_ADVANTAGE.test(spell.desc) ? Math.max(0, at - spell.tier) : 0)
    next.condemned = n
    notes.push(`The next attack against it has ${n > 1 ? `${n}× ` : ''}advantage.`)
    chips.push('turn on Condemned')
  }
  if (ENDS_SMOLDERING.test(spell.desc) && target.smoldering) {
    next.smoldering = false
    notes.push('Its Smoldering ends.')
    chips.push('turn off Smoldering')
  }
  return { note: notes.length ? ` ${notes.join(' ')}` : '', target: next, chips }
}

/**
 * The hero's weapon while a spell they cast enchants it (Enchant Weapon): +KEY damage,
 * +KEY more per upcast tier, and whether a crit sets the target Smoldering.
 */
export function weaponEnchantment(
  sheet: NimbleSheet,
): { spell: string; damage: number; smoldering: boolean; text: string } | null {
  for (const e of sheet.effects) {
    const spell = spellByName(e.source)
    if (!spell || !ENCHANTED.test(spell.desc)) continue
    const key = keyStatValue(sheet)?.value ?? 0
    const tiers = 1 + (ENCHANT_UPCAST.test(spell.desc) ? (e.upcast ?? 0) : 0)
    return {
      spell: spell.name,
      damage: key * tiers,
      smoldering: ENCHANT_SMOLDERS.test(spell.desc),
      text: spell.desc,
    }
  }
  return null
}
