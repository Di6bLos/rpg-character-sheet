// The armor of the creature a hero attacks (Core p. 14): Medium armor takes only
// the dice (negative modifiers still apply), Heavy armor half the dice, rounded
// down. Crits, and attacks that say they ignore armor, deal full damage.

export type TargetArmor = 'none' | 'medium' | 'heavy'

export const TARGET_ARMORS: { value: TargetArmor; label: string }[] = [
  { value: 'none', label: 'Unarmored' },
  { value: 'medium', label: 'Medium' },
  { value: 'heavy', label: 'Heavy' },
]

const LABEL: Record<TargetArmor, string> = { none: 'no', medium: 'Medium', heavy: 'Heavy' }
const IGNORES = /\bignor(?:es|ing) (?:all )?armor\b/i

export function ignoresArmor(text: string): boolean {
  return IGNORES.test(text)
}

/** One step lighter, for the Manablade: Heavy counts as Medium, Medium as none. */
export function lighterArmor(armor: TargetArmor): TargetArmor {
  return armor === 'heavy' ? 'medium' : 'none'
}

export function throughArmor(dice: number, mods: number, armor: TargetArmor): number {
  const kept = Math.min(0, mods)
  if (armor === 'medium') return Math.max(0, dice + kept)
  if (armor === 'heavy') return Math.max(0, Math.floor(dice / 2) + kept)
  return dice + mods
}

/**
 * A hit's damage against the target's armor, given its total and how much of it
 * came from modifiers, with a note for the result line.
 */
export function armorHit(
  total: number,
  mods: number,
  armor: TargetArmor,
  opts: { crit?: boolean; text?: string } = {},
): { damage: number; note: string } {
  if (armor === 'none') return { damage: total, note: '' }
  if (opts.crit) return { damage: total, note: ` (crit: ${LABEL[armor]} armor ignored)` }
  if (opts.text && ignoresArmor(opts.text))
    return { damage: total, note: ` (ignores ${LABEL[armor]} armor)` }
  const damage = throughArmor(total - mods, mods, armor)
  return {
    damage,
    note:
      damage === total
        ? ` through ${LABEL[armor]} armor`
        : ` through ${LABEL[armor]} armor (${total} if unarmored)`,
  }
}

/** What to tell a player who rolls their own dice about the target's armor. */
export function armorRule(armor: TargetArmor, text = ''): string {
  if (armor === 'none' || ignoresArmor(text)) return ''
  return armor === 'medium'
    ? ' Medium armor: count only the dice (negative modifiers still apply); a crit ignores it.'
    : ' Heavy armor: half the dice, rounded down, no positive modifiers; a crit ignores it.'
}
