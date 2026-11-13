// Nimble GM's Guide 1.0: bestiary (pp. 31–40), legendary monsters (pp. 44–60)
// and the sample adventure's bosses (pp. 67, 71). Transcribed from the GM's Guide
// (Nimble © 2025 Nimble Co., referenced under the Nimble 3rd Party Creator License).
// Loot tables, sample encounters and flavour are left out. Art from the books is never used.
// Seeded into the shared NPC pool as official rows by `npm run seed:bestiary`.

import type { CreatureType, NpcKind, StatEntry } from '~/types'

export type BestiaryArmor = 'None' | 'Medium' | 'Heavy'
export type BestiarySection = 'bestiary' | 'legendary' | 'adventure'

export interface BestiaryMonster {
  /** Stable key for the seed's upsert: `nimble-gmg-<name>`. */
  slug: string
  name: string
  /** As printed: "1/4", "1/3", "1/2", "1" … (the Mummy Lord is 21). */
  level: string
  size?: string
  /** Creature type, mostly for legendary monsters ("Owlbear", "Floral Dragon"). */
  type?: string
  /** Broad type the NPC lists filter by. */
  creatureType: CreatureType
  kind: NpcKind
  armor: BestiaryArmor
  /** null = minion (no HP; follows the minion rules). */
  hp: number | null
  /** Only when printed (default speed is 6): "10", "Fly 12", "Burrow 8". */
  speed?: string
  /** Legendary save advantages, as printed: "STR+ INT–". */
  saves?: string
  traits?: StatEntry[]
  actions: StatEntry[]
  bloodied?: StatEntry[]
  lastStand?: StatEntry[]
  /** Printed page. */
  page: number
}

export interface BestiaryFamily {
  name: string
  section: BestiarySection
  page: number
  /** Traits every member of the family has (Kobold "Nooooo!", Bandit "Parry"). */
  traits: StatEntry[]
  monsters: BestiaryMonster[]
}

const e = (n: string, t: string): StatEntry => ({ n, t })
const slug = (name: string) =>
  `nimble-gmg-${name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`

type MonsterInput = Omit<BestiaryMonster, 'slug' | 'kind' | 'armor' | 'page'> &
  Partial<Pick<BestiaryMonster, 'slug' | 'kind' | 'armor' | 'page'>>

function family(
  name: string,
  section: BestiarySection,
  page: number,
  traits: StatEntry[],
  monsters: MonsterInput[],
  defaults: { kind?: NpcKind } = {},
): BestiaryFamily {
  return {
    name,
    section,
    page,
    traits,
    monsters: monsters.map((m) => ({
      ...m,
      slug: m.slug ?? slug(m.name),
      kind: m.kind ?? defaults.kind ?? 'monster',
      armor: m.armor ?? 'None',
      page: m.page ?? page,
    })),
  }
}

const MINION = e('Minion', 'Follows the minion rules.')

// ---------------------------------------------------------------------------
// Bestiary
// ---------------------------------------------------------------------------

// Nimble GM's Guide, Kobolds (p. 31).
const KOBOLDS = family(
  'Kobolds',
  'bestiary',
  31,
  [e('Nooooo!', 'When an ally within 2 spaces dies, attack once for free.')],
  [
    {
      name: 'Kobold Minion',
      creatureType: 'Humanoid',
      level: '1/4',
      size: 'Small',
      hp: null,
      traits: [MINION],
      actions: [e('Stab', '1d4 (follows minion rules).')],
    },
    {
      name: 'Kobold',
      creatureType: 'Humanoid',
      level: '1/3',
      size: 'Small',
      hp: 12,
      actions: [e('Stab', '1d4+2 (or Sling, Range 8).')],
    },
    {
      name: 'Kobold Sneak',
      creatureType: 'Humanoid',
      level: '1/2',
      size: 'Small',
      hp: 15,
      traits: [
        e('Revenge!', 'When an ally dies, you may move up to 6 spaces before using Nooooo!'),
      ],
      actions: [e('Stab', '1d4+2 (or Sling, Range 8).')],
    },
    {
      name: 'Kobold Clanger',
      creatureType: 'Humanoid',
      level: '1',
      armor: 'Heavy',
      hp: 16,
      traits: [
        e('CLANG!', 'Allies who hear your clanging roll 1 additional die whenever they attack.'),
      ],
      actions: [],
    },
    {
      name: 'Kobold Trapper',
      creatureType: 'Humanoid',
      level: '1',
      size: 'Small',
      hp: 26,
      traits: [
        e(
          'Trap!',
          'When an enemy moves adjacent to you or an ally, they trigger one of your traps (1/encounter each): BEEES! 5d4 damage (doesn’t miss), half as much to ALL adjacent creatures. HIDDEN NET! Restrained (escape DC 10).',
        ),
      ],
      actions: [e('Throw Scorpion (2×)', '(Range 8) 1d4+2.')],
    },
    {
      name: 'Kobold Denwarden',
      creatureType: 'Humanoid',
      level: '1',
      armor: 'Medium',
      hp: 20,
      traits: [e('Hold!', 'Adjacent allies gain Medium Armor.')],
      actions: [e('Stab (2×)', '1d4+2 (or Sling, Range 8).')],
    },
  ],
)

// Nimble GM's Guide, Goblins (p. 33).
const GOBLINS = family(
  'Goblins',
  'bestiary',
  33,
  [e('Haha, Missed Me!', 'Whenever an attack misses you, deal 1 psychic damage in return.')],
  [
    {
      name: 'Goblin Minion',
      creatureType: 'Humanoid',
      level: '1/4',
      size: 'Small',
      hp: null,
      traits: [MINION],
      actions: [e('Stab', '1d6 (follows minion rules).')],
    },
    {
      name: 'Goblin',
      creatureType: 'Humanoid',
      level: '1/3',
      size: 'Small',
      hp: 15,
      actions: [e('Stab', '1d6+2 (or Shoot, Range 8).')],
    },
    {
      name: 'Bugbear',
      creatureType: 'Humanoid',
      level: '2',
      armor: 'Medium',
      hp: 30,
      actions: [e('Cleave', '2d6+4. OR:'), e('Javelin', '1d6+2 (Range 8).')],
    },
    {
      name: 'Goblin Taskmaster',
      creatureType: 'Humanoid',
      level: '2',
      size: 'Small',
      armor: 'Medium',
      hp: 30,
      traits: [e('Meat Shield', 'Can force other goblins to Interpose for him.')],
      actions: [
        e('Stab', '1d6+2 (or Shoot, Range 8). Then:'),
        e('Get in here!', 'Call a goblin minion to the fight.'),
      ],
    },
    {
      name: 'Goblin Ratrider',
      creatureType: 'Humanoid',
      level: '2',
      hp: 30,
      speed: '10',
      traits: [
        e(
          'CHAAARGE!',
          'If you move at least 4 spaces in a straight line, attack with advantage once.',
        ),
      ],
      actions: [e('Bite & Stab (2×)', '1d6+2. On crit: Prone.')],
    },
  ],
)

// Nimble GM's Guide, Bandits (p. 34).
const BANDITS = family(
  'Bandits',
  'bestiary',
  34,
  [e('Parry', 'Treat attacks against you that roll 2 as a miss.')],
  [
    {
      name: 'Bandit Minion',
      creatureType: 'Humanoid',
      level: '1/4',
      hp: null,
      traits: [MINION],
      actions: [e('Stab', '1d8 (follows minion rules).')],
    },
    {
      name: 'Bandit',
      creatureType: 'Humanoid',
      level: '1/3',
      hp: 12,
      actions: [e('Stab', '1d8+1 (or Shoot, Range 8).')],
    },
    {
      name: 'Bandit Bruiser',
      creatureType: 'Humanoid',
      level: '2',
      armor: 'Medium',
      hp: 24,
      actions: [e('Bash', '2d8+4.')],
    },
    {
      name: 'Bandit Captain',
      creatureType: 'Humanoid',
      level: '4',
      armor: 'Medium',
      hp: 36,
      actions: [e('Slice (3×)', '1d8+1 (or Shoot, Range 8).')],
    },
    {
      name: 'Bandit Hunter',
      creatureType: 'Humanoid',
      level: '1',
      hp: 22,
      actions: [e('Battlebow', '2d8+2 (Range 12).')],
    },
    {
      name: 'Bandit Assassin',
      creatureType: 'Humanoid',
      level: '2',
      hp: 24,
      traits: [e('Sneak', 'You are invisible until you attack.')],
      actions: [e('Poison Blade (2×)', '1d8+2. On damage: Dazed.')],
    },
    {
      name: 'Bandit Mage',
      creatureType: 'Humanoid',
      level: '4',
      hp: 41,
      traits: [e('Spark Step', 'When damaged, teleport up to 4 spaces.')],
      actions: [
        e(
          'Arc Lightning',
          '3d8 (Range 12). Also strikes the next closest creature. On miss: damage self instead.',
        ),
      ],
    },
  ],
  { kind: 'humanoid' },
)

// Nimble GM's Guide, Snakemen (p. 34).
const SNAKEMEN = family(
  'Snakemen',
  'bestiary',
  34,
  [e('Coiling Strike', 'On melee crit: Grapple (escape DC 10).')],
  [
    {
      name: 'Snakeman Minion',
      creatureType: 'Monstrosity',
      level: '1/4',
      hp: null,
      traits: [MINION],
      actions: [e('Strike', '1d6 melee/ranged (follows minion rules).')],
    },
    {
      name: 'Snakeman',
      creatureType: 'Monstrosity',
      level: '1',
      hp: 26,
      actions: [e('Slash', '1d6+6 (or Spit, Range 8).')],
    },
    {
      name: 'Cobra Captain',
      creatureType: 'Monstrosity',
      level: '4',
      armor: 'Medium',
      hp: 36,
      actions: [e('Slash (2×)', '1d6+6 (or Spit, Range 8).')],
    },
    {
      name: 'Giant Cobra',
      creatureType: 'Beast',
      level: '8',
      size: 'Large',
      armor: 'Medium',
      hp: 80,
      actions: [e('Crush', '2d6+20. Advantage vs. smaller creatures.')],
    },
  ],
)

const LATCHED_ON = e(
  'Latched On',
  'You move where your target moves until either dies. Your attacks can’t miss or be Defended/Interposed against. Attacks that miss you damage your target instead.',
)

// Nimble GM's Guide, Dungeon Denizens: Stirges (p. 35).
const STIRGES = family(
  'Stirges',
  'bestiary',
  35,
  [e('Evasive Flier', 'Attacks against stirges are made with disadvantage.'), LATCHED_ON],
  [
    {
      name: 'Stirge',
      creatureType: 'Beast',
      level: '1/2',
      size: 'Tiny',
      hp: 10,
      actions: [e('Latch On', '1d4+2. On hit: Latched On.')],
    },
    {
      name: 'Greater Stirge',
      creatureType: 'Beast',
      level: '6',
      size: 'Small',
      hp: 60,
      actions: [e('Latch On', '1d12+10. On hit: Latched On.')],
    },
  ],
)

// Nimble GM's Guide, Dungeon Denizens: Mimics (p. 35).
const MIMICS = family(
  'Mimics',
  'bestiary',
  35,
  [
    e('Ambusher', 'Mimics always start first and heroes roll Initiative with disadvantage.'),
    e(
      'Sticky',
      'Mimic hits also Grapple and can Grapple any number of creatures. When crit: release 1 creature (attacker’s choice).',
    ),
  ],
  [
    {
      name: 'Tiny Mimic',
      creatureType: 'Monstrosity',
      level: '1',
      hp: 28,
      traits: [e('Disguise', 'Cup, shoe, apple, candlestick, potion, pebble.')],
      actions: [e('Pseudopod', '1d4 (escape DC 9). OR:'), e('Bite', '(A Grappled creature) 1d12.')],
    },
    {
      name: 'Small Mimic',
      creatureType: 'Monstrosity',
      level: '2',
      hp: 41,
      traits: [e('Disguise', 'Backpack, shield/weapon, chair, crate, tree stump.')],
      actions: [
        e('Pseudopod', '1d6 (escape DC 11). OR:'),
        e('Bite', '(A Grappled creature) 1d20.'),
      ],
    },
    {
      name: 'Medium Mimic',
      creatureType: 'Monstrosity',
      level: '6',
      hp: 79,
      traits: [e('Disguise', 'Table, treasure chest, barrel, bookshelf, door, bed.')],
      actions: [
        e('Pseudopod', '1d8 (escape DC 13). OR:'),
        e('Bite', '(A Grappled creature) 2d20.'),
      ],
    },
  ],
)

// Nimble GM's Guide, Dungeon Denizens: Oozes (p. 35).
const OOZES = family(
  'Oozes',
  'bestiary',
  35,
  [
    e(
      'Digestive Touch',
      'Contact with an ooze inflicts the Digested condition: they deal an additional X damage for each time the target has been Digested this encounter.',
    ),
    e(
      'Goopy',
      'When crit or dealt any slashing damage: summon X ooze minions (size: d6); their attacks inflict Digested.',
    ),
  ],
  [
    {
      name: 'Gray Ooze',
      creatureType: 'Ooze',
      level: '1',
      hp: 28,
      actions: [e('Acidic Touch (2×)', '1d6+2.')],
    },
    {
      name: 'Ochre Jelly',
      creatureType: 'Ooze',
      level: '4',
      size: 'Large',
      hp: 52,
      actions: [e('Acidic Touch (2×)', '1d6+3.')],
    },
    {
      name: 'Black Pudding',
      creatureType: 'Ooze',
      level: '8',
      size: 'Large',
      hp: 90,
      actions: [e('Acidic Touch (2×)', '(Reach 2) 1d6+5.')],
    },
    {
      name: 'Elder Ooze',
      creatureType: 'Ooze',
      level: '12',
      size: 'Huge',
      hp: 150,
      actions: [e('Acidic Touch (3×)', '(Reach 3) 1d6+6.')],
    },
  ],
)

// Nimble GM's Guide, Hill & Field: Gnolls (p. 36).
const GNOLLS = family(
  'Gnolls',
  'bestiary',
  36,
  [e('Frenzy', 'Advantage against Bloodied creatures.')],
  [
    {
      name: 'Gnoll',
      creatureType: 'Humanoid',
      level: '1',
      hp: 28,
      actions: [e('Ravage (2×)', '1d10. OR:'), e('Shoot', '(Range 12) 1d10.')],
    },
    {
      name: 'Gnoll Packleader',
      creatureType: 'Humanoid',
      level: '4',
      armor: 'Medium',
      hp: 39,
      actions: [e('Bark Orders', '2 allies can move. Then:'), e('Ravage (3×)', '1d10.')],
    },
  ],
)

// Nimble GM's Guide, Hill & Field (p. 36).
const HILL_AND_FIELD = family(
  'Hill & Field',
  'bestiary',
  36,
  [],
  [
    {
      name: 'Worg',
      creatureType: 'Monstrosity',
      level: '1',
      size: 'Large',
      hp: 28,
      speed: '10',
      traits: [e('Savage', 'Always crits when attacking a Grappled creature.')],
      actions: [e('Rip Apart (2×)', '1d6+2. On hit: Grappled (escape DC 10).')],
    },
    {
      name: 'Hill Giant',
      creatureType: 'Giant',
      level: '12',
      size: 'Huge',
      hp: 140,
      speed: '8',
      traits: [e('Brute', 'On hit: Knockback Primary Die spaces.')],
      actions: [e('Smash (2×)', '(Reach 2) 1d6+15. OR:'), e('Boulder!', '(Range 12) 1d6+20.')],
    },
    {
      name: 'Bulette',
      creatureType: 'Monstrosity',
      level: '10',
      size: 'Large',
      armor: 'Heavy',
      hp: 74,
      speed: 'Burrow',
      traits: [
        e(
          'Burst Forth!',
          'Combat with a Bulette starts with the heaviest character making a DC 14 DEX save or they are Grappled (escape DC 14) and take 1d12+20 damage (half on save).',
        ),
      ],
      actions: [
        e('Drag Below', '(A Grappled creature) 2d12, then drag below and burrow away. OR:'),
        e('Leap & Bite', '(If not grappling) Leap 6, and attack for 1d12+20. On hit: Grappled.'),
      ],
    },
    {
      name: 'Troll',
      creatureType: 'Giant',
      level: '10',
      size: 'Large',
      armor: 'Medium',
      hp: 100,
      speed: '8',
      traits: [
        e(
          'Regenerate',
          'Does not die at 0 HP. Only fire, radiant, or a crit while at 0 HP can kill it.',
        ),
      ],
      actions: [
        e('Choose twice', 'Claws or Bite.'),
        e('Claws', '(Reach 2) 1d4+10. On crit: Prone.'),
        e('Bite', '(A Prone creature) 1d4+20.'),
      ],
    },
    {
      name: 'Blue Drake',
      creatureType: 'Dragon',
      level: '2',
      hp: 34,
      speed: 'Fly 12',
      traits: [e('On Death', 'Deal 1d12 damage back (ignores metal armor).')],
      actions: [e('Shocking Bite', '1d12+5 (ignores metal armor).')],
    },
    {
      name: 'Griffon',
      creatureType: 'Monstrosity',
      level: '4',
      size: 'Large',
      hp: 50,
      speed: 'Fly 12',
      actions: [
        e('Talons', '2d6+10. On hit: Grappled (escape DC 14). OR:'),
        e('Fly & Drop', '(If grappling) Fly upward 12 and release (6d6 fall damage).'),
      ],
    },
    {
      name: 'Roc',
      creatureType: 'Monstrosity',
      level: '17',
      size: 'Gargantuan',
      armor: 'Medium',
      hp: 195,
      speed: 'Fly 20',
      actions: [
        e('Pluck Up', '(Reach 4, up to 2 creatures) 3d12+20. On hit: Grappled (escape DC 18). OR:'),
        e(
          'Crush & Drop',
          'Fly upward 20 spaces, deal 20 damage to Grappled creatures, then release (10d6 fall damage).',
        ),
      ],
    },
  ],
)

// Nimble GM's Guide, Undead (p. 37).
const UNDEAD = family(
  'Undead',
  'bestiary',
  37,
  [e('Unliving, Undying', 'The first time this dies, reset to 1 HP instead (excluding minions).')],
  [
    {
      name: 'Skeleton',
      creatureType: 'Undead',
      level: '1/3',
      hp: 10,
      actions: [e('Grave Arrow', '1d4+3 (Range 8).')],
    },
    {
      name: 'Zombie',
      creatureType: 'Undead',
      level: '1/2',
      hp: 15,
      actions: [e('Crunch', '1d4+4. On damage: Grappled.')],
    },
    {
      name: 'Ghoul',
      creatureType: 'Undead',
      level: '1',
      hp: 20,
      actions: [e('Sickening Claw', '1d4+8. On damage: Dazed.')],
    },
    {
      name: 'Specter',
      creatureType: 'Undead',
      level: '3',
      hp: 30,
      speed: 'Fly',
      actions: [e('Deathly Touch', '1d4. On damage: set HP to 0.')],
    },
    {
      name: 'Ogre Zombie',
      creatureType: 'Undead',
      level: '5',
      size: 'Large',
      hp: 46,
      actions: [e('Greatclub (2×)', '1d4+8. On crit: Prone.')],
    },
    {
      name: 'Mummy',
      creatureType: 'Undead',
      level: '6',
      hp: 54,
      actions: [e('Slam (2×)', '1d4+8. On damage: Dazed.')],
    },
    {
      name: 'Giant Zombie',
      creatureType: 'Undead',
      level: '8',
      size: 'Huge',
      hp: 73,
      actions: [e('Decaying Swipe (2×)', '1d4+10. On damage: knockback Primary Die spaces.')],
    },
    {
      name: 'Wraith',
      creatureType: 'Undead',
      level: '10',
      hp: 94,
      speed: 'Fly',
      actions: [e('Soul Rend (2×)', '(Range 8) 1d4+10. On damage: deal 1 Wound.')],
    },
    {
      name: 'Mummy Lord',
      creatureType: 'Undead',
      level: '21',
      hp: 280,
      traits: [e('Cursed Gaze', 'When crit: DC 20 INT save, or suffer 1 Wound.')],
      actions: [
        e('Scarab Swarm', 'Summon 10 scarab minions (d6) within 6 spaces. Then:'),
        e('Slam (2×)', '1d4+20. On damage: Dazed.'),
      ],
    },
  ],
)

// Nimble GM's Guide, Forest Denizens (p. 38).
const FOREST = family(
  'Forest Denizens',
  'bestiary',
  38,
  [],
  [
    {
      name: 'Duskprowler',
      creatureType: 'Monstrosity',
      level: '6',
      size: 'Large',
      hp: 70,
      traits: [
        e(
          'Illusory Aura',
          'Attacks against the Duskprowler have Disadvantage 2. Damage suppresses this effect until the end of the next hero’s turn.',
        ),
      ],
      actions: [e('Ravage (2×)', '2d8+2.')],
    },
    {
      name: 'Basilisk',
      creatureType: 'Monstrosity',
      level: '7',
      armor: 'Heavy',
      hp: 48,
      traits: [
        e(
          'Flesh to Stone',
          'Creatures Dazed by the Basilisk remain so for 10 minutes. Dazed 3 times = Petrified.',
        ),
      ],
      actions: [
        e('Stone Gaze', 'Daze 1 creature within sight, then:'),
        e('Envenom', '1d8+10, advantage vs. Dazed targets.'),
      ],
    },
    {
      name: 'Druid',
      creatureType: 'Humanoid',
      level: '8',
      kind: 'humanoid',
      hp: 90,
      actions: [
        e('Beastshift', '+4 speed, gain Medium armor this round. 4d4+10. OR:'),
        e(
          'Hurricane',
          '(Reach 3) 4d4+10 to all enemies within reach. On damage: move targets anywhere else in Reach.',
        ),
      ],
    },
  ],
)

// Nimble GM's Guide, Forest Denizens: Briarbanes (p. 38).
const BRIARBANES = family(
  'Briarbanes',
  'bestiary',
  38,
  [e('Peeling Bark', 'Damage degrades Armor 1 step: Heavy » Medium » None.')],
  [
    {
      name: 'Seedling',
      creatureType: 'Plant',
      level: '1/2',
      size: 'Small',
      armor: 'Heavy',
      hp: 8,
      actions: [e('Thorn Seed', '(Range 6) 2d6+2.')],
    },
    {
      name: 'Acidpod',
      creatureType: 'Plant',
      level: '1',
      size: 'Small',
      armor: 'Heavy',
      hp: 8,
      traits: [e('Caustic Eruption', 'On death: 4d6 acid damage to ALL adjacent creatures.')],
      actions: [e('Grab', 'DC 12 DEX save or Grappled.')],
    },
    {
      name: 'Tangler',
      creatureType: 'Plant',
      level: '2',
      armor: 'Heavy',
      hp: 20,
      actions: [
        e(
          'Tangle (2×)',
          '(Reach 6) 1d6+2. On hit: Grappled (escape DC 12, or any fire or slashing damage).',
        ),
      ],
    },
    {
      name: 'Rootbreaker',
      creatureType: 'Plant',
      level: '5',
      size: 'Large',
      armor: 'Heavy',
      hp: 50,
      actions: [e('Slam', '3d6+6. On crit: knockback 2.')],
    },
    {
      name: 'Treant',
      creatureType: 'Plant',
      level: '14',
      size: 'Huge',
      armor: 'Heavy',
      hp: 170,
      traits: [e('Enrage', 'Attack with advantage when unarmored.')],
      actions: [
        e('Choose twice', 'Slam or Stomp.'),
        e('Slam', '(Reach 3) 2d6+10. On damage: Prone.'),
        e('Stomp', '(Hampered target) 2d6+20.'),
      ],
    },
  ],
)

// Nimble GM's Guide, Cultists (p. 39).
const CULTISTS = family(
  'Cultists',
  'bestiary',
  39,
  [
    e(
      'Fanatical Zeal',
      'While not at max HP, make all rolls with advantage. Your crits also inflict Despair.',
    ),
    e('Despair', 'Disadvantage on the next attack you make this encounter.'),
  ],
  [
    {
      name: 'Cultist',
      creatureType: 'Humanoid',
      level: '1',
      hp: 28,
      actions: [
        e(
          'Oblation of Blood!',
          'If undamaged, attack self for 2 damage. Adjacent enemies are inflicted with Despair. OR:',
        ),
        e('Dreadful Blade', '1d6+6. OR:'),
        e('Blood Boil', '(Range 12, Bloodied creature) 3d6+6.'),
      ],
    },
    {
      name: 'Fanatic',
      creatureType: 'Humanoid',
      level: '3',
      hp: 41,
      actions: [
        e(
          'Oblation of Blood!',
          'If undamaged, attack self for 2 damage. Adjacent enemies are inflicted with Despair. OR:',
        ),
        e(
          'Whispers of Madness',
          'Contested STR check or Grappled (reroll to escape, or any radiant damage); if successful, deal 3d6+6 psychic damage (cannot be Defended or Interposed against).',
        ),
      ],
    },
    {
      name: 'Doomsayer',
      creatureType: 'Humanoid',
      level: '5',
      hp: 58,
      actions: [
        e(
          'Feverish Chant',
          '(Concentration) Reduce all damage done to allies who can hear you to 1. OR:',
        ),
        e('Ecstatic Ravings', '2d6 psychic damage to all enemies who can hear you.'),
      ],
    },
  ],
  { kind: 'humanoid' },
)

// Nimble GM's Guide, Horrors (p. 39).
const HORRORS = family(
  'Horrors',
  'bestiary',
  39,
  [],
  [
    {
      name: 'Stenchling',
      creatureType: 'Fiend',
      level: '1/2',
      size: 'Small',
      hp: 18,
      traits: [e('Putrid Cloud', 'On death: 2d6 poison damage to enemies within Reach 2.')],
      actions: [e('Bite', '2d6.')],
    },
    {
      name: 'Spiny Fiend',
      creatureType: 'Fiend',
      level: '4',
      hp: 49,
      traits: [e('Spines', 'Melee attackers take 3 damage.')],
      actions: [e('Claws (2×)', '1d6+6. OR:'), e('Shoot Spine', '(Range 12) 1d6+6.')],
    },
    {
      name: 'Glabrezu',
      creatureType: 'Fiend',
      level: '14',
      size: 'Large',
      armor: 'Heavy',
      hp: 110,
      actions: [
        e(
          'Doomclaw (2×)',
          '(Reach 2) 3d6+10. On damage: Grappled (escape DC 17). A creature Grappled by both claws must escape from each separately. OR:',
        ),
        e(
          'Tear Asunder',
          '(A creature Grappled by both claws) 50 unpreventable damage. If the target is at 0 HP: DC 17 STR save or be torn in two, dying instantly.',
        ),
      ],
    },
  ],
)

const RESTRAINED_WEB = '(escape DC 12, or any slashing/fire damage)'

// Nimble GM's Guide, Underground (p. 40).
const UNDERGROUND = family(
  'Underground',
  'bestiary',
  40,
  [],
  [
    {
      name: 'Giant Spider',
      creatureType: 'Beast',
      level: '2',
      armor: 'Medium',
      hp: 27,
      actions: [
        e('Shoot Web', `(Range 6) 1d8+2. On hit: Restrained ${RESTRAINED_WEB}. OR:`),
        e('Bite', '(Hampered target) 2d8+4, Poisoned (magical healing ends).'),
      ],
    },
    {
      name: 'Ettercap',
      creatureType: 'Monstrosity',
      level: '4',
      hp: 49,
      traits: [
        e(
          'Silenced',
          'Cannot cast spells or use other abilities that require speaking (e.g. Commander’s Orders).',
        ),
      ],
      actions: [
        e('Web Garrote', '1d8+2. On hit: Grappled (escape DC 13), Silenced until target escapes.'),
      ],
    },
    {
      name: 'Nestweaver',
      creatureType: 'Monstrosity',
      level: '6',
      size: 'Large',
      armor: 'Medium',
      hp: 54,
      actions: [
        e('Summon', 'Summon 2 spider minions (d8). Then choose 1:'),
        e('Shoot Web', `(Range 6) 1d8+2. On hit: Restrained ${RESTRAINED_WEB}. OR:`),
        e('Bite', '(Hampered target) 3d8+6 and Poisoned (magical healing ends).'),
      ],
    },
    {
      name: 'Great Worm',
      creatureType: 'Monstrosity',
      level: '16',
      size: 'Huge',
      armor: 'Heavy',
      hp: 140,
      speed: 'Burrow 8',
      traits: [
        e('Tremor Sight', 'Advantage against creatures that moved since the worm’s last turn.'),
        e(
          'Swallowed',
          'You take 20 damage at the start of your turn. Your attacks cannot miss and ignore armor.',
        ),
      ],
      actions: [
        e(
          'Crush',
          'Creatures in a 2×6 area take 50 damage on a failed DC 18 DEX save. (Creatures who fail can spend 1 Action to dive out of the way instead: they move half their speed and land Prone.) OR:',
        ),
        e('Bite/Swallow', '1d4+40. On crit: Swallowed.'),
      ],
    },
    {
      name: 'Cloaker',
      creatureType: 'Aberration',
      level: '13',
      size: 'Large',
      hp: 110,
      speed: 'Fly 10',
      traits: [
        e('Ambusher', 'Cloakers always start first and heroes roll Initiative with disadvantage.'),
        e(
          'Mutual Harm',
          'You take half damage from attacks while grappling a creature (they take the other half).',
        ),
      ],
      actions: [
        e('Wrap', '2d10+20. On hit: Grappled (escape DC 16). OR:'),
        e(
          'Horrifying Wail',
          'DC 16 WIL save, or creatures within 6 spaces are Frightened and must spend 1 Action moving as far away as possible.',
        ),
      ],
    },
    {
      name: 'Umber Hulk',
      creatureType: 'Monstrosity',
      level: '10',
      size: 'Large',
      armor: 'Heavy',
      hp: 70,
      traits: [
        e(
          'Confounding Pheromones',
          'Enemies make a DC 15 WIL save at the start of their turns or are Confused this turn. They gain advantage 1 on the save for each failure this encounter.',
        ),
        e('Confused', 'The GM spends your next action.'),
      ],
      actions: [e('Mandible & Claws (2×)', '1d10+10.')],
    },
  ],
)

// ---------------------------------------------------------------------------
// Legendary monsters: they act after EACH hero's turn (GM's Guide p. 42).
// ---------------------------------------------------------------------------

const AFTER_EACH = 'After each hero’s turn, choose one.'

// Nimble GM's Guide, Legendary Monster Builder examples (p. 44).
const LEGENDARY_EXAMPLES = family(
  'Legendary (builder examples)',
  'legendary',
  44,
  [],
  [
    {
      name: 'Pudge the Blunderer',
      creatureType: 'Giant',
      level: '2',
      type: 'Dumb Ogre',
      armor: 'Medium',
      hp: 75,
      saves: 'STR+ INT–',
      traits: [e('Actions', AFTER_EACH)],
      actions: [
        e('Move & Smack', 'Move 8, attack for 1d8+2. On damage: Prone.'),
        e(
          'Grab & Throw',
          '1d8+2. On damage: they are thrown at another hero within 6 spaces. Both make a DC 12 DEX save or take 1d8+2 damage and are knocked Prone, half damage on save.',
        ),
      ],
      bloodied: [e('At 37 HP', 'Pudge’s damage increases to 1d12+2.')],
      lastStand: [
        e(
          'Pudge is dying!',
          '20 more damage and he dies. Until then, Pudge can move 6 spaces and use Grab & Throw each turn.',
        ),
      ],
    },
    {
      name: 'Kelebek, Entomancer',
      creatureType: 'Humanoid',
      level: '3',
      type: 'Bug Druid',
      kind: 'humanoid',
      armor: 'Medium',
      hp: 60,
      saves: 'INT+ WIL+',
      traits: [
        e(
          'Kelebek & Poppy',
          'A legendary team with Poppy, Giant Stinkbug. After each hero’s turn, choose Kelebek OR Poppy to act.',
        ),
      ],
      actions: [
        e(
          'Vinelash',
          'Move 6, then 2d6. On damage: move target to an unoccupied space within 10 spaces.',
        ),
      ],
      bloodied: [e('At 30 HP', 'Poppy always Interposes for him.')],
      lastStand: [
        e(
          'When Poppy dies',
          'The room is filled with noxious gas: all heroes have a maximum of 2 actions each turn.',
        ),
      ],
    },
    {
      name: 'Poppy, Giant Stinkbug',
      creatureType: 'Beast',
      level: '3',
      type: 'Stinkbug',
      armor: 'Heavy',
      hp: 60,
      saves: 'STR+',
      traits: [
        e(
          'Kelebek & Poppy',
          'A legendary team with Kelebek, Entomancer. After each hero’s turn, choose Kelebek OR Poppy to act.',
        ),
        e(
          'Stink Cloud',
          'When damaged, enemies within 2 spaces make a STR save (DC equal to the higher of 10 or the damage done). On a failure, they must spend their next action vomiting, and they cannot take reactions this round.',
        ),
      ],
      actions: [e('Crushing Mandibles', 'Move 6. 4d6 damage, up to 2 adjacent creatures.')],
    },
  ],
)

// Nimble GM's Guide, Legendary Monsters (pp. 45–60).
const LEGENDARY = family(
  'Legendary Monsters',
  'legendary',
  45,
  [],
  [
    {
      name: 'Grimbeak, the Unyielding',
      creatureType: 'Monstrosity',
      level: '3',
      size: 'Large',
      type: 'Owlbear',
      armor: 'Medium',
      hp: 100,
      saves: 'STR+',
      page: 45,
      traits: [
        e('Brutal', 'Treat the highest die rolled as the Primary Die. On crit: knock Prone.'),
        e('Actions', AFTER_EACH),
      ],
      actions: [
        e(
          'Savage Screech',
          '(1 use) All enemies within Reach 12 suffer 2d6 damage (ignoring armor). DC 11 WIL save or become Frightened for 1 round.',
        ),
        e('Rend & Tear', 'Attack for 2d6+10 damage.'),
        e('Beak', 'Move 8. Attack for 2d6 damage.'),
      ],
      bloodied: [e('At 50 HP', 'Savage Screech recharges.')],
      lastStand: [
        e(
          'Grimbeak is dying!',
          '30 more damage and she dies. Until then, her attacks use d10s instead of d6s.',
        ),
      ],
    },
    {
      name: 'Thorn Quickblade',
      creatureType: 'Humanoid',
      level: '4',
      type: 'Human Criminal',
      kind: 'humanoid',
      armor: 'Medium',
      hp: 125,
      saves: 'DEX+',
      page: 46,
      traits: [
        e('Strike Back', 'When crit, make a Heart Piercer or Stormquill attack in return.'),
        e('Actions', AFTER_EACH),
      ],
      actions: [
        e('Stormquill (Crossbow)', 'Move 4, 4d4+10 damage (Range 8).'),
        e('Heart Piercer (Rapier)', 'Move 8, 2d4+3 damage. On crit: Dazed.'),
      ],
      bloodied: [
        e(
          'Smoke Bomb',
          'At 62 HP, Thorn immediately becomes invisible (until the end of his next turn), then moves 8, ignoring opportunity attacks.',
        ),
      ],
      lastStand: [
        e(
          'Mortal Panic!',
          'Thorn is dying! 30 more damage and he’s dead. Until then he’ll Strike Back EVERY time he’s hit (1/turn).',
        ),
      ],
    },
    {
      name: 'Ravager of the Lowlands',
      creatureType: 'Monstrosity',
      level: '5',
      size: 'Large',
      type: 'Manticore',
      armor: 'Medium',
      hp: 130,
      saves: 'STR+ DEX+',
      page: 47,
      traits: [
        e('Feral Instinct', 'Whenever Ravager is crit, he can fly 10.'),
        e('Actions', AFTER_EACH),
      ],
      actions: [
        e('Venomous Stinger', '(1 use) Reach 3, 5d12 damage.'),
        e('Ravage', 'Attack for 1d12+20 damage.'),
        e('Claw', 'Fly 10, attack for 1d12+6 damage.'),
      ],
      bloodied: [e('At 65 HP', 'His Venomous Stinger recharges.')],
      lastStand: [
        e(
          'The Ravager is dying!',
          '40 more damage and he dies. Until then, the first time each turn he takes damage, he uses Move & Claw.',
        ),
      ],
    },
    {
      name: 'Queen Aranya, Broodmother',
      creatureType: 'Monstrosity',
      level: '6',
      size: 'Large',
      type: 'Matriarch of Spiders',
      armor: 'Medium',
      hp: 160,
      saves: 'ALL+',
      page: 48,
      traits: [
        e('Weave Web', 'Creatures she hits are entangled in a sticky web (Dazed).'),
        e('Flammable Webs', 'Fire critical hits suppress Weave Web for 1 turn.'),
        e('Actions', AFTER_EACH),
      ],
      actions: [
        e('Impale', '(Reach 2) 2d8+8 damage. Then skitter away up to 8 spaces.'),
        e(
          'Hatch Brood',
          'Summon spiderling minions (1/hero, size: d8); they act only when commanded.',
        ),
        e(
          'Dinner Time!',
          'Command all of your spiderling minions to move up to 6 spaces and attack once each.',
        ),
      ],
      bloodied: [
        e(
          '"Avenge Your Queen, My Brood!"',
          'At 80 HP, summon 3 spiderling minions/hero anywhere within Reach 8.',
        ),
      ],
      lastStand: [
        e(
          'Aranya is dying!',
          '40 more damage and she dies. Until then, Hatch Brood after each of her turns.',
        ),
      ],
    },
    {
      name: 'Nalzar, Apex Predator',
      creatureType: 'Dragon',
      level: '6',
      size: 'Large',
      type: 'Grey Drake',
      armor: 'Medium',
      hp: 180,
      saves: 'STR+ DEX+',
      page: 49,
      traits: [
        e(
          'Tail Swipe',
          'When dealt slashing or lightning damage: knock a hero within 3 spaces Prone.',
        ),
        e('Torn Wings', 'Each slashing crit reduces the Wing Buffet DC by 1.'),
        e('Actions', AFTER_EACH),
      ],
      actions: [
        e('Devour', '(Prone creatures only, Reach 2) 4d12+6.'),
        e(
          'Wing Buffet',
          'Fly 8, then land. Cone 8: 1d12, then DC 14 STR save or also knocked Prone (advantage if behind cover or another hero).',
        ),
      ],
      bloodied: [e('At 90 HP', 'Her Wing Buffet range and DC increase by 2.')],
      lastStand: [
        e(
          'Nalzar is dying!',
          '60 more damage and she dies. Until then, each turn, she moves 6, then uses Devour (ignoring the Prone requirement).',
        ),
      ],
    },
    {
      name: 'Florindris, Bane of the Forest',
      creatureType: 'Dragon',
      level: '7',
      size: 'Large',
      type: 'Floral Dragon',
      armor: 'Medium',
      hp: 200,
      saves: 'ALL+',
      page: 50,
      traits: [
        e(
          'Aura of Wind',
          'Ranged attacks against you have disadvantage. End of turn: push adjacent creatures 2 spaces away.',
        ),
        e('Wither', 'Resistant to necrotic damage, but it suppresses Aura of Wind for 1 turn.'),
        e(
          'Thornblight',
          'Suffer 5 damage for each space you are forcibly moved. Magical healing ends this effect.',
        ),
        e('Actions', AFTER_EACH),
      ],
      actions: [
        e(
          'Petal Storm',
          '(1 use) 3d10+10 damage to all enemies within Reach 8, half on a DC 13 DEX save.',
        ),
        e(
          'Rend',
          'Fly 10 before or after attacking. (Reach 2) 1d10+10 damage to up to 2 targets within reach. On hit: gain Thornblight.',
        ),
        e('Gust', '(Reach 8) Move a target 1d10 spaces.'),
      ],
      bloodied: [
        e('At 100 HP', 'Enemies within Reach 12 gain Thornblight, and Petal Storm recharges.'),
      ],
      lastStand: [
        e(
          'Florindris is dying!',
          '70 more damage and she dies. Until then, Aura of Wind and Gust move creatures twice as far.',
        ),
      ],
    },
    {
      name: 'General Flameheart',
      creatureType: 'Giant',
      level: '8',
      size: 'Huge',
      type: 'Flame Titan',
      armor: 'Heavy',
      hp: 175,
      saves: 'STR+ WIL+',
      page: 51,
      traits: [
        e(
          'Cinder Armor',
          'Immune to fire. When damaged, deal 5 fire damage to all adjacent creatures.',
        ),
        e(
          'Extinguish Flame',
          'Cold or radiant crits extinguish all areas ignited by Molten Fury and suppress Cinder Armor for 1 turn.',
        ),
        e('Actions', AFTER_EACH),
      ],
      actions: [
        e('Inferno Cleave', 'Move 8, then strike a 2×2 square area for 2d10+10 fire damage.'),
        e(
          'Molten Fury',
          'Lob a molten fireball at the furthest hero not already in the flames, igniting a 2×2 square area. Creatures there take 2d10+10 damage, and another 10 damage at the end of each of their turns if they remain in the area.',
        ),
      ],
      bloodied: [
        e(
          'At 87 HP',
          'On his next turn, he uses Molten Fury a number of times equal to half the number of heroes (rounded up).',
        ),
      ],
      lastStand: [
        e(
          'Flameheart is dying!',
          '80 more damage and he dies. Until then, the area of his attacks increases to a 3×3 square.',
        ),
      ],
    },
    {
      name: 'Vael, Undying Necromancer',
      creatureType: 'Humanoid',
      level: '9',
      type: 'Luminary of Malice',
      kind: 'humanoid',
      hp: 250,
      saves: 'INT++ WIL++',
      page: 52,
      traits: [
        e(
          'Protect Master!',
          'Whenever Vael would fail a save or take 20 or more damage, he may sacrifice his Lifebinding Spirit, Bane, instead. He spends his next turn moving up to 6 spaces and summoning Bane.',
        ),
        e('Actions', 'After each hero’s turn, Bane attacks for 1d12+6, then Vael chooses one.'),
      ],
      actions: [
        e('DOOM', '(Range 12, undamaged target) DC 14 WIL save or 5d12 damage. Half on save.'),
        e(
          'Veilwalker’s Rebuke',
          '(Range 8) 2d12+6. Double damage against those behind cover. 1/round you may swap places with them.',
        ),
        e('Cruelty’s Edge', '1d4+2. On hit: DC 14 WIL save or Dazed and Frightened. Then move 6.'),
      ],
      bloodied: [
        e(
          'Shield of Cruelty',
          'At 125 HP, Vael gains this reaction (1 use): if Vael would be damaged, instead he may reflect that much radiant damage back at the attacker.',
        ),
      ],
      lastStand: [
        e(
          'DEATH, AN OLD FRIEND',
          'Vael is dying! 90 more damage and he dies. Until then, he gains Heavy Armor, the hero that most recently damaged him is reduced to 0 HP, and Bane is sacrificed into a Vengeful Spirit. It deals 1d12+6 necrotic damage to creatures within Reach 3 at the end of each of his turns.',
        ),
      ],
    },
    {
      name: 'Titan of the Deep Woods',
      creatureType: 'Undead',
      level: '10',
      size: 'Gargantuan',
      type: 'Skeleton',
      armor: 'Heavy',
      hp: 240,
      saves: 'STR+++',
      page: 53,
      traits: [
        e(
          'Splintering Legions',
          'Bludgeoning damage or any crit causes bones to splinter off and animate, forming a d10 minion.',
        ),
        e('Brittle Bones', 'Resistant to piercing, vulnerable to bludgeoning.'),
        e('Actions', AFTER_EACH),
      ],
      actions: [
        e('Devastating Strike', '(Reach 4) 1d4+30 damage. On hit: Knockback 6.'),
        e(
          'Crushing Stomp',
          'Move up to 10 spaces. Deal 1d4+20 damage to up to 2 targets along the path. On hit: Prone.',
        ),
        e(
          'Beckoning Doom',
          'The 2 furthest heroes make a DC 16 STR save or are moved adjacent to Titan.',
        ),
      ],
      lastStand: [
        e(
          'Shattered Legion',
          'At 0 HP Titan collapses into 4 skeleton minions/hero (d10 sized). If any remain, they reassemble into the Titan the next evening.',
        ),
      ],
    },
    {
      name: 'Ul’vek, Psionic Despot',
      creatureType: 'Aberration',
      level: '11',
      size: 'Medium',
      type: 'Brain-Eating Aberration',
      hp: 300,
      saves: 'INT++ WIL++ DEX+',
      page: 54,
      traits: [
        e(
          'Mind Shield',
          'Whenever Ul’vek would fail a save or take more than 30 damage while he has a creature Dominated, he may avoid the attack instead, but all Dominated creatures come to their senses.',
        ),
        e(
          'Dominated',
          'Rolls are made with disadvantage. Ul’vek spends your first action on each of your turns: moving, making a weapon attack, or casting a cantrip. Damage ends.',
        ),
        e('Actions', AFTER_EACH),
      ],
      actions: [
        e(
          'Dominate',
          '(If no creatures are Dominated) Choose half of the heroes to suffer 2d12 psychic damage (ignoring armor). DC 15 WIL save or Dominated as well.',
        ),
        e(
          'Consume',
          '(Dominated creature) Contested DEX or STR check; on success: Grappled and 6d12. Cannot be Defended or Interposed against.',
        ),
        e(
          'Control',
          'Teleport 8. (Reach 8) DC 15 WIL save, or an enemy must spend one Action to make a weapon attack or cast a cantrip. On save, they attack with disadvantage.',
        ),
      ],
      bloodied: [
        e(
          'Illusory Shift',
          'At 150 HP, gain this reaction. When attacked (1 use): swap places with a Dominated creature, making them the new target of the attack.',
        ),
      ],
      lastStand: [
        e(
          'Ul’vek is dying!',
          '110 more damage and he dies. Until then, Dominated no longer ends on taking damage. Every hero makes a WIL save or becomes Dominated.',
        ),
      ],
    },
    {
      name: 'Dravok, All-Seeing Tyrant',
      creatureType: 'Aberration',
      level: '12',
      size: 'Large',
      type: 'Aberration, all TEETH & EYES',
      hp: 325,
      saves: 'INT++ WIL++',
      page: 55,
      traits: [
        e(
          'My plans, flawless!',
          'Dravok makes all saves with +1 Advantage; attacks against him have Disadvantage.',
        ),
        e(
          'Weakness',
          'Taking more than 12 piercing or slashing damage: Dravok’s plans are FLAWED! (until the end of the next hero’s turn).',
        ),
        e(
          'Actions',
          'After each hero’s turn, Move 6 and then use either Eye Ray (Range 10, randomly chosen ray, then choose target) or Terrible Maw.',
        ),
      ],
      actions: [
        e('Terrible Maw', 'Melee attack. 4d4, EVERY die can crit and is Vicious.'),
        e('Eye Ray 1: Warping Ray', '3d6. On hit: Dazed, exchange places with target.'),
        e(
          'Eye Ray 2: Petrification Ray',
          'Permanently Dazed. Healing ends. (3 stacks: Petrified.)',
        ),
        e(
          'Eye Ray 3: Terror Ray',
          '5d10 psychic damage & Terrified: you are Frightened, and your screams give allies within 6 disadvantage on rolls. Ends when Dravok’s plans are FLAWED.',
        ),
        e('Eye Ray 4: Gravitation Ray', '2d6 damage. Push that many spaces. Knocked Prone on 7+.'),
        e(
          'Eye Ray 5: Charm Ray',
          'DC 16 WIL save or Dravok spends 3 of your Actions attacking with or moving you, 2 Actions on save. (Cannot spend resources; you regain spent actions afterward.)',
        ),
        e(
          'Eye Ray 6: Death Ray',
          'DC 16 STR save or drop to 0 HP. On save, gain 1 Wound. If a Dying creature fails this, they die.',
        ),
      ],
      bloodied: [
        e(
          'To Dust!',
          'At 110 HP, use Petrification Ray against every enemy. His save DC increases to 18.',
        ),
      ],
      lastStand: [
        e(
          'Dravok is dying!',
          '70 more damage and he dies. Until then, each turn he will move or use Warping Ray and then Devastation Beam: 2d12+20 in a 10 space long, 2 space wide line.',
        ),
      ],
    },
    {
      name: 'Azriel, Lord of Pain & Flame',
      creatureType: 'Fiend',
      level: '14',
      size: 'Huge',
      type: 'Balor',
      armor: 'Heavy',
      hp: 320,
      saves: 'ALL+',
      page: 56,
      traits: [
        e(
          'PAIN!',
          'Crits against Azriel are Vicious; he deals damage equal to the crit dice back to the attacker.',
        ),
        e('Actions', AFTER_EACH),
      ],
      actions: [
        e(
          'Crackling Whip',
          'Move 6. (Reach 6) 3d12 damage. On hit: Grappled and pulled adjacent to Azriel (escape DC 17 STR or DEX, or until he uses the whip again).',
        ),
        e('Doom Sword', '3d12+10 fire damage to all creatures within Reach 2.'),
      ],
      bloodied: [e('At 160 HP', 'Azriel can use Crackling Whip twice each turn.')],
      lastStand: [
        e(
          'YES, MORE PAIN!',
          'Azriel is dying! 180 more damage and he dies. Until then, EVERY hit against him is a crit.',
        ),
      ],
    },
    {
      name: 'Gloomwing the Cruel',
      creatureType: 'Dragon',
      level: '15',
      size: 'Huge',
      type: 'Rot Dragon',
      armor: 'Heavy',
      hp: 320,
      saves: 'ALL++',
      page: 57,
      traits: [
        e(
          'Aura of Rot',
          'Creatures within 6 spaces take 5 necrotic damage at the end of their turns.',
        ),
        e(
          'Light Sensitivity',
          'Radiant damage suppresses Aura of Rot until the end of the next hero’s turn.',
        ),
        e('Cruelty’s Gift', 'Healing is halved and Vulnerable to necrotic damage. Healing ends.'),
        e('Actions', AFTER_EACH),
      ],
      actions: [
        e(
          'Rot Breath',
          '(1 use) Fly 10, then (Cone 8) DC 17 DEX save or 8d10 necrotic, half on save.',
        ),
        e('Bite', '(Reach 2) Move 6, then 3d10. On damage: Cruelty’s Gift.'),
        e('Claws', '(Reach 2) 3d10 slashing +10 necrotic.'),
        e('Tail', '(Reach 4) 1d10, and knocked back that many spaces.'),
      ],
      bloodied: [e('At 160 HP', 'Gloomwing’s Rot Breath recharges.')],
      lastStand: [
        e(
          'Gloomwing is dying!',
          '150 more damage and he dies. Until then, the damage and range of his Aura of Rot are doubled.',
        ),
      ],
    },
    {
      name: 'Alaric Draegoth, the Crimson Count',
      creatureType: 'Undead',
      level: '16',
      type: 'Vampire Lord',
      hp: 320,
      saves: 'ALL++',
      page: 58,
      traits: [
        e(
          'Sanguine Cloak',
          '(1/turn) Deal 1d10 necrotic damage whenever you are hit; the attack is reduced by this amount.',
        ),
        e(
          'Sunscorn',
          'Vulnerable to radiant. After taking radiant damage, use Beguile as a Reaction; they roll with disadvantage.',
        ),
        e('Beguiled', 'Dazed. Cannot Defend or allow anyone to Interpose for you. Damage ends.'),
        e(
          'Actions',
          'After each hero’s turn, summon 1 blood bat minion (d10) within 8 spaces, then choose one.',
        ),
      ],
      actions: [
        e(
          'Ebonfang',
          'Deal 1d10+15 damage; your target is considered Bloodied for 1 round. Fly 8 before or after attacking.',
        ),
        e(
          'Beguile',
          'If no creature is Beguiled, Beguile a target on a failed DC 18 WIL save (with disadvantage if Bloodied).',
        ),
        e(
          'Beckon & Bite',
          'Move a Beguiled creature adjacent to you and bite them: 2d10+30 damage and 1 Wound.',
        ),
      ],
      bloodied: [
        e(
          'Mistform',
          'At 160 HP: no longer vulnerable to radiant. Bat Decoy: whenever Alaric would take damage, he first swaps places with a bat minion instead, 1/round.',
        ),
      ],
      lastStand: [
        e(
          'Alaric is dying!',
          '160 more damage and he dies. Until then, his Sanguine Cloak, attacks, and bats roll d20s instead of d10s.',
        ),
      ],
    },
    {
      name: 'Caerys, the Hollow Star',
      creatureType: 'Celestial',
      level: '20',
      type: 'World-Ending Cataclysm, She Who Is Our Desire & End',
      armor: 'Heavy',
      hp: 620,
      saves: 'ALL+++',
      page: 59,
      traits: [
        e('Ravages of Time', 'At the beginning of each round, all heroes suffer 1 Wound.'),
        e(
          'Slipstream',
          '3/encounter: when she would suffer any negative effect, she can swap places with a creature of her choice, making them the target instead. All heroes recover 1 Wound.',
        ),
        e(
          'Actions',
          'After each hero’s turn, choose one not yet chosen (reset when all have been chosen).',
        ),
      ],
      actions: [
        e('Wormhole', 'Teleport 12. 3d20 to a creature adjacent to where you began or ended.'),
        e(
          'Immensity',
          '(Reach 12) DC 20 STR save (disadvantage if within Reach 4) or suffer 3d20 damage and Prone. Half on save.',
        ),
        e(
          'Glimpse Your End',
          'DC 20 WIL save or DOOMED: Concentration ends, the next damage roll against you is maximized.',
        ),
        e(
          'Plasma Storm',
          'Reach 6, DC 20 DEX save or 2d20 lightning and 2d20 fire damage. Half on save.',
        ),
        e('Singularity', 'Reach 2, 5d20 bludgeoning damage.'),
        e(
          'Almighty Push & Pull',
          '(Range 12) DC 20 STR save or be launched 20 ft. into the air; repeat until the target saves. Fall damage for this attack is 1d20 for every 10 ft. fallen.',
        ),
      ],
      bloodied: [
        e(
          'Gravitational Mastery',
          'At 310 HP: move ALL objects and creatures within 16 spaces anywhere else within the area.',
        ),
        e(
          'Gravitational Lensing',
          'The hero with the most HP is marked by Caerys. She takes half damage from all sources, her mark takes the other half. This lasts until the mark drops to 0 HP.',
        ),
      ],
      lastStand: [
        e(
          'Caerys is dying!',
          'Use Gravitational Mastery, then Caerys is dying! 200 more damage and she dies. Until then she chooses twice each turn. If still alive after 1 round: Reset Time: she resets back to full HP.',
        ),
      ],
    },
  ],
)

// ---------------------------------------------------------------------------
// Sample adventure bosses
// ---------------------------------------------------------------------------

// Nimble GM's Guide, sample adventure (pp. 67, 71).
const ADVENTURE = family(
  'Sample adventure',
  'adventure',
  67,
  [],
  [
    {
      name: 'Krogg, Goblin King',
      creatureType: 'Humanoid',
      level: '2',
      type: 'Angry Bugbear',
      armor: 'Medium',
      hp: 75,
      saves: 'STR+ DEX+',
      page: 67,
      traits: [e('Actions', AFTER_EACH)],
      actions: [
        e('Manglemaul', 'Move 6. 2d6+3 damage, Grappled (escape DC 10). OR:'),
        e(
          'Crack Skulls',
          'Move 6. Swing a Grappled creature at another creature. Both take 2d6+3 damage, ending the Grapple.',
        ),
      ],
      bloodied: [e('At 35 HP', 'Krogg’s damage increases to 2d8+3.')],
      lastStand: [
        e('Krogg is dying!', 'If he takes 20 more damage he dies. Until then, he has Heavy armor.'),
      ],
    },
    {
      name: 'Greenthumb, Lichling',
      creatureType: 'Humanoid',
      level: '3',
      type: 'Botanical Wizard',
      kind: 'humanoid',
      hp: 100,
      saves: 'INT+ WIL+',
      page: 71,
      traits: [e('Actions', 'After each hero’s turn, move 6 and then choose one.')],
      actions: [
        e('Summon Briarbanes', 'Summon 1 minion/hero (size: 1d4).'),
        e(
          'Root',
          'Choose half of the heroes to make a DC 11 DEX save or take 2d4 piercing damage and be Restrained by thorny vines (escape DC 11 STR or DEX save, or any slashing or fire damage).',
        ),
        e('Thorn Shot', '(Range 10) 5d4+5.'),
      ],
      bloodied: [e('At 50 HP', 'Greenthumb gains magical bark, giving himself Heavy Armor.')],
      lastStand: [
        e(
          'Greenthumb is dying!',
          '30 more damage and he dies. Until then, he chooses twice each turn.',
        ),
      ],
    },
  ],
)

export const BESTIARY: BestiaryFamily[] = [
  KOBOLDS,
  GOBLINS,
  BANDITS,
  SNAKEMEN,
  STIRGES,
  MIMICS,
  OOZES,
  GNOLLS,
  HILL_AND_FIELD,
  UNDEAD,
  FOREST,
  BRIARBANES,
  CULTISTS,
  HORRORS,
  UNDERGROUND,
  LEGENDARY_EXAMPLES,
  LEGENDARY,
  ADVENTURE,
]
