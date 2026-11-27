// The Artificer's item features (Eberron: Forge of the Artificer, 2025): Replicate Magic Item
// makes items from the plans the hero knows, no more than the Magic Items column (the oldest
// vanishes), a weapon plan enchanting one of the hero's weapons (+1 or +2 to attack and damage)
// and an armor or shield plan its worn gear (+1 or +2 AC, read by utils/dnd5eMagicItems.ts);
// Magic Item Adept, Savant and Master raise the attunement limit to 4, 5 and 6 (Use Magic
// Device too, for a Thief); Spell-Storing Item keeps a level 1–3 spell for twice INT uses.
// Flash of Genius is a reroll (utils/dnd5eRerolls.ts). Pure; tests/dnd5eArtificer.test.ts.
import type { Dnd5eOptionEntry, Dnd5eSpellDef } from '~/data/dnd5e/types'
import type { Dnd5eSheet, InventoryItem } from '~/types/sheets'
import type { Dnd5eColumns } from '~/utils/dnd5eAttacks'
import { itemPlus } from '~/utils/dnd5eMagicItems'
import { dnd5eHero } from '~/utils/dnd5ePlay'

/** How many magic items the hero can be attuned to (3, SRD 5.2.1 p. 204). */
export function attunementLimit(s: Dnd5eSheet, level: number): number {
  const hero = dnd5eHero(s, level)
  if (hero.has('Magic Item Master')) return 6
  if (hero.has('Advanced Artifice')) return 5
  if (hero.has('Magic Item Adept') || hero.has('Use Magic Device')) return 4
  return 3
}

/** What a plan makes: a weapon's or armor's enchantment, or an item of its own. */
export type Dnd5ePlanKind = 'weapon' | 'armor' | 'shield' | 'item'

/** Plans that enchant a weapon, with their bonus (Returning Weapon and the like give +1). */
const WEAPON_PLANS: Record<string, number> = {
  'weapon-1': 1,
  'weapon-2': 2,
  'returning-weapon': 1,
  'repeating-shot': 1,
  'dagger-of-venom': 1,
  'dazzling-weapon': 0,
  'weapon-of-warning': 0,
  'flame-tongue': 0,
}

export function planKind(slug: string): Dnd5ePlanKind {
  if (slug in WEAPON_PLANS) return 'weapon'
  if (/^armor-\d$/.test(slug)) return 'armor'
  if (/^shield-\d$|-shield$/.test(slug)) return 'shield'
  return 'item'
}

/** The plans the hero knows, from its option picks and the data. */
export function knownPlans(s: Dnd5eSheet, plans: Dnd5eOptionEntry[]): Dnd5eOptionEntry[] {
  const known = new Set((s.options ?? []).filter((o) => o.group === 'plans').map((o) => o.slug))
  return plans.filter((p) => known.has(p.slug))
}

/** The Magic Items column: how many replicated items the hero can have at once. */
export const replicaCap = (cols: Dnd5eColumns | undefined) =>
  Number(/\d+/.exec(cols?.['Magic Items'] ?? '')?.[0] ?? 0)

const replicas = (s: Dnd5eSheet) => s.inventory.filter((i) => i.replicated)

/** Takes a replicated item away, with the enchantment it put on a weapon. */
function vanish(s: Dnd5eSheet, item: InventoryItem) {
  s.inventory = s.inventory.filter((i) => i !== item)
  s.weapons = s.weapons.map((w) => {
    if (w.enchant !== item.name) return w
    const { magic: _m, enchant: _e, ...rest } = w
    return { ...rest, name: w.name.replace(/\s*\+[1-3]$/, '') }
  })
}

/**
 * Makes an item from a plan the hero knows (Replicate Magic Item, after a Long Rest): a weapon
 * plan enchants the weapon `on` names (its index on the sheet), an armor or shield plan the
 * worn one; past the Magic Items column the oldest replica vanishes first.
 */
export function replicate(
  s: Dnd5eSheet,
  plan: Dnd5eOptionEntry,
  cols: Dnd5eColumns | undefined,
  on?: number,
): string {
  const cap = replicaCap(cols)
  if (!cap) return 'Replicate Magic Item: no Magic Items yet at this level.'
  if (replicas(s).some((i) => i.name.startsWith(plan.name) || i.name.endsWith(`(${plan.name})`)))
    return `${plan.name}: each item must come from a different plan.`
  const kind = planKind(plan.slug)
  const attune = /attunement/i.test(plan.summary ?? '')
  const notes: string[] = []
  let item: InventoryItem
  if (kind === 'weapon') {
    const w = on !== undefined ? s.weapons[on] : undefined
    if (!w) return `${plan.name}: pick the weapon it enchants.`
    const bonus = WEAPON_PLANS[plan.slug] ?? itemPlus(plan.name)
    const base = w.name.replace(/\s*\+[1-3]$/, '')
    const name = bonus ? `${base} +${bonus}` : `${base} (${plan.name})`
    item = { name, qty: '1', tag: 'Weapon', replicated: true }
    s.weapons = s.weapons.map((x, i) =>
      i === on ? { ...x, name, ...(bonus ? { magic: bonus } : {}), enchant: name } : x,
    )
  } else if (kind === 'armor' || kind === 'shield') {
    const worn = s.inventory.find(
      (i) => i.worn && i.tag === (kind === 'shield' ? 'Shield' : 'Armor') && !i.replicated,
    )
    const bonus = itemPlus(plan.name)
    const base = kind === 'shield' ? 'Shield' : (worn?.name ?? 'Armor')
    const name = bonus ? `${base} +${bonus}` : plan.name
    item = {
      name,
      qty: '1',
      tag: kind === 'shield' ? 'Shield' : 'Armor',
      replicated: true,
      ...(worn ? { worn: true } : {}),
    }
    if (worn) {
      worn.worn = false
      notes.push(`you wear it in place of ${worn.name}`)
    }
  } else item = { name: plan.name, qty: '1', replicated: true }
  const old = replicas(s)
  while (old.length >= cap) {
    const gone = old.shift()!
    vanish(s, gone)
    notes.push(`${gone.name} vanishes`)
  }
  s.inventory = [...s.inventory, item]
  if (attune) notes.push('it needs Attunement (you can attune as you make it)')
  return `Replicate Magic Item: ${item.name}${notes.length ? `; ${notes.join('; ')}` : ''}.`
}

/** Spells a Spell-Storing Item can hold: level 1–3 Artificer spells of one action, no consumed material. */
export function storableSpells(spells: Dnd5eSpellDef[]): Dnd5eSpellDef[] {
  return spells.filter(
    (d) =>
      d.classes.includes('artificer') &&
      d.level >= 1 &&
      d.level <= 3 &&
      (d.activation === 'action' || d.activation === 'magic') &&
      !d.components.consumed,
  )
}

/** Stores a spell (after a Long Rest): it can be cast twice INT times (at least twice). */
export function storeSpell(s: Dnd5eSheet, level: number, def: Dnd5eSpellDef): string {
  const uses = 2 * Math.max(1, dnd5eHero(s, level).mod('INT'))
  s.storedSpell = { slug: def.slug, name: def.name, level: def.level, uses }
  return `Spell-Storing Item: ${def.name} stored, ${uses} uses.`
}

/** Spends one use of the stored spell; the item is empty once they're gone. */
export function useStoredSpell(s: Dnd5eSheet): string {
  const st = s.storedSpell
  if (!st || st.uses < 1) return 'No spell stored.'
  st.uses -= 1
  const left = st.uses
  if (!left) delete s.storedSpell
  return `Spell-Storing Item: ${st.name} (${left} use${left === 1 ? '' : 's'} left).`
}
