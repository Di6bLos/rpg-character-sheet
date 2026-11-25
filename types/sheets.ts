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
  /** The attribute the attack roll uses (conditions like clumsy and enfeebled read it). */
  attr?: Pf2eAttr
  ranged?: boolean
  /** The hero's proficiency rank with the weapon (weapon specialization reads it). */
  rank?: Pf2eRank
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
  /** AoN id, for heroes made in the builder. */
  id?: string
  /** "once per day", "once per 10 minutes"… as the book puts it. */
  frequency?: string
  trigger?: string
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
  shield: {
    name: string
    /** Its circumstance bonus to AC while raised (Buckler +1, most +2); absent means +2. */
    ac?: number
    hardness: number
    hp: number
    hpMax: number
    bt: number
    raised: boolean
  }
  /** Fortitude, Reflex, Will, Perception, Class DC. */
  saves: Pf2eProficiency[]
  tempHp: number
  dying: number
  wounded: number
  /** Lowers the dying value at which the hero dies (Player Core p. 443). */
  doomed?: number
  speed: string
  conditions: string[]
  /** Values of valued conditions in `conditions` (frightened 2); absent means 1. */
  conditionValues?: Record<string, number>
  skills: Pf2eSkill[]
  strikes: Pf2eStrike[]
  focus: { max: number; current: number; note: string }
  feats: Pf2eFeat[]
  bulkLimit: number
  coins: { gp: number; sp: number; cp: number }
  /**
   * Class slug from `data/pf2e` for heroes made in the builder; absent on hand-made
   * sheets, which keep the free-text editing.
   */
  classSlug?: string
  /** What the builder was given (AoN ids), so the build can be read back or redone. */
  creation?: Pf2eCreation
  /** The class's spellcasting, for casters (Player Core pp. 297–298). */
  spellcasting?: Pf2eSpellcasting
  /** Focus spells the hero knows; `focus` holds the pool. */
  focusSpells?: Pf2eSpellRef[]
  /**
   * Effects from `data/pf2e/effects.ts`: toggles the hero has turned on (Rage) and effects
   * from allies (Bless, Heroism +2), by name. `tempHp`: the temporary Hit Points a toggle
   * gave (Rage), so they go when it ends.
   */
  effects?: {
    on: string[]
    given: { name: string; value?: number }[]
    tempHp?: { from: string; amount: number }
  }
  /** Abilities with a daily frequency used since the last daily preparations, by name. */
  used?: string[]
}

/** A spell from `data/pf2e`: its AoN id, name and lowest rank (cantrips are rank 1). */
export interface Pf2eSpellRef {
  id: string
  name: string
  rank: number
  /**
   * A spontaneous caster's signature spell (Player Core p. 297): it heightens to any rank the
   * hero has slots for, not only the rank it's known at.
   */
  signature?: boolean
}

/** One rank of spell slots; prepared casters fill each slot with a spell. */
export interface Pf2eSlotRank {
  max: number
  /** Spontaneous: slots spent today. */
  used: number
  /** Prepared: the spell in each slot (an id, or null while empty) and whether it was cast. */
  prepared?: { id: string | null; cast: boolean }[]
}

export interface Pf2eSpellcasting {
  tradition: string
  kind: 'prepared' | 'spontaneous'
  attr: Pf2eAttr
  /** Proficiency for the spell attack modifier and spell DC. */
  rank: Pf2eRank
  cantrips: Pf2eSpellRef[]
  /** Spontaneous: the repertoire. Prepared: the spells the hero prepares from. */
  spells: Pf2eSpellRef[]
  /** Ranks 1–10, in order. */
  slots: Pf2eSlotRank[]
  /** A cleric's divine font: extra slots at the highest rank for heal or harm (p. 108). */
  font?: { spell: string; max: number; used: number }
}

/** The choices a Pathfinder 2e hero was built from (Player Core pp. 22–27); ids are AoN ids. */
export interface Pf2eCreation {
  ancestry: string
  heritage: string
  background: string
  class: string
  deity?: string
  /** Alternate Ancestry Boosts (Player Core p. 23): two free boosts instead of the listed ones and flaws. */
  freeAncestryBoosts: boolean
  /** The ancestry's free boosts (both of them with `freeAncestryBoosts`). */
  ancestryBoosts: Pf2eAttr[]
  /** One of the background's two attributes, then its free boost. */
  backgroundBoosts: Pf2eAttr[]
  keyAttribute: Pf2eAttr
  /** The four free boosts of Step 6. */
  freeBoosts: Pf2eAttr[]
  /** Subclass choice key → option ids (a muse, three ikons…). */
  subclasses: Record<string, string[]>
  /** Skills the player chose to be trained in. */
  skills: string[]
  /** Names for the Lore skills a background leaves to the player, in its order ("Desert"). */
  lores?: string[]
  /** Feat slot (`ancestry`, `class`, `skill`) → feat id. */
  feats: Record<string, string>
  armor?: string
  shield?: string
  weapons: string[]
  /** Spells picked at creation (AoN ids): cantrips, then 1st-rank spells. */
  spells?: { cantrips: string[]; rank1: string[] }
  /** A cleric's divine font when the deity offers both. */
  font?: string
  /** The tradition a draconic bloodline or dragon eidolon leaves to the player. */
  tradition?: string
  /** Focus spells and class cantrips (AoN ids); absent means the ones the features name. */
  focus?: string[]
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
