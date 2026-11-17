// Nimble Artificer 1.7 (pp. 1–13): class (pp. 3–4), Major Inventions (pp. 5–8),
// Gadgets (pp. 9–10), subclasses (pp. 11–12), FAQ (p. 13).
import type { AbilityPool, ClassDef, PoolOption } from '../types'
import { CAPSTONE_STATS, EPIC_BOON, inc, poolChoice } from './shared'

const eureka = (n: number) =>
  poolChoice('eureka', `Eureka! (${n}): choose 1 Invention or Gadget`, ['inventions', 'gadgets'])

/**
 * Upgrades for one invention or gadget. Options are prefixed with its name so the
 * same upgrade name on two items (Amplified Conduit, Reusable Parts) stays unique.
 */
function upgrades(item: string, options: [string, string][]): AbilityPool {
  return {
    id: `up-${item.toLowerCase().replace(/[^a-z]+/g, '-')}`,
    name: `${item} upgrades`,
    options: options.map(
      ([name, desc]): PoolOption => ({ name: `${item}: ${name}`, desc, requires: item }),
    ),
  }
}

/** Constant Tinkering options, one pool per invention or gadget. */
const UPGRADES: AbilityPool[] = [
  upgrades('Thunder Gauntlets', [
    ['Kinetic Redirect', '(1/round) Move the target any direction instead.'],
    ['Paired Resonators', 'Gain Dual Wielding.'],
    ['Extended Arc Coils', 'Gain Reach 6 instead.'],
  ]),
  upgrades('Manabolt Cannon', [
    ['Amplified Conduit', '+4 Range and +2 damage for each Mana Die.'],
    ['Selective Arc Filter', 'Damage can bypass 1 creature.'],
    ['Overload Dampener', '−3 repair DC. If you get a 20 or more, gain 1 action back.'],
  ]),
  upgrades('Manablade', [
    ['Stabilized Mana Core', 'Roll with advantage.'],
    ['Arc Module', '(1/round) Strike +1 target adjacent to the first.'],
    ['Streamlined Ignition', '−3 repair DC. If you get a 20 or more, gain 1 action back.'],
  ]),
  upgrades('Manaforged Plate', [
    [
      'Reactive Armor',
      'You may also knock an adjacent Medium or smaller creature back 1 space for each Mana Die rolled. If you spent 2 or more Mana Dice, you may knock them Prone also.',
    ],
    [
      'Ablative Coating',
      '(1/encounter) When a creature moves you against your will, move them the same distance in the opposite direction also (Large creatures are moved half as far).',
    ],
    ['Angled Deflectors', '(Passive) +2 Armor.'],
  ]),
  upgrades('Aethertuned Jerkin', [
    ['Autothrusters', 'If you spend 2 or more Mana Dice when you Defend, do so for free.'],
    ['Chronoshard Modulator', '(1/encounter) When crit, gain 1 action.'],
    ['Passive Sensors', '+INT to your Initiative.'],
  ]),
  upgrades('Stim Pack', [
    ['Long-Range Construct', '+4 Reach.'],
    ['Reduced Side Effects', '−4 save DC.'],
    ['Enhanced Stimulants', '2× heal; the target gains 1 Wound.'],
    ['Improved Dosing', '+1 use of Stim Pack/Safe Rest.'],
  ]),
  upgrades('Scrapbot Swarm', [
    ['Dense Swarm', '+2 constructs.'],
    ['Sharpened Scrap', 'Increment the damage dice.'],
    ['Hearty Scrap', '+1 use of Scrapbot Swarm/Safe Rest.'],
  ]),
  upgrades('Homing Missile', [
    ['Long-Range Thrusters', '+4 Range.'],
    ['Reliable Explosives', 'Roll with advantage.'],
    ['Reusable Parts', '+1 use of Homing Missile/Safe Rest.'],
  ]),
  upgrades('Safety Buddy', [
    ['Advanced Propulsion System', '+2 Reach.'],
    ['Explosive Framework', 'INT d6 damage to the attacker; they gain Smoldering.'],
    ['Reusable Parts', '+1 use of Safety Buddy/Safe Rest.'],
  ]),
  upgrades('Propulsive Boots', [
    ['Enhanced Fuel Reserves', '+1 use of Propulsive Boots/Safe Rest.'],
    ['Tuned Thrusters', '+INT speed when moving this way.'],
  ]),
  upgrades('Cheer Bot', [
    ['Invigorating Beacon', '+5 temp HP at the end of your turn.'],
    [
      'Self-Preservation Logic',
      'Attacks made against this construct are made with disadvantage 2.',
    ],
  ]),
  upgrades('Tethercoil', [
    ['Amplified Conduit', '+2 Range.'],
    ['Reinforced Tethers', '+1 Tethercoil save DC.'],
  ]),
]

const tinkering = (n: number) =>
  poolChoice(
    'tinkering',
    `Constant Tinkering (${n}): upgrade 1 Invention or Gadget`,
    UPGRADES.map((p) => p.id),
  )

export const artificer: ClassDef = {
  slug: 'artificer',
  name: 'Artificer',
  tagline: 'A tinkering genius who engineers the impossible, at a price.',
  description:
    'Some call you a mad tinkerer, a hazard to public safety; others speak in hushed awe of your sleek designs. Your genius is fueled by raw instinct and sharpened calculation, and Mana Dice power your inventions: the more you roll, the more they deliver, and the more likely they are to rebel.',
  highlights: [
    'Engineer the Impossible. Wield creations that defy reality, from mana-forged blades to gravity-snaring tethercoils.',
    'Power at a Price. Mana Dice fuel your creations, but push too far and your gear might malfunction.',
    'Tinker’s Instinct. Retool gadgets mid-battle and upgrade an invention every level.',
  ],
  complexity: 3,
  keyStats: ['INT', 'STR'],
  hitDie: 8,
  startingHp: 13,
  saveAdv: 'INT',
  saveDis: 'WIL',
  armor: 'Inventions',
  weapons: 'Inventions',
  startingGear: [
    { name: 'Thunder Gauntlets Prototype', qty: '1' },
    { name: 'Armor Prototype', qty: '1' },
    { name: 'Wrench', qty: '1' },
    { name: 'Notebook', qty: '1' },
  ],
  startingWeapons: ['Thunder Gauntlets Prototype'],
  armorCalc: { base: 0, addInt: true },
  resource: {
    name: 'Mana Accumulator',
    diceName: 'Mana',
    die: 4,
    kind: 'dice',
    ability: 'Mana Accumulator',
    stat: 'STR',
  },
  swapRule: {
    name: 'Reconfigure!',
    desc: 'You may choose different Artificer options whenever you tinker at your workshop during a Safe Rest.',
  },
  pools: [
    {
      id: 'inventions',
      name: 'Major Inventions',
      note: 'Whenever you create or upgrade an invention you can choose a reasonable damage type (check with your GM), and flavor it however you like. Mishaps: ALL dice rolled in the initial attack count (the weapon die and every Mana Die), not extra dice from a crit or other effect. The weapon die is the Primary Die (for the Manablade, the leftmost Mana Die). With advantage or disadvantage, roll 1 additional Primary Die and remove the lowest or highest as normal. Only 1 kind of armor can be worn at a time.',
      options: [
        {
          name: 'Manabolt Cannon',
          desc: 'Range 8, 2 actions, 1d12 damage (req. 1+ Mana Dice). Add INT to each Mana Die rolled and deal that much extra damage to your target and ALL creatures between you and it. Mishap: Arcane Overload. After the attack, suffer 2 damage per Mana Die rolled; the weapon becomes inoperable (DC 12 Finesse check to fix).',
        },
        {
          name: 'Manablade',
          desc: 'Reach 1 (req. 1+ Mana Dice). Deal damage equal to 2× (the sum of the Mana Dice rolled + STR). Treat Heavy armor as Medium, and Medium as unarmored. Mishap: Arcane Rebound. Afterwards, suffer damage equal to the sum rolled; the blade becomes inoperable (DC 12 Arcana check to fix).',
        },
        {
          name: 'Manaforged Plate',
          desc: 'Armor: 8+STR. Autoshields: (1/round) reduce the damage of an attack by INT for free. Mana Infusion: when you Defend, gain 2×STR armor per Mana Die spent. Mishap: Armor Lockup! Restrained (escape DC 10). Only 1 kind of armor can be worn at a time.',
        },
        {
          name: 'Aethertuned Jerkin',
          desc: 'Armor: 1+INT+DEX. Aetheric Thrusters: +1 Speed and +1 Initiative while wearing this armor. Tuned Thrusters: when you Defend, first move 1 space per Mana Die spent (if this puts you out of line of sight, Reach or Range, the attack misses). Mishap: Tumble! Land Prone within 2 spaces of your intended destination (chosen by the GM) instead. Only 1 kind of armor can be worn at a time.',
        },
      ],
    },
    {
      id: 'gadgets',
      name: 'Gadgets',
      note: 'Gadgets are consumable items that you can remake on a Safe Rest. Each upgrade can be chosen a max of 1 time.',
      options: [
        {
          name: 'Stim Pack',
          desc: '(2/Safe Rest) Reach 4. Send a construct to heal a target for INT d8 HP; they gain 1 action. At the end of their turn they must make a DC 16 STR save or become Dazed.',
        },
        {
          name: 'Scrapbot Swarm',
          desc: '(2/Safe Rest) Reach 4, 2 actions. Let loose INT+STR tiny constructs; each deals 1d6 damage to any target within Reach 4.',
        },
        {
          name: 'Homing Missile',
          desc: '(2/Safe Rest) Range 8. Fire off an explosive projectile that inerrantly strikes a target: 1d20 damage, ignoring cover; it does not miss on a 1.',
        },
        {
          name: 'Safety Buddy',
          desc: '(2/Safe Rest) When you use Interpose: summon a 1 HP single-use construct to Interpose for an ally within Reach 2 instead of you.',
        },
        {
          name: 'Propulsive Boots',
          desc: '(3/Safe Rest) Move for free and gain flying until the end of your turn.',
        },
      ],
    },
    ...UPGRADES,
  ],
  levels: {
    1: {
      abilities: [
        {
          name: 'Thunder Gauntlets Prototype',
          desc: '(Reach 4) 1d4+INT. You may roll 1 additional d4 for damage; if you do, for each 1 rolled, you are pushed back 1 space and knocked Prone.',
        },
        { name: 'Armor Prototype', desc: 'Armor: INT+DEX.' },
      ],
    },
    2: {
      abilities: [
        {
          name: 'Thunder Gauntlets',
          desc: 'Your prototype becomes Thunder Gauntlets: Reach 4, 1d6+INT damage. Deal extra damage equal to the sum of the Mana Dice rolled and push a Medium or smaller target 1 space for each Mana Die. The d6 is always the Primary Die (while your Mana Dice are d6s, the leftmost d6). Mishap: Recoil. You are also knocked back the same distance, landing Prone.',
        },
        {
          name: 'Mana Accumulator',
          desc: 'A device that absorbs ambient magic to power your inventions. It holds a max of STR Mana Dice (d4s) and fully recharges at the end of your turns. Powering Inventions: when using an invention, you may expend any amount of available Mana Dice. The more you use at a time, the greater the effect, and the greater the risk: if ANY die rolls a number less than or equal to the total number of dice, the invention overloads, triggering a mishap (e.g., spend 2 Mana Dice and any die rolling 2 or less is a mishap).',
        },
      ],
      replacesAbilities: ['Thunder Gauntlets Prototype'],
      swapAttack: { from: 'Thunder Gauntlets Prototype', to: 'Thunder Gauntlets' },
      choices: [eureka(1)],
    },
    3: {
      subclassChoice: true,
      abilities: [
        {
          name: 'I’ve Got JUST the Thing!',
          desc: '(1/Safe Rest) You pull a simple mechanical contraption out of your pack that is JUST the thing needed for the moment (where something like that could help): an iron wedge, a wrench, a lockpick, block & tackle, a tripwire… NOT an anti-gravity device.',
        },
      ],
      choices: [tinkering(1)],
    },
    4: { abilities: [], statIncrease: inc('INT', 'STR'), choices: [eureka(2), tinkering(2)] },
    5: {
      abilities: [{ name: 'Tuned Mana Condenser', desc: 'Your Mana Dice become d6s.' }],
      resourceDie: 6,
      statIncrease: inc('DEX', 'WIL'),
      choices: [tinkering(3)],
    },
    6: {
      abilities: [
        {
          name: 'Percussive Maintenance',
          desc: '(1/encounter) When you would experience a mishap, you may first increase 1 Mana Die by 1.',
        },
      ],
      choices: [eureka(3), tinkering(4)],
    },
    7: { abilities: [], choices: [tinkering(5)] },
    8: { abilities: [], statIncrease: inc('INT', 'STR'), choices: [eureka(4), tinkering(6)] },
    9: {
      abilities: [
        {
          name: 'Mana Recovery Valve',
          desc: 'After a mishap, gain advantage on your next Mana Die roll this encounter.',
        },
      ],
      statIncrease: inc('DEX', 'WIL'),
      choices: [tinkering(7)],
    },
    10: {
      abilities: [{ name: 'Tuned Mana Condenser (2)', desc: 'Your Mana Dice become d8s.' }],
      resourceDie: 8,
      choices: [tinkering(8)],
    },
    11: { abilities: [], choices: [tinkering(9)] },
    12: { abilities: [], statIncrease: inc('INT', 'STR'), choices: [eureka(5), tinkering(10)] },
    13: {
      abilities: [{ name: 'Optimized Mana Compression', desc: '+1 max Mana Die.' }],
      resourceBonus: 1,
      statIncrease: inc('DEX', 'WIL'),
      choices: [tinkering(11)],
    },
    14: {
      abilities: [{ name: 'Tuned Mana Condenser (3)', desc: 'Your Mana Dice become d10s.' }],
      resourceDie: 10,
      choices: [tinkering(12)],
    },
    15: { abilities: [], choices: [tinkering(13)] },
    16: { abilities: [], statIncrease: inc('INT', 'STR'), choices: [eureka(6), tinkering(14)] },
    17: { abilities: [], statIncrease: inc('DEX', 'WIL'), choices: [tinkering(15)] },
    18: {
      abilities: [{ name: 'Prime Configuration', desc: '+1 max Mana Die.' }],
      resourceBonus: 1,
      choices: [tinkering(16)],
    },
    19: { abilities: [], choices: [EPIC_BOON] },
    20: {
      abilities: [
        {
          name: 'Grand Mechanist',
          desc: '(1/encounter) You may reroll any Mana Dice, replacing them with d20s.',
        },
      ],
      statIncrease: CAPSTONE_STATS,
    },
  },
  subclasses: [
    {
      slug: 'gadgeteer',
      name: 'Gadgeteer',
      tagline: 'a gadget for every occasion',
      levels: {
        3: {
          abilities: [
            {
              name: 'Cheer Bot',
              desc: '(1/Safe Rest) Gadget. Action: place a stationary 1 HP construct adjacent to yourself. Friendly creatures within Reach 12 of it gain +1 action at the end of each of their turns (lasts until destroyed; it can be stored and reused if undamaged).',
            },
          ],
        },
        7: {
          abilities: [
            {
              name: 'Improvised Tinkering',
              desc: '(INT/Safe Rest) You can use any Gadget without using a charge (even if you have not invented it or have no more charges remaining).',
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'Always Be Prepared!',
              desc: '(1/encounter) You can use Improvised Tinkering without spending an action.',
            },
          ],
        },
        15: {
          abilities: [
            {
              name: 'Tinkermaster',
              desc: '+1 use/Safe Rest to all gadgets you have invented.',
            },
          ],
        },
      },
    },
    {
      slug: 'inventor',
      name: 'Inventor',
      tagline: 'bigger, better, more powerful inventions',
      levels: {
        3: {
          abilities: [
            {
              name: 'Tethercoil',
              desc: 'Invention. +4 Range for each Mana Die spent (min 1). Choose 1 mode. Tether (action): pull a creature your size or smaller next to you; you may Restrain them. OR you move to a larger creature and gain Riding. Mishap: Mistether! The GM may choose a different creature in Range. Coil (2 actions): Restrain all creatures fully in an area equal to the number of Mana Dice rolled (e.g., 2 dice: a 2×2 area). Mishap: Tangled! You are Restrained as well.',
            },
          ],
        },
        7: {
          abilities: [
            {
              name: 'Percussive Maintenance (2)',
              desc: 'Precision Tuned Smack: you can use Percussive Maintenance more often (L7: 3/encounter).',
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'Powerful Weaponry',
              desc: 'Whenever you use 2 or more Mana Dice, your Thunder Gauntlets push +1 space, your Manablade can hit +1 adjacent target, or your Manabolt Cannon can deal its damage half as far in a Cone instead.',
            },
          ],
        },
        15: {
          abilities: [
            {
              name: 'Big Brained Inventor',
              desc: '+1 max Mana Die. Your Mana Dice become d12s.',
            },
          ],
          resourceDie: 12,
          resourceBonus: 1,
        },
      },
    },
  ],
}
