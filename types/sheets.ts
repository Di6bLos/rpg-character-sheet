// System-specific sheet data stored in characters.sheet (jsonb).
// Every sheet shares SheetCommon so rosters and the GM console can read a
// character's headline numbers without knowing its system.

export interface SheetCommon {
  /** Race / ancestry. */
  lineage: string
  class: string
  background: string
  hp: number
  hpMax: number
  ac: number
  initMod: number
  passivePerception: number
  xp: number
  xpNext: number
  inventory: InventoryItem[]
  notes: string
}

export interface InventoryItem {
  name: string
  /** Quantity (5e, Nimble) or Bulk (PF2e). */
  qty: string
}

export interface NamedEntry {
  name: string
  desc: string
}

// --- D&D 5e ---------------------------------------------------------------
export type Dnd5eAbility = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA'

export interface Dnd5eWeapon {
  name: string
  atk: number
  dmg: string
  type: string
  range: string
}

export interface Dnd5eSheet extends SheetCommon {
  alignment: string
  abilities: Record<Dnd5eAbility, number>
  saveProfs: Dnd5eAbility[]
  hitDie: number
  speed: string
  profBonus: number
  deathSaves: { successes: number; failures: number }
  weapons: Dnd5eWeapon[]
  features: NamedEntry[]
}

// --- Pathfinder 2e --------------------------------------------------------
export type Pf2eAttr = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA'
export type Pf2eRank = 'U' | 'T' | 'E' | 'M' | 'L'

export interface Pf2eProficiency {
  label: string
  rank: Pf2eRank
  value: number
}

export interface Pf2eSkill {
  name: string
  attr: Pf2eAttr
  rank: Pf2eRank
  value: number
}

export interface Pf2eStrike {
  name: string
  bonus: number
  agile: boolean
  dmg: string
  type: string
  traits: string
}

export interface Pf2eFeat {
  type: string
  level: string
  action: string
  name: string
  desc: string
}

export interface Pf2eSheet extends SheetCommon {
  heritage: string
  subclass: string
  deity: string
  heroPoints: number
  keyAttr: Pf2eAttr
  attrs: Record<Pf2eAttr, number>
  acRank: Pf2eRank
  hpPerLevel: number
  shield: { name: string; hardness: number; hp: number; hpMax: number; bt: number; raised: boolean }
  /** Fortitude, Reflex, Will, Perception, Class DC. */
  saves: Pf2eProficiency[]
  tempHp: number
  dying: number
  wounded: number
  speed: string
  conditions: string[]
  skills: Pf2eSkill[]
  strikes: Pf2eStrike[]
  focus: { max: number; current: number; note: string }
  feats: Pf2eFeat[]
  bulkLimit: number
  coins: { gp: number; sp: number; cp: number }
}

// --- Nimble ---------------------------------------------------------------
export type NimbleStat = 'STR' | 'DEX' | 'INT' | 'WIL'

export interface NimbleAttack {
  name: string
  props: string
  dmg: string
  melee: boolean
}

export interface NimbleSkill {
  name: string
  stat: NimbleStat
  points: number
}

export interface NimbleAbility {
  name: string
  src: string
  desc: string
}

export interface NimbleSheet extends SheetCommon {
  subclass: string
  stats: Record<NimbleStat, number>
  saveAdv: NimbleStat | ''
  saveDis: NimbleStat | ''
  wounds: number
  speed: string
  hitDie: number
  hitDice: number
  actionsSpent: number
  /** Class resource that adds bonus dice to melee damage (Rage / Fury dice for a Berserker). */
  resource: { name: string; diceName: string; active: boolean; dice: number; die: number }
  attacks: NimbleAttack[]
  skills: NimbleSkill[]
  abilities: NimbleAbility[]
  gold: string
}

export type AnySheet = Dnd5eSheet | Pf2eSheet | NimbleSheet

export interface SheetBySystem {
  dnd5e: Dnd5eSheet
  pf2e: Pf2eSheet
  nimble: NimbleSheet
}
