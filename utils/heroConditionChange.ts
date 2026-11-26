import type { GameSystem, HeroConditionChange } from '~/types'
import type { AnySheet, NimbleSheet, Pf2eSheet } from '~/types/sheets'
import { addCondition, removeCondition } from '~/utils/nimbleConditions'
import { clearEffect } from '~/utils/nimbleEffects'
import { addPersistent, removePersistent } from '~/utils/pf2eDamage'
import { endOnUnconscious } from '~/utils/pf2eEffects'

type Change = Pick<HeroConditionChange, 'id' | 'condition' | 'add'> &
  Partial<Pick<HeroConditionChange, 'persistent_type' | 'persistent_dice'>> & {
    created_at?: string
  }

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
 * off gets one quiet no-op, not "you are Prone" then "no longer Prone". PF2e persistent
 * damage counts per damage type.
 */
export function lastPerCondition<T extends Change>(rows: T[]): T[] {
  const last = new Map<string, T>()
  for (const r of rows) {
    const key = r.persistent_type ? `${r.condition}:${r.persistent_type}` : r.condition
    last.delete(key)
    last.set(key, r)
  }
  return [...last.values()]
}

/**
 * PF2e persistent damage from the GM (gm_set_hero_persistent): the GM's amount replaces any
 * of that type, as the saved sheet already has it; null dice ends it. '' when it matched.
 */
export function applyPersistentChange(sheet: Pf2eSheet, change: Change): string {
  const type = change.persistent_type?.trim().toLowerCase()
  if (!type) return ''
  const had = (sheet.persistent ?? []).find((p) => p.type === type)
  const dice = change.persistent_dice ?? null
  if (!dice) return had ? `GM: ${removePersistent(sheet, type)}` : ''
  if (had?.dice === dice) return ''
  removePersistent(sheet, type)
  return `GM: ${addPersistent(sheet, dice, type)}`
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

/**
 * D&D 5e / PF2e: a plain add or remove on the sheet's condition names (no timed ends), with
 * the message to show the player, or '' when the sheet already matched. Removing a PF2e
 * valued condition drops its value too, as the sheet's own toggle does (an add starts at 1).
 */
export function applyPlainConditionChange(
  sheet: { conditions?: string[]; conditionValues?: Record<string, number> },
  change: Change,
): string {
  const name = change.condition.trim()
  if (!name) return ''
  const list = Array.isArray(sheet.conditions) ? sheet.conditions : (sheet.conditions = [])
  const at = list.indexOf(name)
  if (change.add) {
    if (at >= 0) return ''
    list.push(name)
    return `GM: you are ${name}.`
  }
  if (at < 0) return ''
  list.splice(at, 1)
  if (sheet.conditionValues) delete sheet.conditionValues[name]
  return `GM: no longer ${name}.`
}

/** Applies a GM's condition change with the hero's own system's rules. */
export function applyConditionChangeFor(
  system: GameSystem,
  sheet: AnySheet,
  change: Change,
): string {
  if (system === 'nimble') return applyConditionChange(sheet as NimbleSheet, change)
  if (system === 'pf2e' && change.persistent_type)
    return applyPersistentChange(sheet as Pf2eSheet, change)
  const line = applyPlainConditionChange(sheet, change)
  // PF2e, as the sheet's own toggle: falling unconscious ends Rage (Player Core 2 p. 72).
  if (system !== 'pf2e' || !line || !change.add || change.condition.trim() !== 'Unconscious')
    return line
  const ended = endOnUnconscious(sheet as Pf2eSheet)
  return ended ? `${line} ${ended}` : line
}
