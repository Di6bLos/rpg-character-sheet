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
  /** The player's free-text story of where the character comes from (not the rules background). */
  backstory: string
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
  /** Nimble: inventory slots each one takes; 0 = small item (all share one slot). */
  slots?: number
  /** Nimble: short label such as Weapon or Armor. */
  tag?: string
  custom?: CustomItem
  /** Nimble: armor or a shield the hero is wearing; what they wear sets their Armor. */
  worn?: boolean
}

export type CustomItemEffectKind =
  | 'hit'
  | 'crit'
  | 'condition'
  | 'heal'
  | 'resist'
  | 'returning'
  | 'light'

export interface CustomItemEffect {
  kind: CustomItemEffectKind
  dice?: string
  type?: string
  condition?: string
}

export interface CustomItem {
  kind: 'weapon' | 'armor' | 'shield' | 'gear'
  dice?: string
  stat?: NimbleStat
  damageType?: string
  props?: string
  melee?: boolean
  armor?: string
  rarity?: string
  effects?: CustomItemEffect[]
  desc?: string
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
  tempHp: number
  /** Condition names from DND5E_CONDITIONS (the GM can set them from the battle board). */
  conditions: string[]
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
  flat?: number
  onHit?: string[]
  onCrit?: string[]
}

export type ConditionEnd = 'turnStart' | 'turnEnd' | 'round' | 'encounter'

export interface NimbleCustomSummon {
  kind: 'minion' | 'companion' | 'spirit' | 'construct' | 'other'
  armor?: number
  speed?: number
  attack?: { name: string; dice: string; type?: string; reach?: number; actions: number }
  notes?: string
  abilities?: string[]
  resist?: string
  lasts: 'slain' | 'combat' | 'rest'
}

export interface NimbleSummon {
  id: string
  def: string
  name: string
  hp: number
  hpMax: number
  custom?: NimbleCustomSummon
  tier?: number
  charges?: number
  portrait?: string
  beast?: string
}

export interface NimbleSummonLook {
  name?: string
  portrait?: string
  beast?: string
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

/** How the class resource panel behaves on the Nimble sheet. */
export type NimbleResourceKind =
  | 'rage'
  | 'dice'
  | 'counter'
  | 'uses'
  | 'info'
  | 'power'
  | 'judgment'
  | 'crit'

/** Uses spent of a limited ability. The limit comes from its rules text unless `max` is set. */
export interface NimbleUses {
  /** The player's own limit, for bonuses the sheet can't work out. */
  max?: number
  used: number
}

export interface NimbleSheet extends SheetCommon {
  /** Links the sheet to the rules data in data/nimble; empty for hand-made sheets. */
  classSlug: string
  subclassSlug: string
  ancestrySlug: string
  backgroundSlug: string
  /** Picks made at creation and level-up, keyed "L<level>:<choice id>". */
  choices: Record<string, string[]>
  /**
   * Version of the class-data rules the save was built with. Older saves are
   * upgraded on load (`migrateNimble` in utils/sheetDefaults).
   */
  rulesVersion: number
  subclass: string
  stats: Record<NimbleStat, number>
  saveAdv: NimbleStat | ''
  saveDis: NimbleStat | ''
  wounds: number
  woundsMax: number
  speed: string
  hitDie: number
  /** Maximum Hit Dice. */
  hitDice: number
  hitDiceUsed: number
  tempHp: number
  /** At 0 HP and not yet healed. */
  dying: boolean
  actionsSpent: number
  /** Attacks made this turn; each one after the first rolls with one more disadvantage. */
  rushed: number
  /** Names of the reactions used this round. */
  reactionsUsed: string[]
  /** What the hero is concentrating on; empty when not concentrating. */
  concentration: string
  /** A spell that needs more actions than the turn had: the actions still owed. */
  casting: { spell: string; actions: number; at?: number }
  conditions: string[]
  conditionEnds: Record<string, ConditionEnd>
  /** Conditions ending at turn end that were set during this turn, so they last through the next one. */
  conditionHold?: string[]
  /**
   * Class resource. `active` and `dice` are a Berserker's Rage and Fury dice (added to
   * melee damage); `count` holds the dice, charges or uses of the other kinds (for
   * `crit`, 1 once it's used this turn). `rolls` are rolled Judgment Dice waiting for
   * the next melee attack.
   */
  resource: {
    name: string
    diceName: string
    kind: NimbleResourceKind
    active: boolean
    dice: number
    die: number
    count: number
    rolls: number[]
  }
  /** Use counters by `AbilityCounter.id` (see utils/nimblePlay). */
  uses: Record<string, NimbleUses>
  malfunctions: string[]
  summons: NimbleSummon[]
  summonLooks: Record<string, NimbleSummonLook>
  formPortraits: Record<string, string>
  portraitOverride: string
  ownDice: boolean
  /**
   * The seated campaign plays Classic initiative (copied from the board by the sheet
   * editor): the roll only orders turns, so Initiative starts the hero with full actions.
   */
  classicInitiative?: boolean
  /** Between Start turn and End turn. */
  turnActive: boolean
  /** From New encounter until a Safe Rest. */
  inEncounter: boolean
  /** Your turn is over for this round. */
  turnDone: boolean
  /** New encounter was tapped and Initiative not rolled yet. */
  awaitingInitiative?: boolean
  /** This encounter's Initiative total, once rolled. */
  initiative?: number | null
  /**
   * The GM's tracker seat (combatant id) this sheet joined; unset outside the GM's fight.
   * A load compares it with the tracker to tell a new fight, or one that ended, from the same.
   */
  gmCombatant?: string
  effects: {
    condition: string
    source: string
    ends: string[]
    skip?: number
    tempHp?: number
    /** Tiers the spell was upcast by, for effects that grow with it (Enchant Weapon). */
    upcast?: number
  }[]
  attacks: NimbleAttack[]
  skills: NimbleSkill[]
  abilities: NimbleAbility[]
  spells: NimbleSpells
  mana: { current: number; max: number; temp: number }
  coins: { gp: number; sp: number }
  languages: string
  heightWeight: string
}

export type AnySheet = Dnd5eSheet | Pf2eSheet | NimbleSheet

export interface SheetBySystem {
  dnd5e: Dnd5eSheet
  pf2e: Pf2eSheet
  nimble: NimbleSheet
}
