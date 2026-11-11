// Nimble Heroes, Shadowmancer (pp. 42–47) and the Reaver story subclass (pp. 78–79).
import type { ClassDef } from '../types'
import {
  CAPSTONE_STATS,
  EPIC_BOON,
  UPGRADED_CANTRIPS,
  inc,
  pactTierNote,
  poolChoice,
} from './shared'

const greater = (n: number, ordinal: string) =>
  poolChoice(
    'greater-invocation',
    `A Gift from the Master (${n}): choose a ${ordinal} Greater Shadow Invocation`,
    ['greater-invocations'],
  )

const shadowmastery = (label: string) => ({
  id: 'shadowmastery',
  label,
  count: 1,
  source: { kind: 'utility' as const, schools: ['necrotic' as const] },
})

export const shadowmancer: ClassDef = {
  slug: 'shadowmancer',
  name: 'Shadowmancer',
  tagline: 'Summon hordes of expendable shadow minions.',
  description:
    'Totally NOT evil. Great power sometimes comes from… horrible places. Scheme your way into a pact with an ancient horror, and summon a horde of shadow minions to do your bidding. They’re always eager to serve!',
  highlights: [
    'Unspeakable Power Awaits: forge pacts with ancient, unfathomable entities.',
    'Master Shadow Minions: summon legions to overwhelm your adversaries.',
    'Pilfer power from your patron to cast spells at your highest tier.',
  ],
  complexity: 2,
  keyStats: ['INT', 'DEX'],
  hitDie: 8,
  startingHp: 13,
  saveAdv: 'INT',
  saveDis: 'WIL',
  armor: 'Cloth Armor',
  weapons: 'Blades, Wands',
  startingGear: [
    { name: 'Adventurer’s Garb', qty: '1' },
    { name: 'Sickle', qty: '1' },
    { name: 'Shovel', qty: '1' },
  ],
  startingWeapons: ['Sickle'],
  armorCalc: { base: 2 },
  resource: {
    name: 'Pilfered Power',
    diceName: 'Use',
    die: 0,
    kind: 'uses',
    ability: 'Pilfered Power',
    stat: 'DEX',
  },
  swapRule: {
    name: 'Supplicate',
    desc: 'Whenever you commune with your Patron on a Safe Rest, you may beg them to allow you to choose different Shadowmancer options (they may ask for something in return).',
  },
  pools: [
    {
      id: 'lesser-invocations',
      name: 'Lesser Invocations',
      options: [
        {
          name: 'Abhorrent Speech',
          desc: 'You can communicate with horrible creatures (aberrations, undead, etc.).',
        },
        { name: 'Beguiling Influence', desc: '(1/day) You may reroll an Influence check.' },
        {
          name: 'Blood Sight',
          desc: '(1/day) You may reroll an Examination check. You can detect traces of blood on a surface, even after it has been cleaned.',
        },
        {
          name: 'Devoted Acolyte',
          desc: 'Learn 2 of: Celestial, Draconic, Deep Speak, Infernal, or Primordial. Advantage on Lore checks related to those 2 languages.',
        },
        {
          name: 'Eldritch Sense',
          desc: 'You can sense the presence of any shapechanger or creature concealed by magic while within 6 spaces of them.',
        },
        {
          name: 'Gaze of Two Minds',
          desc: 'Touch a willing creature and perceive through its senses instead of your own for as long as you hold concentration.',
        },
        {
          name: 'Knowledge from Beyond',
          desc: 'Whenever you fail an Insight or Arcana check, you may suffer 1 Wound to succeed instead.',
        },
        {
          name: 'My Favored Pet',
          desc: 'One shadow minion can begrudgingly tolerate you outside of combat. It can (very creepily) do any menial task a below average commoner could.',
        },
        {
          name: 'Voice of the Dark',
          desc: 'You can communicate telepathically with a humanoid within 6 spaces.',
        },
        {
          name: 'Whispers of the Grave',
          desc: '(1/day) You can ask a dead creature 3 yes/no questions. It can never be questioned this way again.',
        },
      ],
    },
    {
      id: 'greater-invocations',
      name: 'Greater Invocations',
      options: [
        {
          name: 'Armor of Shadows',
          desc: 'Reduce all damage you receive by an amount equal to the number of minions you have.',
        },
        {
          name: 'Fiendish Boon',
          desc: 'Increase your DEX or INT by 1. You have 1 fewer maximum Hit Dice.',
        },
        {
          name: 'Hungering Shadows',
          desc: 'Whenever one of your shadows would crit, the next tiered spell you cast this encounter does not cost a use of Pilfered Power.',
        },
        {
          name: 'One with Shadows',
          desc: 'Action: When you are in an area of dim light or darkness, you may become Invisible until you move or attack.',
        },
        {
          name: 'Repelling Blast',
          desc: 'When you hit a Medium or smaller creature with Shadow Blast, you can push it up to 2 spaces away from yourself.',
        },
        { name: 'Shadow Magus', desc: 'Your minions gain +4 Reach and deal d10 damage instead.' },
        {
          name: 'Shadow Spear',
          desc: 'Your Shadow Blast can target creatures twice as far away, ignores cover, and you may attack Prone targets with advantage with it (instead of disadvantage).',
        },
        {
          name: 'Shadow Rush',
          desc: 'When your shadow minions attack, instead of rolling damage, you may have any of them deal the max amount, then die.',
        },
        {
          name: 'Shadow Warp',
          desc: 'Action: Switch places with a creature within 12 spaces that has been dealt necrotic damage this turn.',
        },
        {
          name: 'Swarming Shadows',
          desc: 'Whenever one of your shadows would crit, summon another shadow minion adjacent to the target.',
        },
        {
          name: 'Vengeful Blast',
          desc: 'Whenever a minion dies, you may cast Shadow Blast as a reaction (even if you already cast it this turn).',
        },
      ],
    },
  ],
  levels: {
    1: {
      spellTier: 0,
      spells: { learn: ['Shadow Blast', 'Summon Shadows'] },
      abilities: [
        {
          name: 'Conduit of Shadow',
          desc: 'Your Patron grants you knowledge of the Necrotic cantrips Shadow Blast and Summon Shadows. Your shadow minions follow the normal minion rules: 1 HP, no damage bonus, and they do not crit. You and your minions are different creatures, so you can attack once and command them to attack without the Rushed Attack penalty.',
        },
      ],
    },
    2: {
      schools: ['necrotic'],
      spellTier: 1,
      abilities: [
        {
          name: 'Master of Darkness',
          desc: 'Your Patron grants you knowledge of Necrotic cantrips and tier 1 spells.',
        },
        {
          name: 'Pilfered Power',
          desc: 'You may steal power from your patron to cast tiered spells, always casting them at the highest tier you have unlocked. You can do this DEX times before your patron takes notice. Each time you exceed this limit, your patron damages you for half your max HP. The limit resets when you commune with your patron during a Safe Rest.',
        },
      ],
    },
    3: {
      subclassChoice: true,
      abilities: [],
      choices: [
        poolChoice('lesser-invocation', 'THE PACT IS SEALED: choose 1 Lesser Shadow Invocation', [
          'lesser-invocations',
        ]),
      ],
    },
    4: {
      abilities: [],
      statIncrease: inc('INT', 'DEX'),
      choices: [
        poolChoice(
          'greater-invocation',
          'A Gift from the Master: choose 1 Greater Shadow Invocation',
          ['greater-invocations'],
        ),
      ],
    },
    5: {
      spellTier: 2,
      notes: [pactTierNote(2), UPGRADED_CANTRIPS],
      abilities: [],
      statIncrease: inc('STR', 'WIL'),
    },
    6: {
      abilities: [],
      choices: [greater(2, '2nd'), shadowmastery('Shadowmastery: choose 1 Necrotic Utility Spell')],
    },
    7: { spellTier: 3, notes: [pactTierNote(3)], abilities: [] },
    8: {
      abilities: [],
      statIncrease: inc('INT', 'DEX'),
      choices: [
        poolChoice(
          'lesser-invocation',
          'Lesser Invocation: choose a 2nd Lesser Shadow Invocation',
          ['lesser-invocations'],
        ),
      ],
    },
    9: {
      abilities: [],
      statIncrease: inc('STR', 'WIL'),
      choices: [
        shadowmastery('Shadowmastery (2): choose a 2nd Necrotic Utility Spell'),
        greater(3, '3rd'),
      ],
    },
    10: { spellTier: 4, notes: [pactTierNote(4), UPGRADED_CANTRIPS], abilities: [] },
    11: {
      abilities: [],
      choices: [
        poolChoice(
          'lesser-invocation',
          'Lesser Invocation (2): choose a 3rd Lesser Shadow Invocation',
          ['lesser-invocations'],
        ),
      ],
    },
    12: {
      abilities: [
        {
          name: 'Greedy Pact',
          desc: 'When you would take damage from Pilfer Power, make a STR save: 1–9 suffer damage as normal; 10–19 suffer only 10 HP of damage; 20+ suffer no damage and cast the spell as if it were 1 tier higher.',
        },
      ],
      statIncrease: inc('INT', 'DEX'),
    },
    13: { spellTier: 5, notes: [pactTierNote(5)], abilities: [], statIncrease: inc('STR', 'WIL') },
    14: {
      grantUtility: ['necrotic'],
      abilities: [{ name: 'Shadowmastery (3)', desc: 'You know all Necrotic Utility Spells.' }],
      choices: [greater(4, '4th')],
    },
    15: { notes: [UPGRADED_CANTRIPS], abilities: [] },
    16: { spellTier: 6, notes: [pactTierNote(6)], abilities: [], statIncrease: inc('INT', 'DEX') },
    17: {
      abilities: [
        {
          name: 'Dire Shadows',
          desc: 'Attacks against your shadow minions are made with disadvantage. They take no damage from successful saves.',
        },
      ],
      statIncrease: inc('STR', 'WIL'),
    },
    18: { abilities: [], choices: [greater(5, '5th')] },
    19: { spellTier: 7, notes: [pactTierNote(7)], abilities: [], choices: [EPIC_BOON] },
    20: {
      notes: [UPGRADED_CANTRIPS],
      abilities: [
        {
          name: 'Eldritch Usurper',
          desc: 'Whenever you summon a single shadow minion, summon 2 instead. They die only when they receive 12 or more damage at one time.',
        },
      ],
      statIncrease: CAPSTONE_STATS,
    },
  },
  subclasses: [
    {
      slug: 'red-dragon',
      name: 'Pact of the Red Dragon',
      tagline: 'flaming wyrmling shadows',
      levels: {
        3: {
          schools: ['fire'],
          abilities: [
            {
              name: 'Draconic Crimson Rite',
              desc: 'Your Patron grants you knowledge of Fire spells. Your shadow minions become flaming dragon wyrmling shadows. Your Shadow Blast and minions can deal fire or necrotic damage and inflict Smoldering whenever they would crit.',
            },
          ],
        },
        7: {
          abilities: [
            {
              name: 'We’ll ALL Burn!',
              desc: 'You may cast Pyroclasm without Pilfering Power by including yourself in the damage. You have advantage on the save.',
            },
          ],
          choices: [
            {
              id: 'red-dragon-utility',
              label: 'Choose 1 Fire Utility Spell',
              count: 1,
              source: { kind: 'utility', schools: ['fire'] },
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'Heart of Burning Fire',
              desc: 'Regain 1 use of Pilfered Power each time you roll Initiative. This expires at the end of combat if unused.',
            },
          ],
        },
        15: {
          abilities: [
            { name: 'Enveloped by the Master', desc: 'Gain 1d4 Wounds to cast Dragonform.' },
          ],
        },
      },
    },
    {
      slug: 'abyssal-depths',
      name: 'Pact of the Abyssal Depths',
      tagline: 'nightfrost from the deep',
      levels: {
        3: {
          schools: ['ice'],
          abilities: [
            {
              name: 'Master of Nightfrost',
              desc: 'Your Patron grants you knowledge of Ice spells. You can breathe underwater. Your shadow minions become beings of nightfrost. Your Shadow Blast and minions can deal cold or necrotic damage, and whenever they would crit, you gain INT+LVL temp HP.',
            },
          ],
        },
        7: {
          abilities: [
            {
              name: 'Shadowfrost',
              desc: 'Your Shadow Blast also Slows. You can cast Cryosleep or Rimeblades without Pilfering Power by expending 10 temp HP.',
            },
          ],
          choices: [
            {
              id: 'abyssal-utility',
              label: 'Choose 1 Ice Utility Spell',
              count: 1,
              source: { kind: 'utility', schools: ['ice'] },
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'Glacial Resilience',
              desc: '(1/Safe Rest) Reaction (whenever you are attacked or would gain a condition): gain 10×LVL temp HP and end ALL negative conditions on yourself. At the end of your next turn, any remaining temp HP are lost.',
            },
          ],
        },
        15: {
          abilities: [
            {
              name: 'Cryomancer’s Reprisal',
              desc: 'Pay half your max HP to cast ANY Ice spell. Afterwards you gain an invisible aura: the next creature that hits you with a melee attack this encounter takes cold damage equal to half the HP you spent.',
            },
          ],
        },
      },
    },
    {
      slug: 'reaver',
      name: 'Reaver',
      tagline: 'cast aside, born anew',
      story: true,
      introSpells: { lose: ['Shadow Blast'], learn: ['Bonescythe'] },
      intro: [
        {
          name: 'Hollow One',
          desc: 'Cut off from your patron, you can no longer cast Shadow Blast or cast tiered spells using Pilfered Power. As a parting token, you stole a secret from your patron: the Bonescythe.',
        },
      ],
      levels: {
        3: {
          abilities: [
            {
              name: 'Shadow Exploit',
              desc: 'Sacrifice a shadow minion to cast a spell at the highest tier you have unlocked. Each subsequent spell you cast this encounter costs 1 additional minion.',
            },
            {
              name: 'Martyr Spawn',
              desc: 'Whenever you Defend, you can sacrifice a shadow minion to take no damage.',
            },
          ],
        },
        7: {
          abilities: [
            {
              name: 'Grim Harrow',
              desc: 'When you strike with your Bonescythe, you may divide the dice as you choose among any number of adjacent targets within Reach.',
            },
            {
              name: 'Reap',
              desc: 'When your Bonescythe crits, or kills a creature, summon a shadow minion for free.',
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'My Blood, My Power',
              desc: 'You may take 1 Wound to cast a tiered spell you know at the highest tier you have unlocked.',
            },
            {
              name: 'Otherworldly Might',
              desc: 'Advantage on concentration checks if you have any shadow minions.',
            },
          ],
        },
        15: {
          abilities: [
            {
              name: 'I’m the Patron Now!',
              desc: 'Summon 2 shadow minions for free when you roll Initiative.',
            },
          ],
        },
      },
    },
  ],
}
