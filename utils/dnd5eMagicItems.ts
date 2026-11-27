// What a 5e (2024) hero's magic items add to its numbers, read from their names and the data's
// text: a +1, +2 or +3 weapon (on the sheet weapon it enchants), armor or shield; Elven Chain's
// +1 AC; a Ring or Cloak of Protection's +1 to AC and saves while attuned (SRD 5.2.1 pp.
// 214, 237); the Wand of the War Mage's bonus to spell attacks; Wraps of Unarmed Power's bonus
// to Unarmed Strikes; Advantage from a Sentinel Shield (Initiative, Perception) or Boots of
// Elvenkind (Stealth); and an item's charges ("This wand has 7 charges"). The play engine
// (utils/dnd5ePlay.ts, dnd5eAttacks.ts, dnd5eSpells.ts) adds them. Pure, no engine imports.
import type { Dnd5eSheet, InventoryItem } from '~/types/sheets'

/** The "+N" an item's name carries ("Longsword +1", "Shield +2"), or 0. */
export function itemPlus(name: string): number {
  return Number(/\+([1-3])\b/.exec(name)?.[1] ?? 0)
}

const named = (i: InventoryItem, re: RegExp) => re.test(i.name)

/** A bonus an item gives, with the item's name for the breakdown. */
export interface Dnd5eGearBonus {
  label: string
  value: number
}

/** AC from magic armor, a magic shield, Elven Chain and a Ring or Cloak of Protection. */
export function gearAc(s: Pick<Dnd5eSheet, 'inventory'>): Dnd5eGearBonus[] {
  const out: Dnd5eGearBonus[] = []
  for (const i of s.inventory ?? []) {
    if (i.worn && (i.tag === 'Armor' || i.tag === 'Shield') && itemPlus(i.name))
      out.push({ label: i.name, value: itemPlus(i.name) })
    else if (i.worn && named(i, /^elven chain/i)) out.push({ label: i.name, value: 1 })
    if (i.attuned && named(i, /^(ring|cloak) of protection/i)) out.push({ label: i.name, value: 1 })
  }
  return out
}

/** Saving throw bonuses: a Ring or Cloak of Protection while attuned. */
export function gearSaves(s: Pick<Dnd5eSheet, 'inventory'>): Dnd5eGearBonus[] {
  return (s.inventory ?? [])
    .filter((i) => i.attuned && named(i, /^(ring|cloak) of protection/i))
    .map((i) => ({ label: i.name, value: 1 }))
}

/** The Wand of the War Mage's bonus to spell attack rolls while attuned. */
export function gearSpellAttack(s: Pick<Dnd5eSheet, 'inventory'>): Dnd5eGearBonus[] {
  return (s.inventory ?? [])
    .filter((i) => i.attuned && named(i, /wand of the war mage/i) && itemPlus(i.name))
    .map((i) => ({ label: i.name, value: itemPlus(i.name) }))
}

/** Wraps of Unarmed Power's bonus to Unarmed Strikes' attack and damage. */
export function gearUnarmed(s: Pick<Dnd5eSheet, 'inventory'>): Dnd5eGearBonus[] {
  return (s.inventory ?? [])
    .filter((i) => named(i, /wraps of unarmed power/i) && itemPlus(i.name))
    .map((i) => ({ label: i.name, value: itemPlus(i.name) }))
}

/** Advantage magic items give: on Initiative, or on checks with a skill. */
export function gearAdvantage(s: Pick<Dnd5eSheet, 'inventory'>): {
  initiative: string[]
  skills: Record<string, string[]>
} {
  const initiative: string[] = []
  const skills: Record<string, string[]> = {}
  const add = (skill: string, from: string) => (skills[skill] = [...(skills[skill] ?? []), from])
  for (const i of s.inventory ?? []) {
    if (i.worn && named(i, /^sentinel shield/i)) {
      initiative.push(i.name)
      add('Perception', i.name)
    }
    if (named(i, /^boots of elvenkind/i)) add('Stealth', i.name)
  }
  return { initiative, skills }
}

/** An item's charges from its text ("This wand has 7 charges"), and how it regains them. */
export function chargesOf(text: string | undefined): { max: number; regain: string } | null {
  const m = /has (\d+) charges/i.exec(text ?? '')
  if (!m) return null
  const r = /regains? ([^.]*?) expended charges/i.exec(text ?? '')
  return { max: Number(m[1]), regain: r?.[1]?.trim() ?? '' }
}
