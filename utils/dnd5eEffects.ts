// What effects on a 5e (2024) hero do to its numbers: its own features (Rage, Reckless Attack),
// the core actions (Dodge, Dash), the spells it casts on itself (Shield, Haste, Hunter's Mark)
// and what allies give it (Bless, Help, Bardic Inspiration). Effects live on the sheet as
// `sheet.effects` (`Dnd5eEffect`, by `key`); the play engine (utils/dnd5ePlay.ts,
// utils/dnd5eAttacks.ts) reads their numbers from `DND5E_EFFECTS`. Spells by slug turn into
// effects through `SPELL_EFFECTS`; tests/dnd5eRules.test.ts checks every slug is in the data.
import type { Dnd5eAbility, Dnd5eConditionEnd, Dnd5eEffect, Dnd5eSheet } from '~/types/sheets'

export interface Dnd5eEffectDef {
  key: string
  name: string
  /** What it does, as the sheet says it. */
  note: string
  ends: Dnd5eEffect['ends']
  /** Offered in the conditions block's "Ally effects" group. */
  ally?: boolean
  /** A bonus to AC. */
  ac?: number
  /** A base AC of this + DEX while wearing no armor (Mage Armor). */
  acBase?: number
  /** AC can't be lower (Barkskin). */
  acMin?: number
  attack?: {
    adv?: boolean
    dis?: boolean
    /** A die added to attack rolls (Bless +1d4, Bane −1d4 as "-1d4"). */
    dice?: string
    bonus?: number
    /** Only Strength-based attacks (Reckless Attack). */
    strength?: boolean
  }
  damage?: {
    /** Dice added to a hit ("1d6"); `weapon` limits it to weapon attacks. */
    dice?: string
    type?: string
    weapon?: boolean
    bonus?: number
    /** Rage Damage from the class table, on Strength-based attacks. */
    rage?: boolean
  }
  save?: { adv?: Dnd5eAbility[]; dis?: Dnd5eAbility[]; dice?: string }
  check?: { adv?: Dnd5eAbility[]; dis?: Dnd5eAbility[]; dice?: string }
  resist?: string[]
  speed?: { bonus?: number; times?: number; zero?: boolean }
  /** Extra actions on your turn (Haste's limited action). */
  actions?: number
  /** How attack rolls against you go. */
  againstYou?: 'adv' | 'dis'
  /** Spent by the next roll of these kinds: Steady Aim and Vex by an attack, Guidance by a check. */
  spentBy?: ('attack' | 'check' | 'save')[]
  /** Ends when the hero has the Incapacitated condition (Rage, Dodge). */
  endsIncapacitated?: boolean
  /** No spellcasting or concentration while on (Rage). */
  noSpells?: boolean
  /** Your spells: a bonus to their save DC, Advantage on their attack rolls (Innate Sorcery). */
  spell?: { dc?: number; adv?: boolean }
  /** Its `value` (set when it starts) adds to AC, attack rolls, or Concentration saves. */
  valueTo?: ('ac' | 'attack' | 'concentration')[]
  /** Its `value` is a die (8: 1d8) added to the next hit's damage (Feinting Attack). */
  valueDie?: boolean
  /** Advantage on checks with these skills (Peerless Athlete, Bladesong). */
  skillAdv?: string[]
  /** A d20 of 9 or lower counts as 10 on these rolls (Trance of Order). */
  reliable?: ('attack' | 'check' | 'save' | 'concentration')[]
  /** Resistance to every damage type but these. */
  resistAllBut?: string[]
  /** A speed it gives ("fly 60"), said on the Speed tile. */
  moves?: string
  /** The sheet feature that lets the hero turn it on in the Conditions panel. */
  feature?: string
  /** Conditions it ends and keeps off while it lasts (Mindless Rage's Charmed and Frightened). */
  immune?: string[]
}

const BPS = ['Bludgeoning', 'Piercing', 'Slashing']

export const DND5E_EFFECTS: Record<string, Dnd5eEffectDef> = {
  rage: {
    key: 'rage',
    name: 'Rage',
    note: 'Resistance to Bludgeoning, Piercing and Slashing damage; Rage Damage on Strength attacks; Advantage on Strength checks and saves; no spells or Concentration (SRD 5.2.1 p. 28).',
    ends: 'encounter',
    damage: { rage: true },
    resist: BPS,
    save: { adv: ['STR'] },
    check: { adv: ['STR'] },
    endsIncapacitated: true,
    noSpells: true,
  },
  reckless: {
    key: 'reckless',
    name: 'Reckless Attack',
    note: 'Advantage on Strength attack rolls this turn; attack rolls against you have Advantage until your next turn (SRD 5.2.1 p. 29).',
    ends: 'turnStart',
    attack: { adv: true, strength: true },
    againstYou: 'adv',
  },
  dodge: {
    key: 'dodge',
    name: 'Dodging',
    note: 'Attack rolls against you have Disadvantage and you have Advantage on Dexterity saves, until your next turn (SRD 5.2.1 p. 10).',
    ends: 'turnStart',
    againstYou: 'dis',
    save: { adv: ['DEX'] },
    endsIncapacitated: true,
  },
  disengage: {
    key: 'disengage',
    name: 'Disengaged',
    note: 'Your movement provokes no Opportunity Attacks this turn (SRD 5.2.1 p. 10).',
    ends: 'turnEnd',
  },
  dash: {
    key: 'dash',
    name: 'Dashing',
    note: 'Extra movement equal to your Speed this turn (SRD 5.2.1 p. 10).',
    ends: 'turnEnd',
  },
  shield: {
    key: 'shield',
    name: 'Shield',
    note: '+5 AC until the start of your next turn, including against the triggering attack (SRD 5.2.1 p. 154).',
    ends: 'turnStart',
    ac: 5,
  },
  'shield-of-faith': {
    key: 'shield-of-faith',
    name: 'Shield of Faith',
    note: '+2 AC.',
    ends: 'concentration',
    ac: 2,
    ally: true,
  },
  'mage-armor': {
    key: 'mage-armor',
    name: 'Mage Armor',
    note: 'Base AC 13 + Dexterity while you wear no armor.',
    ends: 'long',
    acBase: 13,
    ally: true,
  },
  haste: {
    key: 'haste',
    name: 'Haste',
    note: '+2 AC, Advantage on Dexterity saves, Speed doubled, and an extra action each turn (Attack with one weapon attack, Dash, Disengage, Hide or Utilize).',
    ends: 'concentration',
    ac: 2,
    save: { adv: ['DEX'] },
    speed: { times: 2 },
    actions: 1,
    ally: true,
  },
  bless: {
    key: 'bless',
    name: 'Bless',
    note: '+1d4 to attack rolls and saving throws.',
    ends: 'concentration',
    attack: { dice: '1d4' },
    save: { dice: '1d4' },
    ally: true,
  },
  bane: {
    key: 'bane',
    name: 'Bane',
    note: '−1d4 to attack rolls and saving throws.',
    ends: 'manual',
    attack: { dice: '-1d4' },
    save: { dice: '-1d4' },
    ally: true,
  },
  guidance: {
    key: 'guidance',
    name: 'Guidance',
    note: '+1d4 to one ability check of the skill chosen.',
    ends: 'manual',
    check: { dice: '1d4' },
    spentBy: ['check'],
    ally: true,
  },
  resistance: {
    key: 'resistance',
    name: 'Resistance',
    note: 'Reduce damage of the chosen type by 1d4 once a turn.',
    ends: 'manual',
    ally: true,
  },
  heroism: {
    key: 'heroism',
    name: 'Heroism',
    note: 'Immune to the Frightened condition; temporary Hit Points equal to the caster’s spellcasting modifier at the start of each of your turns.',
    ends: 'concentration',
    ally: true,
  },
  'hunters-mark': {
    key: 'hunters-mark',
    name: 'Hunter’s Mark',
    note: '+1d6 Force damage when you hit the marked creature with an attack roll.',
    ends: 'concentration',
    damage: { dice: '1d6', type: 'Force' },
  },
  hex: {
    key: 'hex',
    name: 'Hex',
    note: '+1d6 Necrotic damage when you hit the cursed creature with an attack roll.',
    ends: 'concentration',
    damage: { dice: '1d6', type: 'Necrotic' },
  },
  'divine-favor': {
    key: 'divine-favor',
    name: 'Divine Favor',
    note: '+1d4 Radiant damage on weapon hits.',
    ends: 'encounter',
    damage: { dice: '1d4', type: 'Radiant', weapon: true },
  },
  barkskin: {
    key: 'barkskin',
    name: 'Barkskin',
    note: 'Your AC can’t be less than 17.',
    ends: 'manual',
    acMin: 17,
    ally: true,
  },
  longstrider: {
    key: 'longstrider',
    name: 'Longstrider',
    note: '+10 feet of Speed.',
    ends: 'manual',
    speed: { bonus: 10 },
    ally: true,
  },
  enlarge: {
    key: 'enlarge',
    name: 'Enlarged',
    note: 'Advantage on Strength checks and saves; weapon and Unarmed Strike hits deal +1d4 damage.',
    ends: 'concentration',
    check: { adv: ['STR'] },
    save: { adv: ['STR'] },
    damage: { dice: '1d4', weapon: true },
    ally: true,
  },
  blur: {
    key: 'blur',
    name: 'Blur',
    note: 'Attack rolls against you have Disadvantage.',
    ends: 'concentration',
    againstYou: 'dis',
  },
  fly: {
    key: 'fly',
    name: 'Flying',
    note: 'A Fly Speed of 60 feet.',
    ends: 'concentration',
    ally: true,
  },
  'magic-weapon': {
    key: 'magic-weapon',
    name: 'Magic Weapon',
    note: '+1 to attack and damage rolls with the weapon.',
    ends: 'manual',
    attack: { bonus: 1 },
    damage: { bonus: 1, weapon: true },
  },
  protection: {
    key: 'protection',
    name: 'Protection from Evil and Good',
    note: 'Aberrations, Celestials, Elementals, Fey, Fiends and Undead have Disadvantage on attacks against you.',
    ends: 'concentration',
    ally: true,
  },
  'armor-of-agathys': {
    key: 'armor-of-agathys',
    name: 'Armor of Agathys',
    note: 'While you have its temporary Hit Points, a creature that hits you with a melee attack takes Cold damage.',
    ends: 'manual',
  },
  aid: {
    key: 'aid',
    name: 'Aid',
    note: 'Hit Point maximum and current Hit Points raised by 5 (more from a higher slot).',
    ends: 'manual',
    ally: true,
  },
  'bardic-inspiration': {
    key: 'bardic-inspiration',
    name: 'Bardic Inspiration',
    note: 'Once, after failing a D20 Test, roll the die and add it, possibly turning the failure into a success.',
    ends: 'manual',
    ally: true,
  },
  helped: {
    key: 'helped',
    name: 'Helped',
    note: 'Advantage on your next attack roll or ability check (the Help action, SRD 5.2.1 p. 10).',
    ends: 'turnEnd',
    attack: { adv: true },
    check: { adv: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] },
    spentBy: ['attack', 'check'],
    ally: true,
  },
  'steady-aim': {
    key: 'steady-aim',
    name: 'Steady Aim',
    note: 'Advantage on your next attack roll this turn; your Speed is 0 until the end of the turn.',
    ends: 'turnEnd',
    attack: { adv: true },
    speed: { zero: true },
    spentBy: ['attack'],
  },
  vex: {
    key: 'vex',
    name: 'Vex',
    note: 'Advantage on your next attack roll against the creature you hit, before the end of your next turn.',
    ends: 'turnEnd',
    attack: { adv: true },
    spentBy: ['attack'],
  },
  sapped: {
    key: 'sapped',
    name: 'Sapped',
    note: 'Disadvantage on your next attack roll before the start of the attacker’s next turn (Sap).',
    ends: 'round',
    attack: { dis: true },
    spentBy: ['attack'],
    ally: true,
  },
  'innate-sorcery': {
    key: 'innate-sorcery',
    name: 'Innate Sorcery',
    note: 'For 1 minute: +1 to the save DC of your Sorcerer spells and Advantage on their attack rolls (SRD 5.2.1 p. 65).',
    ends: 'encounter',
    spell: { dc: 1, adv: true },
  },
  'wild-shape': {
    key: 'wild-shape',
    name: 'Wild Shape',
    note: 'In a Beast form: its stat block replaces your game statistics, except your Hit Points, Hit Dice, mental scores and features (SRD 5.2.1 p. 44).',
    ends: 'manual',
    noSpells: true,
    endsIncapacitated: true,
  },
  studied: {
    key: 'studied',
    name: 'Studied Attacks',
    note: 'Advantage on your next attack roll against the creature you missed, before the end of your next turn (SRD 5.2.1 p. 48).',
    ends: 'turnEnd',
    attack: { adv: true },
    spentBy: ['attack'],
  },
  'parrying-stance': {
    key: 'parrying-stance',
    name: 'Parrying Stance',
    note: 'The 1d6 rolled is added to your AC until your next turn starts.',
    ends: 'turnStart',
    valueTo: ['ac'],
  },
  'form-of-dread': {
    key: 'form-of-dread',
    name: 'Form of Dread',
    note: 'For 1 minute: immune to Frightened; once a turn a hit can frighten the target (WIS save).',
    ends: 'encounter',
    endsIncapacitated: true,
    immune: ['Frightened'],
  },
  'wrath-of-the-wild': {
    key: 'wrath-of-the-wild',
    name: 'Wrath of the Wild',
    note: 'For 1 minute, a ghastly form: the AC bonus shown, an Opportunity Attack when a creature next to you hurts you or an ally, and a frightening aura.',
    ends: 'encounter',
    endsIncapacitated: true,
    valueTo: ['ac'],
  },
  'elemental-attunement': {
    key: 'elemental-attunement',
    name: 'Elemental Attunement',
    note: 'For 10 minutes: Unarmed Strikes reach 10 ft farther, can deal Acid, Cold, Fire, Lightning or Thunder, and can push or pull 10 ft (STR save).',
    ends: 'encounter',
  },
  'living-legend': {
    key: 'living-legend',
    name: 'Living Legend',
    note: 'For 10 minutes: Advantage on Charisma checks, a Reaction to reroll a failed save, and once a turn a missed weapon attack can hit.',
    ends: 'encounter',
    check: { adv: ['CHA'] },
  },
  'sacred-weapon': {
    key: 'sacred-weapon',
    name: 'Sacred Weapon',
    note: 'For 10 minutes: your Charisma modifier (min +1) to attack rolls with the weapon, which can deal Radiant damage and sheds Bright Light 20 ft (SRD 5.2.1 p. 56).',
    ends: 'encounter',
    valueTo: ['attack'],
  },
  'vow-of-enmity': {
    key: 'vow-of-enmity',
    name: 'Vow of Enmity',
    note: 'For 1 minute: Advantage on attack rolls against the creature you marked.',
    ends: 'encounter',
    attack: { adv: true },
  },
  bladesong: {
    key: 'bladesong',
    name: 'Bladesong',
    note: 'For 1 minute without armor or a Shield: INT to AC and to Concentration saves, +10 ft Speed, Advantage on Acrobatics, INT for weapon attacks.',
    ends: 'encounter',
    endsIncapacitated: true,
    valueTo: ['ac', 'concentration'],
    speed: { bonus: 10 },
    skillAdv: ['Acrobatics'],
  },
  feinting: {
    key: 'feinting',
    name: 'Feinting Attack',
    note: 'Advantage on your next attack roll this turn against the creature you feinted; on a hit it adds the Superiority Die to the damage.',
    ends: 'turnEnd',
    attack: { adv: true },
    spentBy: ['attack'],
    valueDie: true,
  },
  lunging: {
    key: 'lunging',
    name: 'Lunging Attack',
    note: 'If you move 5+ ft straight before a melee hit this turn, the Superiority Die adds to its damage.',
    ends: 'turnEnd',
    spentBy: ['attack'],
    valueDie: true,
  },
  'evasive-footwork': {
    key: 'evasive-footwork',
    name: 'Evasive Footwork',
    note: 'The Superiority Die roll is added to your AC until your next turn starts.',
    ends: 'turnStart',
    valueTo: ['ac'],
  },
  'bait-and-switch': {
    key: 'bait-and-switch',
    name: 'Bait and Switch',
    note: 'The Superiority Die roll is added to the AC of you or the creature you swapped with until your next turn starts.',
    ends: 'turnStart',
    valueTo: ['ac'],
  },
  'peerless-athlete': {
    key: 'peerless-athlete',
    name: 'Peerless Athlete',
    note: 'For 1 hour: Advantage on Athletics and Acrobatics checks, and +10 ft on jumps.',
    ends: 'long',
    skillAdv: ['Athletics', 'Acrobatics'],
  },
  foreknowledge: {
    key: 'foreknowledge',
    name: 'Divine Foreknowledge',
    note: 'For 1 hour: Advantage on D20 Tests.',
    ends: 'long',
    attack: { adv: true },
    check: { adv: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] },
    save: { adv: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] },
  },
  'zealous-presence': {
    key: 'zealous-presence',
    name: 'Zealous Presence',
    note: 'Advantage on attack rolls and saving throws until the start of the barbarian’s next turn.',
    ends: 'round',
    attack: { adv: true },
    save: { adv: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] },
    ally: true,
  },
  'trance-of-order': {
    key: 'trance-of-order',
    name: 'Trance of Order',
    note: 'For 1 minute: attack rolls against you can’t have Advantage, and your D20 Tests count a 9 or lower as 10.',
    ends: 'encounter',
    reliable: ['attack', 'check', 'save', 'concentration'],
  },
  'superior-defense': {
    key: 'superior-defense',
    name: 'Superior Defense',
    note: 'For 1 minute: Resistance to all damage except Force (SRD 5.2.1 p. 52).',
    ends: 'encounter',
    endsIncapacitated: true,
    resistAllBut: ['Force'],
  },
  dispersion: {
    key: 'dispersion',
    name: 'Dispersion',
    note: 'Until your next turn ends: Resistance to all damage, no actions, Bonus Actions or Reactions, and a 40-ft fly Speed.',
    ends: 'turnEnd',
    resistAllBut: [],
    moves: 'fly 40 ft',
  },
  'ghost-walk': {
    key: 'ghost-walk',
    name: 'Ghost Walk',
    note: 'For 10 minutes: Fly 10 ft with hover, attack rolls against you have Disadvantage, and you pass through creatures and objects.',
    ends: 'long',
    againstYou: 'dis',
    moves: 'fly 10 ft',
  },
  'umbral-form': {
    key: 'umbral-form',
    name: 'Umbral Form',
    note: 'While Innate Sorcery lasts: Resistance to all damage but Force and Radiant; you move through creatures and objects.',
    ends: 'encounter',
    resistAllBut: ['Force', 'Radiant'],
  },
  'rage-of-the-gods': {
    key: 'rage-of-the-gods',
    name: 'Rage of the Gods',
    note: 'For 1 minute: fly at your Speed and hover, and Resistance to Necrotic, Psychic and Radiant damage.',
    ends: 'encounter',
    resist: ['Necrotic', 'Psychic', 'Radiant'],
    moves: 'fly (your Speed)',
  },
  'wilds-bear': {
    key: 'wilds-bear',
    name: 'Bear Spirit',
    note: 'While raging: Resistance to every damage type but Force, Necrotic, Psychic and Radiant.',
    ends: 'encounter',
    resistAllBut: ['Force', 'Necrotic', 'Psychic', 'Radiant'],
    feature: 'Rage of the Wilds',
  },
  'wilds-eagle': {
    key: 'wilds-eagle',
    name: 'Eagle Spirit',
    note: 'While raging: a Bonus Action Dashes and Disengages.',
    ends: 'encounter',
    feature: 'Rage of the Wilds',
  },
  'wilds-wolf': {
    key: 'wilds-wolf',
    name: 'Wolf Spirit',
    note: 'While raging: your allies have Advantage attacking enemies within 5 ft of you.',
    ends: 'encounter',
    feature: 'Rage of the Wilds',
  },
  'wilds-falcon': {
    key: 'wilds-falcon',
    name: 'Falcon Spirit',
    note: 'While raging and unarmored: fly at your Speed.',
    ends: 'encounter',
    moves: 'fly (your Speed)',
    feature: 'Power of the Wilds',
  },
  'wilds-lion': {
    key: 'wilds-lion',
    name: 'Lion Spirit',
    note: 'While raging: enemies within 5 ft have Disadvantage attacking anyone but you.',
    ends: 'encounter',
    feature: 'Power of the Wilds',
  },
  'wilds-ram': {
    key: 'wilds-ram',
    name: 'Ram Spirit',
    note: 'While raging: a melee hit can knock a Large or smaller target Prone.',
    ends: 'encounter',
    feature: 'Power of the Wilds',
  },
  'wrath-of-the-sea': {
    key: 'wrath-of-the-sea',
    name: 'Wrath of the Sea',
    note: 'For 10 minutes: a stormy aura around you; a Bonus Action makes one creature in it save (CON) or take Cold damage and be pushed.',
    ends: 'long',
  },
  'starry-archer': {
    key: 'starry-archer',
    name: 'Starry Form: Archer',
    note: 'For 10 minutes: a Bonus Action ranged spell attack for Radiant damage.',
    ends: 'long',
  },
  'starry-chalice': {
    key: 'starry-chalice',
    name: 'Starry Form: Chalice',
    note: 'For 10 minutes: when a spell with a slot heals someone, you or a creature within 30 ft also heals.',
    ends: 'long',
  },
  'starry-dragon': {
    key: 'starry-dragon',
    name: 'Starry Form: Dragon',
    note: 'For 10 minutes: INT and WIS checks and Concentration saves count a 9 or lower as 10.',
    ends: 'long',
    reliable: ['concentration'],
  },
  shadowform: {
    key: 'shadowform',
    name: 'Shadowform',
    note: 'For 1 minute: Hide as a Bonus Action in Dim Light or Darkness, and spells cast with a slot add 1d6 to Psychic or Necrotic damage.',
    ends: 'encounter',
    endsIncapacitated: true,
  },
  'moonlight-step': {
    key: 'moonlight-step',
    name: 'Moonlight Step',
    note: 'Advantage on your next attack roll this turn.',
    ends: 'turnEnd',
    attack: { adv: true },
    spentBy: ['attack'],
  },
  'shadow-step': {
    key: 'shadow-step',
    name: 'Shadow Step',
    note: 'Advantage on your next melee attack roll this turn.',
    ends: 'turnEnd',
    attack: { adv: true },
    spentBy: ['attack'],
  },
  luck: {
    key: 'luck',
    name: 'Luck Point',
    note: 'Advantage on your next D20 Test (Lucky).',
    ends: 'manual',
    attack: { adv: true },
    check: { adv: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] },
    save: { adv: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] },
    spentBy: ['attack', 'check', 'save'],
  },
  'tides-of-chaos': {
    key: 'tides-of-chaos',
    name: 'Tides of Chaos',
    note: 'Advantage on your next D20 Test.',
    ends: 'manual',
    attack: { adv: true },
    check: { adv: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] },
    save: { adv: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] },
    spentBy: ['attack', 'check', 'save'],
  },
  'psi-leap': {
    key: 'psi-leap',
    name: 'Psi-Powered Leap',
    note: 'A Fly Speed of twice your Speed until the end of the turn.',
    ends: 'turnEnd',
    moves: 'fly (twice your Speed)',
  },
  'dragon-wings': {
    key: 'dragon-wings',
    name: 'Dragon Wings',
    note: 'For 1 hour: a Fly Speed of 60 ft.',
    ends: 'long',
    moves: 'fly 60 ft',
  },
  'elixir-swiftness': {
    key: 'elixir-swiftness',
    name: 'Elixir of Swiftness',
    note: 'Speed raised by the amount shown for 1 hour.',
    ends: 'long',
    speed: { bonus: 10 },
    ally: true,
  },
  'elixir-resilience': {
    key: 'elixir-resilience',
    name: 'Elixir of Resilience',
    note: '+1 AC for 10 minutes.',
    ends: 'long',
    ac: 1,
    ally: true,
  },
  'elixir-boldness': {
    key: 'elixir-boldness',
    name: 'Elixir of Boldness',
    note: '+1d4 to attack rolls and saving throws for 1 minute.',
    ends: 'encounter',
    attack: { dice: '1d4' },
    save: { dice: '1d4' },
    ally: true,
  },
  'elixir-flight': {
    key: 'elixir-flight',
    name: 'Elixir of Flight',
    note: 'A Fly Speed for 10 minutes.',
    ends: 'long',
    moves: 'fly',
    ally: true,
  },
  'holy-nimbus': {
    key: 'holy-nimbus',
    name: 'Holy Nimbus',
    note: 'For 10 minutes: Radiant damage to enemies starting their turn in your aura, Advantage on saves against Fiends and Undead, and Sunlight.',
    ends: 'long',
  },
  'elder-champion': {
    key: 'elder-champion',
    name: 'Elder Champion',
    note: 'For 1 minute: enemies in your aura have Disadvantage on saves against your spells and Channel Divinity, you regain 10 HP at each turn start, and 1-action spells can be cast as a Bonus Action.',
    ends: 'encounter',
  },
  'avenging-angel': {
    key: 'avenging-angel',
    name: 'Avenging Angel',
    note: 'For 10 minutes: Fly 60 ft with hover, and foes starting a turn in your aura may be Frightened (attacks against them have Advantage).',
    ends: 'long',
    moves: 'fly 60 ft',
  },
  'noble-scion': {
    key: 'noble-scion',
    name: 'Noble Scion',
    note: 'For 10 minutes: Fly 60 ft with hover, and a Reaction to turn a failed D20 Test into a success for you or an ally in your aura.',
    ends: 'long',
    moves: 'fly 60 ft',
  },
  'crown-of-spellfire': {
    key: 'crown-of-spellfire',
    name: 'Crown of Spellfire',
    note: 'While Innate Sorcery lasts: Fly 60 ft with hover, spend Hit Dice to cut a hit’s damage, and saves for half damage take none on a success, half on a failure.',
    ends: 'encounter',
    moves: 'fly 60 ft',
  },
  'grieving-mantle': {
    key: 'grieving-mantle',
    name: 'Grieving Mantle',
    note: 'For 1 minute: immune to Charmed and Frightened, and a Reaction turns an attack’s damage to you to 0.',
    ends: 'encounter',
    endsIncapacitated: true,
    immune: ['Charmed', 'Frightened'],
  },
}

/** Spells the hero casts on itself that are effects here, by spell slug. */
export const SPELL_EFFECTS: Record<string, string> = {
  shield: 'shield',
  'shield-of-faith': 'shield-of-faith',
  'mage-armor': 'mage-armor',
  haste: 'haste',
  bless: 'bless',
  guidance: 'guidance',
  resistance: 'resistance',
  heroism: 'heroism',
  'hunters-mark': 'hunters-mark',
  hex: 'hex',
  'divine-favor': 'divine-favor',
  barkskin: 'barkskin',
  longstrider: 'longstrider',
  'enlarge-reduce': 'enlarge',
  blur: 'blur',
  fly: 'fly',
  'magic-weapon': 'magic-weapon',
  'protection-from-evil-and-good': 'protection',
  'armor-of-agathys': 'armor-of-agathys',
  aid: 'aid',
}

export const effectsOn = (s: Pick<Dnd5eSheet, 'effects'>) => s.effects ?? []

export function hasEffect(s: Pick<Dnd5eSheet, 'effects'>, key: string): boolean {
  return effectsOn(s).some((e) => e.key === key)
}

/** The effects on the hero with their definitions, in order. */
export function activeEffects(
  s: Pick<Dnd5eSheet, 'effects'>,
): { def: Dnd5eEffectDef; effect: Dnd5eEffect }[] {
  return effectsOn(s).flatMap((e) =>
    DND5E_EFFECTS[e.key] ? [{ def: DND5E_EFFECTS[e.key]!, effect: e }] : [],
  )
}

/** What the effects' values add to AC, attack rolls or Concentration saves, a line each. */
export function effectValues(
  s: Pick<Dnd5eSheet, 'effects'>,
  to: 'ac' | 'attack' | 'concentration',
): { label: string; value: number }[] {
  return activeEffects(s)
    .filter((x) => x.def.valueTo?.includes(to) && x.effect.value)
    .map((x) => ({ label: x.effect.name, value: x.effect.value! }))
}

/** The definitions of the effects on the hero, in order. */
export function activeEffectDefs(s: Pick<Dnd5eSheet, 'effects'>): Dnd5eEffectDef[] {
  return effectsOn(s).flatMap((e) => (DND5E_EFFECTS[e.key] ? [DND5E_EFFECTS[e.key]!] : []))
}

/**
 * Puts an effect on (again: its end is refreshed). `held` marks one begun on your own turn that
 * lasts "until the end of your next turn", so this turn's end doesn't take it.
 */
export function addEffect(
  s: Pick<Dnd5eSheet, 'effects'> & Partial<Pick<Dnd5eSheet, 'conditions'>>,
  key: string,
  o: { ends?: Dnd5eEffect['ends']; name?: string; value?: number; held?: boolean } = {},
): Dnd5eEffect | null {
  const def = DND5E_EFFECTS[key]
  if (!def) return null
  const effect: Dnd5eEffect = {
    key,
    name: o.name ?? def.name,
    ends: o.ends ?? def.ends,
    ...(o.held ? { held: true } : {}),
    ...(o.value !== undefined ? { value: o.value } : {}),
  }
  s.effects = [...effectsOn(s).filter((e) => e.key !== key), effect]
  if (def.immune?.length && s.conditions)
    s.conditions = s.conditions.filter((c) => !def.immune!.includes(c))
  return effect
}

/** Takes an effect off; returns its name, or '' when it wasn't on. */
export function removeEffect(s: Dnd5eSheet, key: string): string {
  const on = effectsOn(s).find((e) => e.key === key)
  if (!on) return ''
  s.effects = effectsOn(s).filter((e) => e.key !== key)
  return on.name
}

/** Ends the effects whose end is `when`; returns their names. Held ones lose the hold instead. */
export function endEffects(
  s: Dnd5eSheet,
  when: Dnd5eConditionEnd | 'concentration' | 'long',
): string[] {
  const ended: string[] = []
  const kept: Dnd5eEffect[] = []
  for (const e of effectsOn(s)) {
    const due =
      e.ends === when ||
      (when === 'encounter' &&
        (e.ends === 'turnStart' || e.ends === 'turnEnd' || e.ends === 'round'))
    if (due && e.held && when !== 'encounter') kept.push({ ...e, held: false })
    else if (due) ended.push(e.name)
    else kept.push(e)
  }
  if (ended.length || kept.some((e, i) => e !== effectsOn(s)[i])) s.effects = kept
  return ended
}

/** Ends the effects a roll of `kind` spends (Help by an attack or check, Guidance by a check). */
export function spendEffects(s: Dnd5eSheet, kind: 'attack' | 'check' | 'save'): string[] {
  const spent = effectsOn(s).filter((e) => DND5E_EFFECTS[e.key]?.spentBy?.includes(kind))
  if (!spent.length) return []
  s.effects = effectsOn(s).filter((e) => !spent.includes(e))
  return spent.map((e) => e.name)
}
