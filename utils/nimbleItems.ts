import { classBySlug } from '~/data/nimble/classes'
import { ARMOR, GEAR, WEAPONS, armorByName, gearByName, weaponByName } from '~/data/nimble/core'
import { MAGIC_ITEMS, SCROLL_RULES, WAND_RULES, magicItemByName } from '~/data/nimble/items'
import type {
  CustomItem,
  CustomItemEffect,
  CustomItemEffectKind,
  InventoryItem,
  NimbleAttack,
  NimbleSheet,
} from '~/types/sheets'
import { parseDice, rollDie, sign, type Rng } from '~/utils/dice'
import { classMeleeDamage, weaponAttack } from '~/utils/nimbleBuild'

export const SPELL_SCROLL = 'Spell Scroll'

export interface CatalogGroup {
  label: string
  items: { name: string; hint: string }[]
}

export function catalog(): CatalogGroup[] {
  const armor = (kind: 'shield' | 'armor') =>
    ARMOR.filter((a) => (kind === 'shield') === (a.kind === 'Shield')).map((a) => ({
      name: a.name,
      hint: [a.kind === 'Shield' ? `${a.armor} Armor` : a.armor, a.cost]
        .filter(Boolean)
        .join(' · '),
    }))
  return [
    {
      label: 'Weapons',
      items: WEAPONS.filter((w) => w.cost).map((w) => ({
        name: w.name,
        hint: `${w.dice}+${w.stat} · ${w.cost}`,
      })),
    },
    { label: 'Armor', items: armor('armor') },
    { label: 'Shields', items: armor('shield') },
    { label: 'Gear', items: GEAR.map((g) => ({ name: g.name, hint: g.cost ?? '' })) },
    {
      label: 'Magic items',
      items: [
        ...MAGIC_ITEMS.filter((m) => m.kind !== 'wand').map((m) => ({
          name: m.name,
          hint: m.rarity,
        })),
        { name: SPELL_SCROLL, hint: 'single use' },
      ],
    },
    {
      label: 'Wands',
      items: MAGIC_ITEMS.filter((m) => m.kind === 'wand').map((m) => ({
        name: m.name,
        hint: m.rarity,
      })),
    },
  ]
}

export function bookItem(name: string): InventoryItem | null {
  const known =
    weaponByName(name) ??
    armorByName(name) ??
    gearByName(name) ??
    magicItemByName(name) ??
    (name === SPELL_SCROLL ? name : null)
  if (!known) return null
  const armor = armorByName(name)
  const magic = magicItemByName(name)
  const tag = weaponByName(name)
    ? 'Weapon'
    : armor
      ? armor.kind === 'Shield'
        ? 'Shield'
        : 'Armor'
      : magic || name === SPELL_SCROLL
        ? 'Magic'
        : undefined
  return { name, qty: '1', ...(tag ? { tag } : {}) }
}

export const DAMAGE_TYPES = [
  'Slashing',
  'Piercing',
  'Bludgeoning',
  'Fire',
  'Cold',
  'Lightning',
  'Radiant',
  'Necrotic',
  'Psychic',
  'Poison',
  'Acid',
]

export const ITEM_EFFECTS: {
  kind: CustomItemEffectKind
  label: string
  weapon: boolean
  dice?: string
  type?: string
  condition?: string
}[] = [
  { kind: 'hit', label: 'Extra damage on a hit', weapon: true, dice: '1d4', type: 'Fire' },
  { kind: 'crit', label: 'Extra damage on a crit', weapon: true, dice: '1d6', type: 'Fire' },
  { kind: 'condition', label: 'Condition on a crit', weapon: true, condition: 'Prone' },
  { kind: 'heal', label: 'Heal on a hit', weapon: true, dice: '1d4' },
  { kind: 'resist', label: 'Resistance', weapon: false, type: 'Fire' },
  { kind: 'returning', label: 'Returns when thrown', weapon: true },
  { kind: 'light', label: 'Sheds light', weapon: false },
]

export function itemEffectText(e: CustomItemEffect): string {
  const type = e.type?.toLowerCase() ?? ''
  switch (e.kind) {
    case 'hit':
      return `+${e.dice} ${type} damage on a hit`
    case 'crit':
      return `+${e.dice} ${type} damage on a crit`
    case 'condition':
      return `On a crit, the target is ${e.condition}`
    case 'heal':
      return `On a hit, heal ${e.dice} HP`
    case 'resist':
      return `Resistance to ${type} damage`
    case 'returning':
      return 'Returns to your hand after it is thrown'
    case 'light':
      return 'Sheds light 6 spaces around it'
  }
}

export function rollRiders(
  riders: string[],
  rng: Rng = Math.random,
): { total: number; note: string } {
  let total = 0
  const parts: string[] = []
  for (const rider of riders) {
    const [dice = '', ...type] = rider.split(' ')
    const expr = parseDice(dice)
    if (!expr) continue
    let sum = expr.mod
    for (let i = 0; i < expr.count; i++) sum += rollDie(expr.sides, rng)
    total += sum
    parts.push(`+${sum} ${type.join(' ')}`.trim())
  }
  return { total, note: parts.length ? ` (${parts.join(', ')})` : '' }
}

function cleanEffects(effects: CustomItemEffect[] | undefined): CustomItemEffect[] {
  return (effects ?? []).flatMap((e) => {
    const def = ITEM_EFFECTS.find((d) => d.kind === e.kind)
    if (!def) return []
    const dice = def.dice ? e.dice?.replace(/\s+/g, '') : undefined
    if (def.dice && !parseDice(dice ?? '')) return []
    return [
      {
        kind: e.kind,
        ...(dice ? { dice } : {}),
        ...(def.type ? { type: e.type || def.type } : {}),
        ...(def.condition ? { condition: e.condition || def.condition } : {}),
      },
    ]
  })
}

export function customItem(name: string, custom: CustomItem): InventoryItem | null {
  const label = name.trim().slice(0, 80)
  if (!label) return null
  if (custom.kind === 'weapon' && !parseDice(custom.dice ?? '')) return null
  const tag =
    custom.kind === 'weapon'
      ? 'Weapon'
      : custom.kind === 'armor'
        ? 'Armor'
        : custom.kind === 'shield'
          ? 'Shield'
          : custom.rarity
            ? 'Magic'
            : undefined
  const clean: CustomItem = { kind: custom.kind }
  if (custom.kind === 'weapon') {
    clean.dice = custom.dice?.replace(/\s+/g, '')
    clean.stat = custom.stat ?? 'STR'
    clean.melee = custom.melee ?? true
    if (custom.damageType?.trim()) clean.damageType = custom.damageType.trim()
    if (custom.props?.trim()) clean.props = custom.props.trim()
  }
  if ((custom.kind === 'armor' || custom.kind === 'shield') && custom.armor?.trim())
    clean.armor = custom.armor.trim()
  if (custom.rarity?.trim()) clean.rarity = custom.rarity.trim()
  const effects = cleanEffects(custom.effects).filter(
    (e) => custom.kind === 'weapon' || !ITEM_EFFECTS.find((d) => d.kind === e.kind)?.weapon,
  )
  if (effects.length) clean.effects = effects
  if (custom.desc?.trim()) clean.desc = custom.desc.trim().slice(0, 500)
  return { name: label, qty: '1', ...(tag ? { tag } : {}), custom: clean }
}

export function itemAttack(
  sheet: NimbleSheet,
  item: InventoryItem,
  level: number,
): NimbleAttack | null {
  const cls = classBySlug(sheet.classSlug)
  const meleeBonus = cls ? classMeleeDamage(cls, level) : 0
  const c = item.custom
  if (c?.kind !== 'weapon') return weaponAttack(item.name, sheet.stats, sheet.abilities, meleeBonus)
  const expr = parseDice(c.dice ?? '')
  if (!expr) return null
  const melee = c.melee ?? true
  const mod = sheet.stats[c.stat ?? 'STR'] + (melee ? meleeBonus : 0) + expr.mod
  const riders = (kind: CustomItemEffectKind) =>
    (c.effects ?? [])
      .filter((e) => e.kind === kind && e.dice)
      .map((e) => `${e.dice} ${e.type?.toLowerCase() ?? ''}`.trim())
  const onHit = riders('hit')
  const onCrit = riders('crit')
  return {
    name: item.name,
    props: [
      c.damageType,
      c.props,
      c.rarity ? `${c.rarity} magic` : '',
      ...(c.effects ?? []).map(itemEffectText),
    ]
      .filter(Boolean)
      .join(', '),
    dmg: mod ? `${expr.count}d${expr.sides}${sign(mod)}` : `${expr.count}d${expr.sides}`,
    melee,
    ...(onHit.length ? { onHit } : {}),
    ...(onCrit.length ? { onCrit } : {}),
  }
}

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

function shown(formula: string, stats: NimbleSheet['stats']): string {
  const value = armorValue(formula, stats)
  if (value === null) return formula
  return /[A-Z]/.test(formula) ? `${value} (${formula})` : `${value}`
}

export function itemStat(sheet: NimbleSheet, item: InventoryItem, level: number): string {
  if (isWeapon(item)) {
    const live = item.custom ? itemAttack(sheet, item, level) : null
    const attack =
      live ?? sheet.attacks.find((a) => a.name === item.name) ?? itemAttack(sheet, item, level)
    return attack?.dmg ?? ''
  }
  const book = armorByName(item.name)
  const magic = magicItemByName(item.name)
  const custom =
    item.custom?.kind === 'armor' || item.custom?.kind === 'shield' ? item.custom : null
  const formula = book?.armor ?? custom?.armor ?? magic?.armor
  if (!formula) return ''
  const shield = book?.kind === 'Shield' || custom?.kind === 'shield' || magic?.kind === 'shield'
  if (shield) return `+${formula.replace(/^\+/, '')} Armor`
  const value = armorValue(formula, sheet.stats)
  return `Armor ${value ?? formula}`
}

export function isWeapon(item: InventoryItem): boolean {
  return item.custom ? item.custom.kind === 'weapon' : !!weaponByName(item.name)
}

export function itemSummary(sheet: NimbleSheet, item: InventoryItem, level: number): string {
  const c = item.custom
  const lines: string[] = []
  const attack =
    sheet.attacks.find((a) => a.name === item.name) ??
    (isWeapon(item) ? itemAttack(sheet, item, level) : null)
  if (attack) {
    lines.push(`${attack.melee ? 'Melee' : 'Ranged'} attack, 1 action: ${attack.dmg} damage`)
    if (attack.props) lines.push(attack.props)
  }
  const armor = armorByName(item.name)
  if (armor) {
    lines.push(
      armor.kind === 'Shield'
        ? `Shield: +${armor.armor.replace(/^\+/, '')} Armor`
        : `${armor.kind} armor: ${shown(armor.armor, sheet.stats)}`,
    )
    if (armor.str) lines.push(`Requires ${armor.str} STR`)
  }
  if (c?.kind === 'armor' && c.armor) lines.push(`Armor: ${shown(c.armor, sheet.stats)}`)
  if (c?.kind === 'shield' && c.armor) lines.push(`Shield: +${c.armor.replace(/^\+/, '')} Armor`)
  const magic = magicItemByName(item.name)
  if (magic) {
    lines.push(`${magic.rarity} magic item${magic.armor ? ` · ${magic.armor} Armor` : ''}`)
    lines.push(magic.desc)
    if (magic.kind === 'wand') lines.push(WAND_RULES)
  }
  if (item.name === SPELL_SCROLL) lines.push(SCROLL_RULES)
  if (c?.rarity && !attack) lines.push(`${c.rarity} magic item`)
  if (c?.effects?.length && !attack) lines.push(c.effects.map(itemEffectText).join('. '))
  if (c?.desc) lines.push(c.desc)
  const gear = gearByName(item.name)
  if (gear) lines.push(gear.desc)
  const cost = weaponByName(item.name)?.cost ?? armor?.cost ?? gear?.cost
  if (cost && !c) lines.push(`Cost: ${cost}`)
  if (!lines.length) {
    const ability = sheet.abilities.find((a) => a.name === item.name)
    if (ability) lines.push(ability.desc)
  }
  return lines.join('\n')
}
