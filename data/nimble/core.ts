// Nimble Core Rules: character creation (pp. 18–21) and equipment (pp. 32–36).
import type { StatArray, WeaponDef } from './types'

export const STAT_ARRAYS: StatArray[] = [
  { id: 'standard', name: 'Standard', values: [2, 2, 0, -1] },
  { id: 'balanced', name: 'Balanced', values: [2, 1, 1, 0] },
  { id: 'minmax', name: 'Min–Max', values: [3, 1, -1, -1] },
]

/** Extra skill points placed at level 1, on top of each skill's stat. */
export const STARTING_SKILL_POINTS = 4
export const MAX_SKILL_BONUS = 12
export const BASE_SPEED = 6
export const BASE_WOUNDS = 6

export const WEAPONS: WeaponDef[] = [
  {
    name: 'Dagger',
    dice: '1d4',
    stat: 'DEX',
    type: 'Piercing',
    props: 'Light, Thrown 4',
    melee: true,
  },
  { name: 'Sickle', dice: '1d4', stat: 'DEX', type: 'Slashing', props: 'Vicious', melee: true },
  { name: 'Mace', dice: '1d6', stat: 'STR', type: 'Bludgeoning', props: '', melee: true },
  { name: 'Hand Axe', dice: '1d6', stat: 'STR', type: 'Slashing', props: 'Thrown 4', melee: true },
  { name: 'Short Sword', dice: '1d6', stat: 'DEX', type: 'Piercing', props: 'Light', melee: true },
  { name: 'Staff', dice: '1d8', stat: 'STR', type: 'Bludgeoning', props: '2-handed', melee: true },
  {
    name: 'Battleaxe',
    dice: '1d10',
    stat: 'STR',
    type: 'Slashing',
    props: '2-handed',
    melee: true,
  },
  {
    name: 'Unarmed Strike',
    dice: '1d4',
    stat: 'STR',
    type: 'Bludgeoning',
    props: '',
    melee: true,
  },
  {
    name: 'Sling',
    dice: '1d4',
    stat: 'DEX',
    type: 'Bludgeoning',
    props: '2-handed, Range 12, Vicious',
    melee: false,
  },
  {
    name: 'Javelins',
    dice: '1d6',
    stat: 'STR',
    type: 'Piercing',
    props: 'Range 8, stack of 4',
    melee: false,
  },
  {
    name: 'Shortbow',
    dice: '1d6',
    stat: 'DEX',
    type: 'Piercing',
    props: '2-handed, Range 12',
    melee: false,
  },
]

export function weaponByName(name: string): WeaponDef | undefined {
  return WEAPONS.find((w) => w.name === name)
}

/** Heroic reactions: each costs 1 action and can be used once per round. */
export const REACTIONS = [
  {
    name: 'Defend',
    desc: 'Reduce the damage from a single attack by your Armor. Some damage can’t be avoided.',
  },
  {
    name: 'Interpose',
    desc: 'When a creature within 2 spaces would be hit, push them to an adjacent space and become the new target.',
  },
  {
    name: 'Opportunity Attack',
    desc: 'A melee attack with disadvantage against an adjacent enemy as it willingly moves away.',
  },
  {
    name: 'Help',
    desc: 'Give an ally advantage on a roll if you can explain how you help (one Help per roll).',
  },
]

/** Conditions the sheet works out from HP and Wounds; they can't be toggled by hand. */
export const AUTO_CONDITIONS = ['Bloodied', 'Dying', 'Wounded']

export const CONDITIONS = [
  {
    name: 'Blinded',
    desc: 'Can’t see. Attacks against you have advantage; your attacks have disadvantage.',
  },
  { name: 'Bloodied', desc: 'At half HP or less.' },
  {
    name: 'Charmed',
    desc: 'Sees the charmer as an ally; the charmer has advantage on social checks with you.',
  },
  { name: 'Dazed', desc: 'Heroes lose 1 action on their next turn.' },
  { name: 'Dying', desc: 'At 0 HP. Taking damage causes 2 Wounds, a crit 3.' },
  {
    name: 'Frightened',
    desc: 'Disadvantage while the source is nearby; speed halved moving toward it.',
  },
  { name: 'Grappled', desc: 'Can’t move. Attacks against you have advantage.' },
  { name: 'Restrained', desc: 'Like Grappled, but from objects or spells; ignores size.' },
  {
    name: 'Hampered',
    desc: 'Actions or movement reduced (Dazed, Grappled, Prone, difficult terrain).',
  },
  {
    name: 'Incapacitated',
    desc: 'Can’t do anything. Attacks against you have advantage; melee hits crit.',
  },
  {
    name: 'Invisible',
    desc: 'Can’t be seen. Your attacks have advantage; attacks against you have disadvantage.',
  },
  { name: 'Petrified', desc: 'Incapacitated, but immune to most damage.' },
  { name: 'Poisoned', desc: 'Disadvantage on rolls.' },
  {
    name: 'Prone',
    desc: 'Movement costs double; melee against you has advantage, ranged has disadvantage. Standing costs 3 spaces.',
  },
  {
    name: 'Riding',
    desc: 'You move with the creature you ride; attacks that miss you hit it.',
  },
  { name: 'Slowed', desc: 'Speed halved during your next turn.' },
  { name: 'Taunted', desc: 'Disadvantage on attacks except against the most recent taunter.' },
  { name: 'Wounded', desc: 'Has any Wounds.' },
]
