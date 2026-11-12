// Nimble GM's Guide: minion die sizes (p. 26),
// Monster Builder (p. 29), Legendary Monster Builder (p. 43).
// Numbers referenced under the Nimble 3rd Party Creator License
// (Nimble © 2025 Nimble Co.). Art from the books is never used.

export interface MonsterRow {
  /** Monster level as printed: "1/4", "1/3", "1/2", "1" … "20". */
  level: string
  hpNone: number
  hpMedium: number
  hpHeavy: number
  damagePerRound: number
  /** One big attack, or two smaller ones. */
  sampleDice: string
  saveDc: number
  /** Rough 5e challenge rating, for conversions. */
  crEquivalent: string
}

const row = (
  level: string,
  hpNone: number,
  hpMedium: number,
  hpHeavy: number,
  damagePerRound: number,
  sampleDice: string,
  saveDc: number,
  crEquivalent: string,
): MonsterRow => ({
  level,
  hpNone,
  hpMedium,
  hpHeavy,
  damagePerRound,
  sampleDice,
  saveDc,
  crEquivalent,
})

/** Monster Builder table (GM's Guide p. 29). */
export const MONSTER_TABLE: MonsterRow[] = [
  row('1/4', 12, 9, 7, 3, '1d4+1', 9, '1/8'),
  row('1/3', 15, 11, 8, 5, '1d6+2', 9, '1/4'),
  row('1/2', 18, 15, 11, 7, '1d6+3', 10, '1/4'),
  row('1', 26, 20, 16, 11, '2d8+2 or (2×) 1d8+1', 10, '1/2'),
  row('2', 34, 27, 20, 13, '2d8+4 or (2×) 1d8+3', 11, '1'),
  row('3', 41, 33, 25, 15, '2d8+6 or (2×) 1d8+4', 11, '1'),
  row('4', 49, 39, 29, 18, '2d8+9 or (2×) 1d8+5', 12, '2'),
  row('5', 58, 46, 35, 19, '2d8+10 or (2×) 1d8+6', 12, '2'),
  row('6', 68, 54, 41, 21, '2d8+12 or (2×) 1d8+7', 13, '3'),
  row('7', 79, 63, 47, 24, '3d8+10 or (2×) 2d8+4', 13, '3'),
  row('8', 91, 73, 55, 26, '3d8+12 or (2×) 2d8+5', 14, '4'),
  row('9', 104, 83, 62, 28, '4d8+10 or (2×) 2d8+6', 14, '4'),
  row('10', 118, 94, 71, 30, '4d8+12 or (2×) 2d8+7', 15, '5'),
  row('11', 133, 106, 80, 33, '5d8+11 or (2×) 3d8+3', 15, '6'),
  row('12', 149, 119, 89, 35, '5d8+13 or (2×) 3d8+4', 16, '7'),
  row('13', 166, 132, 100, 38, '6d8+11 or (2×) 3d8+6', 16, '8'),
  row('14', 184, 147, 110, 40, '6d8+13 or (2×) 3d8+7', 17, '9'),
  row('15', 203, 162, 122, 43, '7d8+11 or (2×) 3d8+8', 17, '9'),
  row('16', 223, 178, 134, 45, '7d8+13 or (2×) 4d8+5', 18, '10'),
  row('17', 244, 195, 146, 48, '8d8+12 or (2×) 4d8+6', 18, '11'),
  row('18', 266, 213, 160, 50, '8d8+14 or (2×) 4d8+7', 19, '12'),
  row('19', 289, 231, 173, 52, '9d8+12 or (2×) 4d8+8', 19, '13'),
  row('20', 313, 250, 189, 54, '9d8+13 or (2×) 4d8+9', 20, '14'),
]

export interface LegendaryRow {
  /** Party level: legendary stats don't depend on the number of heroes. */
  partyLevel: number
  hpMedium: number
  hpHeavy: number
  /** Extra damage after reaching 0 HP before it dies. */
  hpLastStand: number
  saveDc: number
  attackSmall: number
  attackBig: number
}

/** Legendary Monster Stats by Level (GM's Guide p. 43). Index = party level − 1. */
export const LEGENDARY_TABLE: LegendaryRow[] = Array.from({ length: 20 }, (_, i) => {
  const lvl = i + 1
  return {
    partyLevel: lvl,
    hpMedium: 25 + 25 * lvl,
    hpHeavy: 15 + 20 * lvl,
    hpLastStand: 10 * lvl,
    saveDc: 10 + Math.floor(lvl / 2),
    attackSmall: 7 + lvl,
    attackBig: 2 * (7 + lvl),
  }
})

/** Suggested minion die size by party level (GM's Guide p. 26). Bands overlap in the book at 3, 5, 10, 13 and 17; the lower band wins here. */
export function minionDie(partyLevel: number): string {
  if (partyLevel <= 3) return 'd4'
  if (partyLevel <= 5) return 'd6'
  if (partyLevel <= 10) return 'd8'
  if (partyLevel <= 13) return 'd10'
  if (partyLevel <= 17) return 'd12'
  return 'd20'
}
