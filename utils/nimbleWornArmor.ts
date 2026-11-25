// A Nimble hero's Armor from what they wear (Core p. 33): which items are armor or shields,
// their formulas, and the total with ancestry, background and ability armor. Kept apart from
// utils/nimbleItems.ts so utils/nimbleBuild.ts (which nimbleItems imports) can re-sync Armor
// after a level-up without an import cycle.
import { ancestryBySlug } from '~/data/nimble/ancestries'
import { backgroundBySlug } from '~/data/nimble/backgrounds'
import { classBySlug } from '~/data/nimble/classes'
import { armorByName } from '~/data/nimble/core'
import { magicItemByName } from '~/data/nimble/items'
import type { InventoryItem, NimbleSheet } from '~/types/sheets'
import { sign } from '~/utils/dice'
import { abilityArmor } from '~/utils/nimbleArmor'
import { abilityBaseName, classFlagAt } from '~/utils/nimbleClassRules'

export function armorValue(formula: string, stats: NimbleSheet['stats']): number | null {
  const cap = Number(/\(max (\d+)\)/.exec(formula)?.[1] ?? Number.POSITIVE_INFINITY)
  const terms = formula
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, '')
    .split('+')
    .filter(Boolean)
  if (!terms.length) return null
  let total = 0
  for (const t of terms) {
    if (/^\d+$/.test(t)) total += Number(t)
    else if (t === 'STR' || t === 'DEX' || t === 'INT' || t === 'WIL')
      total += Math.min(cap, stats[t])
    else return null
  }
  return total
}

/** An invention worn as armor says so in its ability text (Armor Prototype: "Armor: INT+DEX."). */
const INVENTION_ARMOR = /^Armor: ([\dA-Z+]+)\./

export interface ArmorPiece {
  shield: boolean
  /** "6+DEX (max 2)", "+2", "INT+DEX". */
  formula: string
  /** Cloth, Leather, Mail, Plate, Shield; Custom, Magic or Invention otherwise. */
  kind: string
  /** STR the book lists as required (Req. N STR); 0 for none. */
  str: number
}

/** What an item gives when worn: book, custom or magic armor or a shield, or an armor invention. */
export function armorPiece(sheet: NimbleSheet, item: InventoryItem): ArmorPiece | null {
  const book = armorByName(item.name)
  if (book)
    return {
      shield: book.kind === 'Shield',
      formula: book.armor,
      kind: book.kind,
      str: book.str ?? 0,
    }
  const c = item.custom
  if ((c?.kind === 'armor' || c?.kind === 'shield') && c.armor?.trim())
    return {
      shield: c.kind === 'shield',
      formula: c.armor,
      kind: c.kind === 'shield' ? 'Shield' : 'Custom',
      str: 0,
    }
  const magic = magicItemByName(item.name)
  if (magic?.armor)
    return {
      shield: magic.kind === 'shield',
      formula: magic.armor,
      kind: magic.kind === 'shield' ? 'Shield' : 'Magic',
      str: 0,
    }
  const formula = sheet.abilities
    .filter((a) => abilityBaseName(a.name) === item.name)
    .map((a) => INVENTION_ARMOR.exec(a.desc)?.[1])
    .findLast(Boolean)
  return formula ? { shield: false, formula, kind: 'Invention', str: 0 } : null
}

/**
 * Whether the class is trained in this kind of armor ("Mail Armor, Shields", "All Armor").
 * Custom and magic armor name no training kind, so they never get the untrained note.
 */
function proficient(training: string, kind: string): boolean {
  if (kind === 'Custom' || kind === 'Magic') return true
  if (/\bAll\b/.test(training)) return true
  if (kind === 'Shield') return /\bShields?\b/.test(training)
  if (kind === 'Invention') return /\bInventions?\b/.test(training)
  return new RegExp(`\\b${kind}\\b`).test(training)
}

/**
 * True once the sheet records what it wears: the builder and Equip set `worn` (taking
 * something off stores `false`), while sheets from before Equip never have the field.
 */
export const tracksWorn = (sheet: NimbleSheet) => sheet.inventory.some((i) => i.worn !== undefined)

/**
 * The hero's Armor from what they wear (Core p. 33): the worn armor's formula, or DEX
 * unarmored (Zephyr: DEX+STR); plus a worn shield and the ancestry, background and ability
 * armor. Iron Defense (2) doubles the whole Armor while unarmored, as the level-ups always
 * have. Notes an unmet STR requirement, armor the class isn't trained in (Defend then costs
 * 1 more action) and a formula it can't read.
 */
export function wornArmor(
  sheet: NimbleSheet,
  level: number,
): { value: number; parts: string[]; notes: string[] } {
  const cls = classBySlug(sheet.classSlug)
  const worn = sheet.inventory
    .filter((i) => i.worn)
    .flatMap((item) => {
      const piece = armorPiece(sheet, item)
      return piece ? [{ item, piece }] : []
    })
  const body = worn.find((w) => !w.piece.shield)
  const shield = worn.find((w) => w.piece.shield)
  const parts: string[] = []
  const notes: string[] = []
  const read = (name: string, formula: string) => {
    const v = armorValue(formula, sheet.stats)
    if (v === null) notes.push(`Can't read ${name}'s armor (“${formula}”): counted as 0.`)
    return v ?? 0
  }
  let value: number
  if (body) {
    value = read(body.item.name, body.piece.formula)
    parts.push(`${body.item.name} ${value}`)
  } else {
    const str = cls?.armorCalc.addStr ? sheet.stats.STR : 0
    value = sheet.stats.DEX + str
    parts.push(`unarmored ${value}`)
  }
  if (shield) {
    const bonus = read(shield.item.name, shield.piece.formula)
    value += bonus
    parts.push(`${shield.item.name} ${sign(bonus)}`)
  }
  const extra =
    (ancestryBySlug(sheet.ancestrySlug)?.armor ?? 0) +
    (backgroundBySlug(sheet.backgroundSlug)?.armor ?? 0) +
    abilityArmor(sheet)
  if (extra) {
    value += extra
    parts.push(`${sign(extra)} ancestry, background and abilities`)
  }
  if (!body && cls && classFlagAt(cls, level, 'armorDoubled')) {
    value *= 2
    parts.push('×2 Iron Defense')
  }
  for (const { item, piece } of worn) {
    if (piece.str && piece.str > sheet.stats.STR) notes.push(`${item.name} needs ${piece.str} STR.`)
    if (cls && !proficient(cls.armor, piece.kind))
      notes.push(`Not trained in ${item.name}: Defend costs 1 more action.`)
  }
  return { value, parts, notes }
}

/**
 * After anything that changes stats or ability armor (a level-up, a subclass change, going
 * back a level): a hero who marks worn gear has Armor worked out from it again, so it never
 * drifts from what they wear. Sheets from before Equip keep the old incremental Armor.
 */
export function syncWornArmor(sheet: NimbleSheet, level: number) {
  if (tracksWorn(sheet)) sheet.ac = wornArmor(sheet, level).value
}

/**
 * A sheet from before Equip has no worn flags, though its Armor assumed the starting armor
 * and shield: mark the first body armor and first shield worn, as the builder does, so a
 * first Equip doesn't treat the hero as unarmored.
 */
export function adoptStartingWorn(sheet: NimbleSheet) {
  if (tracksWorn(sheet)) return
  let body = false
  let shield = false
  sheet.inventory = sheet.inventory.map((i) => {
    const piece = armorPiece(sheet, i)
    if (!piece) return i
    if (piece.shield ? shield : body) return i
    if (piece.shield) shield = true
    else body = true
    return { ...i, worn: true }
  })
}
