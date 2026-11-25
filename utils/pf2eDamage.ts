// Pathfinder 2e damage on the hero beyond the amount: damage types and their categories
// (Player Core pp. 407–408), immunities, then weaknesses, then resistances (p. 407), what a
// raging barbarian's Raging Resistance resists by instinct (Player Core 2 pp. 74–75), the
// persistent damage condition (p. 445), and the deadly and fatal weapon traits on a critical
// hit (p. 282). `takeDamage` in utils/pf2ePlay.ts applies them.
import type { Pf2eSheet } from '~/types/sheets'
import { parseDice } from '~/utils/dice'
import { resistancesNow } from '~/utils/pf2eEffects'

/** Physical damage (p. 407); bleed is a special physical type. */
export const PHYSICAL_TYPES = ['bludgeoning', 'piercing', 'slashing', 'bleed']
/** Energy damage (p. 407), vitality, void and force included. */
export const ENERGY_TYPES = [
  'acid',
  'cold',
  'electricity',
  'fire',
  'sonic',
  'vitality',
  'void',
  'force',
]
/** The damage types the hero can be dealt, for the damage form's type pick. */
export const PF2E_DAMAGE_TYPES = [...PHYSICAL_TYPES, ...ENERGY_TYPES, 'spirit', 'mental', 'poison']

/** What a damage instance is, for immunities, weaknesses and resistances. */
export interface Pf2eHit {
  type?: string
  /** From a spell (resistance to spells, Arcane Cascade). */
  spell?: boolean
  /** Persistent damage (resistance to persistent bleed). */
  persistent?: boolean
}

const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\bdamage\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Whether an immunity, weakness or resistance covers a hit: all damage, a category (physical,
 * energy, spells), "persistent bleed", or the type itself; lists like "piercing and slashing".
 */
export function covers(kind: string, hit: Pf2eHit): boolean {
  const k = norm(kind)
  if (/^all\b/.test(k)) return true
  const type = norm(hit.type ?? '')
  return k
    .split(/,|\band\b|\bor\b/)
    .map((x) => x.trim())
    .filter(Boolean)
    .some((part) => {
      const persistent = part.startsWith('persistent ')
      const what = persistent ? part.slice('persistent '.length) : part
      if (persistent && !hit.persistent) return false
      if (what === 'physical' || what === 'physical weapon') return PHYSICAL_TYPES.includes(type)
      if (what === 'energy') return ENERGY_TYPES.includes(type)
      if (/^(?:from )?spells?$/.test(what)) return !!hit.spell
      return !!type && what === type
    })
}

/**
 * Raging Resistance resists "damage types based on your instinct" (Player Core 2 p. 70): the
 * types each instinct names (pp. 74–75; Elemental, Rage of Elements p. 54; Bloodrager, War of
 * Immortals p. 60), and what only the table can apply.
 */
export const INSTINCT_RESISTS: Record<string, { types: string; note?: string }> = {
  Animal: { types: 'piercing, slashing' },
  Bloodrager: {
    types: 'slashing, persistent bleed',
    note: 'also damage from the creature whose blood you last drank',
  },
  Dragon: { types: 'piercing', note: 'also your dragon breath’s damage type' },
  Elemental: {
    types: '',
    note: 'damage from elementals of your element and effects with its trait',
  },
  Fury: { types: 'physical', note: 'weapon damage only, not unarmed attacks' },
  Giant: { types: 'bludgeoning', note: 'also cold, electricity or fire, as you chose' },
  Spirit: { types: 'void', note: 'also damage from undead' },
  Superstition: { types: 'spells', note: 'spells of your two chosen traditions' },
}

/** The hero's barbarian instinct, by its feature (or the sheet's subclass line). */
const instinctOf = (s: Pf2eSheet) =>
  s.feats.find((f) => f.type.toLowerCase() === 'instinct')?.name ??
  s.subclass
    .split(',')
    .find((x) => INSTINCT_RESISTS[x.trim()])
    ?.trim() ??
  ''

export interface Pf2eDefense {
  type: string
  value: number
  source: string
  note?: string
}

/** The hero's immunities, weaknesses and resistances: the sheet's own and the effects'. */
export function defensesOf(s: Pf2eSheet, level = s.level ?? 1) {
  const own = s.defenses
  const instinct = INSTINCT_RESISTS[instinctOf(s)]
  const fromEffects = resistancesNow(s, level).map((r): Pf2eDefense => {
    if (!/instinct/i.test(r.type)) return r
    if (!instinct) return r
    return {
      ...r,
      type: instinct.types || r.type,
      ...(instinct.note ? { note: instinct.note } : {}),
    }
  })
  return {
    resistances: [
      ...(own?.resistances ?? []).map((r) => ({ ...r, source: 'Sheet' })),
      ...fromEffects,
    ] as Pf2eDefense[],
    weaknesses: (own?.weaknesses ?? []).map((w) => ({ ...w, source: 'Sheet' })) as Pf2eDefense[],
    immunities: own?.immunities ?? [],
  }
}

const highest = (list: Pf2eDefense[], hit: Pf2eHit) =>
  list.filter((d) => d.value > 0 && covers(d.type, hit)).sort((a, b) => b.value - a.value)[0]

/**
 * One damage instance after the hero's defenses (p. 407): an immunity ignores it, then the
 * highest weakness that applies adds, then the highest resistance takes off (to 0). Returns
 * the amount, what changed it, and the resistance used (an effect against "the triggering
 * damage" ends once it has).
 */
export function applyDefenses(s: Pf2eSheet, amount: number, hit: Pf2eHit, level = s.level ?? 1) {
  const d = defensesOf(s, level)
  const immune = d.immunities.find((i) => covers(i, hit))
  if (immune) return { amount: 0, notes: [`immune to ${immune}`], resisted: undefined }
  let n = amount
  const notes: string[] = []
  const weak = amount > 0 ? highest(d.weaknesses, hit) : undefined
  if (weak) {
    n += weak.value
    notes.push(`weakness ${weak.value} ${weak.type}`)
  }
  const resist = n > 0 ? highest(d.resistances, hit) : undefined
  if (resist) {
    n = Math.max(0, n - resist.value)
    const by = resist.source === 'Sheet' ? '' : `, ${resist.source}`
    notes.push(`resistance ${resist.value} ${resist.type}${by}`)
  }
  return { amount: n, notes, resisted: resist }
}

// --- Persistent damage --------------------------------------------------------------

/** The flat check DC that ends persistent damage (p. 445); 10 with particularly apt help. */
export const PERSISTENT_DC = 15
export const ASSISTED_DC = 10

/** A dice expression or amount's average, to tell the higher of two of a type (p. 445). */
export function averageOf(dice: string) {
  const e = parseDice(dice)
  if (e) return (e.count * (e.sides + 1)) / 2 + e.mod
  const n = Number(dice.trim())
  return Number.isFinite(n) ? n : 0
}

/** "1d6", "2", "2d6+3" are amounts persistent damage can be; anything else isn't. */
export const persistentAmount = (dice: string) => {
  const t = dice.replace(/\s+/g, '')
  return parseDice(t) || /^\d+$/.test(t) ? t : null
}

/**
 * Gains persistent damage (p. 445): one condition per damage type, the higher amount overriding
 * the lower; an immunity to the type keeps it off.
 */
export function addPersistent(s: Pf2eSheet, dice: string, type: string): string {
  const amount = persistentAmount(dice)
  if (!amount) return `“${dice}” isn’t an amount like 1d6 or 2.`
  const t = norm(type) || 'untyped'
  const immune = defensesOf(s).immunities.find((i) => covers(i, { type: t, persistent: true }))
  if (immune) return `Immune to ${immune}: no persistent ${t} damage.`
  const list = (s.persistent ??= [])
  const had = list.find((p) => p.type === t)
  if (had && averageOf(had.dice) >= averageOf(amount))
    return `Already taking ${had.dice} persistent ${t} damage; the higher amount stays.`
  s.persistent = [...list.filter((p) => p !== had), { dice: amount, type: t }]
  return `${amount} persistent ${t} damage: taken at the end of each of your turns, then a DC ${PERSISTENT_DC} flat check ends it.`
}

/** Ends one persistent damage condition. */
export function removePersistent(s: Pf2eSheet, type: string): string {
  const t = norm(type)
  const before = s.persistent?.length ?? 0
  s.persistent = (s.persistent ?? []).filter((p) => p.type !== t)
  return s.persistent.length < before ? `Persistent ${t} damage ends.` : ''
}

// --- Deadly and fatal ------------------------------------------------------------------

/** The die size a Strike's deadly or fatal trait names ("Deadly d10" → 10), if it has one. */
export function traitDie(traits: string[], trait: 'deadly' | 'fatal') {
  const m = traits
    .map((t) => new RegExp(`^${trait}\\s+1?d(\\d+)$`, 'i').exec(t.trim()))
    .find(Boolean)
  return m ? Number(m[1]) : undefined
}

/**
 * Deadly (p. 282): on a critical hit, one die of the listed size after doubling; two with a
 * greater striking rune (3 weapon dice), three with a major striking rune (4).
 */
export const deadlyCount = (weaponDice: number) => (weaponDice >= 4 ? 3 : weaponDice >= 3 ? 2 : 1)

/**
 * What a critical hit changes on a Strike's dice (p. 282): fatal raises the weapon's damage die
 * to its size and adds one more such die; deadly adds its dice. Both extras come after the
 * doubling and aren't doubled (p. 407).
 */
export function critDiceFor(traits: string[], weapon: { count: number; sides: number }) {
  const fatal = traitDie(traits, 'fatal')
  const deadly = traitDie(traits, 'deadly')
  const after: { count: number; sides: number; label: string }[] = []
  if (fatal) after.push({ count: 1, sides: fatal, label: `fatal d${fatal}` })
  if (deadly)
    after.push({ count: deadlyCount(weapon.count), sides: deadly, label: `deadly d${deadly}` })
  return { sides: fatal ?? weapon.sides, after }
}
