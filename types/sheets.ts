// System-specific sheet data stored in characters.sheet (jsonb).
// Every sheet shares SheetCommon so rosters and the GM console can read a
// character's headline numbers without knowing its system.
import type {
  Pf2eActivation,
  Pf2eEffectDef,
  Pf2eItemDamage,
  Pf2eItemKind,
  Pf2eItemNumbers,
  Pf2eRuneNumbers,
  Pf2eRuneVsDamage,
} from '~/data/pf2e/types'
import type { Dnd5eRecharge, Dnd5eSpellcastingKind, Dnd5eUses } from '~/data/dnd5e/types'

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
  /** What was picked (PF2e sheets built from class data), to replay the level. */
  pf2e?: Pf2eLevelInput
  /** What was picked (5e sheets built from class data), to replay the level. */
  dnd5e?: Dnd5eLevelInput
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
  /** PF2e: what the inventory tracks about the item; `qty` stays the Bulk of one. */
  pf2e?: Pf2eItemState
  /** Nimble and 5e: armor or a shield the hero is wearing; what they wear sets their Armor. */
  worn?: boolean
  /** 5e: a magic item the hero is attuned to (at most 3, SRD 5.2.1 p. 204). */
  attuned?: boolean
  /** 5e: made with the Artificer's Replicate Magic Item, from a plan. */
  replicated?: boolean
  /** 5e: charges spent from a magic item that has them. */
  chargesUsed?: number
}

/**
 * A Pathfinder 2e item on the sheet (Player Core pp. 269–271, GM Core pp. 219–225), with a
 * copy of the numbers its data record gives so the sheet works without loading the data.
 */
export interface Pf2eItemState extends Pf2eItemNumbers {
  /** AoN id of the record it was added from; absent for hand-written items. */
  id?: string
  kind?: Pf2eItemKind | 'weapon' | 'armor' | 'shield'
  count: number
  /** Bulk of one: 0.1 is light, 0 negligible (Player Core p. 269). */
  bulk: number
  level?: number
  /** Price of one in copper pieces. */
  price?: number
  /** Worn, held, or stowed (carried in a pack). Armor carried rather than worn is 1 Bulk more. */
  carry: 'worn' | 'held' | 'stowed'
  usage?: string
  traits?: string[]
  /** Invested now (GM Core p. 219). */
  invested?: boolean
  /** Invested since daily preparations, even if taken off since: it counts against the 10. */
  investedToday?: boolean
  activations?: Pf2eActivation[]
  /** Armor's category (light, medium, heavy, unarmored) and a weapon's melee or ranged, for runes. */
  category?: string
  ranged?: boolean
  /** Runes etched on a weapon or armor (GM Core pp. 224–225). */
  runes?: Pf2eItemRunes
  /** A staff's charges left today (GM Core p. 278). */
  charges?: number
  /** A wand's day (GM Core p. 282): cast, overcharged, broken or destroyed. */
  wand?: { cast: boolean; overcharged: boolean; broken: boolean }
  /** The spell in a scroll or wand, at the item's rank. */
  spell?: { id: string; name: string; rank: number }
  /** An item that grants Shield Block while held, as its text says (Scale of Igroon). */
  shieldBlock?: boolean
  /**
   * An injury poison applied to this weapon (GM Core p. 249): its affliction, spent by the next
   * Strike that hits.
   */
  poisoned?: { name: string; dc: number; save: string; stages: string[]; maxDuration?: string }
}

export interface Pf2eItemRunes {
  /** Weapon or armor potency +0–4. */
  potency: number
  /** Striking 0–4: extra weapon damage dice (striking, greater, major, mythic). */
  striking: number
  /** Resilient +0–4: item bonus to saves. */
  resilient: number
  property: Pf2ePropertyRune[]
  /** A shield's reinforcing rune (GM Core p. 232), by name, with what it adds. */
  reinforcing?: { id: string; name: string } & NonNullable<Pf2eRuneNumbers['reinforcing']>
}

export interface Pf2ePropertyRune {
  id: string
  name: string
  level: number
  damage?: Pf2eItemDamage
  /** Persistent damage on a hit (wounding), a condition the target tracks. */
  persistent?: Pf2eItemDamage
  /** Damage against some foes only (vitalizing against undead). */
  vs?: Pf2eRuneVsDamage[]
  crit?: string
  /** Keen: a natural 19 that hits is a critical hit (GM Core p. 237). */
  keen?: boolean
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
  /** The weapon's data slug when the builder added it; its numbers follow the hero's level-ups. */
  slug?: string
  /** A magic bonus to its attack and damage rolls (a +1 weapon), and the item that gives it. */
  magic?: number
  enchant?: string
}

/** A feature on the sheet. `from` marks one the builder added ("Fighter 2", "Elf", "Alert"). */
export interface Dnd5eFeatureEntry extends NamedEntry {
  from?: string
}

/** What a built hero is trained in, by the books' names ("Athletics", "Martial weapons"). */
export interface Dnd5eProficiencies {
  skills: string[]
  /** Skills with Expertise (twice the Proficiency Bonus, SRD 5.2.1 p. 182). */
  expertise: string[]
  tools: string[]
  languages: string[]
  weapons: string[]
  armor: string[]
}

/** A spell a built hero has: a class spell, or one a subclass, species, feat or option gives. */
export interface Dnd5eSpellRef {
  slug: string
  name: string
  /** 0 for a cantrip. */
  level: number
  /** What gives it ("Wizard", "High Elf", "Magic Initiate", "Life Domain"). */
  from: string
  ability: Dnd5eAbility
  /**
   * Always prepared and not counted against the class's prepared spells (subclass, species,
   * feat and option spells). Class picks leave it out.
   */
  always?: boolean
  /** Casts without a slot this often. */
  free?: Dnd5eUses
  /** Casts at will, without a slot (Armor of Shadows). */
  atWill?: boolean
  /** In the wizard's spellbook but not prepared. */
  book?: boolean
}

/** The class's spellcasting numbers at the hero's level (SRD 5.2.1 p. 106). */
export interface Dnd5eCasting {
  ability: Dnd5eAbility
  kind: Dnd5eSpellcastingKind
  /** The class whose spell list it uses. */
  list: string
  saveDc: number
  attack: number
  /** Spell slots per spell level 1–9. */
  slots: number[]
  /** Pact Magic slots (Warlock). */
  pact?: { slots: number; level: number }
  cantrips: number
  prepared: number
}

/** A limited-use feature at the hero's level (Rage, Channel Divinity, Sorcery Points). */
export interface Dnd5eResource {
  name: string
  /** What gives it ("Barbarian", "Battle Master", "Dragonborn"). */
  from: string
  max: number
  recharge: Dnd5eRecharge
  /** Uses a Short Rest gives back when the recharge is a Long Rest. */
  short?: number | 'all'
  dice?: string
}

/** The level 1 choices a built 5e hero was made from (SRD 5.2.1 pp. 19–23). */
export interface Dnd5eCreation {
  classSlug: string
  speciesSlug: string
  backgroundSlug: string
  /** How the scores were made; `manual` covers rolled scores typed in. */
  method: 'standard' | 'pointBuy' | 'manual'
  /** Scores before the background's increases. */
  base: Record<Dnd5eAbility, number>
  /** The background's +2/+1 or +1/+1/+1. */
  bonus: Partial<Record<Dnd5eAbility, number>>
  /** Starting equipment: the class's and the background's option letter (the last is gold). */
  equipment: { class: string; background: string }
  /**
   * A background the player made (`backgroundSlug` "custom", SRD 5.2.1 p. 193): its name, its
   * three abilities and the gear bought with its 50 GP (data slugs). Its feat, skills and tool
   * are picks in `choices` like any other.
   */
  custom?: { name: string; abilities: Dnd5eAbility[]; gear: string[] }
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
  features: Dnd5eFeatureEntry[]
  // Built from data/dnd5e by the hero builder and the data-driven level-up. All absent on a
  // hand-made sheet, which keeps the free-text level-up.
  /** Class slug; empty or absent means a hand-made sheet. */
  classSlug?: string
  subclassSlug?: string
  speciesSlug?: string
  backgroundSlug?: string
  creation?: Dnd5eCreation
  /** Every pick, keyed "L<level>:<choice>" (`L1:class:skills`, `L4:asi`, `L4:asi>asi`). */
  choices?: Record<string, string[]>
  proficiencies?: Dnd5eProficiencies
  /** Feats taken, with the level each came at. */
  featsTaken?: { slug: string; name: string; level: number }[]
  /** Option-group picks: invocations, metamagic, maneuvers, artificer plans. */
  options?: { group: string; slug: string; name: string; level: number }[]
  /** Weapon kinds whose mastery property the hero can use (weapon slugs). */
  masteries?: string[]
  castingStats?: Dnd5eCasting
  spells?: Dnd5eSpellRef[]
  resources?: Dnd5eResource[]
  senses?: { name: string; range: number }[]
  defenses?: { resistances: string[]; immunities: string[]; conditionImmunities: string[] }
  size?: string
  coins?: Dnd5eCoins
  // Play state, kept by the sheet's play engine (utils/dnd5ePlay.ts and friends). All optional,
  // so a sheet from before it loads as it was.
  /** "Manual dice" from the player's profile (`profiles.own_dice`), copied on by the sheet editor. */
  ownDice?: boolean
  /** The turn tracker (SRD 5.2.1 pp. 9–13). */
  turn?: Dnd5eTurn
  /** In an encounter (from New encounter, or the GM seating the hero, until it ends). */
  inEncounter?: boolean
  /** New encounter was started and Initiative isn't rolled yet. */
  awaitingInitiative?: boolean
  /** This round's turn is over (End turn); New round starts the next. */
  turnDone?: boolean
  /** The GM's tracker seat (combatant id) the sheet last joined, as Nimble's `gmCombatant`. */
  gmCombatant?: string
  /** Uses spent of each limited resource, by `Dnd5eResource.name`. */
  used?: Record<string, number>
  /** Spell slots spent, per spell level 1–9. */
  slotsUsed?: number[]
  /** Pact Magic slots spent. */
  pactUsed?: number
  /** Free casts spent (a feat's or species' spell), by `<slug>|<from>`. */
  freeUsed?: Record<string, number>
  /** The spell the hero is concentrating on (SRD 5.2.1 p. 179). */
  concentration?: { slug: string; name: string; level: number }
  /** Effects on the hero from its own features and spells, or an ally's (`DND5E_EFFECTS`). */
  effects?: Dnd5eEffect[]
  /** Exhaustion level 0–6 (SRD 5.2.1 p. 181); "Exhaustion" is in `conditions` while above 0. */
  exhaustion?: number
  /** When each condition the player set an end for goes away; absent: when they remove it. */
  conditionEnds?: Record<string, Dnd5eConditionEnd>
  /** Hit Point Dice spent (a hero has one per level, SRD 5.2.1 p. 185). */
  hitDiceUsed?: number
  /** Heroic Inspiration (SRD 5.2.1 p. 8): spend it to reroll a die. */
  heroicInspiration?: boolean
  /** The Abjurer's Arcane Ward: Hit Points it has left (it takes damage first). */
  arcaneWard?: number
  /** The Diviner's Portent: the foretold d20 rolls not yet used. */
  portent?: number[]
  /** Wild Shape's known Beast forms, entered by hand (the data has no stat blocks). */
  beastForms?: Dnd5eBeastForm[]
  /** The Beast form the hero is in (a `beastForms` name), while Wild Shape lasts. */
  beastForm?: string
  /** The Artificer's Spell-Storing Item: the spell in it and its uses left. */
  storedSpell?: { slug: string; name: string; level: number; uses: number }
}

/** A Beast form for Wild Shape (SRD 5.2.1 p. 44), its stat block's numbers as typed. */
export interface Dnd5eBeastForm {
  name: string
  /** Challenge Rating as printed ("1/4", "1"). */
  cr: string
  ac: number
  /** Speeds as printed ("40 ft, climb 30 ft"). */
  speed: string
  fly?: boolean
  attacks: { name: string; bonus: number; damage: string; type: string }[]
  notes?: string
}

export interface Dnd5eCoins {
  gp: number
  cp?: number
  sp?: number
  ep?: number
  pp?: number
}

/** When a condition or effect ends: your next turn's start or end, the next round, combat's end. */
export type Dnd5eConditionEnd = 'turnStart' | 'turnEnd' | 'round' | 'encounter'

/**
 * An effect on the hero: `key` names its numbers in `DND5E_EFFECTS` (utils/dnd5eEffects.ts).
 * `ends` is when it goes; `concentration` effects end with the hero's concentration, `long`
 * ones on a Long Rest, `attack` ones with the next attack roll, `manual` ones when turned off.
 */
export interface Dnd5eEffect {
  key: string
  /** As shown ("Rage", "Shield", "Bless (ally)"). */
  name: string
  ends: Dnd5eConditionEnd | 'concentration' | 'long' | 'manual' | 'attack'
  /** Set during this turn: "until the end of your next turn" skips this turn's end. */
  held?: boolean
  /** A number it carries (a Bardic Inspiration die's size, Parrying Stance's AC). */
  value?: number
  /** Who gave it (an ally's name). */
  from?: string
  /** A Bardic Inspiration die from a College of Valor bard (Combat Inspiration). */
  valor?: boolean
}

/**
 * The turn tracker (SRD 5.2.1 pp. 9–13): `active` between Start turn and End turn. On your turn
 * you have an action (more with Action Surge or Haste), a Bonus Action, movement and one free
 * object interaction; the Reaction is one a round, back at the start of your turn.
 */
export interface Dnd5eTurn {
  active: boolean
  /** Actions left this turn. */
  actions: number
  /** Actions this turn has had (1, plus Action Surge or Haste), for the circles. */
  actionsMax: number
  bonus: boolean
  reaction: boolean
  /** The free object interaction is still unused. */
  object: boolean
  /** Feet moved this turn. */
  moved: number
  /** Attacks left in the Attack action taken this turn (Extra Attack, SRD 5.2.1 p. 10). */
  attacks: number
  round: number
  /** The Initiative rolled this encounter. */
  initiative?: number
  /** The GM tracker's round whose turn the tracker started for the hero. */
  trackerRound?: number
  /**
   * Once-a-turn things used this turn: Sneak Attack, Savage Attacker, Cleave, Nick, a spell
   * slot (SRD 5.2.1 p. 105), Great Weapon Master's extra damage…
   */
  once: string[]
}

/**
 * A 5e level-up's picks (SRD 5.2.1 p. 23): the Hit Die result (rolled, or the fixed value)
 * before CON, and every choice by its key.
 */
export interface Dnd5eLevelInput {
  hpRoll: number
  picks: Record<string, string[]>
}

// --- Pathfinder 2e --------------------------------------------------------
/** A PF2e level-up's picks (Player Core p. 29); ids are AoN ids. */
export interface Pf2eLevelInput {
  /** The four attribute boosts at 5th, 10th, 15th and 20th level, each to a different one. */
  boosts: Pf2eAttr[]
  /** Feat slot key (`class`, `skill`, `general`, `ancestry`) → feat id. */
  feats: Record<string, string>
  /** One skill per skill increase, in order. */
  skills: string[]
  /** Skills an Intelligence increase trains (Player Core p. 29). */
  trained?: string[]
  /** Spells learned, by pick key (`rank3`, `book`, `cantrip`) → spell ids. */
  spells: Record<string, string[]>
  /** Feature choices (a weapon group, a saving throw, a later subclass option) by key. */
  choices: Record<string, string[]>
  /** The free archetype variant turned on or off from this level (GM Core p. 84). */
  freeArchetype?: boolean
}

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
  requirements?: string
  /** Its traits (Flourish, Attack, Press…), from the data. */
  traits?: string[]
  /** The archetype it was taken for (Player Core p. 215), shown grouped under it. */
  archetype?: string
  /** It is that archetype's dedication feat. */
  dedication?: boolean
  /** The feat that granted it (Basic Maneuver's fighter feat), which counts as one feat. */
  via?: string
}

export interface Pf2eSheet extends SheetCommon {
  /**
   * The character's level, copied from the character by the sheet so rules on the sheet
   * alone can tell when a later benefit starts (Warpriest's fifth doctrine at 15th).
   */
  level?: number
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
  /**
   * When each condition the player set an end for goes away: at the start or end of their next
   * turn, or when the encounter ends (`PF2E_END_LABELS` in utils/pf2ePlay.ts). Absent: when
   * they remove it.
   */
  conditionEnds?: Record<string, Pf2eConditionEnd>
  /** Set during the hero's own turn to end "at the end of your next turn": this turn's end skips them. */
  conditionHold?: string[]
  /** Conditions no rest or effect lowers until a week passes (Resurrect's, Player Core p. 394). */
  conditionsLocked?: string[]
  /**
   * Saved by the sheet editor for the battle board (`acParts` in utils/pf2ePlay.ts): the AC
   * modifiers not from conditions or the raised shield, and the conditions effects give.
   */
  acParts?: {
    mods: { value: number; type: 'status' | 'circumstance' | 'item' | 'untyped'; source: string }[]
    given: Record<string, number>
  }
  /**
   * Persistent damage conditions (Player Core p. 445), one per damage type: the dice or
   * amount taken at the end of each turn, and the round of its last assisted recovery.
   */
  persistent?: { dice: string; type: string; assisted?: number }[]
  /**
   * Resistances, weaknesses and immunities the player wrote down (ancestry, items, the GM's
   * call; p. 408). Effects add their own resistances on top.
   */
  defenses?: {
    resistances: { type: string; value: number }[]
    weaknesses: { type: string; value: number }[]
    immunities: string[]
  }
  skills: Pf2eSkill[]
  strikes: Pf2eStrike[]
  focus: { max: number; current: number; note: string }
  feats: Pf2eFeat[]
  bulkLimit: number
  coins: { pp?: number; gp: number; sp: number; cp: number }
  /** The sheet gave the hero encumbered for carrying too much (Player Core p. 269). */
  bulkEncumbered?: boolean
  /**
   * Class slug from `data/pf2e` for heroes made in the builder; absent on hand-made
   * sheets, which keep the free-text editing.
   */
  classSlug?: string
  /** What the builder was given (AoN ids), so the build can be read back or redone. */
  creation?: Pf2eCreation
  /**
   * Level-up choices later levels read, by key: a fighter's weapon group, a monk's path to
   * perfection, an exemplar's epithets.
   */
  levelChoices?: Record<string, string[]>
  /** Attributes holding a partial boost (Player Core p. 19: a boost to +4 or more). */
  partialBoosts?: Pf2eAttr[]
  /** The class's spellcasting, for casters (Player Core pp. 297–298). */
  spellcasting?: Pf2eSpellcasting
  /** Focus spells the hero knows; `focus` holds the pool. */
  focusSpells?: Pf2eSpellRef[]
  /** Spellcasting from multiclass archetypes, one entry per archetype (Player Core p. 215). */
  archetypeCasting?: Pf2eArchetypeCasting[]
  /**
   * Effects from `data/pf2e/effects.ts`: toggles the hero has turned on (Rage) and effects
   * from allies (Bless, Heroism +2), by name. `tempHp`: the temporary Hit Points a toggle
   * gave (Rage), so they go when it ends.
   */
  effects?: {
    on: string[]
    given: { name: string; value?: number }[]
    tempHp?: { from: string; amount: number }
    /** A toggle's number at the rank its spell was cast (Competitive Edge +2), by name. */
    values?: Record<string, number>
    /** Effects of consumables the hero used (an elixir's bonus), on until they end. */
    items?: Pf2eEffectDef[]
  }
  /**
   * Uses of abilities with a frequency since daily preparations (which clear it): the name for
   * a daily use, "name@period" for shorter ones (turn, round, minute, 10min, hour), with
   * ":target" for a per-target limit (Battle Medicine), once per use.
   */
  used?: string[]
  /**
   * The turn tracker (Player Core pp. 436–437): `active` between Start turn and End turn,
   * actions left, whether the reaction is spent, attacks made this turn (the multiple attack
   * penalty), and the round count.
   */
  turn?: {
    active: boolean
    actions: number
    reaction: boolean
    attacks: number
    round: number
    /** A flourish action was used this turn (p. 413: one per turn). */
    flourish?: boolean
    /** Effects begun this turn that last until the end of the next one. */
    carry?: string[]
    /** A finisher was used this turn: no more attack actions (Player Core 2 p. 163). */
    finisher?: boolean
    /** The initiative rolled this encounter (one roll, p. 434), kept until it ends. */
    initiative?: number
    /** The GM tracker's round whose turn the tracker started for the hero (board turn steps). */
    trackerRound?: number
    /** Actions stunned and slowed took at the start of this turn (p. 446), shown struck out. */
    lost?: { stunned: number; slowed: number; all?: string }
    /** Extra actions gained during this turn (quickened mid-turn, the GM's call). */
    extra?: number
  }
  /** The GM's tracker seat (combatant id) the sheet last joined, as Nimble's `gmCombatant`. */
  gmCombatant?: string
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

/**
 * An archetype's spellcasting (Player Core p. 215): its own tradition, attribute and rank, the
 * cantrips its dedication grants, and the slots its basic, expert and master spellcasting feats
 * give by level. Also holds a class's second track of slots (`label`).
 */
export interface Pf2eArchetypeCasting extends Pf2eSpellcasting {
  archetype: string
  /**
   * The panel's name when this is the class's own second track (an animist's "Apparition
   * spells", War of Immortals p. 10) rather than an archetype's.
   */
  label?: string
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
  /** Feat slot (`ancestry`, `class`, `class2` for a bonus class feat, `skill`) → feat id. */
  feats: Record<string, string>
  armor?: string
  shield?: string
  weapons: string[]
  /** Other gear and consumables bought (AoN ids), with how many of each. */
  items?: { id: string; count: number }[]
  /**
   * Spells picked at creation (AoN ids): cantrips, 1st-rank spells, and a wizard's 1st-rank
   * curriculum spells (Player Core p. 197).
   */
  spells?: { cantrips: string[]; rank1: string[]; curriculum?: string[] }
  /** A cleric's divine font when the deity offers both. */
  font?: string
  /** The tradition a draconic bloodline or dragon eidolon leaves to the player. */
  tradition?: string
  /** Focus spells and class cantrips (AoN ids); absent means the ones the features name. */
  focus?: string[]
  /** The free archetype variant (GM Core p. 84): an archetype feat at every even level. */
  freeArchetype?: boolean
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
/** PF2e has no New round step (the reaction comes back with your turn), so no round end. */
export type Pf2eConditionEnd = 'turnStart' | 'turnEnd' | 'encounter'

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
