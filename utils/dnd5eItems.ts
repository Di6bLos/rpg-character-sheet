// A 5e (2024) hero's gear on the sheet: wearing armor and a shield (one of each; what's worn sets
// AC, SRD 5.2.1 p. 92, as Nimble's wearItem does), attunement (at most 3 magic items, p. 204),
// and what they carry against their capacity (Strength × 15 lb, p. 190). AC moves by the change
// the gear makes, so a number the player typed by hand keeps its edit. Pure;
// tests/dnd5eItems.test.ts.
import type {
  Dnd5eArmorDef,
  Dnd5eGearDef,
  Dnd5eMagicItemDef,
  Dnd5eWeaponDef,
} from '~/data/dnd5e/types'
import type { Dnd5eSheet, InventoryItem } from '~/types/sheets'
import { type Dnd5eBuildData, type Dnd5eBuildState, armorClass } from '~/utils/dnd5eBuild'
import { norm5e } from '~/utils/dnd5ePlay'

export const ATTUNE_MAX = 3

/** The armor's record by name; a magic "+1" on the name is the same armor underneath. */
export const armorOf = (armor: Dnd5eArmorDef[], name: string) =>
  armor.find((a) => norm5e(a.name) === norm5e(name.replace(/\s*\+[1-3]$/, '')))

/** AC from the worn gear: the build's unarmored formulas for a built hero, 10 + DEX otherwise. */
export function gearAc(
  s: Dnd5eSheet,
  armor: Dnd5eArmorDef[],
  st: Pick<Dnd5eBuildState, 'ac'> | null,
  inventory: InventoryItem[] = s.inventory,
): number {
  return armorClass(st ?? { ac: [] }, s.abilities, inventory, { armor } as Dnd5eBuildData)
}

/**
 * Puts on or takes off armor or a shield: one body armor and one shield are worn at a time.
 * Returns the line to show, with the AC change and a Strength requirement not met.
 */
export function wearItem(
  s: Dnd5eSheet,
  index: number,
  armor: Dnd5eArmorDef[],
  st: Pick<Dnd5eBuildState, 'ac'> | null,
): string {
  const item = s.inventory[index]
  const def = item ? armorOf(armor, item.name) : undefined
  if (!item || !def) return ''
  const before = gearAc(s, armor, st)
  const on = !item.worn
  const shield = def.category === 'Shield'
  s.inventory = s.inventory.map((it, i) => {
    if (i === index) return { ...it, worn: on, tag: it.tag ?? (shield ? 'Shield' : 'Armor') }
    const other = armorOf(armor, it.name)
    if (on && it.worn && other && (other.category === 'Shield') === shield)
      return { ...it, worn: false }
    return it
  })
  const after = gearAc(s, armor, st)
  s.ac += after - before
  const notes: string[] = []
  if (on && def.strength && s.abilities.STR < def.strength)
    notes.push(`Strength ${def.strength} needed: your Speed drops by 10 ft`)
  if (on && def.stealthDisadvantage) notes.push('Disadvantage on Stealth checks')
  const trained = s.proficiencies?.armor ?? []
  const want = shield ? 'Shields' : `${def.category} armor`
  if (on && s.proficiencies && !trained.some((t) => norm5e(t) === norm5e(want)))
    notes.push(
      `not trained in ${want}: Disadvantage on Strength and Dexterity D20 Tests, and no spells`,
    )
  return `${on ? 'Wearing' : 'Took off'} ${item.name}: AC ${s.ac}.${notes.length ? ` ${notes.join('; ')}.` : ''}`
}

/** Attunes or ends attunement; at most `max` items at once (three, more for an Artificer). */
export function toggleAttune(s: Dnd5eSheet, index: number, max = ATTUNE_MAX): string {
  const item = s.inventory[index]
  if (!item) return ''
  if (!item.attuned && s.inventory.filter((i) => i.attuned).length >= max)
    return `You’re attuned to ${max} items already: end one first.`
  s.inventory = s.inventory.map((it, i) => (i === index ? { ...it, attuned: !it.attuned } : it))
  return `${item.attuned ? 'No longer attuned to' : 'Attuned to'} ${item.name}.`
}

/** The weight of one item from the data, by name (0 when unknown). */
export function weightOf(
  name: string,
  data: { weapons: Dnd5eWeaponDef[]; armor: Dnd5eArmorDef[]; gear: Dnd5eGearDef[] },
): number {
  const n = norm5e(name.replace(/\s*\(.*\)$/, ''))
  return (
    data.weapons.find((x) => norm5e(x.name) === n)?.weight ??
    data.armor.find((x) => norm5e(x.name) === n)?.weight ??
    data.gear.find((x) => norm5e(x.name) === n)?.weight ??
    0
  )
}

/** What the hero carries, and their carrying capacity: Strength × 15 lb (doubled when Large). */
export function carried(
  s: Dnd5eSheet,
  data: { weapons: Dnd5eWeaponDef[]; armor: Dnd5eArmorDef[]; gear: Dnd5eGearDef[] },
): { weight: number; capacity: number } {
  const weight = s.inventory.reduce(
    (n, i) => n + weightOf(i.name, data) * Math.max(0, Number.parseFloat(i.qty) || 1),
    0,
  )
  const large = s.size === 'Large' ? 2 : 1
  return { weight: Math.round(weight * 10) / 10, capacity: (s.abilities.STR ?? 10) * 15 * large }
}

/** Whether a magic item needs attunement (from its data). */
export const needsAttunement = (name: string, items: Dnd5eMagicItemDef[]) =>
  !!items.find((x) => norm5e(x.name) === norm5e(name))?.attunement
