// Nimble Heroes, Hunter (pp. 24–29) and the Beastmaster story subclass (pp. 80–81).
import type { ClassDef } from '../types'
import { CAPSTONE_STATS, EPIC_BOON, inc, poolChoice } from './shared'

const thrill = (n: number, ordinal: string) =>
  poolChoice(
    'thrill-of-the-hunt',
    `Thrill of the Hunt (${n}): choose a ${ordinal} Thrill of the Hunt ability`,
    ['thrill-of-the-hunt'],
  )

export const hunter: ClassDef = {
  slug: 'hunter',
  name: 'Hunter',
  tagline: 'Resourceful survivalist, bowmaster, and skilled tracker.',
  description:
    'Respect the forest and her children, and she will bestow upon you many gifts. Hunters mark their prey and harness the Thrill of the Hunt, but no true Hunter takes without recognizing what they have first been given.',
  highlights: [
    'Relentless Tracker: mark your prey and become a shadow in pursuit.',
    'Master of the Wild: set decoys, spring traps, and strike with lethal efficiency.',
    'Deadly from afar or up close: your prey won’t escape your reach.',
  ],
  complexity: 2,
  keyStats: ['DEX', 'WIL'],
  hitDie: 8,
  startingHp: 13,
  saveAdv: 'DEX',
  saveDis: 'INT',
  armor: 'Leather Armor',
  weapons: 'DEX Weapons',
  startingGear: [
    { name: 'Shortbow', qty: '1' },
    { name: 'Cheap Hides', qty: '1' },
    { name: 'Dagger', qty: '1' },
    { name: 'Hunting Trap', qty: '1' },
  ],
  startingWeapons: ['Shortbow', 'Dagger'],
  armorCalc: { base: 3 },
  swapRule: {
    name: 'Remember the Wild',
    desc: 'Whenever you spend a day in the wilderness during a Safe Rest, you may choose different Hunter options available to you.',
  },
  pools: [
    {
      id: 'thrill-of-the-hunt',
      name: 'Thrill of the Hunt',
      note: 'Unless noted otherwise, each Thrill of the Hunt ability costs 1 charge and cannot miss. Abilities that spend charges cannot generate new ones. Unused charges are lost when combat ends.',
      options: [
        {
          name: 'Addling Arrow',
          desc: 'Action: Attack with a ranged weapon. The next attack the target makes must be against the closest other creature, chosen at random.',
        },
        {
          name: 'Come Get Some!',
          desc: 'Action: Attack a target. It is Taunted by you until the end of their next turn.',
        },
        {
          name: 'Decoy',
          desc: 'When you Defend: the attack misses instead, and you can move up to half your speed away (where you really were all along!).',
        },
        { name: 'Fleet Feet', desc: 'Move up to your speed for free, ignoring difficult terrain.' },
        {
          name: 'Grease Trap',
          desc: '(1/encounter) Reaction (when an enemy moves adjacent to you or an ally within 6 spaces): Target falls Prone, is vulnerable to the next fire damage it takes, and is treated as if it is Smoldering.',
        },
        {
          name: 'Hail of Arrows',
          desc: '(Half range) 2 actions: Shoot all creatures within a 3×3 area. Their speed is halved until the end of their next turn.',
        },
        {
          name: 'Heavy Shot',
          desc: '(Half range) Action: Attack with a ranged weapon and push your target: 4 spaces for a small creature, 2 for a medium creature, 1 for a large creature.',
        },
        {
          name: 'Incendiary Shot',
          desc: '(Half range) Action: Attack with a ranged weapon, add WIL d8 fire damage.',
        },
        {
          name: 'Multishot',
          desc: '(Half range) Action: Attack your quarry with a ranged weapon and load an extra projectile. Select a 2nd target within 2 spaces of them to take the same amount of damage.',
        },
        {
          name: 'Pinning Shot',
          desc: 'Spend 3 actions shooting your quarry. They are Restrained until they can escape (DC 10+WIL).',
        },
        {
          name: 'Sharpshooter',
          desc: 'Action: If you have not moved this turn and your quarry is 4 or more spaces away, attack them for double damage.',
        },
        {
          name: 'Snare Trap',
          desc: '(1/encounter) Reaction (when an enemy moves adjacent to you or an ally within 6 spaces): Move them back 1 space; they are Restrained until they can escape (DC 10+WIL).',
        },
        {
          name: 'Vital Shot',
          desc: '(Half range) Action: Attack your Hampered quarry with a ranged weapon, ignoring their armor or doubling your Hunter’s Mark damage bonus if they have none.',
        },
        {
          name: 'Wild Instinct',
          desc: '(1/round, costs 0 TotH charges if you have none.) Assess for free, with advantage.',
        },
      ],
    },
    {
      id: 'beast-companion',
      name: 'Animal Companion',
      note: 'Your companion’s HP and movement are abstracted; it knows where it is most needed and is never put in mortal danger. Its attacks count as your own for gaining Thrill of the Hunt charges.',
      options: [
        {
          name: 'Small Companion',
          desc: 'Cat, Bat, Hawk, Raccoon, Rooster, Ferret… Keen Eyes: (1/encounter) Mark a target for free (L7: 2/encounter, L11: 3/encounter). Protect Me!: (1/encounter) Whenever you Defend, your companion distracts the attacker, causing the attack to miss, and you move up to half your speed away (L7: 2/encounter). Go for the Throat!: (1/encounter) Costs 1 TotH charge: your companion attacks your quarry for 1d4+LVL damage for free, ignoring armor (L11: 2/encounter, 1/round; L15: 3/encounter, 1/round).',
        },
        {
          name: 'Medium Companion',
          desc: 'Wolf, Boar, Panther, Vulture, Giant Spider… (Req. level 3) Ferocious: whenever you or your companion crit your quarry, your companion attacks again for LVL damage (ignoring armor) and you can move up to 2 spaces for free (L7: 4 spaces, L15: 6 spaces). Protect Me!: when you Defend, your companion may first attack that creature for 1d4+LVL damage. Go for the Throat!: (1/encounter) Costs 1 TotH charge, action: your companion attacks your quarry for 1d8+(3×LVL) damage, ignoring armor (L11: 2/encounter).',
        },
        {
          name: 'Large Companion',
          desc: 'Lion, Owlbear, Elk, Giant Scorpion, Drake… (Req. level 3) Alpha Protector: damage from the first attack against you each round is halved. Protect Me!: (1/encounter) after you gain a Wound, your companion can whisk you away up to 12 spaces (L7: before gaining the Wound; L15: 2/encounter). Go for the Throat!: (1/encounter) Costs 2 TotH charges, 2 actions: your companion attacks your quarry for 1d12+(4×LVL) damage, ignoring armor; if it dies, deal half as much to another creature within Reach 4 (L11: 2/encounter).',
        },
      ],
    },
  ],
  levels: {
    1: {
      abilities: [
        {
          name: 'Hunter’s Mark',
          desc: 'Action: A creature you can see is marked as your quarry for 1 day (or until you mark another creature). It can’t be hidden from you, and your attacks against it gain your choice of advantage OR +LVL damage (choose before each attack).',
        },
        {
          name: 'Forager',
          desc: 'Gain advantage on skill checks to find food and water in the wild.',
        },
      ],
    },
    2: {
      abilities: [
        {
          name: 'Thrill of the Hunt',
          desc: 'Gain a charge to use your Thrill of the Hunt abilities during an encounter whenever: your quarry dies, or you hit your quarry in melee or crit your quarry at range.',
        },
        {
          name: 'Roll & Strike',
          desc: 'Action: If you have no Thrill of the Hunt charges, move up to your speed toward your quarry. If you end adjacent to them, make a melee attack against them for free.',
        },
      ],
      choices: [
        poolChoice(
          'thrill-of-the-hunt',
          'Thrill of the Hunt: choose 2 Thrill of the Hunt abilities',
          ['thrill-of-the-hunt'],
          2,
        ),
      ],
    },
    3: {
      subclassChoice: true,
      abilities: [
        {
          name: 'Tracker’s Intuition',
          desc: 'You can discern the events of a past encounter by studying tracks and other subtle clues, accurately determining the kind and amount of creatures, their direction, key actions, and passage of time.',
        },
      ],
    },
    4: {
      abilities: [{ name: 'Explorer of the Wilds', desc: '+2 speed; gain a climbing speed.' }],
      speed: 2,
      statIncrease: inc('DEX', 'WIL'),
      choices: [thrill(2, '3rd')],
    },
    5: {
      abilities: [
        {
          name: 'Hunter’s Resolve',
          desc: 'Whenever you have no Thrill of the Hunt charges, gain Hunter’s Resolve until the end of your turn: treat all creatures as your quarry for the purposes of movement and melee attacks.',
        },
        {
          name: 'Final Takedown',
          desc: 'Action: Spend 1 Thrill of the Hunt charge to make a melee attack against your Bloodied quarry. Turn it into a crit and double the damage of your Hunter’s Mark. If they survive, they crit you back.',
        },
      ],
      statIncrease: inc('STR', 'INT'),
    },
    6: {
      abilities: [
        {
          name: 'Versatile Bowmaster',
          desc: 'Whenever you attack with a Longbow, you may roll 2d4 instead of 1d8; or with a Crossbow, 2d8 instead of 4d4.',
        },
      ],
      choices: [thrill(3, '4th')],
    },
    7: { abilities: [] },
    8: { abilities: [], statIncrease: inc('DEX', 'WIL'), choices: [thrill(4, '5th')] },
    9: {
      abilities: [
        {
          name: 'No Escape',
          desc: 'Whenever you see one or more allies make an opportunity attack, you may also make a ranged opportunity attack against the same target.',
        },
      ],
      statIncrease: inc('STR', 'INT'),
    },
    10: {
      abilities: [
        {
          name: 'Veteran Stalker',
          desc: 'Gain a Thrill of the Hunt charge whenever you are first Bloodied in an encounter and for every Wound you gain.',
        },
        { name: 'Keen Eye, Steady Hand', desc: 'Add WIL to your ranged weapon damage.' },
      ],
    },
    11: { abilities: [] },
    12: { abilities: [], statIncrease: inc('DEX', 'WIL'), choices: [thrill(5, '6th')] },
    13: {
      abilities: [{ name: 'Keen Sight', desc: 'Advantage on Perception checks.' }],
      statIncrease: inc('STR', 'INT'),
    },
    14: { abilities: [], choices: [thrill(6, '7th')] },
    15: { abilities: [] },
    16: { abilities: [], statIncrease: inc('DEX', 'WIL') },
    17: {
      abilities: [
        { name: 'Peerless Hunter', desc: 'You can Defend against your quarry for free.' },
      ],
      statIncrease: inc('STR', 'INT'),
    },
    18: {
      abilities: [
        {
          name: 'Wild Endurance',
          desc: 'Gain 1 Thrill of the Hunt charge at the start of your turns.',
        },
      ],
    },
    19: { abilities: [], choices: [EPIC_BOON] },
    20: {
      abilities: [
        {
          name: 'Nemesis',
          desc: 'Your Hunter’s Mark can target any number of creatures simultaneously.',
        },
      ],
      statIncrease: CAPSTONE_STATS,
    },
  },
  subclasses: [
    {
      slug: 'shadowpath',
      name: 'Keeper of the Shadowpath',
      tagline: 'unshakable, strikes from hiding',
      levels: {
        3: {
          abilities: [
            {
              name: 'Ambusher',
              desc: 'When you roll Initiative, you may use Hunter’s Mark for free. Gain advantage on the first attack you make each encounter.',
            },
            {
              name: 'Skilled Tracker',
              desc: 'You have advantage on skill checks to track creatures.',
            },
          ],
        },
        7: {
          abilities: [
            {
              name: 'Skilled Navigator',
              desc: 'You cannot become lost by nonmagical means.',
            },
            {
              name: 'Primal Predator',
              desc: '(1/encounter) Your weapon attacks ignore cover and armor this turn.',
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'Pack Hunter',
              desc: 'Whenever you mark a creature, you may also mark another creature within 6 spaces of them for free.',
            },
          ],
        },
        15: {
          abilities: [
            {
              name: 'Apex Predator',
              desc: 'You may use your Primal Predator ability twice each encounter. Gain 1 Thrill of the Hunt charge when you roll Initiative.',
            },
          ],
        },
      },
    },
    {
      slug: 'wild-heart',
      name: 'Keeper of the Wild Heart',
      tagline: 'resourceful survivalist',
      levels: {
        3: {
          abilities: [
            { name: 'Impressive Form', desc: '+5 max HP. Upgrade your Hit Dice to d10s.' },
            {
              name: 'I Have the High Ground',
              desc: 'When you roll Initiative or gain one or more Thrill of the Hunt charges, move up to half your speed for free, ignoring difficult terrain.',
            },
          ],
          hpBonus: 5,
          hitDie: 10,
        },
        7: {
          abilities: [
            {
              name: 'Resourceful Herbalist',
              desc: 'Whenever you Safe Rest near where plants or fungi can grow, you may spend a day collecting herbs to craft a number of Healing Salves equal to your WIL.',
            },
            {
              name: 'Healing Salve',
              desc: 'Action: Heal yourself or an adjacent creature WIL d6 HP. Only you or another experienced Herbalist may administer these, and they expire whenever you Safe Rest.',
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'Ha! I’m Over Here!',
              desc: '(1/Safe Rest) If an attack would cause you to drop to 0 HP, you instead move up to your speed away and take no damage.',
            },
          ],
        },
        15: {
          abilities: [
            {
              name: 'Unparalleled Survivalist',
              desc: 'Gain +WIL armor. When you attack with a ranged weapon, you may first move half your speed for free.',
            },
          ],
        },
      },
    },
    {
      slug: 'beastmaster',
      name: 'Beastmaster',
      tagline: 'together, unstoppable',
      story: true,
      intro: [
        {
          name: 'Beastmaster',
          desc: 'Choose a Small, Medium, or Large animal as your companion. Instead of your first 2 Thrill of the Hunt abilities, you can select Go for the Throat! and Protect Me! to use with your companion. At the GM’s discretion it can do anything the base animal can (fly, sniff out scents, be a mount); complex actions like Grapple or Help cost you 1 action to command.',
        },
      ],
      introChoices: [
        poolChoice('beast-companion', 'Choose your animal companion', ['beast-companion']),
      ],
      levels: {},
    },
  ],
}
