// Level history: a copy of the sheet taken before every level-up, so lowering a
// character's level removes exactly what the higher levels granted.
import type {
  AnySheet,
  Dnd5eLevelInput,
  LevelHistoryEntry,
  NimbleLevelInput,
  NimbleSheet,
  Pf2eLevelInput,
} from '~/types/sheets'
import { syncWornArmor } from '~/utils/nimbleWornArmor'

/**
 * Play state that belongs to the table rather than the level: kept as it is when
 * a level is undone, and left out of snapshots to keep them small.
 */
const PLAY_STATE = new Set([
  'levelHistory',
  'hp',
  'inventory',
  'notes',
  'backstory',
  'gold',
  'coins',
  'xp',
  'xpNext',
  'wounds',
  'conditions',
  'conditionEnds',
  'conditionHold',
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
  'casting',
  'uses',
  'malfunctions',
  'summons',
  'summonLooks',
  'formPortraits',
  'portraitOverride',
  'ownDice',
  'classicInitiative',
  'turnActive',
  'inEncounter',
  'turnDone',
  'awaitingInitiative',
  'initiative',
  'gmCombatant',
  'effects',
  'used',
  'turn',
  'doomed',
  'conditionValues',
  'languages',
  'heightWeight',
])

type Loose = Record<string, unknown>

/**
 * Fields a level-up can add to a sheet that didn't have them (PF2e: the sheet's level, partial
 * boosts, level-up choices, a first focus spell; 5e: a subclass's spellcasting, a second
 * class's casting, the class list and Hit Point Dice of a save from before multiclassing): gone
 * again when a snapshot without them is restored.
 */
const ADDED_BY_LEVELS = [
  'level',
  'partialBoosts',
  'levelChoices',
  'focusSpells',
  'archetypeCasting',
  'castingStats',
  'castingClasses',
  'classes',
  'hitDice',
]

/**
 * Play state nested inside objects whose other fields depend on the level: the
 * definition and maximum come back from the snapshot, these stay as they are.
 * `max` names the field each one is clamped to after the restore.
 */
const LIVE_FIELDS: { obj: string; field: string; max?: string }[] = [
  { obj: 'mana', field: 'current', max: 'max' },
  { obj: 'mana', field: 'temp' },
  { obj: 'resource', field: 'active' },
  { obj: 'resource', field: 'dice' },
  { obj: 'resource', field: 'count' },
  { obj: 'resource', field: 'rolls' },
  { obj: 'focus', field: 'current', max: 'max' },
  { obj: 'shield', field: 'hp', max: 'hpMax' },
  { obj: 'shield', field: 'raised' },
]

function liveFields(sheet: Loose): Map<string, unknown> {
  const out = new Map<string, unknown>()
  for (const { obj, field } of LIVE_FIELDS) {
    const o = sheet[obj] as Loose | undefined
    if (o && typeof o === 'object' && field in o) out.set(`${obj}.${field}`, o[field])
  }
  return out
}

function restoreLiveFields(sheet: Loose, live: Map<string, unknown>) {
  for (const { obj, field, max } of LIVE_FIELDS) {
    const o = sheet[obj] as Loose | undefined
    const key = `${obj}.${field}`
    if (!o || typeof o !== 'object' || !live.has(key)) continue
    const value = live.get(key)
    const cap = max ? o[max] : undefined
    o[field] = typeof value === 'number' && typeof cap === 'number' ? Math.min(value, cap) : value
  }
}

function snapshot(sheet: AnySheet): Loose {
  const out: Loose = {}
  for (const [k, v] of Object.entries(sheet)) if (!PLAY_STATE.has(k)) out[k] = v
  return JSON.parse(JSON.stringify(out)) as Loose
}

/**
 * Records the sheet before it reaches `level`, with what was picked (Nimble, PF2e or 5e) so
 * Reconfigure can replay it. Call before applying the level-up.
 */
export function recordLevel(
  sheet: AnySheet,
  level: number,
  nimble?: NimbleLevelInput,
  pf2e?: Pf2eLevelInput,
  dnd5e?: Dnd5eLevelInput,
): void {
  const history = (sheet.levelHistory ?? []).filter((e) => e.level < level)
  const entry: LevelHistoryEntry = { level, before: snapshot(sheet) }
  if (nimble) entry.nimble = JSON.parse(JSON.stringify(nimble)) as NimbleLevelInput
  if (pf2e) entry.pf2e = JSON.parse(JSON.stringify(pf2e)) as Pf2eLevelInput
  if (dnd5e) entry.dnd5e = JSON.parse(JSON.stringify(dnd5e)) as Dnd5eLevelInput
  history.push(entry)
  sheet.levelHistory = history
}

/** True when every level-up above `target` (up to `current`) has a snapshot. */
export function canRestore(sheet: AnySheet, target: number): boolean {
  return (sheet.levelHistory ?? []).some((e) => e.level === target + 1)
}

/**
 * Puts the sheet back to how it was at `target`. Play state (current HP, wounds,
 * inventory, notes, PF2e spell slots spent and prepared…) stays, clamped to the restored
 * maximums, and entries added by hand are kept (Nimble abilities without a level, PF2e feats
 * and Strikes).
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

  applySnapshot(sheet, entry.before, target)
  sheet.levelHistory = history.filter((e) => e.level <= target)
  // The inventory (and what's worn) is play state the snapshot keeps; Armor follows it.
  if (isNimble(sheet)) syncWornArmor(sheet, target)
  return true
}

/**
 * Puts the sheet back to a freshly built level 1 sheet (a reconfigured creation),
 * keeping play state the same way an undone level does. Level history is cleared.
 */
export function restoreBuild(sheet: AnySheet, built: AnySheet): void {
  applySnapshot(sheet, snapshot(built))
  sheet.levelHistory = []
  if (isNimble(sheet)) syncWornArmor(sheet, 1)
}

export function keepDamage(sheet: AnySheet, before: { hp: number; hpMax: number }): void {
  const damage = Math.max(0, before.hpMax - before.hp)
  sheet.hp = Math.max(0, sheet.hpMax - damage)
}

const isNimble = (s: AnySheet): s is NimbleSheet => 'stats' in s && 'abilities' in s

type SlotState = { max: number; used: number; prepared?: { id: string | null; cast: boolean }[] }
type Casting = {
  spells?: { id: string }[]
  slots?: SlotState[]
  font?: { max: number; used: number }
}

/**
 * PF2e spell slots are play state where the slot still exists: slots spent today and the spells
 * prepared in them (and whether they were cast), kept slot by slot, clamped to the restored
 * maximums; a prepared spell the restored sheet no longer knows leaves its slot empty.
 */
function castingState(loose: Loose) {
  const entries = (s: Loose) => [
    ...(s.spellcasting ? [['', s.spellcasting as Casting] as const] : []),
    ...((s.archetypeCasting as (Casting & { archetype: string })[] | undefined) ?? []).map(
      (c) => [c.archetype, c] as const,
    ),
  ]
  const saved = new Map(
    entries(loose).map(([k, c]) => [k, JSON.parse(JSON.stringify(c)) as Casting]),
  )
  return () => {
    for (const [k, c] of entries(loose)) {
      const was = saved.get(k)
      if (!was) continue
      const known = new Set((c.spells ?? []).map((x) => x.id))
      c.slots?.forEach((slot, i) => {
        const old = was.slots?.[i]
        if (!old) return
        slot.used = Math.min(old.used, slot.max)
        slot.prepared?.forEach((p, j) => {
          const o = old.prepared?.[j]
          if (o && (!o.id || known.has(o.id))) Object.assign(p, o)
        })
      })
      if (c.font && was.font) c.font.used = Math.min(was.font.used, c.font.max)
    }
  }
}

/**
 * PF2e entries added by hand stay when a level is undone, as Nimble's do: feats without an id
 * or not from a later level, and Strikes the snapshot doesn't have.
 */
function handEntries(loose: Loose, target: number | undefined) {
  const feats = Array.isArray(loose.feats)
    ? (loose.feats as { id?: string; name: string; type?: string; level?: string }[])
    : null
  const strikes = Array.isArray(loose.strikes) ? (loose.strikes as { name: string }[]) : null
  const keptFeats = (feats ?? []).filter(
    (f) => !f.id || (target !== undefined && Number(f.level) <= target),
  )
  const keptStrikes = [...(strikes ?? [])]
  const same = (a: { name: string; type?: string }, b: { name: string; type?: string }) =>
    a.name === b.name && a.type === b.type
  return () => {
    if (feats && Array.isArray(loose.feats)) {
      const list = loose.feats as { name: string; type?: string }[]
      for (const f of keptFeats) if (!list.some((x) => same(x, f))) list.push(f)
    }
    if (strikes && Array.isArray(loose.strikes)) {
      const list = loose.strikes as { name: string }[]
      for (const s of keptStrikes) if (!list.some((x) => x.name === s.name)) list.push(s)
    }
  }
}

function applySnapshot(sheet: AnySheet, snap: Loose, target?: number) {
  const loose = sheet as unknown as Loose
  const handMade = Array.isArray(loose.abilities)
    ? (loose.abilities as { name: string; level?: number }[]).filter((a) => !a.level)
    : []
  const live = liveFields(loose)
  const restoreCasting = castingState(loose)
  const restoreHand = handEntries(loose, target)
  const before = JSON.parse(JSON.stringify(snap)) as Loose

  for (const k of ADDED_BY_LEVELS) if (!(k in before)) delete loose[k]
  Object.assign(loose, before)

  sheet.hp = Math.min(sheet.hp, sheet.hpMax)
  restoreLiveFields(loose, live)
  restoreCasting()
  restoreHand()
  if (Array.isArray(loose.abilities)) {
    const list = loose.abilities as { name: string; level?: number }[]
    for (const a of handMade) if (!list.some((b) => !b.level && b.name === a.name)) list.push(a)
  }
}
