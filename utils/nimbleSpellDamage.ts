import type { SpellDef } from '~/data/nimble/types'
import type { NimbleSheet, NimbleStat } from '~/types/sheets'
import { parseDice, rollDie, rollNimble, type Rng } from '~/utils/dice'
import { keyStatValue } from '~/utils/nimbleBuild'

export interface SpellDamage {
  dice: string
  text: string
  type: string
  single: boolean
  rollable: boolean
}

const SCHOOL_TYPE: Record<string, string> = {
  fire: 'fire',
  ice: 'cold',
  lightning: 'lightning',
  radiant: 'radiant',
  necrotic: 'necrotic',
}
const TYPES =
  /\b(fire|cold|lightning|radiant|necrotic|psychic|piercing|slashing|bludgeoning|acid|poison)\b(?: or (\w+))?/
const DIE_STEPS = [4, 6, 8, 10, 12]

function statValue(sheet: NimbleSheet, token: string | undefined): number {
  if (!token) return 0
  if (/^\d+$/.test(token)) return Number(token)
  if (token === 'KEY') return keyStatValue(sheet)?.value ?? 0
  return sheet.stats[token as NimbleStat] ?? 0
}

export function spellDamage(
  sheet: NimbleSheet,
  level: number,
  spell: SpellDef,
  at = spell.tier,
): SpellDamage | null {
  const line = /\bDamage: ([^.]+)/.exec(spell.desc)?.[1]
  if (!line) return null
  const steps = Math.floor(level / 5)
  const typed = TYPES.exec(line)
  let type = typed
    ? typed[2]
      ? `${typed[1]} or ${typed[2]}`
      : typed[1]!
    : (SCHOOL_TYPE[spell.school] ?? '')
  for (const a of sheet.abilities) {
    const alt = /\bYour ([A-Z][\w ]+?) (?:and minions )?can deal (\w+) or (\w+) damage\b/.exec(
      a.desc,
    )
    if (alt?.[1] === spell.name) type = `${alt[2]} or ${alt[3]}`
  }
  const single = /\bSingle Target\b/i.test(spell.cast) && !/\bdoes not miss\b/i.test(line)
  const m = /^(\d+)d(\d+)(?:\+(\d+|KEY|STR|DEX|INT|WIL))?/.exec(line.trim())
  if (!m) return { dice: '', text: line.trim(), type, single, rollable: false }
  let count = Number(m[1])
  let sides = Number(m[2])
  let flat = statValue(sheet, m[3])
  const high = /High Levels: \+(\d+)(d\d+)? damage every 5 levels/.exec(spell.desc)
  if (high && high[2]) count += Number(high[1]) * steps
  else if (high) flat += Number(high[1]) * steps
  if (/High Levels: increment the die size 1 step every 5 levels/.test(spell.desc)) {
    const at0 = DIE_STEPS.indexOf(sides)
    if (at0 >= 0) sides = DIE_STEPS[Math.min(DIE_STEPS.length - 1, at0 + steps)]!
  }
  const upcast = /Upcast: \+(\d+) damage\b/.exec(spell.desc)
  if (upcast && at > spell.tier) flat += Number(upcast[1]) * (at - spell.tier)
  const dice = `${count}d${sides}${flat ? `+${flat}` : ''}`
  return { dice, text: dice, type, single, rollable: true }
}

export function rollSpellDamage(
  damage: SpellDamage,
  rng: Rng = Math.random,
  disadvantage = 0,
): { total: number; miss: boolean; crit: boolean; detail: string } | null {
  const expr = parseDice(damage.dice)
  if (!expr) return null
  if (damage.single) {
    const roll = rollNimble(expr, null, rng, disadvantage)
    return { total: roll.total, miss: roll.miss, crit: roll.crit, detail: roll.dice.join(', ') }
  }
  const rolls = Array.from({ length: expr.count + disadvantage }, () => rollDie(expr.sides, rng))
  const kept = [...rolls].sort((a, b) => a - b).slice(0, expr.count)
  return {
    total: kept.reduce((a, b) => a + b, 0) + expr.mod,
    miss: false,
    crit: false,
    detail: disadvantage ? `${rolls.join(', ')}, kept ${kept.join(', ')}` : rolls.join(', '),
  }
}
