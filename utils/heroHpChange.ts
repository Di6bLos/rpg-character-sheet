import type { GameSystem, HeroHpChange } from '~/types'
import type { AnySheet, Dnd5eSheet, NimbleSheet, Pf2eSheet } from '~/types/sheets'
import { heal, takeDamage } from '~/utils/nimblePlay'
import { wardedDamage } from '~/utils/nimbleConditions'

type Change = Pick<HeroHpChange, 'id' | 'amount' | 'crit'>

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

/** Damage off temp HP first, then HP (floor 0). Returns whether HP was above 0 before. */
function hurt(sheet: { hp: number; tempHp?: number }, n: number): boolean {
  const wasUp = sheet.hp > 0
  const temp = Math.max(0, sheet.tempHp ?? 0)
  const fromTemp = Math.min(temp, n)
  sheet.tempHp = temp - fromTemp
  sheet.hp = Math.max(0, sheet.hp - (n - fromTemp))
  return wasUp
}

/** Heals up to max HP. Returns whether the hero was at 0 before. */
function mend(sheet: { hp: number; hpMax: number }, n: number): boolean {
  const wasDown = sheet.hp <= 0
  sheet.hp = Math.min(sheet.hpMax, Math.max(0, sheet.hp) + n)
  return wasDown
}

function tookLine(n: number, crit: boolean, sheet: { hp: number; hpMax: number }) {
  return `GM: took ${n} damage${crit ? ' (crit)' : ''}: ${sheet.hp}/${sheet.hpMax} HP.`
}

/**
 * D&D 5e: damage takes temp HP first, then HP down to 0 (a crit's extra dice are already
 * in the amount); healing caps at max HP, and healing from 0 resets the death saves.
 */
export function applyDnd5eHpChange(sheet: Dnd5eSheet, change: Change): string {
  const n = Math.abs(Math.floor(change.amount))
  if (!n) return ''
  if (change.amount < 0) {
    const wasUp = hurt(sheet, n)
    const down = wasUp && sheet.hp === 0 ? ' Down: roll death saves.' : ''
    return `${tookLine(n, change.crit, sheet)}${down}`
  }
  const wasDown = mend(sheet, n)
  if (wasDown) sheet.deathSaves = { successes: 0, failures: 0 }
  return `GM: healed ${n}: ${sheet.hp}/${sheet.hpMax} HP.${wasDown ? ' Death saves reset.' : ''}`
}

/**
 * Pathfinder 2e: damage takes temp HP first, then HP down to 0; dropping to 0 sets Dying to
 * 1 + Wounded (2 + Wounded on a crit). Healing caps at max HP; healing from 0 ends Dying and
 * raises Wounded by 1.
 */
export function applyPf2eHpChange(sheet: Pf2eSheet, change: Change): string {
  const n = Math.abs(Math.floor(change.amount))
  if (!n) return ''
  const wounded = Math.max(0, sheet.wounded ?? 0)
  if (change.amount < 0) {
    const wasUp = hurt(sheet, n)
    let note = ''
    if (wasUp && sheet.hp === 0) {
      sheet.dying = (change.crit ? 2 : 1) + wounded
      note = ` Dying ${sheet.dying}.`
    }
    return `${tookLine(n, change.crit, sheet)}${note}`
  }
  const wasDown = mend(sheet, n)
  let note = ''
  if (wasDown) {
    sheet.dying = 0
    sheet.wounded = wounded + 1
    note = ` Wounded ${sheet.wounded}.`
  }
  return `GM: healed ${n}: ${sheet.hp}/${sheet.hpMax} HP.${note}`
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
