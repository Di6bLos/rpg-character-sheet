// Small pure helpers on Nimble class data and ability names, shared by utils/nimbleBuild.ts
// and utils/nimbleWornArmor.ts (which nimbleBuild imports, so they can't live in nimbleBuild).
import type { ClassDef } from '~/data/nimble/types'

/** An upgraded ability's name: "Sneak Attack (2)". */
export const UPGRADE = /^(.*) \((\d+)\)$/

/** True once the class table has granted a per-level flag (Swift Feet, Iron Defense (2)…). */
export function classFlagAt(
  cls: ClassDef,
  level: number,
  flag: 'initiativePerLevel' | 'meleeDamagePerLevel' | 'armorDoubled',
): boolean {
  for (let l = 1; l <= level; l++) if (cls.levels[l]?.[flag]) return true
  return false
}

/** Base name of an ability: "Sneak Attack (3)" is "Sneak Attack". */
export function abilityBaseName(name: string): string {
  return UPGRADE.exec(name)?.[1] ?? name
}
