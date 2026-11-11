// Nimble Heroes, Stormshifter (pp. 60–65).
import type { ChoiceDef, ClassDef } from '../types'
import { CAPSTONE_STATS, EPIC_BOON, UPGRADED_CANTRIPS, inc, poolChoice, tierNote } from './shared'

const stormcaller = (label: string): ChoiceDef => ({
  id: 'stormcaller',
  label,
  count: 'perSchool',
  source: { kind: 'utility', schools: 'known' },
})

const boon = (n: number, ordinal: string) =>
  poolChoice('chimeric-boon', `Chimeric Boon (${n}): choose a ${ordinal} Chimeric Boon`, [
    'chimeric-boons',
  ])

export const stormshifter: ClassDef = {
  slug: 'stormshifter',
  name: 'Stormshifter',
  tagline: 'Master of beast and nature.',
  description:
    'The trees whisper their excitement, the clouds sing with glee. Born of an ancient union between mortal and dryad, Stormshifters wield lightning and tempest as others wield blade and shield, and are as one with storm and beast.',
  highlights: [
    'Aid your allies in whatever role is most needed.',
    'Wade into the fray as a shapeshifted beast: friendly, vicious, indomitable, or HORRIBLE.',
    'Cast powerful spells from a distance to strike down, control, and mend.',
  ],
  complexity: 3,
  keyStats: ['WIL', 'DEX'],
  hitDie: 8,
  startingHp: 13,
  saveAdv: 'WIL',
  saveDis: 'STR',
  armor: 'Cloth or Leather Armor',
  weapons: 'Staves, Wands',
  startingGear: [
    { name: 'Cheap Hides', qty: '1' },
    { name: 'Staff', qty: '1' },
    { name: 'Strange Plant', qty: '1' },
  ],
  startingWeapons: ['Staff'],
  armorCalc: { base: 3 },
  mana: { label: '(WIL×3)+LVL', stat: 'WIL', mult: 3 },
  swapRule: {
    name: 'Be Wild',
    desc: 'Whenever you spend a day with wild animals during a Safe Rest, you may choose different Stormshifter options available to you.',
  },
  pools: [
    {
      id: 'chimeric-boons',
      name: 'Chimeric Boons',
      note: 'Whenever you shapeshift into a Direbeast form, you may modify it with 1 Chimeric Boon you know.',
      options: [
        {
          name: 'Beast of the Sea',
          desc: 'Can move, breathe, and fight underwater without penalty.',
        },
        { name: 'Climber', desc: 'Can walk across walls and ceilings; ignores difficult terrain.' },
        {
          name: 'Earthwalker',
          desc: '+2 armor. Can burrow through dirt and unworked rock at half speed (leaving a tunnel behind). Advantage against the Prone condition.',
        },
        {
          name: 'Fleet Footed',
          desc: '+2 speed. Advantage on Stealth checks and against the Grappled condition.',
        },
        {
          name: 'Keen Senses',
          desc: 'Advantage on Perception and Assess checks. Unaffected by Blinded.',
        },
        {
          name: 'Leader of the Pack',
          desc: 'Advantage against fear and charm effects for yourself and allies within 6 spaces.',
        },
        {
          name: 'Phasebeast',
          desc: 'Whenever you shift between this form and your normal form (and vice versa), you may teleport up to 6 spaces away to a place you can see.',
        },
        {
          name: 'Prehensile Tail',
          desc: 'Creatures you hit in melee that are your size or smaller are Grappled. If you hit a larger creature, you may move with it when it moves.',
        },
        {
          name: 'Winged',
          desc: 'Gain a flying speed. Forced movement moves you twice as far while flying.',
        },
      ],
    },
  ],
  levels: {
    1: {
      schools: ['lightning', 'wind'],
      spellTier: 0,
      abilities: [
        {
          name: 'Master of Storms',
          desc: 'You know cantrips from the Lightning and Wind schools.',
        },
        {
          name: 'Beastshift',
          desc: 'Action: Transform into a harmless beast (squirrel, pigeon, etc.). While transformed, you can speak with animals. The form lasts until you drop to 0 HP, cast a spell, or end it on your turn for free. You have DEX Beastshift charges; they reset on a Safe Rest. Tiny beasts: attacks against you have disadvantage, but ANY damage ends the form.',
        },
      ],
    },
    2: {
      spellTier: 1,
      abilities: [
        {
          name: 'Direbeast Form',
          desc: 'You can Beastshift into a Fearsome Beast (Large): transform into any Large beast. Gain DEX+LVL temp HP (until Beastshift ends), the Gore attack (Action: 1d6+LVL damage, on hit gain LVL temp HP), and Fearsome (whenever you Interpose or Defend, you may spend 1 mana to force them to reroll the attack; you choose either result).',
        },
        {
          name: 'Mana and Unlock Tier 1 Spells',
          desc: 'You unlock tier 1 Wind and Lightning spells and gain a mana pool to cast them. Its maximum is always (WIL×3)+LVL and it recharges on a Safe Rest.',
        },
      ],
    },
    3: {
      subclassChoice: true,
      abilities: [
        {
          name: 'Direbeast Form (2)',
          desc: 'You can Beastshift into a Beast of the Pack (Medium): gain +DEX speed, Supercharge, and the Thunderfang attack (Action: 1d4+LVL piercing). Whenever you crit or kill one or more enemies, Thunderfang gains a cumulative +1d4 lightning damage until combat ends. Supercharge: spend up to WIL mana, and your next Thunderfang deals +1d8 lightning damage per mana spent (you take this damage on a miss).',
        },
      ],
    },
    4: {
      spellTier: 2,
      notes: [tierNote(2)],
      abilities: [],
      statIncrease: inc('WIL', 'DEX'),
      choices: [stormcaller('Stormcaller: learn a Utility Spell from each spell school you know')],
    },
    5: {
      notes: [UPGRADED_CANTRIPS],
      abilities: [
        {
          name: 'Direbeast Form (3)',
          desc: 'You can Beastshift into a Beast of Nightmares (Tiny): any Tiny beast or insect (provided it is horrible). Gain the Sting attack ((1/round) Action: Reach 0, 1d4 piercing + 3×LVL acid damage ignoring armor; on crit 4×LVL instead) and Silent But Deadly (Speed 2; you cannot Defend or Interpose; attackers cannot target you until you become conspicuous).',
        },
      ],
      statIncrease: inc('STR', 'INT'),
    },
    6: {
      spellTier: 3,
      notes: [tierNote(3)],
      abilities: [
        {
          name: 'Chimeric Boon',
          desc: 'Whenever you shapeshift into a Direbeast form, you may modify it with 1 Chimeric Boon you know.',
        },
        { name: 'Expert Shifter', desc: 'Gain 1 additional use of Beastshift per Safe Rest.' },
      ],
      choices: [
        poolChoice(
          'chimeric-boon',
          'Chimeric Boon: choose 2 Chimeric Boons',
          ['chimeric-boons'],
          2,
        ),
      ],
    },
    7: {
      abilities: [],
      choices: [
        stormcaller('Stormcaller (2): learn a 2nd Utility Spell from each spell school you know'),
      ],
    },
    8: {
      spellTier: 4,
      notes: [tierNote(4)],
      abilities: [
        {
          name: 'Stormborn',
          desc: 'Gain resistance to lightning damage. (1/day) You may gain advantage on a Naturecraft check or Concentration check.',
        },
      ],
      statIncrease: inc('WIL', 'DEX'),
    },
    9: {
      abilities: [
        { name: 'Expert Shifter (2)', desc: 'Gain 1 additional use of Beastshift per Safe Rest.' },
      ],
      statIncrease: inc('STR', 'INT'),
      choices: [boon(2, '3rd')],
    },
    10: { spellTier: 5, notes: [tierNote(5), UPGRADED_CANTRIPS], abilities: [] },
    11: { abilities: [] },
    12: {
      spellTier: 6,
      notes: [tierNote(6)],
      abilities: [
        { name: 'Expert Shifter (3)', desc: 'Gain 1 additional use of Beastshift per Safe Rest.' },
      ],
      statIncrease: inc('WIL', 'DEX'),
      choices: [boon(3, '4th')],
    },
    13: {
      abilities: [
        {
          name: 'Stormborn (2)',
          desc: 'Instead of rolling dice, deal the max damage of a Wind spell by spending a charge of your Beastshift feature. Whenever you end Beastshift, you may cast a cantrip for free.',
        },
      ],
      statIncrease: inc('STR', 'INT'),
    },
    14: { spellTier: 7, notes: [tierNote(7)], abilities: [] },
    15: { notes: [UPGRADED_CANTRIPS], abilities: [] },
    16: { spellTier: 8, notes: [tierNote(8)], abilities: [], statIncrease: inc('WIL', 'DEX') },
    17: { abilities: [], statIncrease: inc('STR', 'INT'), choices: [boon(4, '5th')] },
    18: { spellTier: 9, notes: [tierNote(9)], abilities: [] },
    19: { abilities: [], choices: [EPIC_BOON] },
    20: {
      notes: [UPGRADED_CANTRIPS],
      abilities: [
        {
          name: 'Archdruid',
          desc: '(1/encounter) Cast a spell up to tier 4 for free when you enter or leave a Beastshift form.',
        },
      ],
      statIncrease: CAPSTONE_STATS,
    },
  },
  subclasses: [
    {
      slug: 'sky-storm',
      name: 'Circle of Sky & Storm',
      tagline: 'tempestuous spellcaster',
      levels: {
        3: {
          abilities: [
            { name: 'Creature of the Fey', desc: 'You may cast spells while Beastshifted.' },
            {
              name: 'Attuned to Nature',
              desc: '(1/day) Add LVL to any skill check related to nature or weather.',
            },
          ],
          choices: [
            {
              id: 'deepening-study',
              label: 'Deepening Study: choose the Ice or Radiant school to learn',
              count: 1,
              source: { kind: 'school', schools: ['ice', 'radiant'] },
            },
          ],
        },
        7: {
          abilities: [
            {
              name: 'Raging Tempest',
              desc: 'Whenever you crit with a tiered spell, you may cast a cantrip for free from a school you know and haven’t cast any spells from this turn (at the same level of dis/advantage).',
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'Primordial Force',
              desc: 'Spending 2+ mana on a spell grants an additional effect: Ice: gain WIL temp HP. Lightning: deal additional damage equal to your WIL. Radiant: you may heal a creature within 6 spaces WIL HP. Wind: gain a flying speed this turn and move up to 6 spaces for free.',
            },
          ],
        },
        15: {
          abilities: [
            {
              name: 'Master of Storm',
              desc: 'You can concentrate on 1 lightning spell and 1 wind spell at the same time. (1/Safe Rest) You can cast Ride the Lightning for 0 mana.',
            },
          ],
        },
      },
    },
    {
      slug: 'fang-claw',
      name: 'Circle of Fang & Claw',
      tagline: 'bestial shapeshifter',
      levels: {
        3: {
          abilities: [
            {
              name: 'Swiftshift',
              desc: 'When you roll Initiative, you may Beastshift or move for free. While transformed, you may shift between different Direbeast forms for free (and as a reaction by spending 1 mana); Beastshifting for free does not grant any temp HP.',
            },
            {
              name: 'Windborne Protector',
              desc: '(1/encounter) Reaction: when an enemy attacks, spend 2 mana to shift into a Fearsome Beast. Then you may Interpose from up to 12 spaces away and Defend for free (if you have not yet done so this round).',
            },
            {
              name: 'Friend of Beasts',
              desc: 'Beasts will not attack you until you first harm them. You may transform into harmless beasts without spending a Beastshift charge.',
            },
          ],
        },
        7: {
          abilities: [
            {
              name: 'Unleash the Beast',
              desc: '(1/encounter) When you miss, you can crit instead.',
            },
            {
              name: 'Storm Wake',
              desc: '(1/encounter) Action: Spend 3 mana to shift into a Beast of the Pack, then teleport in a straight line up to 12 spaces away, unerringly dealing WIL d8 lightning damage to any creatures you choose adjacent to your path.',
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'Master of Forms',
              desc: 'Your shapeshift forms can have 2 Chimeric Boons at a time.',
            },
            {
              name: 'Venomous Gaze',
              desc: '(1/encounter) Action: Spend 2 mana to shift into a Beast of Nightmares. Then entice a creature within 12 spaces to move 2×WIL spaces closer on a failed WIL save (they roll with disadvantage and must repeat until they save or can move no further). If they end in your space, you may Sting them for free.',
            },
          ],
        },
        15: {
          abilities: [
            {
              name: 'Master of Forms (2)',
              desc: 'You can Beastshift 2 additional times per Safe Rest. Your Direbeast forms can have 3 Chimeric Boons at a time.',
            },
          ],
          choices: [
            poolChoice(
              'chimeric-boon',
              'Master of Forms (2): choose 2 additional Chimeric Boons',
              ['chimeric-boons'],
              2,
            ),
          ],
        },
      },
    },
  ],
}
