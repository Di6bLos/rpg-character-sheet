import type { HeroHpChange } from '~/types'
import type { NimbleSheet } from '~/types/sheets'
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
