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
    props: 'Swift Fists: no Rushed Attack disadvantage',
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
