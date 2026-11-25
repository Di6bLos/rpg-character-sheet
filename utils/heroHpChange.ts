import type { GameSystem, HeroHpChange } from '~/types'
import type { AnySheet, Dnd5eSheet, NimbleSheet, Pf2eSheet } from '~/types/sheets'
import { heal, takeDamage } from '~/utils/nimblePlay'
import { wardedDamage } from '~/utils/nimbleConditions'
import { PF2E_DEAD_AT } from '~/utils/roster'

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

/**
 * Damage off temp HP first, then HP (floor 0). Returns whether HP was above 0 before, and
 * the damage left over once HP hit 0.
 */
function hurt(sheet: { hp: number; tempHp?: number }, n: number) {
  const wasUp = sheet.hp > 0
  const temp = Math.max(0, sheet.tempHp ?? 0)
  const fromTemp = Math.min(temp, n)
  sheet.tempHp = temp - fromTemp
  const toHp = n - fromTemp
  const before = Math.max(0, sheet.hp)
  sheet.hp = Math.max(0, before - toHp)
  return { wasUp, overflow: Math.max(0, toHp - before) }
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

const DEAD_HEAL = 'GM: healing has no effect: the hero is dead.'

/** Unconscious at 0 HP: added on dropping to 0, removed on healing from 0 (5e and PF2e). */
function setUnconscious(sheet: { conditions?: string[] }, on: boolean) {
  const list = sheet.conditions ?? []
  const has = list.includes('Unconscious')
  if (on && !has) sheet.conditions = [...list, 'Unconscious']
  else if (!on && has) sheet.conditions = list.filter((c) => c !== 'Unconscious')
}

/**
 * D&D 5e: damage takes temp HP first, then HP down to 0 (a crit's extra dice are already
 * in the amount); dropping to 0 adds Unconscious. Damage while already at 0 fails a death save
 * (2 on a crit, up to 3) and ends Stable (the successes start over); damage left over after 0
 * that reaches max HP is massive damage: dead (3 failures). Healing caps at max HP; healing
 * from 0 resets the death saves and removes Unconscious; a dead hero can't be healed.
 */
export function applyDnd5eHpChange(sheet: Dnd5eSheet, change: Change): string {
  const n = Math.abs(Math.floor(change.amount))
  if (!n) return ''
  const saves = sheet.deathSaves ?? (sheet.deathSaves = { successes: 0, failures: 0 })
  if (change.amount < 0) {
    const { wasUp, overflow } = hurt(sheet, n)
    let note = ''
    if (wasUp && sheet.hp === 0) setUnconscious(sheet, true)
    if (sheet.hp === 0 && overflow >= sheet.hpMax && sheet.hpMax > 0) {
      saves.failures = 3
      note = ' Massive damage: dead.'
    } else if (wasUp && sheet.hp === 0) {
      note = ' Down: roll death saves.'
    } else if (!wasUp && overflow > 0 && saves.failures < 3) {
      if (saves.successes >= 3) saves.successes = 0
      saves.failures = Math.min(3, saves.failures + (change.crit ? 2 : 1))
      note =
        saves.failures >= 3
          ? ' Death save failed (3/3): dead.'
          : ` Death save failed (${saves.failures}/3).`
    }
    return `${tookLine(n, change.crit, sheet)}${note}`
  }
  if (sheet.hp <= 0 && saves.failures >= 3) return DEAD_HEAL
  const wasDown = mend(sheet, n)
  if (wasDown) {
    sheet.deathSaves = { successes: 0, failures: 0 }
    setUnconscious(sheet, false)
  }
  return `GM: healed ${n}: ${sheet.hp}/${sheet.hpMax} HP.${wasDown ? ' Death saves reset.' : ''}`
}

/**
 * Pathfinder 2e: damage takes temp HP first, then HP down to 0; dropping to 0 sets Dying to
 * 1 + Wounded (2 + Wounded on a crit) and adds Unconscious. Damage while already at 0 raises
 * Dying by 1 (2 on a crit) while dying; a stabilised hero (Dying 0) starts again at 1 + Wounded
 * (2 + Wounded on a crit). Dying 4 is dead (Doomed isn't tracked). Healing caps at max HP;
 * healing a dying hero ends Dying and raises Wounded by 1 (a stabilised hero at Dying 0 gains
 * no Wounded); healing from 0 removes Unconscious; a dead hero can't be healed.
 */
export function applyPf2eHpChange(sheet: Pf2eSheet, change: Change): string {
  const n = Math.abs(Math.floor(change.amount))
  if (!n) return ''
  const wounded = Math.max(0, sheet.wounded ?? 0)
  const base = Math.max(0, sheet.dying ?? 0)
  const dead = sheet.hp <= 0 && base >= PF2E_DEAD_AT
  if (change.amount < 0) {
    const { wasUp, overflow } = hurt(sheet, n)
    const step = change.crit ? 2 : 1
    let note = ''
    if (wasUp && sheet.hp === 0) setUnconscious(sheet, true)
    // Temp HP that soaks the whole hit at 0 HP leaves Dying alone.
    if (!dead && sheet.hp === 0 && (wasUp || overflow > 0)) {
      const dying = !wasUp && base > 0 ? base + step : step + wounded
      sheet.dying = Math.min(PF2E_DEAD_AT, dying)
      note = sheet.dying >= PF2E_DEAD_AT ? ` Dying ${sheet.dying}: dead.` : ` Dying ${sheet.dying}.`
    }
    return `${tookLine(n, change.crit, sheet)}${note}`
  }
  if (dead) return DEAD_HEAL
  const wasDying = sheet.hp <= 0 && base > 0
  const wasDown = mend(sheet, n)
  if (wasDown) setUnconscious(sheet, false)
  let note = ''
  if (wasDying) {
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
