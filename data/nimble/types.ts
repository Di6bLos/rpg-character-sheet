// Rules data for Nimble character creation and levelling, transcribed from the
// Nimble Core Rules and Heroes books (Nimble © 2025 Nimble Co., referenced
// under the Nimble 3rd Party Creator License). Art from the books is never
// used; class sigils are original.
import type { InventoryItem, NimbleResourceKind, NimbleStat } from '~/types/sheets'

export type SpellSchool = 'fire' | 'ice' | 'lightning' | 'wind' | 'radiant' | 'necrotic'

export interface AbilityDef {
  name: string
  desc: string
}

/** An option the player may pick from a class pool (Savage Arsenal, Invocations…). */
export interface PoolOption extends AbilityDef {
  /** Name of another option in the same pool that must be picked first. */
  requires?: string
  /** Option can be taken more than once (e.g. "+1 max Combat Dice"). */
  repeatable?: boolean
  /** Change to max Wounds while the option is held (Mighty Endurance). */
  woundsMax?: number
  /** Change to speed in spaces while the option is held (Unstoppable Protector). */
  speed?: number
  /** Change to max Hit Dice while the option is held (Fiendish Boon: -1). */
  hitDice?: number
  /**
   * +1 to one of these stats when picked (Fiendish Boon: DEX or INT). The build
   * raises the higher one (the first on a tie); the player can move it by hand.
   */
  statBump?: NimbleStat[]
}

export interface AbilityPool {
  id: string
  name: string
  /** Shown above the options, e.g. the Thrill of the Hunt charge rules. */
  note?: string
  options: PoolOption[]
}

/** Where the options for a level-up choice come from. */
export type ChoiceSource =
  /**
   * Options from the class's ability pools (merged). `spellMaxTier` also offers
   * single spells from any school up to that tier (Spellblade).
   */
  | { kind: 'pool'; pools: string[]; spellMaxTier?: number }
  /** Utility spells from the listed schools, or from every school the hero knows. */
  | { kind: 'utility'; schools: SpellSchool[] | 'known' }
  /** Pick a school the hero knows and learn all of its utility spells. */
  | { kind: 'utilitySchool' }
  /** Learn a whole spell school (cantrips and tiered spells). */
  | { kind: 'school'; schools: SpellSchool[] }
  /** Learn single spells from any school up to a tier (Spellblade). */
  | { kind: 'spell'; maxTier: number; minTier?: number; schools?: SpellSchool[] }
  /** Write in a choice the book leaves to the table (Epic Boon). */
  | { kind: 'text'; name: string; placeholder: string }

export interface ChoiceDef {
  /** Stable within the class, used to key recorded picks. */
  id: string
  label: string
  /** How many picks; "perSchool" means one from each spell school the hero knows. */
  count: number | 'perSchool'
  source: ChoiceSource
}

export interface StatIncrease {
  /** Stats the bonus may go to. */
  stats: NimbleStat[]
  /** Number of +1s; at level 20 every class gets +1 to any 2 stats. */
  count: number
}

export interface LevelDef {
  /**
   * Abilities gained. A name ending in "(n)" upgrades the earlier ability with
   * the same base name instead of adding a new entry.
   */
  abilities: AbilityDef[]
  /** Shown in the level-up dialog only (spell tiers, upgraded cantrips). */
  notes?: string[]
  choices?: ChoiceDef[]
  statIncrease?: StatIncrease
  /** The class table asks for a subclass at this level. */
  subclassChoice?: boolean
  /** Highest spell tier unlocked from this level on. */
  spellTier?: number
  /** Spell schools learned automatically. */
  schools?: SpellSchool[]
  /** Utility spells granted outright ("You know all Necrotic Utility Spells"). */
  grantUtility?: SpellSchool[] | 'known'
  /** Single spells learned or lost (Oathbreaker swaps some Radiant spells). */
  spells?: { learn?: string[]; lose?: string[] }
  /** New size of the class resource die (Fury d6, Judgment d10…). */
  resourceDie?: number
  /** Hit Dice upgrade (Wild Heart d10). */
  hitDie?: number
  /** Flat bonus to max HP. */
  hpBonus?: number
  /** Change to speed in spaces. */
  speed?: number
  /** Change to max Wounds. */
  woundsMax?: number
  /** From this level on, Initiative gets +LVL (Zephyr's Swift Feet). */
  initiativePerLevel?: boolean
  /** From this level on, melee attacks deal +LVL damage (Zephyr's Reverberating Strikes). */
  meleeDamagePerLevel?: boolean
  /** From this level on, armor from the class formula is doubled (Zephyr's Iron Defense (2)). */
  armorDoubled?: boolean
  /** Abilities this level's features replace (removed from the sheet). */
  replacesAbilities?: string[]
}

export type LevelTable = Partial<Record<number, LevelDef>>

export interface SubclassDef {
  slug: string
  name: string
  /** Short hook for the picker, e.g. "fallen, seeking redemption". */
  tagline: string
  /** Story subclass: chosen with GM approval, replacing the current subclass. */
  story?: boolean
  /** Rules that apply as soon as a story subclass is taken. */
  intro?: AbilityDef[]
  /** Picks made as soon as the subclass is taken (Beastmaster companion). */
  introChoices?: ChoiceDef[]
  /** Spells learned or lost as soon as the subclass is taken (Oathbreaker). */
  introSpells?: { learn?: string[]; lose?: string[] }
  /** Extra schools allowed whenever the class picks a Utility Spell. */
  utilityExtra?: SpellSchool[]
  /** Class abilities this subclass replaces (removed from the sheet). */
  replacesAbilities?: string[]
  /** Class pools this subclass replaces in later choices (Spellblade). */
  poolSwap?: { replace: string[]; withPools: string[]; spellMaxTier?: number }
  /**
   * The hero's earliest picks from a pool that this subclass takes the place of
   * (Beastmaster: the companion's moves instead of the first 2 Thrill of the Hunt
   * abilities). They leave the sheet and come back if the subclass is removed.
   */
  dropPoolPicks?: { pool: string; count: number }
  /** Mana pool of a stat gained on Initiative and lost when combat ends (Spellblade). */
  encounterMana?: NimbleStat
  levels: LevelTable
}

/**
 * A class resource tracked on the sheet. `rage` is a toggled state whose dice add
 * to melee damage (Fury); `dice` and `counter` are pools the player counts by hand
 * (Combat Dice, Bursts of Speed); `uses` is spent by casting (Pilfered Power);
 * `info` only shows the rule (Sneak Attack).
 */
export interface ResourceDef {
  name: string
  diceName: string
  /** Die size, for the kinds that roll dice. */
  die: number
  kind: NimbleResourceKind
  /**
   * Ability that grants the resource. The panel appears once the hero has it and
   * shows its text, so upgrades from later levels are included.
   */
  ability: string
  /** Stat that sets how many the hero gets (shown as a hint; `uses` treats it as the limit). */
  stat?: NimbleStat
  /** Pool whose picked options appear as buttons that spend one. */
  movesPool?: string
  /** Extra uses from a level on (Windborne: +1 Burst of Speed at level 20). */
  bonus?: { level: number; amount: number }
}

export interface ClassDef {
  slug: string
  name: string
  /** One-line pitch from the book's index, e.g. "An unstoppable force of wrath and ruin." */
  tagline: string
  /** Short flavour for the detail panel. */
  description: string
  highlights: string[]
  complexity: 1 | 2 | 3
  keyStats: [NimbleStat, NimbleStat]
  hitDie: number
  startingHp: number
  saveAdv: NimbleStat
  saveDis: NimbleStat
  armor: string
  weapons: string
  startingGear: InventoryItem[]
  /** Names from WEAPONS that become attacks on the sheet. */
  startingWeapons: string[]
  /** How starting armor is worked out from gear: base, DEX cap, shield bonus. */
  armorCalc: { base: number; dexMax?: number; shield?: number; addStr?: boolean }
  /** Formula text for the mana pool, and how to compute it. */
  mana?: { label: string; stat: NimbleStat; mult: number }
  resource?: ResourceDef
  /** "Wrath & Ruin" style rule for swapping options on a Safe Rest. */
  swapRule: AbilityDef
  pools: AbilityPool[]
  levels: LevelTable
  subclasses: SubclassDef[]
}

export interface AncestryDef {
  slug: string
  name: string
  size: string
  exotic: boolean
  description: string
  trait: AbilityDef
  speed?: number
  hitDice?: number
  woundsMax?: number
  armor?: number
  initiative?: number
  /** Flat bonus to every skill (Human), or to named skills. */
  skills?: { all?: number; named?: Record<string, number> }
  /** The disadvantaged save becomes neutral (Celestial). */
  clearSaveDis?: boolean
  /** Hit Dice go up one size (Oozeling/Construct). */
  hitDieStep?: number
  language?: string
}

export interface BackgroundDef {
  slug: string
  name: string
  desc: string
  /** Only available when the stat is 0 or negative at creation. */
  requires?: { stat: NimbleStat; max: number }
  woundsMax?: number
  hitDice?: number
  armor?: number
  initiative?: number
  skills?: Record<string, number>
  /** A pick made at creation (Academy Dropout learns a Utility Spell). */
  choice?: ChoiceDef
}

export interface WeaponDef {
  name: string
  /** Damage dice before the stat, e.g. "1d10". */
  dice: string
  stat: NimbleStat
  type: string
  props: string
  melee: boolean
}

export interface SpellDef {
  name: string
  school: SpellSchool
  /** 0 = cantrip. */
  tier: number
  /** "1 Action, Single Target" style header. */
  cast: string
  desc: string
  utility?: boolean
  /** Only this class can learn it (Vicious Mockery, Lifebinding Spirit, Shadow Blast…). */
  classOnly?: string
  /** Never comes with a school; only granted by name (the Reaver's Bonescythe). */
  learnedOnly?: boolean
}

export interface StatArray {
  id: string
  name: string
  values: [number, number, number, number]
}
