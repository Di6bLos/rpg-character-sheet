import type { SpellDef } from '~/data/nimble/types'
import type { NimbleSheet, NimbleStat } from '~/types/sheets'
import { parseDice, rollDie, rollNimble, showDice, sign, type Rng } from '~/utils/dice'
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
  // "Upcast: +1 DC, +10 damage", "+1d20 damage", "+KEY damage"; not "+1d12 damage when…".
  const upcast = /Upcast:[^.]*?\+(\d+|KEY|STR|DEX|INT|WIL)(d\d+)? damage\b(?! when)/.exec(
    spell.desc,
  )
  const upcastSteps = upcast && at > spell.tier ? at - spell.tier : 0
  const m = /^(\d+)d(\d+)(?:\+(\d+|KEY|STR|DEX|INT|WIL))?/.exec(line.trim())
  if (!m) {
    const extra = upcast && !upcast[2] ? statValue(sheet, upcast[1]) * upcastSteps : 0
    const text = `${line.trim()}${extra ? ` +${extra} (upcast)` : ''}`
    return { dice: '', text, type, single, rollable: false }
  }
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
  if (upcast && upcastSteps) {
    if (upcast[2] === `d${sides}`) count += statValue(sheet, upcast[1]) * upcastSteps
    else if (!upcast[2]) flat += statValue(sheet, upcast[1]) * upcastSteps
  }
  const dice = `${count}d${sides}${flat ? sign(flat) : ''}`
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
  const extra = Math.abs(disadvantage)
  const rolls = Array.from({ length: expr.count + extra }, () => rollDie(expr.sides, rng))
  const order = rolls
    .map((value, index) => ({ value, index }))
    .sort((a, b) => (disadvantage >= 0 ? a.value - b.value : b.value - a.value))
  const kept = order.slice(0, expr.count).map((d) => d.value)
  const total = kept.reduce((a, b) => a + b, 0) + expr.mod
  showDice({
    sides: expr.sides,
    dice: rolls,
    dropped: order.slice(expr.count).map((d) => d.index),
    primary: -1,
    explosions: [],
    extra: null,
    mod: expr.mod,
    total,
    miss: false,
    crit: false,
    odds: disadvantage,
  })
  return {
    total,
    miss: false,
    crit: false,
    detail: disadvantage ? `${rolls.join(', ')}, kept ${kept.join(', ')}` : rolls.join(', '),
  }
}
