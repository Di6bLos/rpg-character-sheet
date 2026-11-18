// Rolls and statuses from class abilities and spells: Artificer 1.7 (pp. 3–12); Nimble
// Heroes, Cheat (pp. 12–17), Shadowmancer (pp. 42–47), Stormshifter (pp. 62–65) and
// Zephyr (pp. 68–69); Nimble Core Rules spells (pp. 46–51).
import type { AbilityRollDef, InventionDef, Mishap, SelfEffectDef } from './types'

export const ABILITY_ROLLS: AbilityRollDef[] = [
  {
    ability: 'Stim Pack',
    count: ['INT'],
    die: 8,
    kind: 'healing',
    dc: 16,
    note: 'The target gains 1 action; at the end of their turn, DC {dc} STR save or Dazed.',
    upgrades: [
      { name: 'Stim Pack: Enhanced Stimulants', mult: 2, note: 'The target gains 1 Wound.' },
      { name: 'Stim Pack: Reduced Side Effects', dc: -4 },
    ],
  },
  {
    ability: 'Scrapbot Swarm',
    count: ['INT', 'STR'],
    die: 6,
    kind: 'damage',
    each: true,
    note: 'Each construct hits any target within Reach 4.',
    upgrades: [
      { name: 'Scrapbot Swarm: Dense Swarm', count: 2 },
      { name: 'Scrapbot Swarm: Sharpened Scrap', dieSteps: 1 },
    ],
  },
  {
    ability: 'Homing Missile',
    count: [1],
    die: 20,
    kind: 'damage',
    noMiss: true,
    note: 'Ignores cover; it does not miss.',
    upgrades: [{ name: 'Homing Missile: Reliable Explosives', advantage: true }],
  },
  {
    ability: 'Safety Buddy',
    requires: 'Safety Buddy: Explosive Framework',
    count: ['INT'],
    die: 6,
    kind: 'damage',
    note: 'Explosive Framework: to the attacker, who gains Smoldering.',
  },
]

export const INVENTIONS: InventionDef[] = [
  {
    name: 'Manabolt Cannon',
    use: 'cannon',
    actions: 2,
    min: 1,
    stats: 'Range 8 · 2 actions · needs 1+ Mana Dice',
    modes: [{ text: '1d12, plus each Mana Die + INT to the target and to everything in between.' }],
    mishap: {
      name: 'Arcane Overload',
      text: 'Take 2 damage per Mana Die; inoperable until a DC 12 Finesse check.',
    },
  },
  {
    name: 'Manablade',
    use: 'blade',
    actions: 1,
    min: 1,
    stats: 'Reach 1 · 1 action · needs 1+ Mana Dice',
    modes: [{ text: '2 × (Mana Dice + STR). Heavy armor counts as Medium, Medium as none.' }],
    mishap: {
      name: 'Arcane Rebound',
      text: 'Take damage equal to the dice rolled; inoperable until a DC 12 Arcana check.',
    },
  },
  {
    name: 'Manaforged Plate',
    use: 'plate',
    actions: 0,
    min: 0,
    stats: 'Armor 8+STR',
    modes: [
      { name: 'Autoshields', cost: '1/round, free', text: 'Reduce a hit by INT.' },
      { name: 'Mana Infusion', cost: 'with Defend', text: '+2×STR Armor per Mana Die.' },
    ],
    mishap: { name: 'Armor Lockup', text: 'You are Restrained (escape DC 10).' },
  },
  {
    name: 'Aethertuned Jerkin',
    use: 'jerkin',
    actions: 0,
    min: 0,
    stats: 'Armor 1+INT+DEX · +1 Speed, +1 Initiative',
    modes: [
      {
        name: 'Tuned Thrusters',
        cost: 'with Defend',
        text: 'First move 1 space per Mana Die; out of reach or sight, the attack misses.',
      },
    ],
    mishap: { name: 'Tumble', text: 'Land Prone within 2 spaces of where you aimed (GM picks).' },
  },
  {
    name: 'Tethercoil',
    use: 'tether',
    actions: 0,
    min: 1,
    stats: '+4 Range per Mana Die · needs 1+ Mana Dice',
    modes: [
      {
        name: 'Tether',
        cost: '1 action',
        text: 'Pull a creature your size or smaller next to you (you may Restrain it), or move to a larger one and ride it.',
        mishap: { name: 'Mistether', text: 'The GM may pick another creature in Range.' },
      },
      {
        name: 'Coil',
        cost: '2 actions',
        text: 'Restrain every creature fully inside an N×N area (N = Mana Dice).',
        mishap: { name: 'Tangled', text: 'You are Restrained too.' },
      },
    ],
  },
]

export const WEAPON_MISHAPS: Record<string, Mishap> = {
  'Thunder Gauntlets': { name: 'Recoil', text: 'You are knocked back as far, landing Prone.' },
}

export const SELF_EFFECTS: SelfEffectDef[] = [
  {
    source: 'One with Shadows',
    condition: 'Invisible',
    ends: ['attack', 'encounter'],
    until: 'until you move or attack',
  },
  {
    source: 'I’m Outta Here!',
    condition: 'Invisible',
    ends: ['nextTurnEnd'],
    until: 'until the end of your next turn; then move up to half your speed for free',
  },
  {
    source: 'Propulsive Boots',
    condition: 'Flying',
    ends: ['turnEnd'],
    until: 'until the end of your turn; move for free',
  },
  {
    source: 'Glacial Resilience',
    condition: 'Glacial Resilience',
    ends: ['nextTurnEnd'],
    until: '10×LVL temp HP, lost at the end of your next turn; negative conditions ended',
    tempHp: '10×LVL',
    clearNegative: true,
  },
  {
    source: 'Ethereal Projection',
    condition: 'Ethereal Projection',
    ends: ['rest'],
    until: 'for up to 10 minutes, up to 30 ft. away',
  },
  {
    source: 'Dragonform',
    transform: true,
    condition: 'Dragonform',
    ends: ['tempHpGone', 'rest'],
    until: 'while its temp HP remain (max 10 minutes); when it ends you drop to 0 HP',
    trigger: 'cast',
    tempHp: '10×LVL',
    dropToZero: true,
    attack: { name: 'Tooth & Claw', dice: '1d20+LVL', note: 'Reach 2, ignoring armor, Smoldering' },
  },
  {
    source: 'Frost Shield',
    condition: 'Frost Shield',
    ends: ['turn'],
    until: '2×KEY temp HP until the start of your next turn',
    trigger: 'cast',
    tempHp: '2×KEY',
    tempHpPerUpcast: '2×KEY',
  },
  {
    source: 'Alacrity',
    condition: 'Charged',
    ends: ['encounter'],
    until: 'until combat ends',
    trigger: 'cast',
  },
  {
    source: 'Seething Storm',
    transform: true,
    condition: 'Seething Storm',
    ends: ['concentration'],
    until:
      'while you concentrate: you can fly, move for free 1/round, attacks against you have disadvantage',
    trigger: 'cast',
  },
  {
    source: 'Boisterous Winds',
    condition: 'Flying',
    ends: ['concentration'],
    until: 'while you concentrate: flying speed 12, ranged attacks against you have disadvantage',
    trigger: 'cast',
  },
  {
    source: 'Harmless beast',
    transform: true,
    condition: 'Beastshifted',
    ends: ['spell', 'zeroHp', 'damage', 'rest'],
    until: 'until you drop to 0 HP, cast a spell or end it; you can speak with animals',
    form: {
      requires: 'Beastshift',
      rank: 0,
      cost: 'Beastshift',
      freeWith: 'Friend of Beasts',
      keepOnSpell: 'Creature of the Fey',
    },
  },
  {
    source: 'Fearsome Beast',
    transform: true,
    condition: 'Beastshifted',
    ends: ['spell', 'zeroHp', 'rest'],
    until: 'Large; DEX+LVL temp HP until the form ends',
    tempHp: 'DEX+LVL',
    attack: { name: 'Gore', dice: '1d6+LVL', note: 'on hit: gain LVL temp HP' },
    form: {
      requires: 'Direbeast Form',
      rank: 1,
      cost: 'Beastshift',
      keepOnSpell: 'Creature of the Fey',
    },
  },
  {
    source: 'Beast of the Pack',
    transform: true,
    condition: 'Beastshifted',
    ends: ['spell', 'zeroHp', 'rest'],
    until: 'Medium; +DEX speed, Supercharge',
    attack: {
      name: 'Thunderfang',
      dice: '1d4+LVL',
      note: '+1d4 lightning for each crit or kill this combat (add by hand)',
    },
    form: {
      requires: 'Direbeast Form',
      rank: 2,
      cost: 'Beastshift',
      keepOnSpell: 'Creature of the Fey',
    },
  },
  {
    source: 'Beast of Nightmares',
    transform: true,
    condition: 'Beastshifted',
    ends: ['spell', 'zeroHp', 'damage', 'rest'],
    until: 'Tiny; speed 2, can’t Defend or Interpose; ANY damage ends it',
    attack: {
      name: 'Sting',
      dice: '1d4+3×LVL',
      note: '(1/round) Reach 0, acid ignoring armor; 4×LVL on a crit',
    },
    form: {
      requires: 'Direbeast Form',
      rank: 3,
      cost: 'Beastshift',
      keepOnSpell: 'Creature of the Fey',
    },
  },
  {
    source: 'Escape Plan',
    condition: 'Invisible',
    ends: ['attack', 'encounter'],
    until: 'for 1 minute or until you attack',
  },
  {
    source: 'Amidst All This Commotion…',
    condition: 'Invisible',
    ends: ['attack', 'turn'],
    until: 'until you attack or your next turn starts',
  },
  {
    source: 'Thunder Gauntlets',
    condition: 'Prone',
    ends: [],
    until: 'Recoil: knocked back the same distance',
    trigger: 'mishap',
  },
  {
    source: 'Aethertuned Jerkin',
    condition: 'Prone',
    ends: [],
    until: 'Tumble!: within 2 spaces of where you meant to land (the GM picks)',
    trigger: 'mishap',
  },
]
