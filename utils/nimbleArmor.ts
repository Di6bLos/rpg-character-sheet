import type { NimbleStat } from '~/types/sheets'

const ABILITY_ARMOR =
  /(?:^|[.!]\s)Gain \+?(STR|DEX|INT|WIL|\d+) armor\b(?!\s+(?:if|while|when|until)\b)/

export function abilityArmor(sheet: {
  abilities: { desc: string }[]
  stats: Record<NimbleStat, number>
}): number {
  return sheet.abilities.reduce((sum, a) => {
    const m = ABILITY_ARMOR.exec(a.desc)?.[1]
    if (!m) return sum
    return sum + (/^\d+$/.test(m) ? Number(m) : (sheet.stats[m as NimbleStat] ?? 0))
  }, 0)
}
