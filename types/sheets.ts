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
  /**
   * The sheet as it was before each level-up, so lowering the level can undo
   * what the higher levels granted. Added by the level-up dialog.
   */
  levelHistory?: LevelHistoryEntry[]
}

export interface LevelHistoryEntry {
  /** Level reached by this level-up; `before` is the sheet at `level - 1`. */
  level: number
  before: Record<string, unknown>
  /** What was picked (Nimble sheets built from class data), to replay the level. */
  nimble?: NimbleLevelInput
}

export interface NimbleLevelInput {
  hpGain: number
  statBumps: Partial<Record<NimbleStat, number>>
  /** Skill that receives the level's extra skill point. */
  skillPoint?: string
  subclassSlug?: string
  picks: Record<string, string[]>
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
  /** Level it was gained at (characters built from class data). */
  level?: number
}

export interface NimbleSpells {
  /** Schools known: their cantrips and tiered spells up to `tier` are castable. */
  schools: string[]
  /** Highest unlocked spell tier; 0 = cantrips only. */
  tier: number
  /** Single spells learned outside a known school (Shadow Blast, Spellblade picks…). */
  learned: string[]
  /** Spells lost (Oathbreaker loses Heal…). */
  lost: string[]
  utility: string[]
}

export interface NimbleSheet extends SheetCommon {
  /** Links the sheet to the rules data in data/nimble; empty for hand-made sheets. */
  classSlug: string
  subclassSlug: string
  ancestrySlug: string
  backgroundSlug: string
  /** Picks made at creation and level-up, keyed "L<level>:<choice id>". */
  choices: Record<string, string[]>
  subclass: string
  stats: Record<NimbleStat, number>
  saveAdv: NimbleStat | ''
  saveDis: NimbleStat | ''
  wounds: number
  woundsMax: number
  speed: string
  hitDie: number
  hitDice: number
  actionsSpent: number
  /** Class resource that adds bonus dice to melee damage (Rage / Fury dice for a Berserker). */
  resource: { name: string; diceName: string; active: boolean; dice: number; die: number }
  attacks: NimbleAttack[]
  skills: NimbleSkill[]
  abilities: NimbleAbility[]
  spells: NimbleSpells
  mana: { current: number; max: number }
  gold: string
}

export type AnySheet = Dnd5eSheet | Pf2eSheet | NimbleSheet

export interface SheetBySystem {
  dnd5e: Dnd5eSheet
  pf2e: Pf2eSheet
  nimble: NimbleSheet
}
