// Nimble Heroes, Mage (pp. 30–35).
import type { ClassDef } from '../types'
import { CAPSTONE_STATS, EPIC_BOON, UPGRADED_CANTRIPS, inc, poolChoice, tierNote } from './shared'

const spellshaper = (n: number) =>
  poolChoice('spellshaper', `Spellshaper (${n}): choose 1 additional Spellshaper ability`, [
    'spellshaper',
  ])

const mastery = (label: string) => ({
  id: 'elemental-mastery',
  label,
  count: 1,
  source: { kind: 'utilitySchool' as const },
})

export const mage: ClassDef = {
  slug: 'mage',
  name: 'Mage',
  tagline: 'Wield and shape the elements of fire, ice, and lightning.',
  description:
    'Elemental power flows through all things… find it, study it, and harness it. Mages refine their natural gifts through scholarly pursuit, with tomes and parchments as their companions.',
  highlights: [
    'Spellshaper: stretch time, gain extra-dimensional vision, or echo cast multiple spells.',
    'Elemental Mastery: rain down fire, freeze enemies, strike with thunderous lightning.',
    'Chaos or Control: snatch control of the frayed tapestry of mana, or lean into chaos.',
  ],
  complexity: 3,
  keyStats: ['INT', 'WIL'],
  hitDie: 6,
  startingHp: 10,
  saveAdv: 'INT',
  saveDis: 'STR',
  armor: 'Cloth Armor',
  weapons: 'Blades, Staves, Wands',
  startingGear: [
    { name: 'Adventurer’s Garb', qty: '1' },
    { name: 'Staff', qty: '1' },
    { name: 'Soap', qty: '1' },
  ],
  startingWeapons: ['Staff'],
  armorCalc: { base: 2 },
  mana: { label: '(INT×3)+LVL', stat: 'INT', mult: 3 },
  swapRule: {
    name: 'Study!',
    desc: 'Whenever you study arcane books or are tutored by a higher level Mage during a Safe Rest, you may choose different Mage options available to you.',
  },
  pools: [
    {
      id: 'spellshaper',
      name: 'Spellshaper',
      note: 'You may use 1 Spellshaper ability per turn.',
      options: [
        {
          name: 'Dimensional Compression',
          desc: '(1 or more mana) +4 range to a spell for each additional mana spent.',
        },
        {
          name: 'Echo Casting',
          desc: '(2×mana, min. 1 mana) When you cast a tiered, single-target spell, you may cast a copy of that spell on a 2nd target for free.',
        },
        {
          name: 'Elemental Destruction',
          desc: '(1 or more mana) After you hit with a spell, you may spend 1 or more mana (up to your WIL) to reroll 1 die per mana spent.',
        },
        {
          name: 'Elemental Transmutation',
          desc: '(1 mana) Change the damage type of a spell to: Fire, Ice, Lightning, Necrotic, or Radiant.',
        },
        {
          name: 'Extra-Dimensional Vision',
          desc: '(2 mana) You may ignore the line of sight requirement of a spell. Your spell phases through barriers and obstacles to reach a target you know of within range.',
        },
        {
          name: 'Methodical Spellweaver',
          desc: '(–2 mana) Spend 1 additional action to reduce the mana cost of a spell by 2 (min 1).',
        },
        {
          name: 'Precise Casting',
          desc: '(1+ mana) Choose 1 creature per mana spent to be unaffected by a spell you cast.',
        },
        { name: 'Stretch Time', desc: '(2 mana) Reduce the action cost of a spell by 1 (min 1).' },
      ],
    },
  ],
  levels: {
    1: {
      schools: ['fire', 'ice', 'lightning'],
      spellTier: 0,
      abilities: [
        {
          name: 'Elemental Spellcasting',
          desc: 'You know Fire, Ice, and Lightning cantrips.',
        },
      ],
    },
    2: {
      spellTier: 1,
      abilities: [
        {
          name: 'Mana and Unlock Tier 1 Spells',
          desc: 'You unlock tier 1 Fire, Ice, and Lightning spells and gain a mana pool to cast them. Its maximum is always (INT×3)+LVL and it recharges on a Safe Rest.',
        },
        {
          name: 'Talented Researcher',
          desc: 'Gain advantage on Arcana or Lore checks when you have access to a large amount of books and time to study them.',
        },
      ],
    },
    3: {
      subclassChoice: true,
      abilities: [],
      choices: [
        mastery('Elemental Mastery: learn the Utility Spells from 1 spell school you know'),
      ],
    },
    4: {
      spellTier: 2,
      notes: [tierNote(2)],
      abilities: [
        {
          name: 'Spellshaper',
          desc: 'You gain the ability to enhance your spells with powerful effects by spending additional mana (1/turn).',
        },
      ],
      statIncrease: inc('INT', 'WIL'),
      choices: [
        poolChoice(
          'spellshaper',
          'Spellshaper: choose 2 Spellshaper abilities',
          ['spellshaper'],
          2,
        ),
      ],
    },
    5: {
      notes: [UPGRADED_CANTRIPS],
      abilities: [
        {
          name: 'Elemental Surge',
          desc: 'When you roll Initiative, regain WIL mana (this expires at the end of combat if unused).',
        },
      ],
      statIncrease: inc('STR', 'DEX'),
    },
    6: {
      spellTier: 3,
      notes: [tierNote(3)],
      abilities: [],
      choices: [
        mastery('Elemental Mastery (2): learn the Utility Spells from a 2nd spell school you know'),
      ],
    },
    7: { abilities: [] },
    8: { spellTier: 4, notes: [tierNote(4)], abilities: [], statIncrease: inc('INT', 'WIL') },
    9: { abilities: [], statIncrease: inc('STR', 'DEX'), choices: [spellshaper(2)] },
    10: {
      spellTier: 5,
      notes: [tierNote(5), UPGRADED_CANTRIPS],
      abilities: [
        {
          name: 'Elemental Surge (2)',
          desc: 'Your Elemental Surge now regains WIL+1d4 mana.',
        },
      ],
    },
    11: { abilities: [] },
    12: { spellTier: 6, notes: [tierNote(6)], abilities: [], statIncrease: inc('INT', 'WIL') },
    13: { abilities: [], statIncrease: inc('STR', 'DEX'), choices: [spellshaper(3)] },
    14: {
      spellTier: 7,
      notes: [tierNote(7)],
      abilities: [],
      choices: [
        mastery('Elemental Mastery (3): learn the Utility Spells from a 3rd spell school you know'),
      ],
    },
    15: { notes: [UPGRADED_CANTRIPS], abilities: [] },
    16: { spellTier: 8, notes: [tierNote(8)], abilities: [], statIncrease: inc('INT', 'WIL') },
    17: {
      abilities: [
        {
          name: 'Elemental Surge (3)',
          desc: 'Your Elemental Surge now regains WIL+2d4 mana.',
        },
      ],
      statIncrease: inc('STR', 'DEX'),
    },
    18: { spellTier: 9, notes: [tierNote(9)], abilities: [] },
    19: { abilities: [], choices: [EPIC_BOON] },
    20: {
      notes: [UPGRADED_CANTRIPS],
      abilities: [
        {
          name: 'Archmage',
          desc: '(1/encounter) The first tiered spell you cast each encounter costs 1 action less and 5 fewer mana.',
        },
      ],
      statIncrease: CAPSTONE_STATS,
    },
  },
  subclasses: [
    {
      slug: 'control',
      name: 'Invoker of Control',
      tagline: 'structure, iron will',
      levels: {
        3: {
          abilities: [
            {
              name: 'Force of Will',
              desc: '(1/round) On your turn, you may Demand Control: choose 1 option from the Control Table you haven’t chosen yet; resets when you roll Initiative or when you have chosen all options once. Control Table: I INSIST (cast a cantrip for free, ignoring all disadvantage; it cannot miss). ELEMENTAL AFFLICTION (a creature of your choice within 12 spaces gains the Charged, Smoldering, or Slowed condition). NO (choose a creature; it cannot harm a creature of your choice during its next turn). LOSE CONTROL (do ALL of the above, but the GM chooses each time).',
            },
            {
              name: 'Deny Fate',
              desc: 'Whenever you miss with a spell or an effect you cause is saved against, you MUST Demand Control.',
            },
          ],
        },
        7: {
          abilities: [
            {
              name: 'Nullify',
              desc: '(1/encounter) Ignore all disadvantage and other negative effects on your next action this turn, then Demand Control.',
            },
          ],
          choices: [
            {
              id: 'at-any-cost-cantrip',
              label: 'At Any Cost: learn 1 Necrotic cantrip',
              count: 1,
              source: { kind: 'spell', maxTier: 0, schools: ['necrotic'] },
            },
            {
              id: 'at-any-cost-spell',
              // The book sets no tier cap; offer what a level 7 Mage can cast.
              label:
                'At Any Cost: learn 1 tiered Necrotic spell (up to tier 3, the highest you can cast)',
              count: 1,
              source: { kind: 'spell', minTier: 1, maxTier: 3, schools: ['necrotic'] },
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'Steel Will',
              desc: '(1/Safe Rest) Whenever you would fail a save, you may succeed instead. Whenever you roll a 1 on an Elemental Surge die, you may reroll it once.',
            },
          ],
        },
        15: {
          abilities: [
            {
              name: 'Supreme Control',
              desc: 'Whenever you Demand Control, you may choose to trigger the selected option twice. You may Demand Control as a Reaction.',
            },
          ],
        },
      },
    },
    {
      slug: 'chaos',
      name: 'Invoker of Chaos',
      tagline: 'madness, let chaos reign',
      levels: {
        3: {
          abilities: [
            {
              name: 'Force of Chaos',
              desc: 'Whenever you cast a spell, you can choose to spend 1 less mana. Whenever you do this and whenever you crit, Invoke Chaos: roll on the Chaos Table (the GM has it; a 1 is really bad, a 20 is AWESOME).',
            },
          ],
        },
        7: {
          abilities: [
            {
              name: 'Chaos Lash',
              desc: '(1/encounter) Reaction (when an enemy moves adjacent to you): they are pushed back 2 spaces, and on a failed WIL save, knocked Prone as well. Invoke Chaos.',
            },
          ],
          choices: [
            {
              id: 'tempest-mage-cantrip',
              label: 'Tempest Mage: learn 1 Wind cantrip',
              count: 1,
              source: { kind: 'spell', maxTier: 0, schools: ['wind'] },
            },
            {
              id: 'tempest-mage-spell',
              // The book sets no tier cap; offer what a level 7 Mage can cast.
              label:
                'Tempest Mage: learn 1 tiered Wind spell (up to tier 3, the highest you can cast)',
              count: 1,
              source: { kind: 'spell', minTier: 1, maxTier: 3, schools: ['wind'] },
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'Thrive in Chaos',
              desc: 'Whenever you Invoke Chaos, you may roll twice and cause both effects. (1/Safe Rest) You may choose which roll to use instead.',
            },
          ],
        },
        15: {
          abilities: [
            { name: 'Master of Chaos', desc: 'Whenever you Invoke Chaos, roll with advantage.' },
          ],
        },
      },
    },
  ],
}
