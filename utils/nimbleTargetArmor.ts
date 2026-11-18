// The armor of the creature a hero attacks (Core p. 14): Medium armor takes only
// the dice (negative modifiers still apply), Heavy armor half the dice, rounded
// down. Crits, damage the target is vulnerable to, and attacks that ignore armor
// deal full damage; a vulnerable unarmored target takes double.

export type TargetArmor = 'none' | 'medium' | 'heavy'

export const TARGET_ARMORS: { value: TargetArmor; label: string }[] = [
  { value: 'none', label: 'Unarmored' },
  { value: 'medium', label: 'Medium' },
  { value: 'heavy', label: 'Heavy' },
]

/** What the hero is attacking, and what lets this attack past its armor. */
export interface ArmorContext {
  armor: TargetArmor
  vulnerable?: boolean
  /** Why this attack ignores armor ("Vital Shot", "ignores armor"); empty when it doesn't. */
  ignore?: string
  /** One step lighter (Manablade: Heavy counts as Medium, Medium as none). */
  lighter?: boolean
}

const LABEL: Record<TargetArmor, string> = { none: 'no', medium: 'Medium', heavy: 'Heavy' }
const IGNORES = /\bignor(?:es|ing) (?:all |their |its )?armor\b/i

export function ignoresArmor(text: string): boolean {
  return IGNORES.test(text)
}

/** One step lighter, for the Manablade: Heavy counts as Medium, Medium as none. */
export function lighterArmor(armor: TargetArmor): TargetArmor {
  return armor === 'heavy' ? 'medium' : 'none'
}

/** The armor that applies to this attack, and why it differs from the target's. */
export function effectiveArmor(ctx: ArmorContext): { armor: TargetArmor; why: string } {
  if (ctx.armor === 'none') return { armor: 'none', why: '' }
  if (ctx.vulnerable) return { armor: 'none', why: 'vulnerable' }
  if (ctx.ignore) return { armor: 'none', why: ctx.ignore }
  if (ctx.lighter)
    return { armor: lighterArmor(ctx.armor), why: `counts as ${LABEL[lighterArmor(ctx.armor)]}` }
  return { armor: ctx.armor, why: '' }
}

export function throughArmor(dice: number, mods: number, armor: TargetArmor): number {
  const kept = Math.min(0, mods)
  if (armor === 'medium') return Math.max(0, dice + kept)
  if (armor === 'heavy') return Math.max(0, Math.floor(dice / 2) + kept)
  return dice + mods
}

/**
 * A hit's damage against the target, given its total and how much of it came
 * from modifiers, with a note for the result line.
 */
export function armorHit(
  total: number,
  mods: number,
  ctx: ArmorContext,
  crit = false,
): { damage: number; note: string } {
  if (ctx.vulnerable && ctx.armor === 'none')
    return { damage: total * 2, note: ` (vulnerable: doubled from ${total})` }
  if (ctx.armor === 'none') return { damage: total, note: '' }
  if (crit) return { damage: total, note: ` (crit: ${LABEL[ctx.armor]} armor ignored)` }
  const { armor, why } = effectiveArmor(ctx)
  if (armor === 'none')
    return { damage: total, note: ` (${LABEL[ctx.armor]} armor ignored: ${why})` }
  const damage = throughArmor(total - mods, mods, armor)
  const label = `${LABEL[armor]} armor${why ? ` (${LABEL[ctx.armor]} ${why})` : ''}`
  return {
    damage,
    note: damage === total ? ` through ${label}` : ` through ${label}; ${total} if unarmored`,
  }
}

/**
 * A damage expression as it lands on the target: Medium drops positive flat
 * terms ("1d6+2 +2d4" → "1d6+2d4"), Heavy halves the dice ("½(1d6+2d4)").
 * `rolled` is dice already rolled (held Fury or Judgment Dice), which count as
 * dice. Empty when armor changes nothing, so the card keeps its own damage.
 */
export function armorDice(dmg: string, ctx: ArmorContext, rolled = 0): string {
  if (ctx.vulnerable && ctx.armor === 'none') return `2×(${dmg})`
  const { armor } = effectiveArmor(ctx)
  if (armor === 'none') return ''
  const times = /^(\d+×)\((.*)\)$/.exec(dmg.trim())
  const body = times ? times[2]! : dmg
  const terms = body.replace(/\s+/g, '').match(/[+-]?[^+-]+/g) ?? []
  const kept = terms
    .filter((t) => /d\d/.test(t) || t.startsWith('-'))
    .join('+')
    .replace(/\+\+/g, '+')
    .replace(/\+-/g, '-')
    .replace(/^\+/, '')
  const withRolled = [kept, rolled ? String(rolled) : ''].filter(Boolean).join('+')
  if (!withRolled) return '0'
  const dice = armor === 'heavy' ? `½(${withRolled})` : withRolled
  return times ? `${times[1]}(${dice})` : dice
}

/** Why the shown damage differs from the weapon's own, for its tooltip. */
export function armorDiceWhy(dmg: string, ctx: ArmorContext): string {
  if (ctx.armor === 'none' && !ctx.vulnerable) return ''
  if (ctx.vulnerable && ctx.armor === 'none') return `Vulnerable: double damage (${dmg})`
  const { armor, why } = effectiveArmor(ctx)
  if (armor === 'none') return `${LABEL[ctx.armor]} armor ignored: ${why}`
  return `${armor === 'medium' ? 'Medium armor: dice only' : 'Heavy armor: half the dice, no modifiers'}${why ? ` (${LABEL[ctx.armor]} ${why})` : ''}; ${dmg} unarmored. Crits ignore armor.`
}

/** How the target's armor met an attack, for a result line: " through Heavy armor". */
export function armorLabel(ctx: ArmorContext): string {
  if (ctx.armor === 'none') return ctx.vulnerable ? ' (vulnerable: doubled)' : ''
  const { armor, why } = effectiveArmor(ctx)
  if (armor === 'none') return ` (${LABEL[ctx.armor]} armor ignored: ${why})`
  return ` through ${LABEL[armor]} armor`
}

/** What to tell a player who rolls their own dice about the target's armor. */
export function armorRule(ctx: ArmorContext): string {
  const { armor, why } = effectiveArmor(ctx)
  if (ctx.vulnerable && ctx.armor === 'none') return ' Vulnerable: double the damage.'
  if (ctx.armor === 'none') return ''
  if (armor === 'none') return ` ${LABEL[ctx.armor]} armor ignored (${why}).`
  return armor === 'medium'
    ? ' Medium armor: count only the dice (negative modifiers still apply); a crit ignores it.'
    : ' Heavy armor: half the dice, rounded down, no positive modifiers; a crit ignores it.'
}
