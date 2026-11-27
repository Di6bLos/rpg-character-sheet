// The standing numbers a 5e (2024) hero's features give while something holds: Resistances
// while raging (Primordial Bond) or in a form (Full of Stars), bonuses to checks (Thaumaturge,
// Otherworldly Glamour), to saves (Hungering Might, Improved Circle Forms) and to Initiative
// (Dread Ambusher, Rakish Audacity), Advantage sources (Assassinate, Life Essence), AC floors
// (Circle Forms), death-save edges (Survivor) and Speed (Gloom Stalker's first turn). The play
// engine (utils/dnd5ePlay.ts d20Test, acNow, speedNow, defensesNow, concentrationTest) adds the
// ones that apply. Features are read by their sheet name through `has`; tests/dnd5eRules.test.ts
// checks each is in the data. Pure, no imports from the engine (it imports this).
import type { Dnd5eAbility, Dnd5eSheet } from '~/types/sheets'
import { hasEffect } from '~/utils/dnd5eEffects'

const ALL: Dnd5eAbility[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']

/** What the modifiers need to know about the hero. */
export interface Dnd5eModifierHero {
  level: number
  pb: number
  has: (name: string) => boolean
  mod: (a: Dnd5eAbility) => number
}

/**
 * When it holds: an effect on the hero by key, `unarmored` (no armor), `no-shield`, `no-heavy`
 * (no Heavy armor), `bloodied`, `round1` (combat's first round), `first-turn` (your first turn
 * of the encounter).
 */
export type Dnd5eModifierWhile = string

/** An amount: a number, an ability modifier (at least +1), or PB. */
export type Dnd5eAmount = number | Dnd5eAbility | 'PB'

export interface Dnd5eModifier {
  feature: string
  while?: Dnd5eModifierWhile[]
  ac?: Dnd5eAmount
  /** AC is at least this base + ability (Circle Forms: 13 + WIS). */
  acFloor?: { base: number; plus: Dnd5eAbility }
  resist?: string[]
  /** A bonus to saves of these abilities (`all`), or Advantage on them. */
  save?: { abilities: Dnd5eAbility[] | 'all'; plus?: Dnd5eAmount; adv?: boolean }
  /** A bonus to checks with these skills or abilities, or Advantage on them. */
  check?: { skills?: string[]; abilities?: Dnd5eAbility[]; plus?: Dnd5eAmount; adv?: boolean }
  initiative?: { plus?: Dnd5eAmount; dice?: string; adv?: boolean }
  /** Death saves: Advantage, and a roll this high counts as a 20 (Survivor). */
  death?: { adv?: boolean; twentyOn?: number }
  concentration?: { plus?: Dnd5eAmount; adv?: boolean }
  speed?: number
  note: string
}

export const DND5E_MODIFIERS: Dnd5eModifier[] = [
  // Barbarian
  {
    feature: 'Primordial Bond',
    while: ['rage'],
    resist: ['Cold', 'Fire', 'Lightning'],
    note: 'Resistance to Cold, Fire and Lightning while raging.',
  },
  // Bard
  {
    feature: 'Dazzling Footwork',
    while: ['unarmored', 'no-shield'],
    check: { skills: ['Performance'], adv: true },
    note: 'Advantage on Performance checks that involve dancing, without armor or a Shield.',
  },
  // Cleric, Druid
  {
    feature: 'Divine Order: Thaumaturge',
    check: { skills: ['Arcana', 'Religion'], plus: 'WIS' },
    note: 'Your WIS modifier (min +1) on Arcana and Religion checks.',
  },
  {
    feature: 'Primal Order: Magician',
    check: { skills: ['Arcana', 'Nature'], plus: 'WIS' },
    note: 'Your WIS modifier (min +1) on Arcana and Nature checks.',
  },
  {
    feature: 'Circle Forms',
    while: ['wild-shape'],
    acFloor: { base: 13, plus: 'WIS' },
    note: 'In Wild Shape your AC is at least 13 + WIS.',
  },
  {
    feature: 'Improved Circle Forms',
    while: ['wild-shape'],
    save: { abilities: ['CON'], plus: 'WIS' },
    note: 'In Wild Shape, add your WIS modifier to Constitution saves.',
  },
  {
    feature: 'Stormborn',
    while: ['wrath-of-the-sea'],
    resist: ['Cold', 'Lightning', 'Thunder'],
    note: 'While Wrath of the Sea lasts: Resistance to Cold, Lightning and Thunder, and a Fly Speed equal to your Speed.',
  },
  {
    feature: 'Full of Stars',
    while: ['starry-archer|starry-chalice|starry-dragon'],
    resist: ['Bludgeoning', 'Piercing', 'Slashing'],
    note: 'In Starry Form: Resistance to Bludgeoning, Piercing and Slashing.',
  },
  // Fighter
  {
    feature: 'Survivor',
    death: { adv: true, twentyOn: 18 },
    note: 'Advantage on death saves, and an 18–20 counts as a 20.',
  },
  {
    feature: 'Armor Model: Infiltrator',
    speed: 5,
    check: { skills: ['Stealth'], adv: true },
    note: 'Your Infiltrator armor: +5 ft Speed and Advantage on Stealth checks.',
  },
  {
    feature: 'Adventurer’s Atlas',
    initiative: { dice: '1d4' },
    note: 'Holding one of your maps: +1d4 to Initiative.',
  },
  // Paladin
  {
    feature: 'Aura of Warding',
    resist: ['Necrotic', 'Psychic', 'Radiant'],
    note: 'In your Aura of Protection: Resistance to Necrotic, Psychic and Radiant.',
  },
  {
    feature: 'Aura of Deathly Endurance',
    resist: ['Cold', 'Necrotic', 'Psychic'],
    note: 'In your Aura of Protection: Resistance to Cold, Necrotic and Psychic.',
  },
  // Ranger
  {
    feature: 'Dread Ambusher',
    initiative: { plus: 'WIS' },
    note: 'Your WIS modifier on Initiative rolls.',
  },
  {
    feature: 'Dread Ambusher',
    while: ['first-turn'],
    speed: 10,
    note: '+10 ft Speed on your first turn of each combat.',
  },
  {
    feature: 'Otherworldly Glamour',
    check: { abilities: ['CHA'], plus: 'WIS' },
    note: 'Your WIS modifier (min +1) on Charisma checks.',
  },
  {
    feature: 'Hungering Might',
    save: { abilities: ['CON'], plus: 'WIS' },
    note: 'Your WIS modifier (min +1) on Constitution saves.',
  },
  // Rogue
  {
    feature: 'Assassinate',
    initiative: { adv: true },
    note: 'Advantage on Initiative rolls.',
  },
  {
    feature: 'Rakish Audacity',
    initiative: { plus: 'CHA' },
    note: 'Your CHA modifier on Initiative rolls.',
  },
  {
    feature: 'Tokens of the Departed',
    save: { abilities: ['CON'], adv: true },
    death: { adv: true },
    note: 'Holding a soul trinket: Advantage on Constitution saves and death saves.',
  },
]

const wearsArmor = (s: Dnd5eSheet) => s.inventory?.some((i) => i.worn && i.tag === 'Armor')
const wearsShield = (s: Dnd5eSheet) => s.inventory?.some((i) => i.worn && i.tag === 'Shield')

function holds(s: Dnd5eSheet, w: Dnd5eModifierWhile, heavy: boolean): boolean {
  if (w === 'unarmored') return !wearsArmor(s)
  if (w === 'no-shield') return !wearsShield(s)
  if (w === 'no-heavy') return !heavy
  if (w === 'bloodied') return s.hp <= Math.floor(s.hpMax / 2)
  if (w === 'round1') return !!s.inEncounter && (s.turn?.round ?? 1) <= 1
  if (w === 'first-turn') return !!s.inEncounter && !!s.turn?.active && (s.turn?.round ?? 1) <= 1
  return w.split('|').some((k) => hasEffect(s, k))
}

/** The modifiers that apply to the hero now. `heavy`: it wears Heavy armor. */
export function activeModifiers(
  s: Dnd5eSheet,
  hero: Dnd5eModifierHero,
  heavy = false,
): Dnd5eModifier[] {
  return DND5E_MODIFIERS.filter(
    (m) => hero.has(m.feature) && (m.while ?? []).every((w) => holds(s, w, heavy)),
  )
}

/** An amount's value for the hero: an ability modifier counts at least +1. */
export function amountOf(hero: Dnd5eModifierHero, a: Dnd5eAmount | undefined): number {
  if (a === undefined) return 0
  if (typeof a === 'number') return a
  if (a === 'PB') return hero.pb
  return Math.max(1, hero.mod(a))
}

export const allAbilities = (a: Dnd5eAbility[] | 'all') => (a === 'all' ? ALL : a)
