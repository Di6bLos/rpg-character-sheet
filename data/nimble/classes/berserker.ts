// Nimble Heroes, Berserker (pp. 6–11).
import type { ClassDef } from '../types'
import { CAPSTONE_STATS, EPIC_BOON, inc, poolChoice } from './shared'

const arsenal = (n: number) =>
  poolChoice('savage-arsenal', `Savage Arsenal (${n}): choose a Savage Arsenal ability`, [
    'savage-arsenal',
  ])

export const berserker: ClassDef = {
  slug: 'berserker',
  name: 'Berserker',
  tagline: 'An unstoppable force of wrath and ruin.',
  description:
    'Wrath and Ruin. The Berserker knows not fatigue nor caution. Once a Berserker has begun to fight, they only grow stronger, fueled by battle-lust and an unending Rage.',
  highlights: [
    'Become a raging, damage-dealing machine. Greet death as an old friend and keep on fighting!',
    'The longer a fight goes on, the more your Rage intensifies.',
    'Choose Savage Arsenal abilities to crush your foes and laugh in the face of death.',
  ],
  complexity: 2,
  keyStats: ['STR', 'DEX'],
  hitDie: 12,
  startingHp: 20,
  saveAdv: 'STR',
  saveDis: 'INT',
  armor: 'None',
  weapons: 'All STR weapons',
  startingGear: [
    { name: 'Battleaxe', qty: '1' },
    { name: 'Rations (meat)', qty: '1' },
    { name: 'Rope (50 ft.)', qty: '1' },
  ],
  startingWeapons: ['Battleaxe'],
  armorCalc: { base: 0 },
  resource: {
    name: 'Rage',
    diceName: 'Fury',
    die: 4,
    kind: 'rage',
    ability: 'Rage',
  },
  swapRule: {
    name: 'Wrath & Ruin',
    desc: 'Whenever you perform a notable act of destruction or feat of strength during a Safe Rest, you may choose different Berserker options available to you.',
  },
  pools: [
    {
      id: 'savage-arsenal',
      name: 'Savage Arsenal',
      options: [
        {
          name: 'Death Blow',
          desc: 'After you deal damage from a crit, you may expend any number of Fury Dice. Sum the dice and deal double that amount of damage.',
        },
        {
          name: 'Deathless Rage',
          desc: '(1/turn) While Dying, you may suffer 1 Wound to gain 1 action.',
        },
        {
          name: 'Eager for Battle',
          desc: 'Gain advantage on Initiative. Move 2×DEX spaces for free on your first turn each encounter.',
        },
        {
          name: 'Into the Fray',
          desc: 'Action: Leap up to 2×DEX spaces toward an enemy. If you land adjacent to at least 2 enemies, make an attack against 1 of them for free.',
        },
        {
          name: 'Mighty Endurance',
          desc: 'You can now survive an additional 4 Wounds before death.',
        },
        { name: 'MORE BLOOD!', desc: 'Whenever an enemy crits you, gain 1 Fury Die.' },
        {
          name: 'Rampage',
          desc: '(1/turn) After you land a hit, you may treat your next attack this turn as if you rolled that same amount instead of rolling again.',
        },
        {
          name: 'Swift Fury',
          desc: 'Whenever you gain one or more Fury Dice, move up to DEX spaces for free, ignoring difficult terrain.',
        },
        {
          name: 'Thunderous Steps',
          desc: 'After moving at least 4 spaces while Raging, you may deal STR Bludgeoning damage to all adjacent creatures where you stop.',
        },
        {
          name: 'Unstoppable Force',
          desc: 'While Dying and Raging, taking damage causes 1 Wound (instead of 2) and critical hits inflict 2 Wounds (instead of 3).',
        },
        {
          name: 'Whirlwind',
          desc: '2 actions: Attack ALL targets within your melee weapon’s reach.',
        },
        {
          name: 'You’re Next!',
          desc: 'Action: While Raging, make a Might skill check to demoralize an enemy within Reach 12 (DC: their current HP). On a success, they immediately flee the battle.',
        },
      ],
    },
  ],
  levels: {
    1: {
      abilities: [
        {
          name: 'Rage',
          desc: '(1/turn) Action: Roll a Fury Die (1d4) and set it aside. Add it to every STR attack you make. You can have a max of KEY Fury Dice; they are lost when your Rage ends. Your Rage ends if you leave combat, drop to 0 HP, or go 1 round without attacking or Raging. You can Rage again while Raging; at your max, roll and keep the dice you want.',
        },
        {
          name: 'That all you got?!',
          desc: 'When you are attacked, you may expend 1 or more Fury Dice to reduce the damage taken by STR+DEX for each die spent.',
        },
      ],
    },
    2: {
      abilities: [
        {
          name: 'Intensifying Fury',
          desc: 'If you are Raging at the beginning of your turn, roll 1 Fury Die for free.',
        },
        {
          name: 'One with the Ancients',
          desc: '(1/Safe Rest) When faced with a decision about which direction or course of action to take, you can call upon your ancestors to guide you toward the most dangerous or challenging path.',
        },
      ],
    },
    3: {
      subclassChoice: true,
      abilities: [
        {
          name: 'Bloodlust',
          desc: 'Expend 1 or more Fury Dice on your turn, move DEX spaces per die spent for free.',
        },
      ],
    },
    4: {
      abilities: [
        {
          name: 'Enduring Rage',
          desc: 'While Dying, you Rage automatically for free at the beginning of your turn, have a max of 2 actions instead of 1, and ignore the STR saves to make attacks.',
        },
      ],
      statIncrease: inc('STR', 'DEX'),
      choices: [arsenal(1)],
    },
    5: {
      abilities: [{ name: 'Rage (2)', desc: 'Whenever you Rage, gain 2 Fury Dice instead.' }],
      statIncrease: inc('INT', 'WIL'),
    },
    6: {
      abilities: [{ name: 'Intensifying Fury (2)', desc: 'Your Fury Dice are now d6s.' }],
      resourceDie: 6,
      choices: [arsenal(2)],
    },
    7: { abilities: [] },
    8: { abilities: [], statIncrease: inc('STR', 'DEX'), choices: [arsenal(3)] },
    9: {
      abilities: [{ name: 'Intensifying Fury (3)', desc: 'Your Fury Dice are now d8s.' }],
      resourceDie: 8,
      statIncrease: inc('INT', 'WIL'),
    },
    10: { abilities: [], choices: [arsenal(4)] },
    11: { abilities: [] },
    12: { abilities: [], statIncrease: inc('STR', 'DEX'), choices: [arsenal(5)] },
    13: {
      abilities: [{ name: 'Intensifying Fury (4)', desc: 'Your Fury Dice are now d10s.' }],
      resourceDie: 10,
      statIncrease: inc('INT', 'WIL'),
    },
    14: { abilities: [], choices: [arsenal(6)] },
    15: { abilities: [] },
    16: { abilities: [], statIncrease: inc('STR', 'DEX'), choices: [arsenal(7)] },
    17: {
      abilities: [{ name: 'Intensifying Fury (5)', desc: 'Your Fury Dice are now d12s.' }],
      resourceDie: 12,
      statIncrease: inc('INT', 'WIL'),
    },
    18: {
      abilities: [{ name: 'Deep Rage', desc: 'Dropping to 0 HP does not cause your Rage to end.' }],
    },
    19: { abilities: [], choices: [EPIC_BOON] },
    20: {
      abilities: [
        {
          name: 'Boundless Rage',
          desc: 'Anytime you roll less than 6 on a Fury Die, change it to 6 instead.',
        },
      ],
      statIncrease: CAPSTONE_STATS,
    },
  },
  subclasses: [
    {
      slug: 'mountainheart',
      name: 'Path of the Mountainheart',
      tagline: 'indomitable as the mountain',
      levels: {
        3: {
          abilities: [
            {
              name: 'Stone’s Resilience',
              desc: 'Whenever you expend Fury Dice to reduce incoming damage, add the value of the die to the amount reduced.',
            },
            {
              name: 'Mountainous Tenacity',
              desc: 'Whenever you expend your Hit Dice to recover HP, for every 10 HP you would recover, you may heal 1 Wound instead.',
            },
          ],
        },
        7: {
          abilities: [
            {
              name: 'Unbreakable',
              desc: '(1/encounter) While Raging, if you would suffer your last Wound or other negative condition of your choice, you don’t.',
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'Titan’s Fury',
              desc: 'After you miss an attack or are crit by an enemy, Rage for free.',
            },
          ],
        },
        15: {
          abilities: [
            {
              name: 'Mountain’s Endurance',
              desc: 'While Dying, if an attack against you would be a crit, the attack is rerolled instead (when-crit abilities, such as Titan’s Fury, still trigger).',
            },
          ],
        },
      },
    },
    {
      slug: 'red-mist',
      name: 'Path of the Red Mist',
      tagline: 'frenzied, drunk on blood',
      levels: {
        3: {
          abilities: [
            {
              name: 'Blood Frenzy',
              desc: '(1/turn) While Raging, whenever you crit or kill an enemy, change 1 Fury Die to the maximum.',
            },
            {
              name: 'Savage Awareness',
              desc: 'Advantage on Perception checks to notice or track down blood. Blindsight 2 while Raging: you ignore the Blinded condition and can see through darkness and Invisibility within that Range.',
            },
          ],
        },
        7: {
          abilities: [
            {
              name: 'Unstoppable Brutality',
              desc: 'While Raging, you may gain 1 Wound to reroll any attack or save.',
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'Opportunistic Frenzy',
              desc: 'While Raging, you can make opportunity attacks without disadvantage, and you may make them whenever an enemy enters your melee weapon’s reach.',
            },
          ],
        },
        15: {
          abilities: [
            {
              name: 'Onslaught',
              desc: 'While Raging, gain +2 speed. (1/round) You may move for free.',
            },
          ],
        },
      },
    },
  ],
}
