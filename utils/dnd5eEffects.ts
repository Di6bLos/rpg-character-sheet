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

/** The definitions of the effects on the hero, in order. */
export function activeEffectDefs(s: Pick<Dnd5eSheet, 'effects'>): Dnd5eEffectDef[] {
  return effectsOn(s).flatMap((e) => (DND5E_EFFECTS[e.key] ? [DND5E_EFFECTS[e.key]!] : []))
}

/**
 * Puts an effect on (again: its end is refreshed). `held` marks one begun on your own turn that
 * lasts "until the end of your next turn", so this turn's end doesn't take it.
 */
export function addEffect(
  s: Dnd5eSheet,
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
