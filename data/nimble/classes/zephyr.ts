// Nimble Heroes, Zephyr (pp. 66–71).
import type { ClassDef } from '../types'
import { CAPSTONE_STATS, EPIC_BOON, inc, poolChoice } from './shared'

const martial = (n: number, ordinal: string) =>
  poolChoice('martial-arts', `Martial Master (${n}): choose a ${ordinal} Martial Arts Ability`, [
    'martial-arts',
  ])

export const zephyr: ClassDef = {
  slug: 'zephyr',
  name: 'Zephyr',
  tagline: 'A disciplined martial artist with swift hands and swift feet.',
  description:
    'A Zephyr dedicates their life to the relentless pursuit of kinetic perfection, honing their body into a blur of motion. Speed is both their weapon and shield.',
  highlights: [
    'Unarmed and Dangerous: absorb blows and deliver devastating strikes.',
    'A Graceful Combatant: outpace allies and foes, and turn enemy strikes into counterattacks.',
  ],
  complexity: 2,
  keyStats: ['DEX', 'STR'],
  hitDie: 8,
  startingHp: 13,
  saveAdv: 'DEX',
  saveDis: 'INT',
  armor: 'None',
  weapons: 'Melee',
  startingGear: [
    { name: 'Staff', qty: '1' },
    { name: 'Traveling Robes & Sandals', qty: '1' },
  ],
  startingWeapons: ['Unarmed Strike', 'Staff'],
  armorCalc: { base: 0, addStr: true },
  swapRule: {
    name: 'Focus',
    desc: 'Whenever you spend time meditating alone in a windy place during a Safe Rest, you may choose different Zephyr options available to you.',
  },
  pools: [
    {
      id: 'martial-arts',
      name: 'Martial Arts Abilities',
      options: [
        {
          name: 'Airshift',
          desc: 'You cannot be Grappled while conscious. While moving, you may travel across all terrain as normal ground, ignoring all ill effects (walls/ceilings, water, treetops, lava, spikes, clouds).',
        },
        {
          name: 'Blur',
          desc: '(1/encounter) When you Defend, you may first move up to half your speed away, taking no damage if you are now out of range or have Full Cover.',
        },
        {
          name: 'Bodily Discipline',
          desc: 'You may spend 1 action to end any non-Wound condition on yourself.',
        },
        {
          name: 'Enduring Soul',
          desc: 'Each time you roll Initiative, gain Hit Dice equal to the actions you get on your first turn. They expire at the end of combat if unused.',
        },
        {
          name: 'I Jump On His Back!',
          desc: 'While moving with your Windstep, if you move into the space of a creature your size or larger, you may jump onto its back. While on it, gain advantage on melee attacks against it, and any damage you avoid is dealt to it instead.',
        },
        {
          name: 'Kinetic Barrage',
          desc: 'Whenever you miss an attack, gain a cumulative +STR bonus to all damage you do for the rest of this encounter (a disciplined martial artist does not miss on purpose).',
        },
        {
          name: 'Mighty Soul',
          desc: 'You cannot be moved against your will. Whenever you would fail a saving throw, you may gain a Wound to add your STR to the result. You may repeat this any number of times.',
        },
        {
          name: 'Quickstrike',
          desc: 'When you Interpose, you may first make an unarmed strike against the enemy for free.',
        },
        {
          name: 'Use Momentum',
          desc: 'Whenever you avoid all the damage of a melee attack (it misses or you Defend), you may swap places with the attacker, then choose another target now within the attack’s reach; they are hit instead.',
        },
        {
          name: 'Vital Rejuvenation',
          desc: 'When you receive healing for the first time on a turn, you may heal another target within 6 spaces HP equal to your STR.',
        },
        {
          name: 'Windstrider',
          desc: 'If you move through the space of a willing creature while using Windstep, they can move with you and choose any space adjacent to your path to end in.',
        },
      ],
    },
  ],
  levels: {
    1: {
      abilities: [
        {
          name: 'Iron Defense',
          desc: 'Your armor equals DEX+STR as long as you are unarmored.',
        },
        {
          name: 'Swift Fists',
          desc: 'Your unarmed strikes are not subject to disadvantage imposed by Rushed Attacks, and their damage is 1d4+STR.',
        },
      ],
    },
    2: {
      speed: 2,
      abilities: [
        { name: 'Swift Feet', desc: 'While unarmored, gain +2 speed and +LVL Initiative.' },
        {
          name: 'Burst of Speed',
          desc: 'When you roll Initiative, gain DEX Bursts of Speed for that encounter. (1/turn) Spend 1 to use a maneuver for free: Slipstream (Defend, and the attack misses), Whirling Defense (Defend and apply your armor to every attack this round), Swiftstrike (attack on your turn, ignoring disadvantage from Rushed Attacks), or Windstep (move on your turn, ignoring difficult terrain).',
        },
      ],
    },
    3: {
      subclassChoice: true,
      abilities: [
        { name: 'Kinetic Momentum', desc: 'Whenever you gain a Wound, gain a Burst of Speed.' },
        {
          name: 'Ethereal Projection',
          desc: '(1/day) By meditating for at least 10 minutes, you can project an ethereal version of yourself up to 30 ft. away, passing through solid objects. You see through its eyes; it is visible as a translucent you, cannot interact physically, and lasts up to 10 minutes.',
        },
      ],
    },
    4: {
      abilities: [
        {
          name: 'Unyielding Resolve',
          desc: 'Ignore the first Wound you would suffer each encounter (when-Wounded abilities, such as Kinetic Momentum, still trigger).',
        },
      ],
      statIncrease: inc('DEX', 'STR'),
      choices: [
        poolChoice('martial-arts', 'Martial Master: choose a Martial Arts ability', [
          'martial-arts',
        ]),
      ],
    },
    5: {
      abilities: [
        {
          name: 'Reverberating Strikes',
          desc: 'Add LVL bludgeoning damage to all of your melee attacks.',
        },
      ],
      statIncrease: inc('INT', 'WIL'),
    },
    6: {
      abilities: [
        {
          name: 'Infuse Strength',
          desc: 'Action: Make an unarmed strike against an ally to infuse them with your strength instead of harming them. Expend any number of Hit Dice and heal them as you would heal yourself during a Field Rest (roll them and add your STR to each).',
        },
      ],
      choices: [martial(2, '2nd')],
    },
    7: { abilities: [] },
    8: { abilities: [], statIncrease: inc('DEX', 'STR'), choices: [martial(3, '3rd')] },
    9: {
      speed: 2,
      abilities: [
        {
          name: 'Swift Feet (2)',
          desc: 'Gain an additional +2 speed as long as you are unarmored.',
        },
      ],
      statIncrease: inc('INT', 'WIL'),
    },
    10: {
      abilities: [
        {
          name: 'Unyielding Resolve (2)',
          desc: 'Ignore the first 2 Wounds you would suffer each encounter.',
        },
      ],
      choices: [martial(4, '4th')],
    },
    11: { abilities: [] },
    12: { abilities: [], statIncrease: inc('DEX', 'STR'), choices: [martial(5, '5th')] },
    13: {
      abilities: [{ name: 'Iron Defense (2)', desc: 'Your armor is doubled while unarmored.' }],
      statIncrease: inc('INT', 'WIL'),
    },
    14: { abilities: [], choices: [martial(6, '6th')] },
    15: { abilities: [] },
    16: { abilities: [], statIncrease: inc('DEX', 'STR'), choices: [martial(7, '7th')] },
    17: {
      abilities: [
        {
          name: 'Unyielding Resolve (3)',
          desc: 'Ignore the first 3 Wounds you would suffer each encounter. You have advantage on STR saves while Dying.',
        },
      ],
      statIncrease: inc('INT', 'WIL'),
    },
    18: { abilities: [], choices: [martial(8, '8th')] },
    19: { abilities: [], choices: [EPIC_BOON] },
    20: {
      abilities: [
        {
          name: 'Windborne',
          desc: '+1 additional Burst of Speed when you roll Initiative. Permanently gain 1 action (while Dying, you have a max of 2 actions).',
        },
      ],
      statIncrease: CAPSTONE_STATS,
    },
  },
  subclasses: [
    {
      slug: 'pain',
      name: 'Way of Pain',
      tagline: 'disciplined, pain returned',
      levels: {
        3: {
          abilities: [
            {
              name: 'Bring the Pain',
              desc: '(1/round) You may turn any melee attack against you into a crit. Whenever you are crit, reduce the damage by half. The attacker takes the same amount of damage you took (ignoring armor). You may suffer 1 Wound to double the damage the enemy takes.',
            },
          ],
        },
        7: {
          abilities: [
            {
              name: 'Share My Pain',
              desc: 'Your Swiftstrike can also target a 2nd creature within Reach 2.',
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'Pain Sharpens the Mind',
              desc: 'While you are Bloodied, gain advantage on the first attack you make each turn, and on all saves.',
            },
          ],
        },
        15: {
          abilities: [
            {
              name: 'Echoed Agony',
              desc: 'Your Swiftstrike can also target a 3rd creature within Reach 4.',
            },
          ],
        },
      },
    },
    {
      slug: 'flame',
      name: 'Way of Flame',
      tagline: 'explosive, burning soul',
      levels: {
        3: {
          abilities: [
            {
              name: 'Exploding Soul',
              desc: '(1/round) On your turn, you may suffer a Wound. Whenever you gain a Wound, deal STR+Wounds damage to any creatures you choose within 2 spaces (ignoring armor) and give them the Smoldering condition.',
            },
          ],
        },
        7: {
          abilities: [
            {
              name: 'Blazing Speed',
              desc: 'Gain +2 speed while using Windstep. After you cease moving with Windstep, enemies you passed through take STR+DEX fire damage. Smoldering enemies may take double, ending the condition.',
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'Chain Reaction',
              desc: '(1/turn) When you crit, deal fire damage equal to your STR+Wounds to creatures of your choice within 2 spaces of your target. Repeat any number of times, targeting creatures not yet damaged by this effect within 2 spaces of any already damaged.',
            },
          ],
        },
        15: { abilities: [{ name: 'Burning Soul', desc: 'Double any fire damage you deal.' }] },
      },
    },
  ],
}
