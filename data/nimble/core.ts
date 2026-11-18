// Nimble Core Rules: character creation (pp. 18–21) and equipment (pp. 32–36).
import type { ArmorDef, GearDef, StatArray, WeaponDef } from './types'

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

export const SKILL_USES: Record<string, string> = {
  Arcana:
    'Magic: identify magical effects, decipher arcane symbols, learn what magic items do. Knowledge of Aberrations, Elementals and Oozes.',
  Examination:
    'Analysis and deduction: diagnose injuries, find causes of death, uncover clues, work out traps and mechanisms. Knowledge of Constructs.',
  Finesse:
    'Careful hands and feet: pick locks, disarm traps, pilot vehicles, tinker, sleight of hand, steal or plant items, climb tricky surfaces.',
  Influence: 'Charm and cunning: convince or deceive, negotiate, build trust, win allies, perform.',
  Insight:
    'Seeing beyond the obvious: sense motives, detect lies, read emotions, make sense of clues. Can also reveal that your hero thought ahead.',
  Lore: 'History, kingdoms, religions and cultures. Knowledge of Celestials, Dragons, Fey, Fiends, Giants, Humanoids and Undead.',
  Might: 'Applied strength: lift heavy things, break through obstacles, climb, swim, jump.',
  Naturecraft:
    'The wild: survival, navigation, tracking, handling animals, identifying plants and creatures. Knowledge of Beasts, Monstrosities and Plants.',
  Perception:
    'Noticing details: spot hidden objects and secret passages, sense changes around you, notice when you are followed or watched.',
  Stealth: 'Staying unseen and quiet: hide, slip past guards, avoid detection.',
}

export const WEAPONS: WeaponDef[] = [
  {
    name: 'Dagger',
    dice: '1d4',
    stat: 'DEX',
    type: 'Piercing',
    props: 'Light, Thrown 4',
    melee: true,
    cost: '3 gp',
  },
  {
    name: 'Sickle',
    dice: '1d4',
    stat: 'DEX',
    type: 'Slashing',
    props: 'Vicious',
    melee: true,
    cost: '10 gp',
  },
  {
    name: 'Club',
    dice: '1d6',
    stat: 'STR',
    type: 'Bludgeoning',
    props: '',
    melee: true,
    cost: '2 gp',
  },
  {
    name: 'Mace',
    dice: '1d6',
    stat: 'STR',
    type: 'Bludgeoning',
    props: '',
    melee: true,
    cost: '2 gp',
  },
  {
    name: 'Hand Axe',
    dice: '1d6',
    stat: 'STR',
    type: 'Slashing',
    props: 'Thrown 4',
    melee: true,
    cost: '8 gp',
  },
  {
    name: 'Short Sword',
    dice: '1d6',
    stat: 'DEX',
    type: 'Piercing',
    props: 'Light',
    melee: true,
    cost: '10 gp',
  },
  {
    name: 'Rapier',
    dice: '2d4',
    stat: 'DEX',
    type: 'Piercing',
    props: '',
    melee: true,
    cost: '60 gp',
  },
  {
    name: 'Staff',
    dice: '1d8',
    stat: 'STR',
    type: 'Bludgeoning',
    props: '2-handed',
    melee: true,
    cost: '8 gp',
  },
  {
    name: 'Longsword',
    dice: '1d8',
    stat: 'STR',
    type: 'Slashing',
    props: '2-handed (1-handed: Req. 2 STR)',
    melee: true,
    cost: '60 gp',
  },
  {
    name: 'Battleaxe',
    dice: '1d10',
    stat: 'STR',
    type: 'Slashing',
    props: '2-handed',
    melee: true,
    cost: '30 gp',
  },
  {
    name: 'Pole Hammer',
    dice: '1d10',
    stat: 'STR',
    type: 'Bludgeoning',
    props: '2-handed, Reach 2',
    melee: true,
    cost: '60 gp',
  },
  {
    name: 'Glaive',
    dice: '1d10',
    stat: 'STR',
    type: 'Slashing',
    props: '2-handed, Reach 2',
    melee: true,
    cost: '60 gp',
  },
  {
    name: 'Spear',
    dice: '1d10',
    stat: 'STR',
    type: 'Piercing',
    props: '2-handed, Reach 2',
    melee: true,
    cost: '60 gp',
  },
  {
    name: 'Greatmaul',
    dice: '1d12',
    stat: 'STR',
    type: 'Bludgeoning',
    props: '2-handed (Req. 2 STR)',
    melee: true,
    cost: '80 gp',
  },
  {
    name: 'Greataxe',
    dice: '2d6',
    stat: 'STR',
    type: 'Slashing',
    props: '2-handed (Req. 2 STR)',
    melee: true,
    cost: '100 gp',
  },
  {
    name: 'Greatsword',
    dice: '3d4',
    stat: 'STR',
    type: 'Slashing/Piercing',
    props: '2-handed (Req. 2 STR)',
    melee: true,
    cost: '120 gp',
  },
  { name: 'Unarmed Strike', dice: '1d4', stat: 'STR', type: 'Bludgeoning', props: '', melee: true },
  {
    name: 'Sling',
    dice: '1d4',
    stat: 'DEX',
    type: 'Bludgeoning',
    props: '2-handed, Range 12, Vicious',
    melee: false,
    cost: '4 gp',
  },
  {
    name: 'Javelins',
    dice: '1d6',
    stat: 'STR',
    type: 'Piercing',
    props: 'Range 8, stack of 4',
    melee: false,
    cost: '20 gp',
  },
  {
    name: 'Throwing Hammers',
    dice: '1d8',
    stat: 'STR',
    type: 'Bludgeoning',
    props: 'Range 4, stack of 3',
    melee: false,
    cost: '25 gp',
  },
  {
    name: 'Shortbow',
    dice: '1d6',
    stat: 'DEX',
    type: 'Piercing',
    props: '2-handed, Range 12',
    melee: false,
    cost: '25 gp',
  },
  {
    name: 'Longbow',
    dice: '1d8',
    stat: 'DEX',
    type: 'Piercing',
    props: '2-handed, Range 16 (Req. 1 STR)',
    melee: false,
    cost: '30 gp',
  },
  {
    name: 'Crossbow',
    dice: '4d4',
    stat: 'DEX',
    type: 'Piercing',
    props: '2-handed, Load: 1 action, Range 8',
    melee: false,
    cost: '60 gp',
  },
  {
    name: 'Handheld Ballista',
    dice: '1d20',
    stat: 'DEX',
    type: 'Piercing',
    props: '2-handed, Load: 2 actions, Range 8 (Req. 2 STR)',
    melee: false,
    cost: '120 gp',
  },
  // Artificer 1.7 (p. 3). Damage type is the player's choice (p. 5), so it's left blank.
  {
    name: 'Thunder Gauntlets Prototype',
    dice: '1d4',
    stat: 'INT',
    type: '',
    props: 'Reach 4, may roll +1d4: each 1 pushes you back 1 space and knocks you Prone',
    melee: true,
  },
  {
    name: 'Thunder Gauntlets',
    dice: '1d6',
    stat: 'INT',
    type: '',
    props: 'Reach 4, + Mana Dice (push 1 space per die)',
    melee: true,
  },
]

export function weaponByName(name: string): WeaponDef | undefined {
  return WEAPONS.find((w) => w.name === name)
}

export const ARMOR: ArmorDef[] = [
  { name: 'Adventurer’s Garb', kind: 'Cloth', armor: '2+DEX', cost: '10 gp' },
  { name: 'Minor Enchantment', kind: 'Cloth', armor: '3+DEX', cost: '100 gp' },
  { name: 'Major Enchantment', kind: 'Cloth', armor: '4+DEX', cost: '1,000 gp' },
  { name: 'Epic Enchantment', kind: 'Cloth', armor: '5+DEX', cost: '10,000 gp' },
  { name: 'Cheap Hides', kind: 'Leather', armor: '3+DEX', cost: '5 gp' },
  { name: 'Ox Hide', kind: 'Leather', armor: '4+DEX', cost: '45 gp' },
  { name: 'Hard Leather', kind: 'Leather', armor: '5+DEX', str: 1, cost: '300 gp' },
  { name: 'Wyrmhide', kind: 'Leather', armor: '6+DEX', str: 1, cost: '2,000 gp' },
  { name: 'Rusty Mail', kind: 'Mail', armor: '6+DEX (max 2)', cost: '15 gp' },
  { name: 'Chain Shirt', kind: 'Mail', armor: '9+DEX (max 2)', str: 2, cost: '60 gp' },
  { name: 'Scale Mail', kind: 'Mail', armor: '12+DEX (max 2)', str: 3, cost: '700 gp' },
  { name: 'Dragonscale', kind: 'Mail', armor: '15+DEX (max 2)', str: 4, cost: '3,000 gp' },
  { name: 'Rusty Plate', kind: 'Plate', armor: '10', str: 2, cost: '25 gp' },
  { name: 'Half Plate', kind: 'Plate', armor: '14', str: 3, cost: '200 gp' },
  { name: 'Full Plate', kind: 'Plate', armor: '18', str: 4, cost: '2,000 gp' },
  { name: 'Mithril Plate', kind: 'Plate', armor: '22', str: 5, cost: '5,000 gp' },
  { name: 'Wooden Buckler', kind: 'Shield', armor: '+2', cost: '5 gp' },
  { name: 'Iron Shield', kind: 'Shield', armor: '+4', str: 2, cost: '80 gp' },
  { name: 'Tower Shield', kind: 'Shield', armor: '+6', str: 3, cost: '1,500 gp' },
  { name: 'Dragon Shield', kind: 'Shield', armor: '+8', str: 3, cost: '9,000 gp' },
]

export function armorByName(name: string): ArmorDef | undefined {
  return ARMOR.find((a) => a.name === name)
}

export const GEAR: GearDef[] = [
  {
    name: 'Healing Potion',
    desc: '1 action to drink or give to an adjacent willing creature: heal 2d4+4 HP.',
    cost: '50 gp',
  },
  {
    name: 'Greater Healing Potion',
    desc: '1 action to drink or give to an adjacent willing creature: heal 3d6+6 HP.',
    cost: '150 gp',
  },
  {
    name: 'Supreme Healing Potion',
    desc: '1 action to drink or give to an adjacent willing creature: heal 4d8+8 HP.',
    cost: '450 gp',
  },
  {
    name: 'Torch (stack of 2)',
    desc: 'Light up to 6 spaces; each lasts about 1 dungeon.',
    cost: '5 sp',
  },
  {
    name: 'Lantern & Oil',
    desc: 'Light up to 6 spaces until your next Safe Rest (refill: 1 gp).',
    cost: '10 gp',
  },
  { name: 'Vial of Pitch', desc: 'Sticky and very flammable.', cost: '2 gp' },
  { name: 'Rope (50 ft.)', desc: 'You always need rope.', cost: '10 gp' },
  { name: 'Chain (10 ft.)', desc: 'Like rope, but stronger (and heavy).', cost: '50 gp' },
  { name: 'Bucket', desc: 'Also works as a hat in a pinch.', cost: '1 gp' },
  { name: 'Padlock & Key', desc: 'Lock it or lose it.', cost: '3 gp' },
  { name: 'Mirror', desc: 'For medusas and spinach teeth.', cost: '4 gp' },
  { name: 'Telescope', desc: 'See far.', cost: '10 gp' },
  { name: 'Magnifying Glass', desc: 'Make the small big.', cost: '5 gp' },
  { name: 'Chalk', desc: 'Mark your way.', cost: '1 sp' },
  { name: 'Shovel', desc: 'Dig a hole.', cost: '3 gp' },
  { name: 'Pulley', desc: 'Pull down, go up.', cost: '3 gp' },
  { name: 'Grappling Hook', desc: 'For climbing.', cost: '4 gp' },
  { name: 'Quiver & Ammo', desc: 'No need to track arrows.', cost: '10 gp' },
  { name: 'Saw', desc: 'For cutting lumber.', cost: '4 gp' },
  { name: 'Soap', desc: 'Useless.', cost: '1 sp' },
  { name: 'Strange Plant', desc: 'Who knows?', cost: '5 sp' },
  { name: 'Shiny Object', desc: 'Worthless, but very pretty.', cost: '1 sp' },
  { name: 'Lock Pick', desc: 'For locks that aren’t yours.', cost: '5 gp' },
  { name: 'Bell', desc: 'For service.', cost: '2 gp' },
  { name: 'Dice', desc: 'For games.', cost: '5 sp' },
  { name: 'Blanket', desc: 'Warm.', cost: '1 gp' },
  { name: 'Hunting Trap', desc: 'Snaps shut on whatever steps in it.', cost: '10 gp' },
  { name: 'Camping Supplies', desc: 'Bedroll, rations, simple tent.', cost: '5 gp' },
  { name: 'Crowbar', desc: 'Pries things open.', cost: '2 gp' },
  { name: 'Pitons', desc: 'Metal spikes, for sealing doors.', cost: '5 gp' },
  { name: 'Manacles', desc: 'Restrains a prisoner.', cost: '3 gp' },
  { name: 'Large Sack', desc: 'A big pocket.', cost: '5 sp' },
  { name: 'Instrument', desc: 'Drums, horn, lyre, flute…', cost: '5–50 gp' },
]

export function gearByName(name: string): GearDef | undefined {
  return GEAR.find((g) => g.name === name)
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
    desc: 'Movement costs double and your attacks have disadvantage; melee against you has advantage, ranged has disadvantage. Standing costs 3 spaces.',
  },
  {
    name: 'Riding',
    desc: 'You move with the creature you ride; attacks that miss you hit it.',
  },
  { name: 'Slowed', desc: 'Speed halved during your next turn.' },
  { name: 'Taunted', desc: 'Disadvantage on attacks except against the most recent taunter.' },
  { name: 'Wounded', desc: 'Has any Wounds.' },
]
