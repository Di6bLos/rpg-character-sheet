import type { GameSystem, HeroHpChange } from '~/types'
import type { AnySheet, Dnd5eSheet, NimbleSheet, Pf2eSheet } from '~/types/sheets'
import { heal, takeDamage } from '~/utils/nimblePlay'
import { wardedDamage } from '~/utils/nimbleConditions'
import {
  heal as pf2eHeal,
  isDead as pf2eIsDead,
  takeDamage as pf2eTakeDamage,
} from '~/utils/pf2ePlay'

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

/** Unconscious at 0 HP: added on dropping to 0, removed on healing from 0 (5e). */
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
 * Pathfinder 2e, with the sheet's own engine (utils/pf2ePlay.ts takeDamage / heal): temp HP
 * first, knocked out at 0 with Dying 1 + Wounded (2 + Wounded on a crit), Dying raised while
 * down, massive damage, Doomed lowering the Dying value that kills; healing a dying hero ends
 * Dying and raises Wounded, and the dead can't be healed.
 */
export function applyPf2eHpChange(sheet: Pf2eSheet, change: Change): string {
  const n = Math.abs(Math.floor(change.amount))
  if (!n) return ''
  sheet.tempHp = Math.max(0, sheet.tempHp ?? 0)
  sheet.dying = Math.max(0, sheet.dying ?? 0)
  sheet.wounded = Math.max(0, sheet.wounded ?? 0)
  if (!Array.isArray(sheet.conditions)) sheet.conditions = []
  if (change.amount < 0) {
    const line = pf2eTakeDamage(sheet, n, { crit: change.crit })
    // While dying the engine only says the new Dying value; the GM's line says the hit too.
    return line.startsWith('Took ') ? gmLine(line) : `${tookLine(n, change.crit, sheet)} ${line}`
  }
  if (pf2eIsDead(sheet)) return DEAD_HEAL
  return gmLine(pf2eHeal(sheet, n))
}

/** The engine's line as the GM's: "Took 5 damage…" reads "GM: took 5 damage…". */
function gmLine(line: string) {
  return `GM: ${line.charAt(0).toLowerCase()}${line.slice(1)}`
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
