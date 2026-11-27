import type { GameSystem, HeroHpChange } from '~/types'
import type { AnySheet, Dnd5eSheet, NimbleSheet, Pf2eSheet } from '~/types/sheets'
import { heal, takeDamage } from '~/utils/nimblePlay'
import { wardedDamage } from '~/utils/nimbleConditions'
import {
  heal as dnd5eHeal,
  isDead as dnd5eIsDead,
  takeDamage as dnd5eTakeDamage,
} from '~/utils/dnd5ePlay'
import {
  heal as pf2eHeal,
  isDead as pf2eIsDead,
  takeDamage as pf2eTakeDamage,
} from '~/utils/pf2ePlay'

type Change = Pick<HeroHpChange, 'id' | 'amount' | 'crit'> &
  Partial<Pick<HeroHpChange, 'damage_type' | 'spell' | 'shield_block'>>

/**
 * The rows not applied yet, oldest first, marking them taken: the initial load and
 * the live subscription can deliver the same row.
 */
export function freshChanges<T extends Change & { created_at?: string }>(
  rows: T[],
  taken: Set<string>,
): T[] {
  const fresh = rows
    .filter((r) => !taken.has(r.id))
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
  for (const r of fresh) taken.add(r.id)
  return fresh
}

/**
 * Applies a GM's HP change with the sheet's own rules (takeDamage for damage, heal for
 * healing, as the Vitals buttons do) and returns the message to show the player.
 */
export function applyHpChange(sheet: NimbleSheet, level: number, change: Change): string {
  const n = Math.abs(Math.floor(change.amount))
  if (!n) return ''
  if (change.amount < 0) {
    const ward = wardedDamage(sheet, n)
    const notes = takeDamage(sheet, ward.taken, level, change.crit)
    const crit = change.crit ? ' (crit)' : ''
    return `GM: took ${ward.taken} damage${crit}: ${sheet.hp}/${sheet.hpMax} HP.${ward.note}${notes ? ` ${notes}` : ''}`
  }
  heal(sheet, n)
  return `GM: healed ${n}: ${sheet.hp}/${sheet.hpMax} HP.`
}

function tookLine(n: number, crit: boolean, sheet: { hp: number; hpMax: number }) {
  return `GM: took ${n} damage${crit ? ' (crit)' : ''}: ${sheet.hp}/${sheet.hpMax} HP.`
}

const DEAD_HEAL = 'GM: healing has no effect: the hero is dead.'

/**
 * D&D 5e, with the sheet's own engine (utils/dnd5ePlay.ts takeDamage / heal): the GM's damage
 * type meets the hero's resistances, immunities and Rage; temp HP first, then HP down to 0
 * (a crit's extra dice are already in the amount); dropping to 0 adds Unconscious (and ends
 * Concentration and Rage) unless Relentless Endurance holds; damage while already at 0 fails a
 * death save (2 on a crit) and ends Stable; damage left over that reaches max HP kills.
 * Healing from 0 resets the death saves and wakes the hero; a dead hero can't be healed.
 */
export function applyDnd5eHpChange(sheet: Dnd5eSheet, change: Change): string {
  const n = Math.abs(Math.floor(change.amount))
  if (!n) return ''
  if (!Array.isArray(sheet.conditions)) sheet.conditions = []
  if (change.amount < 0) {
    const hit = {
      amount: n,
      crit: change.crit,
      ...(change.damage_type ? { type: change.damage_type } : {}),
    }
    return gmLine(dnd5eTakeDamage(sheet, hit).line)
  }
  if (dnd5eIsDead(sheet)) return DEAD_HEAL
  return gmLine(dnd5eHeal(sheet, n))
}

/**
 * Pathfinder 2e, with the sheet's own engine (utils/pf2ePlay.ts takeDamage / heal): the GM's
 * damage type and "from a spell" go through the hero's immunities, weaknesses and resistances,
 * and Shield Block through `shieldBlockProblem` (it says why it can't); then temp HP, knocked
 * out at 0 with Dying 1 + Wounded (2 + Wounded on a crit), Dying raised while down, massive
 * damage, Doomed lowering the Dying value that kills; healing a dying hero ends Dying and
 * raises Wounded, and the dead can't be healed.
 */
export function applyPf2eHpChange(sheet: Pf2eSheet, change: Change): string {
  const n = Math.abs(Math.floor(change.amount))
  if (!n) return ''
  sheet.tempHp = Math.max(0, sheet.tempHp ?? 0)
  sheet.dying = Math.max(0, sheet.dying ?? 0)
  sheet.wounded = Math.max(0, sheet.wounded ?? 0)
  if (!Array.isArray(sheet.conditions)) sheet.conditions = []
  if (change.amount < 0) {
    const line = pf2eTakeDamage(sheet, n, {
      crit: change.crit,
      ...(change.damage_type ? { type: change.damage_type } : {}),
      ...(change.spell ? { spell: true } : {}),
      ...(change.shield_block ? { shieldBlock: true } : {}),
    })
    // While dying the engine only says the new Dying value; the GM's line says the hit too.
    return /\bTook \d/.test(line) ? gmLine(line) : `${tookLine(n, change.crit, sheet)} ${line}`
  }
  if (pf2eIsDead(sheet)) return DEAD_HEAL
  return gmLine(pf2eHeal(sheet, n))
}

/**
 * The engine's line as the GM's: "Took 5 damage…" reads "GM: took 5 damage…"; a line that
 * starts with a note ("Steel Shield blocks 5…", "Resistance…") keeps its capital.
 */
function gmLine(line: string) {
  return `GM: ${/^(?:Took|Healed) /.test(line) ? `${line.charAt(0).toLowerCase()}${line.slice(1)}` : line}`
}

/** Applies a GM's HP change with the hero's own system's rules. */
export function applyHpChangeFor(
  system: GameSystem,
  sheet: AnySheet,
  level: number,
  change: Change,
): string {
  if (system === 'dnd5e') return applyDnd5eHpChange(sheet as Dnd5eSheet, change)
  if (system === 'pf2e') return applyPf2eHpChange(sheet as Pf2eSheet, change)
  return applyHpChange(sheet as NimbleSheet, level, change)
}
