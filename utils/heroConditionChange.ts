import type { HeroConditionChange } from '~/types'
import type { NimbleSheet } from '~/types/sheets'
import { addCondition, removeCondition } from '~/utils/nimbleConditions'
import { clearEffect } from '~/utils/nimbleEffects'

type Change = Pick<HeroConditionChange, 'id' | 'condition' | 'add'> & { created_at?: string }

/**
 * The rows not applied yet, oldest first, marking them taken: the initial load and the
 * live subscription can deliver the same row, and add-then-remove must land in order.
 */
export function freshConditionChanges<T extends Change>(rows: T[], taken: Set<string>): T[] {
  const fresh = rows
    .filter((r) => !taken.has(r.id))
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
  for (const r of fresh) taken.add(r.id)
  return fresh
}

/**
 * The last change per condition, in order: a hero back after the GM toggled Prone on and
 * off gets one quiet no-op, not "you are Prone" then "no longer Prone".
 */
export function lastPerCondition<T extends Change>(rows: T[]): T[] {
  const last = new Map<string, T>()
  for (const r of rows) {
    last.delete(r.condition)
    last.set(r.condition, r)
  }
  return [...last.values()]
}

/**
 * Applies a GM's condition change with the sheet's own rules (addCondition also sets the
 * condition's usual end) and returns the message to show the player, or '' when the sheet
 * already matched.
 */
export function applyConditionChange(sheet: NimbleSheet, change: Change): string {
  const name = change.condition.trim()
  if (!name) return ''
  const has = sheet.conditions.includes(name)
  if (change.add) {
    if (has) return ''
    addCondition(sheet, name)
    return `GM: you are ${name}.`
  }
  if (!has) return ''
  // As the sheet's own toggle: an ability or spell status behind it ends too.
  clearEffect(sheet, name)
  removeCondition(sheet, name)
  return `GM: no longer ${name}.`
}
