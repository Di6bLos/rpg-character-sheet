// What a 5e (2024) hero can add to a weapon, Unarmed Strike or beast-form attack as it rolls it:
// the Barbarian's Brutal Strike effects (traded from Reckless Attack's Advantage, SRD 5.2.1
// p. 29), the Rogue's Cunning Strike and Devious Strikes (traded from Sneak Attack dice, pp.
// 62–63), Stunning Strike (p. 51), Divine Strike and Primal Strike (pp. 40, 44), the Battle
// Master's maneuvers and the Arcane Archer's Arcane Shots (each spending its die), and the
// subclass riders with numbers (Frenzy, Divine Fury, Colossus Slayer, Dread Ambusher, Psionic
// Strike, Hand of Harm, Despairing Strikes, Arcane Jolt, Lunar Form…). `DND5E_RIDERS` lists
// them by the sheet feature that gives them; `attackRiders` says which an attack can take now
// and why not; `riderPlan` turns the player's picks into what utils/dnd5eAttacks.ts
// rollAttack5e rolls: extra damage parts, dice forgone, a forgone Advantage, a bonus after a
// miss, the save DCs and notes, and what each spends. Pure; tests/dnd5eRiders.test.ts, and
// tests/dnd5eRules.test.ts checks every feature named here is in the data.
import type { Dnd5eSave } from '~/data/dnd5e/types'
import type { Dnd5eAbility, Dnd5eSheet } from '~/types/sheets'
import type {
  Dnd5eAttackPlan,
  Dnd5eAttackRiders,
  Dnd5eColumns,
  Dnd5eDamagePart,
  Dnd5eMissBoost,
} from '~/utils/dnd5eAttacks'
import { addEffect, hasEffect } from '~/utils/dnd5eEffects'
import {
  type Dnd5eHero,
  castingFor,
  dnd5eHero,
  heal,
  spendUses,
  useOnce,
  usedOnce,
  usesLeft,
} from '~/utils/dnd5ePlay'
import { type Rng, parseDice, rollDice, sign } from '~/utils/dice'

/** What an attack has to be for a rider: all of `on`, and one of `any` when given. */
export type Dnd5eRiderOn =
  | 'weapon'
  | 'unarmed'
  | 'beast'
  | 'melee'
  | 'ranged'
  | 'strength'
  | 'ammunition'
  | 'monk'
  | 'heavy'
  | 'offhand'
  | 'blade'

/**
 * What must hold on the hero: an effect by key (`rage`, `reckless`, `wild-shape`, `form-of-dread`),
 * `sneak` (the attack deals Sneak Attack), `round1` (combat's first round) or `bloodied`.
 */
export type Dnd5eRiderNeed = string

/** Extra damage dice: an expression, a pool's die (`pool` resource) a number of times, a step by class level, or Rage Damage's number of `sides`. */
export type Dnd5eRiderDice =
  | string
  | { pool: string; times?: number }
  | { at: Record<number, string> }
  | { rageDice: number }
  | { column: string }

export interface Dnd5eRiderPart {
  dice?: Dnd5eRiderDice
  /** Added to the extra damage: class level, half of it, PB, or an ability modifier. */
  plus?: ('level' | 'half' | 'PB' | Dnd5eAbility)[]
  /** Damage type: the weapon's (absent), one type, or a choice. */
  type?: string | string[]
  save?: Dnd5eSave
  /** A resource it spends (by its name on the sheet), `n` uses. */
  spend?: { resource: string; n?: number }
  /** Once a turn, by this key. */
  once?: string
  needs?: Dnd5eRiderNeed[]
  on?: Dnd5eRiderOn[]
  any?: Dnd5eRiderOn[]
  /** The attack roll forgoes any Advantage (Brutal Strike). */
  forgoAdv?: boolean
}

export interface Dnd5eRiderDef extends Dnd5eRiderPart {
  key: string
  /** As the chip says it. */
  name: string
  /** The feature on the sheet that gives it ("Brutal Strike", "Blessed Strikes: Divine Strike"). */
  feature: string
  /** Another feature it needs as well (Devious Strikes for Daze). */
  also?: string
  /** One of a set with a shared base and a limit (`brutal`, `cunning`, `maneuver`…). */
  group?: string
  /** Sneak Attack d6s it trades away (Cunning Strike). */
  sneakCost?: number
  /** On by default when it can apply. */
  auto?: boolean
  /**
   * Used after the attack roll misses: adds its dice (or this number) to the roll, rerolls the
   * d20 (Heroic Inspiration), or makes it a 20 (Stroke of Luck).
   */
  miss?: number | 'dice' | 'reroll' | 'twenty'
  /** A miss rider spent only when it turns the miss into a hit. */
  missKeep?: boolean
  /** Spends what the hero holds: Heroic Inspiration, or an ally's Bardic Inspiration die. */
  clears?: 'heroic' | 'bardic-inspiration'
  /** No attack roll: the creatures in its area make the save (Piercing Shot). */
  noAttack?: boolean
  /** Its damage comes after the hit, so a Critical Hit doesn't double it. */
  separate?: boolean
  /** The dice heal you (Hungering Might) or someone else (Restorative Energy) instead. */
  heals?: 'self' | 'ally'
  /** On a failed save the target takes the attack's damage again (Death Strike). */
  double?: boolean
  /** Puts an effect on you, its value the dice rolled (Parrying Stance's AC). */
  effect?: string
  /** A level the class must have reached for it. */
  minLevel?: number
  /** What it does, in a line. */
  note: string
}

/** A group's shared parts and how many of its riders one attack can take. */
export interface Dnd5eRiderGroup extends Dnd5eRiderPart {
  label: string
  max: (hero: Dnd5eHero) => number
}

const STR_DEX: Dnd5eSave['dc'] = '8+PB+STR/DEX'
const DEX_DC: Dnd5eSave['dc'] = '8+PB+DEX'
const INT_DC: Dnd5eSave['dc'] = '8+PB+INT'
const WIS_DC: Dnd5eSave['dc'] = '8+PB+WIS'
const ELEMENTS = ['Cold', 'Fire', 'Lightning', 'Thunder']

export const DND5E_RIDER_GROUPS: Record<string, Dnd5eRiderGroup> = {
  brutal: {
    label: 'Brutal Strike',
    max: (h) => (h.levelOf('Brutal Strike') >= 17 && h.has('Improved Brutal Strike') ? 2 : 1),
    dice: { at: { 9: '1d10', 17: '2d10' } },
    once: 'brutal',
    needs: ['reckless'],
    on: ['strength'],
    forgoAdv: true,
  },
  cunning: {
    label: 'Cunning Strike',
    max: (h) => (h.has('Improved Cunning Strike') ? 2 : 1),
    needs: ['sneak'],
  },
  maneuver: {
    label: 'Maneuver',
    max: () => 1,
    dice: { pool: 'Combat Superiority' },
    spend: { resource: 'Combat Superiority' },
  },
  'arcane-shot': {
    label: 'Arcane Shot',
    max: () => 1,
    spend: { resource: 'Arcane Shot' },
    once: 'arcane-shot',
    on: ['ammunition'],
  },
  despair: {
    label: 'Despairing Strike',
    max: () => 1,
    dice: { pool: 'Despairing Strikes' },
    spend: { resource: 'Despairing Strikes' },
    type: 'Psychic',
    on: ['weapon'],
  },
  spirit: {
    label: 'Spiritual Protectors',
    max: () => 1,
    needs: ['rage'],
    any: ['weapon', 'unarmed'],
  },
  torment: {
    label: 'Torment',
    max: () => 1,
    once: 'torment',
    needs: ['hunters-mark'],
    on: ['weapon'],
  },
  jolt: {
    label: 'Arcane Jolt',
    max: () => 1,
    once: 'jolt',
    spend: { resource: 'Arcane Jolt' },
    on: ['weapon'],
  },
}

const shot = (
  key: string,
  name: string,
  times: number,
  type: string,
  save: Dnd5eAbility | null,
  note: string,
  extra: Partial<Dnd5eRiderDef> = {},
): Dnd5eRiderDef => ({
  key: `shot:${key}`,
  name,
  feature: name,
  group: 'arcane-shot',
  dice: { pool: 'Arcane Shot', times },
  type,
  ...(save ? { save: { ability: save, dc: INT_DC } } : {}),
  note,
  ...extra,
})

const maneuver = (
  key: string,
  name: string,
  note: string,
  extra: Partial<Dnd5eRiderDef> = {},
): Dnd5eRiderDef => ({
  key: `man:${key}`,
  name,
  feature: name,
  group: 'maneuver',
  note,
  ...extra,
})

const cunning = (
  key: string,
  name: string,
  feature: string,
  cost: number,
  note: string,
  extra: Partial<Dnd5eRiderDef> = {},
): Dnd5eRiderDef => ({
  key: `cun:${key}`,
  name,
  feature,
  group: 'cunning',
  sneakCost: cost,
  note,
  ...extra,
})

export const DND5E_RIDERS: Dnd5eRiderDef[] = [
  // Barbarian (SRD 5.2.1 p. 29–30)
  {
    key: 'brutal:forceful',
    name: 'Forceful Blow',
    feature: 'Brutal Strike',
    group: 'brutal',
    note: 'The target is pushed 15 ft straight away; you can move up to half your Speed toward it without provoking.',
  },
  {
    key: 'brutal:hamstring',
    name: 'Hamstring Blow',
    feature: 'Brutal Strike',
    group: 'brutal',
    note: 'Its Speed drops by 15 ft until the start of your next turn (only the latest Hamstring Blow counts).',
  },
  {
    key: 'brutal:staggering',
    name: 'Staggering Blow',
    feature: 'Brutal Strike',
    also: 'Improved Brutal Strike',
    group: 'brutal',
    note: 'Disadvantage on its next saving throw, and no Opportunity Attacks until the start of your next turn.',
  },
  {
    key: 'brutal:sundering',
    name: 'Sundering Blow',
    feature: 'Brutal Strike',
    also: 'Improved Brutal Strike',
    group: 'brutal',
    note: 'Before your next turn, the next attack roll another creature makes against it gets +5.',
  },
  {
    key: 'frenzy',
    name: 'Frenzy',
    feature: 'Frenzy',
    dice: { rageDice: 6 },
    needs: ['rage', 'reckless'],
    on: ['strength'],
    once: 'frenzy',
    auto: true,
    note: 'Your first Strength-based hit this turn while raging and reckless: d6s equal to your Rage Damage.',
  },
  {
    key: 'divine-fury',
    name: 'Divine Fury',
    feature: 'Divine Fury',
    dice: '1d6',
    plus: ['half'],
    type: ['Necrotic', 'Radiant'],
    needs: ['rage'],
    any: ['weapon', 'unarmed'],
    once: 'divine-fury',
    auto: true,
    note: 'Your first weapon or Unarmed Strike hit each turn while raging.',
  },
  {
    key: 'spirit:distract',
    name: 'Distract',
    feature: 'Spiritual Protectors',
    group: 'spirit',
    note: 'Until your next turn starts, it has Disadvantage attacking anyone but you or another such Barbarian.',
  },
  {
    key: 'spirit:hinder',
    name: 'Hinder',
    feature: 'Spiritual Protectors',
    group: 'spirit',
    note: 'Slow too: its Speed drops by 10 ft until your next turn starts.',
  },
  {
    key: 'spirit:strike',
    name: 'Spirit Strike',
    feature: 'Spiritual Protectors',
    group: 'spirit',
    dice: '1d4',
    type: ['Cold', 'Fire', 'Lightning'],
    auto: true,
    note: 'The spirits add 1d4 Cold, Fire or Lightning damage.',
  },
  {
    key: 'ram',
    name: 'Ram',
    feature: 'Power of the Wilds',
    needs: ['rage'],
    on: ['melee'],
    note: 'Ram: a Large or smaller target can be knocked Prone.',
  },
  {
    key: 'battering-roots',
    name: 'Battering Roots',
    feature: 'Battering Roots',
    on: ['melee', 'weapon'],
    note: 'Push or Topple too, besides the weapon’s own mastery (Heavy or Versatile weapons).',
  },
  // Rogue (SRD 5.2.1 pp. 62–63)
  cunning(
    'poison',
    'Poison',
    'Cunning Strike',
    1,
    'Poisoned for 1 minute on a failed save, repeating it at the end of each of its turns (needs a Poisoner’s Kit).',
    { save: { ability: 'CON', dc: DEX_DC } },
  ),
  {
    key: 'envenom',
    name: 'Envenom Weapons',
    feature: 'Envenom Weapons',
    dice: '2d6',
    type: 'Poison',
    needs: ['sneak'],
    separate: true,
    note: 'With Poison: the target also takes 2d6 Poison (ignoring Resistance) each time it fails the save.',
  },
  cunning(
    'trip',
    'Trip',
    'Cunning Strike',
    1,
    'A Large or smaller target falls Prone on a failed save.',
    {
      save: { ability: 'DEX', dc: DEX_DC },
    },
  ),
  cunning(
    'withdraw',
    'Withdraw',
    'Cunning Strike',
    1,
    'Right after the attack, move up to half your Speed without provoking.',
  ),
  cunning(
    'daze',
    'Daze',
    'Devious Strikes',
    2,
    'On a failed save, on its next turn it can only move, or take an action, or a Bonus Action.',
    { save: { ability: 'CON', dc: DEX_DC } },
  ),
  cunning(
    'knock-out',
    'Knock Out',
    'Devious Strikes',
    6,
    'On a failed save, Unconscious for 1 minute or until it takes damage, repeating the save at the end of each of its turns.',
    { save: { ability: 'CON', dc: DEX_DC } },
  ),
  cunning(
    'obscure',
    'Obscure',
    'Devious Strikes',
    3,
    'Blinded until the end of its next turn on a failed save.',
    {
      save: { ability: 'DEX', dc: DEX_DC },
    },
  ),
  cunning(
    'stealth-attack',
    'Stealth Attack',
    'Supreme Sneak',
    1,
    'Hidden and Invisible, the attack doesn’t end it if you end the turn behind Three-Quarters or Total Cover.',
  ),
  cunning(
    'terrify',
    'Terrify',
    'Strike Fear',
    1,
    'Frightened for 1 minute on a failed save (repeats at its turn end); you have Advantage attacking it meanwhile.',
    { save: { ability: 'WIS', dc: DEX_DC } },
  ),
  cunning(
    'goad',
    'Goad',
    'Panache',
    1,
    'On a failed save, until its next turn ends it has Disadvantage attacking others and makes Opportunity Attacks only against you.',
    { save: { ability: 'WIS', dc: DEX_DC } },
  ),
  cunning(
    'awe',
    'Awe',
    'Panache',
    3,
    'Creatures you choose within 30 ft save or are Charmed until your next turn ends.',
    {
      save: { ability: 'WIS', dc: DEX_DC },
    },
  ),
  cunning(
    'invigorate',
    'Invigorate',
    'Dashing Strikes',
    2,
    'A creature you see within 30 ft adds 1d6 to its attack rolls and saves until its next turn ends.',
  ),
  cunning(
    'parrying-stance',
    'Parrying Stance',
    'Dashing Strikes',
    2,
    'Roll 1d6 and add it to your AC until your next turn starts.',
    {
      dice: '1d6',
      effect: 'parrying-stance',
    },
  ),
  {
    key: 'assassinate',
    name: 'Assassinate',
    feature: 'Assassinate',
    plus: ['level'],
    needs: ['sneak', 'round1'],
    auto: true,
    note: 'In combat’s first round, a Sneak Attack hit adds your Rogue level as damage.',
  },
  {
    key: 'death-strike',
    name: 'Death Strike',
    feature: 'Death Strike',
    save: { ability: 'CON', dc: DEX_DC },
    needs: ['sneak', 'round1'],
    double: true,
    auto: true,
    note: 'On a failed save it takes the attack’s damage again (double).',
  },
  {
    key: 'rend-mind',
    name: 'Rend Mind',
    feature: 'Rend Mind',
    save: { ability: 'WIS', dc: DEX_DC },
    spend: { resource: 'Rend Mind' },
    needs: ['sneak'],
    on: ['blade'],
    note: 'Stunned for 1 minute on a failed save, repeating it at the end of each of its turns.',
  },
  {
    key: 'wails',
    name: 'Wails from the Grave',
    feature: 'Wails from the Grave',
    dice: { column: 'Sneak Attack' },
    type: 'Necrotic',
    spend: { resource: 'Wails from the Grave' },
    needs: ['sneak'],
    separate: true,
    note: 'A second creature within 30 ft of the target takes Necrotic damage from half your Sneak Attack dice.',
  },
  {
    key: 'master-duelist',
    name: 'Master Duelist',
    feature: 'Master Duelist',
    needs: ['sneak'],
    on: ['melee'],
    auto: true,
    note: 'Right after the Sneak Attack, make another attack on it if no one else is within 5 ft of you.',
  },
  {
    key: 'fancy-footwork',
    name: 'Fancy Footwork',
    feature: 'Fancy Footwork',
    on: ['melee'],
    auto: true,
    note: 'It can’t make Opportunity Attacks against you for the rest of your turn.',
  },
  // Monk (SRD 5.2.1 p. 51) and its subclasses
  {
    key: 'stunning',
    name: 'Stunning Strike',
    feature: 'Stunning Strike',
    save: { ability: 'CON', dc: WIS_DC },
    spend: { resource: 'Monk’s Focus' },
    once: 'stunning',
    any: ['monk', 'unarmed'],
    note: 'Stunned until the start of your next turn on a failed save; on a success its Speed is halved and the next attack on it has Advantage.',
  },
  {
    key: 'focused-strike',
    name: 'Focused Strike',
    feature: 'Focused Strike',
    any: ['monk', 'unarmed'],
    note: 'After a Stunning Strike, pass or fail, it has Disadvantage on saves against your spells until your next turn starts.',
  },
  {
    key: 'physicians-touch',
    name: 'Physician’s Touch',
    feature: 'Physician’s Touch',
    on: ['unarmed'],
    note: 'With Hand of Harm: it’s also Poisoned until the end of your next turn.',
  },
  {
    key: 'hand-of-harm',
    name: 'Hand of Harm',
    feature: 'Hand of Harm',
    dice: { column: 'Martial Arts' },
    plus: ['WIS'],
    type: 'Necrotic',
    spend: { resource: 'Monk’s Focus' },
    once: 'hand-of-harm',
    on: ['unarmed'],
    note: 'One Martial Arts die + WIS of Necrotic damage.',
  },
  {
    key: 'elemental-attunement',
    name: 'Elemental Strike',
    feature: 'Elemental Attunement',
    save: { ability: 'STR', dc: WIS_DC },
    needs: ['elemental-attunement'],
    on: ['unarmed'],
    note: 'It can deal Acid, Cold, Fire, Lightning or Thunder, and on a failed save you move it 10 ft toward or away.',
  },
  {
    key: 'elemental-epitome',
    name: 'Elemental Epitome',
    feature: 'Elemental Epitome',
    dice: { column: 'Martial Arts' },
    type: ['Acid', 'Cold', 'Fire', 'Lightning', 'Thunder'],
    needs: ['elemental-attunement'],
    on: ['unarmed'],
    once: 'elemental-epitome',
    auto: true,
    note: 'Once a turn while attuned, an Unarmed Strike hit adds a Martial Arts die.',
  },
  // Cleric and Druid (SRD 5.2.1 pp. 40, 44)
  {
    key: 'divine-strike',
    name: 'Divine Strike',
    feature: 'Blessed Strikes: Divine Strike',
    dice: { at: { 7: '1d8', 14: '2d8' } },
    type: ['Radiant', 'Necrotic'],
    on: ['weapon'],
    once: 'divine-strike',
    auto: true,
    note: 'Once on each of your turns, a weapon hit deals extra Necrotic or Radiant damage.',
  },
  {
    key: 'primal-strike',
    name: 'Primal Strike',
    feature: 'Elemental Fury: Primal Strike',
    dice: { at: { 7: '1d8', 15: '2d8' } },
    type: ELEMENTS,
    any: ['weapon', 'beast'],
    once: 'primal-strike',
    auto: true,
    note: 'Once on each of your turns, a weapon or Beast form hit deals extra Cold, Fire, Lightning or Thunder damage.',
  },
  {
    key: 'lunar-form',
    name: 'Lunar Form',
    feature: 'Lunar Form',
    dice: '2d10',
    type: 'Radiant',
    on: ['beast'],
    once: 'lunar-form',
    auto: true,
    note: 'Once a turn, a Beast form hit adds 2d10 Radiant.',
  },
  {
    key: 'pull-of-death',
    name: 'Pull of Death',
    feature: 'Circle of Mortality',
    dice: { at: { 3: '1d4', 11: '1d6' } },
    type: 'Necrotic',
    once: 'pull-of-death',
    note: 'Once a turn, a hit on a creature below its Hit Point maximum adds Necrotic damage.',
  },
  {
    key: 'path-to-the-grave',
    name: 'End Path to the Grave',
    feature: 'Path to the Grave',
    plus: ['level'],
    type: ['Necrotic', 'Radiant'],
    note: 'End the curse on the target: Necrotic or Radiant damage equal to your Cleric level.',
  },
  // Fighter subclasses
  maneuver('trip', 'Trip Attack', 'A Large or smaller target falls Prone on a failed save.', {
    save: { ability: 'STR', dc: STR_DEX },
    any: ['weapon', 'unarmed'],
  }),
  maneuver(
    'push',
    'Pushing Attack',
    'A Large or smaller target is shoved up to 15 ft straight away on a failed save.',
    {
      save: { ability: 'STR', dc: STR_DEX },
      any: ['weapon', 'unarmed'],
    },
  ),
  maneuver(
    'disarm',
    'Disarming Attack',
    'On a failed save it drops one object you choose that it holds, in its space.',
    {
      save: { ability: 'STR', dc: STR_DEX },
    },
  ),
  maneuver(
    'menace',
    'Menacing Attack',
    'Frightened until the end of your next turn on a failed save.',
    {
      save: { ability: 'WIS', dc: STR_DEX },
    },
  ),
  maneuver(
    'goad',
    'Goading Attack',
    'On a failed save, Disadvantage attacking anyone but you until the end of your next turn.',
    { save: { ability: 'WIS', dc: STR_DEX } },
  ),
  maneuver(
    'distract',
    'Distracting Strike',
    'Before your next turn starts, the next attack roll against it by someone else has Advantage.',
  ),
  maneuver(
    'maneuvering',
    'Maneuvering Attack',
    'A willing ally who sees or hears you can use its Reaction to move up to half its Speed without provoking from the target.',
  ),
  maneuver(
    'mortal',
    'Mortal Strike',
    'It can’t regain Hit Points until the end of your next turn.',
  ),
  maneuver(
    'sweep',
    'Sweeping Attack',
    'A second creature within 5 ft of the target and your reach takes the die as damage if the roll would hit it.',
    { on: ['melee'], separate: true },
  ),
  shot(
    'banishing',
    'Banishing Shot',
    1,
    'Psychic',
    'CHA',
    'On a failed save it is shunted to a harmless demiplane, Incapacitated with Speed 0, until its next turn ends.',
  ),
  shot(
    'beguiling',
    'Beguiling Shot',
    2,
    'Psychic',
    'WIS',
    'On a failed save it is Charmed by you or an ally within 30 ft until your next turn starts.',
  ),
  shot(
    'bursting',
    'Bursting Shot',
    2,
    'Force',
    null,
    'The target and every creature in a 10-ft Emanation around it take the Force damage.',
    { separate: true },
  ),
  shot(
    'enfeebling',
    'Enfeebling Shot',
    2,
    'Necrotic',
    'CON',
    'On a failed save, Poisoned until its next turn ends, its hits dealing one Arcane Shot die less.',
  ),
  shot(
    'grasping',
    'Grasping Shot',
    1,
    'Slashing',
    'STR',
    'On a failed save, Restrained by brambles for 1 minute (an action and a Strength (Athletics) check against your DC frees it).',
  ),
  shot(
    'piercing',
    'Piercing Shot',
    2,
    'Piercing',
    'DEX',
    'No attack roll: each creature in a 30-ft Line takes the hit’s damage on a failed save, half on a success.',
    { noAttack: true },
  ),
  shot(
    'seeking',
    'Seeking Shot',
    2,
    'Force',
    'DEX',
    'No attack roll: a creature you saw in the last minute takes the hit’s damage on a failed save (and you learn where it is), half on a success.',
    { noAttack: true },
  ),
  shot(
    'shadow',
    'Shadow Shot',
    1,
    'Psychic',
    'WIS',
    'Blinded until its next turn ends on a failed save.',
  ),
  {
    key: 'psionic-strike',
    name: 'Psionic Strike',
    feature: 'Psionic Power',
    dice: { pool: 'Psionic Power' },
    plus: ['INT'],
    type: 'Force',
    spend: { resource: 'Psionic Power' },
    once: 'psionic-strike',
    on: ['weapon'],
    separate: true,
    note: 'Right after a weapon hit on a target within 30 ft: a Psionic Energy Die + INT of Force damage.',
  },
  {
    key: 'despair:strike',
    name: 'Despairing Strike',
    feature: 'Despairing Strikes',
    group: 'despair',
    note: 'The die’s roll in extra Psychic damage.',
  },
  {
    key: 'despair:abandoned',
    name: 'Abandoned',
    feature: 'Despairing Strikes',
    group: 'despair',
    save: { ability: 'INT', dc: WIS_DC },
    note: 'On a failed save, Deafened until the end of your next turn, treating everyone it sees as an enemy.',
  },
  {
    key: 'despair:dread',
    name: 'Dread',
    feature: 'Despairing Strikes',
    group: 'despair',
    note: 'Disadvantage on its next saving throw before your next turn starts.',
  },
  {
    key: 'despair:apathetic',
    name: 'Apathetic',
    feature: 'Despairing Strikes',
    also: 'Unsettled Strikes',
    group: 'despair',
    save: { ability: 'WIS', dc: WIS_DC },
    note: 'On a failed save, Incapacitated until your next turn starts.',
  },
  {
    key: 'despair:lost',
    name: 'Lost',
    feature: 'Despairing Strikes',
    also: 'Unsettled Strikes',
    group: 'despair',
    save: { ability: 'CHA', dc: WIS_DC },
    note: 'On a failed save, Blinded with Speed 0 through its next turn; on a success its Speed is halved.',
  },
  {
    key: 'despair:weary',
    name: 'Weary',
    feature: 'Despairing Strikes',
    also: 'Unsettled Strikes',
    group: 'despair',
    save: { ability: 'CON', dc: WIS_DC },
    note: 'On a failed save, 1 Exhaustion level (not past 2), gone when your next turn ends.',
  },
  {
    key: 'eldritch-strike',
    name: 'Eldritch Strike',
    feature: 'Eldritch Strike',
    on: ['weapon'],
    auto: true,
    note: 'It has Disadvantage on its next save against a spell you cast before the end of your next turn.',
  },
  // Ranger subclasses
  {
    key: 'colossus-slayer',
    name: 'Colossus Slayer',
    feature: 'Hunter’s Prey: Colossus Slayer',
    dice: '1d8',
    on: ['weapon'],
    once: 'colossus-slayer',
    note: 'Once a turn, a weapon hit on a creature below its Hit Point maximum adds 1d8.',
  },
  {
    key: 'dread-ambusher',
    name: 'Dread Ambusher',
    feature: 'Dread Ambusher',
    dice: { at: { 3: '2d6', 11: '2d8' } },
    type: 'Psychic',
    spend: { resource: 'Dread Ambusher' },
    once: 'dread-ambusher',
    on: ['weapon'],
    note: 'Once a turn, a weapon hit adds Psychic damage.',
  },
  {
    key: 'dreadful-strikes',
    name: 'Dreadful Strikes',
    feature: 'Dreadful Strikes',
    dice: { at: { 3: '1d4', 11: '1d6' } },
    type: 'Psychic',
    on: ['weapon'],
    auto: true,
    note: 'A weapon hit adds Psychic damage, once per creature each turn.',
  },
  {
    key: 'polar-strikes',
    name: 'Polar Strikes',
    feature: 'Frigid Explorer',
    dice: { at: { 3: '1d4', 11: '1d6' } },
    type: 'Cold',
    on: ['weapon'],
    once: 'polar-strikes',
    auto: true,
    note: 'Once a turn, a weapon hit adds Cold damage.',
  },
  {
    key: 'torment:chaos',
    name: 'Chaos Strike',
    feature: 'Torment',
    group: 'torment',
    dice: '1d8',
    type: 'Fire',
    auto: true,
    note: 'Your Hunter’s Mark target takes an extra 1d8 Fire.',
  },
  {
    key: 'torment:pain',
    name: 'Aura of Pain',
    feature: 'Torment',
    group: 'torment',
    note: 'Its next save before the end of your next turn takes −1d4.',
  },
  {
    key: 'hungering-might',
    name: 'Hungering Might',
    feature: 'Hungering Might',
    dice: '1d10',
    plus: ['WIS'],
    heals: 'self',
    needs: ['wrath-of-the-wild', 'bloodied'],
    once: 'hungering-might',
    auto: true,
    note: 'Once a turn while transformed and Bloodied, a hit heals you 1d10 + WIS.',
  },
  {
    key: 'strangling-roots',
    name: 'Strangling Roots',
    feature: 'Rot and Violence',
    needs: ['wrath-of-the-wild'],
    on: ['weapon'],
    note: 'Sap or Slow too, besides the weapon’s own mastery.',
  },
  {
    key: 'ominous-strikes',
    name: 'Ominous Strikes',
    feature: 'Ancient Might',
    plus: ['WIS'],
    note: 'A hit on a Frightened creature adds your WIS as damage.',
  },
  // Paladin subclasses
  {
    key: 'unholy-rune',
    name: 'Unholy Rune',
    feature: 'Runeforging: Unholy',
    plus: ['CHA'],
    type: 'Necrotic',
    on: ['heavy'],
    once: 'unholy-rune',
    auto: true,
    note: 'The first creature you hit each turn with a Heavy weapon takes extra Necrotic equal to your CHA.',
  },
  {
    key: 'frost-rune',
    name: 'Frost Rune',
    feature: 'Runeforging: Frost',
    dice: '1d4',
    type: 'Cold',
    on: ['offhand'],
    auto: true,
    note: 'The Light property’s extra attack adds 1d4 Cold when it hits.',
  },
  // Artificer, Warlock subclasses
  {
    key: 'jolt:destructive',
    name: 'Destructive Energy',
    feature: 'Arcane Jolt',
    group: 'jolt',
    dice: { at: { 9: '2d6', 15: '4d6' } },
    type: 'Force',
    note: 'Your magic weapon’s hit adds Force damage.',
  },
  {
    key: 'jolt:restorative',
    name: 'Restorative Energy',
    feature: 'Arcane Jolt',
    group: 'jolt',
    dice: { at: { 9: '2d6', 15: '4d6' } },
    heals: 'ally',
    note: 'A creature or object you see within 30 ft of the target regains that many Hit Points.',
  },
  {
    key: 'frightful-avatar',
    name: 'Frightful Avatar',
    feature: 'Form of Dread',
    save: { ability: 'WIS', dc: 'spell' },
    needs: ['form-of-dread'],
    once: 'frightful-avatar',
    auto: true,
    note: 'Frightened until the end of your next turn on a failed save.',
  },
  {
    key: 'hurl-through-hell',
    name: 'Hurl Through Hell',
    feature: 'Hurl Through Hell',
    dice: '8d10',
    type: 'Psychic',
    save: { ability: 'CHA', dc: 'spell' },
    spend: { resource: 'Hurl Through Hell' },
    once: 'hurl-through-hell',
    separate: true,
    note: 'On a failed save it vanishes through the Lower Planes until the end of your next turn, then takes the Psychic damage (unless it’s a Fiend).',
  },
  // Bard (an ally's Bardic Inspiration from a College of Valor bard)
  {
    key: 'combat-inspiration',
    name: 'Combat Inspiration',
    feature: '',
    dice: { pool: 'bardic-inspiration' },
    needs: ['bardic-inspiration:valor'],
    clears: 'bardic-inspiration',
    note: 'Right after the hit, the Bardic Inspiration die is added to its damage and spent.',
  },
  // After a miss: what can still make it a hit
  maneuver('precision', 'Precision Attack', 'After a miss, add the die to the attack roll.', {
    miss: 'dice',
  }),
  {
    key: 'miss:bardic',
    name: 'Bardic Inspiration',
    feature: '',
    dice: { pool: 'bardic-inspiration' },
    needs: ['bardic-inspiration'],
    miss: 'dice',
    clears: 'bardic-inspiration',
    note: 'If the attack misses, roll your Bardic Inspiration die and add it.',
  },
  {
    key: 'miss:peerless',
    name: 'Peerless Skill',
    feature: 'Peerless Skill',
    dice: { pool: 'Bardic Inspiration' },
    spend: { resource: 'Bardic Inspiration' },
    miss: 'dice',
    missKeep: true,
    note: 'If the attack misses, add a Bardic Inspiration die; it’s spent only if the attack then hits.',
  },
  {
    key: 'miss:homing',
    name: 'Homing Strikes',
    feature: 'Soul Blades',
    dice: { pool: 'Psionic Power' },
    spend: { resource: 'Psionic Power' },
    miss: 'dice',
    missKeep: true,
    note: 'If a Psychic Blade misses, add a Psionic Energy Die; it’s spent only if the attack then hits.',
  },
  {
    key: 'miss:guided',
    name: 'Guided Strike',
    feature: 'Guided Strike',
    spend: { resource: 'Channel Divinity' },
    miss: 10,
    note: 'If the attack misses, spend a Channel Divinity use for +10 to the roll.',
  },
  {
    key: 'miss:heroic',
    name: 'Heroic Inspiration',
    feature: '',
    needs: ['heroic'],
    miss: 'reroll',
    clears: 'heroic',
    note: 'If the attack misses, spend Heroic Inspiration to reroll the d20.',
  },
  {
    key: 'miss:stroke',
    name: 'Stroke of Luck',
    feature: 'Stroke of Luck',
    spend: { resource: 'Stroke of Luck' },
    miss: 'twenty',
    note: 'If the attack misses, the d20 becomes a 20.',
  },
  {
    key: 'miss:living-legend',
    name: 'Living Legend',
    feature: 'Living Legend',
    needs: ['living-legend'],
    once: 'living-legend',
    miss: 'twenty',
    note: 'Once a turn while it lasts, a missed weapon attack can hit instead.',
  },
]

const abilityDc = (hero: Dnd5eHero, dc: Dnd5eSave['dc'], spellDc: number | undefined) => {
  if (typeof dc === 'number') return dc
  if (dc === 'spell') return spellDc ?? 8 + hero.pb + Math.max(hero.mod('WIS'), hero.mod('CHA'))
  const abilities = dc.replace('8+PB+', '').split('/') as Dnd5eAbility[]
  return 8 + hero.pb + Math.max(...abilities.map((a) => hero.mod(a)))
}

/** "1d8", "d8" or "1d10" from a resource's die; '' when it has none. */
const dieOf = (d: string | undefined) => {
  const m = /(\d*)d(\d+)/.exec(d ?? '')
  return m ? `${m[1] || 1}d${m[2]}` : ''
}

const columnNumber = (cols: Dnd5eColumns | undefined, name: string) =>
  Number(/-?\d+/.exec((cols?.[name] ?? '').replace(/^\+/, ''))?.[0] ?? 0)

/** What an attack is, for the riders' `on` and `any`. */
export function attackTraits(p: Dnd5eAttackPlan): Set<Dnd5eRiderOn> {
  const out = new Set<Dnd5eRiderOn>()
  const k = p.kind ?? 'weapon'
  out.add(k)
  out.add(p.melee ? 'melee' : 'ranged')
  if (p.ability === 'STR') out.add('strength')
  for (const prop of p.props ?? []) {
    if (prop === 'Ammunition') out.add('ammunition')
    if (prop === 'Heavy') out.add('heavy')
  }
  if (p.monk) out.add('monk')
  if (p.offhand) out.add('offhand')
  if (p.blade) out.add('blade')
  return out
}

/** The Bardic Inspiration die the hero holds from an ally ("1d8"), with a College of Valor's flag. */
export function heldInspiration(s: Dnd5eSheet): { dice: string; valor: boolean } | null {
  const e = (s.effects ?? []).find((x) => x.key === 'bardic-inspiration')
  if (!e) return null
  return { dice: `1d${e.value || 6}`, valor: !!e.valor }
}

export interface Dnd5eRiderContext {
  columns?: Dnd5eColumns
  /** Sneak Attack is on for this attack. */
  sneak?: boolean
  /** The roll's chosen odds (Brutal Strike can't ride an attack with Disadvantage). */
  mode?: 'normal' | 'adv' | 'dis'
}

function needOk(s: Dnd5eSheet, need: Dnd5eRiderNeed, ctx: Dnd5eRiderContext): boolean {
  if (need === 'sneak') return !!ctx.sneak
  if (need === 'round1') return !!s.inEncounter && (s.turn?.round ?? 1) <= 1
  if (need === 'bloodied') return s.hp <= Math.floor(s.hpMax / 2)
  if (need === 'bardic-inspiration:valor') return !!heldInspiration(s)?.valor
  if (need === 'bardic-inspiration') return !!heldInspiration(s)
  if (need === 'heroic') return !!s.heroicInspiration
  return hasEffect(s, need)
}

const NEED_LABEL: Record<string, string> = {
  sneak: 'Needs Sneak Attack',
  round1: 'First round only',
  bloodied: 'Only while Bloodied',
  rage: 'Only while raging',
  reckless: 'Needs Reckless Attack',
  'wild-shape': 'Only in Wild Shape',
  'hunters-mark': 'Needs Hunter’s Mark',
  'form-of-dread': 'Only in Form of Dread',
  'wrath-of-the-wild': 'Only while transformed',
  'elemental-attunement': 'Needs Elemental Attunement',
  'bardic-inspiration:valor': 'Needs a Valor Bardic Inspiration',
  'bardic-inspiration': 'No Bardic Inspiration die',
  heroic: 'No Heroic Inspiration',
}

/** Resolves a rider's dice to an expression now (a pool's die, a level step, Rage dice). */
function diceOf(
  s: Dnd5eSheet,
  level: number,
  d: Dnd5eRiderDice | undefined,
  cols: Dnd5eColumns | undefined,
): string {
  if (!d) return ''
  if (typeof d === 'string') return d
  if ('pool' in d) {
    const die =
      d.pool === 'bardic-inspiration'
        ? (heldInspiration(s)?.dice ?? '')
        : dieOf(s.resources?.find((r) => r.name === d.pool)?.dice)
    const p = parseDice(die)
    return p ? `${p.count * (d.times ?? 1)}d${p.sides}` : ''
  }
  if ('at' in d)
    return Object.entries(d.at).reduce((v, [at, x]) => (level >= Number(at) ? x : v), '')
  if ('rageDice' in d) {
    const n = columnNumber(cols, 'Rage Damage')
    return n > 0 ? `${n}d${d.rageDice}` : ''
  }
  const c = (cols?.[d.column] ?? '').replace(/\s+/g, '').match(/(\d*)d(\d+)/)
  if (!c) return ''
  return `${c[1] || 1}d${c[2]}`
}

/** A rider's flat amount; "level" is the level of the class whose feature it is. */
const plusOf = (hero: Dnd5eHero, plus: Dnd5eRiderPart['plus'], level = hero.level) =>
  (plus ?? []).reduce(
    (n, p) =>
      n +
      (p === 'level'
        ? level
        : p === 'half'
          ? Math.floor(level / 2)
          : p === 'PB'
            ? hero.pb
            : Math.max(1, hero.mod(p))),
    0,
  )

export interface Dnd5eRiderOption {
  def: Dnd5eRiderDef
  /** It suits this kind of attack at all (a Strength one, an Ammunition weapon…). */
  fits: boolean
  /** Why it can't ride this attack now, or ''. */
  why: string
  /** Its group's shared dice, resolved (Brutal Strike's 1d10, a maneuver's Superiority Die). */
  base: string
  /** Its own extra dice, resolved, and the flat amount it adds. */
  dice: string
  flat: number
  /** The damage types to choose from (one: no choice). */
  types: string[]
  save?: { ability: Dnd5eAbility; dc: number }
  /** The chip's tooltip: the numbers, then what it does. */
  title: string
}

/** True when the sheet has the feature (and the `also` one), and the level it needs. */
function hasRider(hero: Dnd5eHero, d: Dnd5eRiderDef): boolean {
  if (d.minLevel && hero.levelOf(d.feature) < d.minLevel) return false
  if (d.also && !hero.has(d.also)) return false
  if (!d.feature) return true
  return hero.has(d.feature)
}

function partWhy(
  s: Dnd5eSheet,
  part: Dnd5eRiderPart,
  traits: Set<Dnd5eRiderOn>,
  ctx: Dnd5eRiderContext,
  plan: Dnd5eAttackPlan,
): string {
  for (const o of part.on ?? []) if (!traits.has(o)) return `Not with this attack (${o})`
  if (part.any?.length && !part.any.some((o) => traits.has(o))) return 'Not with this attack'
  for (const n of part.needs ?? [])
    if (!needOk(s, n, ctx)) return NEED_LABEL[n] ?? `Needs ${n.replace(/-/g, ' ')}`
  if (part.once && usedOnce(s, part.once)) return 'Used this turn'
  if (part.forgoAdv && (plan.test.dis.length || ctx.mode === 'dis'))
    return 'The attack has Disadvantage'
  return ''
}

function spendWhy(s: Dnd5eSheet, hero: Dnd5eHero, part: Dnd5eRiderPart): string {
  const sp = part.spend
  if (!sp) return ''
  if (sp.resource === 'Combat Superiority' && relentless(s, hero)) return ''
  if (!s.resources?.some((r) => r.name === sp.resource)) return `No ${sp.resource}`
  return usesLeft(s, sp.resource) < (sp.n ?? 1) ? `No ${sp.resource} left` : ''
}

/** Relentless (Battle Master 15): once a turn, a maneuver with a free 1d8 when no die is left. */
const relentless = (s: Dnd5eSheet, hero: Dnd5eHero) =>
  hero.has('Relentless') && usesLeft(s, 'Combat Superiority') < 1 && !usedOnce(s, 'relentless')

/** Every rider the hero has for this attack, usable or with why not. */
export function attackRiders(
  s: Dnd5eSheet,
  level: number,
  plan: Dnd5eAttackPlan,
  ctx: Dnd5eRiderContext = {},
): Dnd5eRiderOption[] {
  const hero = dnd5eHero(s, level)
  const traits = attackTraits(plan)
  const out: Dnd5eRiderOption[] = []
  for (const d of DND5E_RIDERS) {
    if (!hasRider(hero, d)) continue
    if (!d.feature && d.needs?.some((n) => !needOk(s, n, ctx))) continue
    const g = d.group ? DND5E_RIDER_GROUPS[d.group] : undefined
    let why = (g ? partWhy(s, g, traits, ctx, plan) : '') || partWhy(s, d, traits, ctx, plan)
    why ||= (g ? spendWhy(s, hero, g) : '') || spendWhy(s, hero, d)
    const sneakDice = parseDice(plan.extras.find((e) => e.once === 'sneak')?.dice ?? '')
    if (!why && d.sneakCost && (sneakDice?.count ?? 0) < d.sneakCost)
      why = `Needs ${d.sneakCost}d6 of Sneak Attack`
    const classLevel = d.feature ? hero.levelOf(d.feature) : level
    const own = d.dice
      ? d.key === 'wails'
        ? `${Math.ceil((sneakDice?.count ?? 0) / 2)}d6`
        : diceOf(s, classLevel, d.dice, ctx.columns)
      : ''
    const flat = plusOf(hero, d.plus, classLevel)
    const types =
      typeof d.type === 'string'
        ? [d.type]
        : d.type?.length
          ? d.type
          : g?.type
            ? [String(g.type)]
            : [plan.type]
    const save = d.save
      ? {
          ability: d.save.ability,
          dc: abilityDc(
            hero,
            d.save.dc,
            castingFor(s, hero.sourceOf(d.feature))?.saveDc ?? s.castingStats?.saveDc,
          ),
        }
      : undefined
    const base = g?.dice ? diceOf(s, classLevel, g.dice, ctx.columns) : ''
    const numbers = [
      base ? `${g!.label} ${base}` : '',
      d.sneakCost ? `costs ${d.sneakCost}d6 of Sneak Attack` : '',
      own || flat
        ? `${own}${flat ? `${own ? ' ' : ''}${sign(flat)}` : ''}${d.heals ? ' healing' : ` ${types.join(' or ')}`}`
        : '',
      save ? `DC ${save.dc} ${save.ability} save` : '',
      d.spend || g?.spend ? `spends 1 ${(d.spend ?? g!.spend)!.resource}` : '',
      d.once || g?.once ? 'once a turn' : '',
    ].filter(Boolean)
    const shape = (part: Dnd5eRiderPart) =>
      (part.on ?? []).every((x) => traits.has(x)) &&
      (!part.any?.length || part.any.some((x) => traits.has(x)))
    out.push({
      def: d,
      fits: (!g || shape(g)) && shape(d),
      why,
      base: d.group === 'maneuver' && relentless(s, hero) ? '1d8' : base,
      dice: own,
      flat,
      types,
      ...(save ? { save } : {}),
      title: [numbers.join(' · '), d.note].filter(Boolean).join('\n'),
    })
  }
  return out
}

/** A rider the player picked for the attack, with the damage type chosen. */
export interface Dnd5eRiderPick {
  key: string
  type?: string
}

/** The picks on by default: the `auto` riders that can apply, one per group. */
export function defaultRiders(options: Dnd5eRiderOption[]): Dnd5eRiderPick[] {
  const groups = new Set<string>()
  const out: Dnd5eRiderPick[] = []
  for (const o of options) {
    if (!o.def.auto || o.why) continue
    if (o.def.group) {
      if (groups.has(o.def.group)) continue
      groups.add(o.def.group)
    }
    out.push({ key: o.def.key })
  }
  return out
}

/**
 * Keeps the picks a group allows (its limit; the latest picks win), the Sneak Attack dice they
 * can trade (`sneakDice`), and drops those that can't apply.
 */
export function limitRiders(
  s: Dnd5eSheet,
  level: number,
  options: Dnd5eRiderOption[],
  picks: Dnd5eRiderPick[],
  sneakDice = Infinity,
): Dnd5eRiderPick[] {
  const hero = dnd5eHero(s, level)
  const ok = new Map(options.filter((o) => !o.why).map((o) => [o.def.key, o]))
  const counts = new Map<string, number>()
  let sneak = 0
  const kept: Dnd5eRiderPick[] = []
  for (const p of [...picks].reverse()) {
    const o = ok.get(p.key)
    if (!o || kept.some((k) => k.key === p.key)) continue
    const g = o.def.group
    const n = g ? (counts.get(g) ?? 0) : 0
    if (g && n >= (DND5E_RIDER_GROUPS[g]?.max(hero) ?? 1)) continue
    const cost = o.def.sneakCost ?? 0
    if (sneak + cost > sneakDice) continue
    sneak += cost
    if (g) counts.set(g, n + 1)
    kept.unshift(p)
  }
  return kept
}

/** "1d8 Radiant (Divine Strike)" lines for the card's damage text, from the picks. */
export function riderDamageText(options: Dnd5eRiderOption[], picks: Dnd5eRiderPick[]): string[] {
  const out: string[] = []
  const bases = new Set<string>()
  for (const p of picks) {
    const o = options.find((x) => x.def.key === p.key)
    if (!o || o.why) continue
    const g = o.def.group ? DND5E_RIDER_GROUPS[o.def.group] : undefined
    if (g && o.base && !o.def.miss && !bases.has(o.def.group!)) {
      bases.add(o.def.group!)
      const type = typeof g.type === 'string' ? g.type : (p.type ?? o.types[0])
      out.push(`${o.base} ${type} (${g.label === 'Maneuver' ? o.def.name : g.label})`)
    }
    if ((o.dice || o.flat) && !o.def.heals && !o.def.effect) {
      const amount = o.dice ? `${o.dice}${o.flat ? sign(o.flat) : ''}` : String(o.flat)
      out.push(`${amount} ${p.type ?? o.types[0]} (${o.def.name})`)
    }
    if (o.def.sneakCost) out.push(`−${o.def.sneakCost}d6 Sneak Attack (${o.def.name})`)
  }
  return out
}

/**
 * What the picks do to one roll, for rollAttack5e: the extra damage parts, Sneak Attack d6s
 * forgone, whether Advantage is forgone, what can turn a miss into a hit, the no-attack save,
 * and `pay`, which spends the hit riders' uses, marks the once-a-turn ones, heals and puts on
 * their effects.
 */
export function riderPlan(
  s: Dnd5eSheet,
  level: number,
  plan: Dnd5eAttackPlan,
  picks: Dnd5eRiderPick[],
  ctx: Dnd5eRiderContext = {},
): Dnd5eAttackRiders {
  const hero = dnd5eHero(s, level)
  const options = attackRiders(s, level, plan, ctx)
  const sneakDice = parseDice(plan.extras.find((e) => e.once === 'sneak')?.dice ?? '')?.count ?? 0
  const chosen = limitRiders(s, level, options, picks, sneakDice).map((p) => ({
    pick: p,
    o: options.find((x) => x.def.key === p.key)!,
  }))
  const parts: Dnd5eDamagePart[] = []
  const notes: string[] = []
  const heals: { dice: string; flat: number; who: 'self' | 'ally'; label: string }[] = []
  const effects: { key: string; dice: string; label: string }[] = []
  const spends = new Map<string, number>()
  const onces = new Set<string>()
  const clears = new Set<'heroic' | 'bardic-inspiration'>()
  const misses: Dnd5eMissBoost[] = []
  let sneakCost = 0
  let forgoAdv = false
  let noAttack: Dnd5eAttackRiders['noAttack'] = null
  let double: Dnd5eAttackRiders['double'] = null
  const groups = new Set<string>()
  const add = (m: Map<string, number>, r: string, n = 1) => m.set(r, (m.get(r) ?? 0) + n)
  for (const { pick, o } of chosen) {
    const d = o.def
    const g = d.group ? DND5E_RIDER_GROUPS[d.group] : undefined
    const type = pick.type && o.types.includes(pick.type) ? pick.type : o.types[0]!
    const free = g?.spend?.resource === 'Combat Superiority' && relentless(s, hero)
    const spend = d.spend ?? g?.spend
    if (d.miss) {
      const dice = o.base || o.dice
      misses.push({
        label: d.name,
        ...(d.miss === 'dice' ? { dice } : {}),
        ...(typeof d.miss === 'number' ? { bonus: d.miss } : {}),
        ...(d.miss === 'reroll' ? { reroll: true } : {}),
        ...(d.miss === 'twenty' ? { twenty: true } : {}),
        ...(d.missKeep ? { onlyIfHit: true } : {}),
        pay: () => {
          if (free) useOnce(s, 'relentless')
          else if (spend) spendUses(s, spend.resource, spend.n ?? 1)
          if (d.once) useOnce(s, d.once)
          if (d.clears) clearHeld(s, d.clears)
        },
      })
      continue
    }
    if (g && !groups.has(d.group!)) {
      groups.add(d.group!)
      if (g.forgoAdv) forgoAdv = true
      if (g.once) onces.add(g.once)
      if (free) onces.add('relentless')
      else if (g.spend) add(spends, g.spend.resource, g.spend.n ?? 1)
      if (o.base)
        parts.push({
          dice: o.base,
          type: typeof g.type === 'string' ? g.type : type,
          label: g.label === 'Maneuver' ? d.name : g.label,
          ...(d.separate ? { separate: true } : {}),
        })
    }
    if (d.forgoAdv) forgoAdv = true
    if (d.once) onces.add(d.once)
    if (d.spend) add(spends, d.spend.resource, d.spend.n ?? 1)
    if (d.clears) clears.add(d.clears)
    sneakCost += d.sneakCost ?? 0
    if (d.noAttack && o.save) noAttack = { label: d.name, save: o.save }
    if (d.double && o.save) double = { label: d.name, save: o.save }
    if (d.heals && (o.dice || o.flat))
      heals.push({ dice: o.dice, flat: o.flat, who: d.heals, label: d.name })
    else if (d.effect) effects.push({ key: d.effect, dice: o.dice, label: d.name })
    else if (o.dice || o.flat)
      parts.push({
        dice: o.dice || String(o.flat),
        type,
        label: d.name,
        ...(o.dice && o.flat ? { flat: o.flat } : {}),
        ...(d.separate ? { separate: true } : {}),
      })
    const save = o.save && !d.double ? `DC ${o.save.dc} ${o.save.ability} save: ` : ''
    if (!d.double) notes.push(`${d.name}: ${save}${d.note}`)
  }
  return {
    names: chosen.map((c) => c.o.def.name),
    parts,
    notes,
    sneakCost,
    forgoAdv,
    misses,
    noAttack,
    double,
    pay: (rng?: Rng) => {
      for (const [r, n] of spends) spendUses(s, r, n)
      for (const k of onces) useOnce(s, k)
      for (const c of clears) clearHeld(s, c)
      const said: string[] = []
      for (const h of heals) {
        const p = parseDice(h.dice)
        const n = (p ? rollDice(p, rng).total : 0) + h.flat
        if (h.who === 'self') said.push(`${h.label}: ${heal(s, n) || `heals ${n}`}`)
        else said.push(`${h.label}: a creature regains ${n} HP`)
      }
      for (const e of effects) {
        const p = parseDice(e.dice)
        const n = p ? rollDice(p, rng).total : 0
        addEffect(s, e.key, { value: n, held: !!s.turn?.active })
        said.push(`${e.label}: +${n}`)
      }
      return said
    },
  }
}

/** Spends Heroic Inspiration or the Bardic Inspiration die the hero holds. */
function clearHeld(s: Dnd5eSheet, what: 'heroic' | 'bardic-inspiration') {
  if (what === 'heroic') s.heroicInspiration = false
  else s.effects = (s.effects ?? []).filter((e) => e.key !== 'bardic-inspiration')
}
