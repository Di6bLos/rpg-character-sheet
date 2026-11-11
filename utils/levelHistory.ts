// Level history: a copy of the sheet taken before every level-up, so lowering a
// character's level removes exactly what the higher levels granted.
import type { AnySheet, LevelHistoryEntry, NimbleLevelInput } from '~/types/sheets'

/**
 * Play state that belongs to the table rather than the level: kept as it is when
 * a level is undone, and left out of snapshots to keep them small.
 */
const PLAY_STATE = new Set([
  'levelHistory',
  'hp',
  'inventory',
  'notes',
  'gold',
  'coins',
  'xp',
  'xpNext',
  'wounds',
  'conditions',
  'deathSaves',
  'tempHp',
  'dying',
  'wounded',
  'heroPoints',
  'actionsSpent',
  'hitDiceUsed',
  'rushed',
  'reactionsUsed',
  'concentration',
  'uses',
  'languages',
  'heightWeight',
])

type Loose = Record<string, unknown>

function snapshot(sheet: AnySheet): Loose {
  const out: Loose = {}
  for (const [k, v] of Object.entries(sheet)) if (!PLAY_STATE.has(k)) out[k] = v
  return JSON.parse(JSON.stringify(out)) as Loose
}

/** Records the sheet before it reaches `level`. Call before applying the level-up. */
export function recordLevel(sheet: AnySheet, level: number, nimble?: NimbleLevelInput): void {
  const history = (sheet.levelHistory ?? []).filter((e) => e.level < level)
  const entry: LevelHistoryEntry = { level, before: snapshot(sheet) }
  if (nimble) entry.nimble = JSON.parse(JSON.stringify(nimble)) as NimbleLevelInput
  history.push(entry)
  sheet.levelHistory = history
}

/** True when every level-up above `target` (up to `current`) has a snapshot. */
export function canRestore(sheet: AnySheet, target: number): boolean {
  return (sheet.levelHistory ?? []).some((e) => e.level === target + 1)
}

/**
 * Puts the sheet back to how it was at `target`. Play state (current HP, wounds,
 * inventory, notes…) stays, clamped to the restored maximums, and abilities added
 * by hand (Nimble entries without a level) are kept.
 *
 * Returns false when there is no snapshot for that level (levelled up before the
 * history existed); then only Nimble's level-tagged abilities and picks above
 * `target` are removed.
 */
export function restoreLevel(sheet: AnySheet, target: number): boolean {
  const history = sheet.levelHistory ?? []
  const entry = history.find((e) => e.level === target + 1)
  const loose = sheet as unknown as Loose

  if (!entry) {
    const abilities = loose.abilities
    if (Array.isArray(abilities))
      loose.abilities = abilities.filter((a: { level?: number }) => !a.level || a.level <= target)
    const choices = loose.choices as Record<string, string[]> | undefined
    if (choices && typeof choices === 'object')
      for (const key of Object.keys(choices))
        if (Number(/^L(\d+):/.exec(key)?.[1] ?? 0) > target) delete choices[key]
    sheet.levelHistory = history.filter((e) => e.level <= target)
    return false
  }

  const handMade = Array.isArray(loose.abilities)
    ? (loose.abilities as { name: string; level?: number }[]).filter((a) => !a.level)
    : []
  const mana = loose.mana as { current: number } | undefined
  const manaNow = mana?.current
  const before = JSON.parse(JSON.stringify(entry.before)) as Loose

  Object.assign(loose, before)

  sheet.hp = Math.min(sheet.hp, sheet.hpMax)
  const restoredMana = loose.mana as { current: number; max: number } | undefined
  if (restoredMana && manaNow !== undefined)
    restoredMana.current = Math.min(manaNow, restoredMana.max)
  if (Array.isArray(loose.abilities)) {
    const list = loose.abilities as { name: string; level?: number }[]
    for (const a of handMade) if (!list.some((b) => !b.level && b.name === a.name)) list.push(a)
  }
  sheet.levelHistory = history.filter((e) => e.level <= target)
  return true
}
