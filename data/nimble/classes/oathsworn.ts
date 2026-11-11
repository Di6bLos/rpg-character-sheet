// Nimble Heroes, Oathsworn (pp. 36–41) and the Oathbreaker story subclass (pp. 74–75).
import type { ClassDef } from '../types'
import { CAPSTONE_STATS, EPIC_BOON, UPGRADED_CANTRIPS, inc, poolChoice, tierNote } from './shared'

const decree = (n: number, ordinal: string) =>
  poolChoice('sacred-decree', `Sacred Decree (${n}): learn a ${ordinal} Sacred Decree`, [
    'sacred-decrees',
  ])

const radiance = (label: string) => ({
  id: 'master-of-radiance',
  label,
  count: 1,
  source: { kind: 'utility' as const, schools: ['radiant' as const] },
})

export const oathsworn: ClassDef = {
  slug: 'oathsworn',
  name: 'Oathsworn',
  tagline: 'Faithful guardian, protector, and avenger of the weak.',
  description:
    'I will protect my companions and vanquish evil at all costs. Zealous, holy warriors who have attained great physical and radiant strength through absolute devotion to their oaths. The mark of a true Oathsworn is their willingness to lay down their life for their friends.',
  highlights: [
    'Defend with Devotion: shield your allies and channel righteous judgment.',
    'Divinely Protect: stand as a bastion of defense, safeguarding allies even from afar.',
    'Shine as a Beacon of Virtue: mend wounds and discern truth from ill intent.',
  ],
  complexity: 2,
  keyStats: ['STR', 'WIL'],
  hitDie: 10,
  startingHp: 17,
  saveAdv: 'STR',
  saveDis: 'DEX',
  armor: 'All Armor',
  weapons: 'STR Weapons',
  startingGear: [
    { name: 'Mace', qty: '1' },
    { name: 'Rusty Mail', qty: '1' },
    { name: 'Wooden Buckler', qty: '1' },
    { name: 'Manacles', qty: '1' },
  ],
  startingWeapons: ['Mace'],
  armorCalc: { base: 6, dexMax: 2, shield: 2 },
  mana: { label: 'WIL+LVL', stat: 'WIL', mult: 1 },
  swapRule: {
    name: 'Serve Selflessly',
    desc: 'Whenever you perform a notable selfless act during a Safe Rest, you may choose different Oathsworn options available to you.',
  },
  pools: [
    {
      id: 'sacred-decrees',
      name: 'Sacred Decrees',
      options: [
        {
          name: 'Blinding Aura',
          desc: '(1/Safe Rest) Action: Enemies in your aura are Blinded until the end of their next turn.',
        },
        {
          name: 'Courage!',
          desc: '(1/encounter) When you or an ally in your aura would drop to 0 HP, set their HP to 1 instead.',
        },
        {
          name: 'Explosive Judgment',
          desc: '(1/encounter) 2 actions: Expend your Judgment Dice, deal that much radiant damage to all enemies in your aura.',
        },
        { name: 'Improved Aura', desc: '+2 aura Reach.' },
        {
          name: 'Radiant Aura',
          desc: 'Action: End any single harmful condition or effect on yourself or another willing creature within your aura (ending Dying grants 1 HP, ending Dazed grants 1 action, etc.). You may use this ability WIL times/Safe Rest.',
        },
        {
          name: 'Reliable Justice',
          desc: 'Whenever you roll Judgment Dice, roll with advantage (roll one extra and drop the lowest).',
        },
        {
          name: 'Shining Mandate',
          desc: 'The first time each round you are attacked while you already have Judgment Dice, select an ally within your aura to roll one and apply it to their next attack. You have advantage on skill checks to see through illusions.',
        },
        {
          name: 'Stand Fast, Friends!',
          desc: 'When you roll Initiative, grant allies temp HP equal to your STR+WIL. You and allies within your aura have advantage against fear and effects that would move or knock Prone.',
        },
        {
          name: 'Unstoppable Protector',
          desc: 'Gain +1 speed. You may Interpose even if you are restrained, stunned, or otherwise incapacitated. If you Interpose for a non-combatant NPC, you may Interpose again this round.',
        },
        { name: 'Well Armored', desc: 'Whenever you Interpose, gain temp HP equal to your STR.' },
      ],
    },
  ],
  levels: {
    1: {
      abilities: [
        {
          name: 'Radiant Judgment',
          desc: 'Whenever an enemy attacks you, if you have no Judgment Dice, roll your Judgment Dice (2d6). On your next melee attack this encounter, if you hit, deal that much additional radiant damage. The dice are expended whether you hit or miss.',
        },
        {
          name: 'Lay on Hands',
          desc: 'Gain a magical pool of healing power. Its maximum is always 5×LVL and it recharges on a Safe Rest. Action: Touch a target and spend any amount of remaining healing power to restore that many HP.',
        },
      ],
    },
    2: {
      schools: ['radiant'],
      spellTier: 1,
      abilities: [
        {
          name: 'Mana and Radiant Spellcasting',
          desc: 'You know Radiant cantrips and tier 1 Radiant spells, and gain a mana pool equal to WIL+LVL that recharges on a Safe Rest.',
        },
        {
          name: 'Zealot',
          desc: 'Whenever you attack with a melee weapon, you may spend mana (up to your highest unlocked spell tier) to choose one for each mana spent: Condemning Strike (deal +5 radiant damage) or Blessed Aim (decrease your target’s armor by 1 step for this attack).',
        },
        {
          name: 'Paragon of Virtue',
          desc: 'Advantage on Influence checks to convince someone when you are forthrightly telling the truth, disadvantage when misleading.',
        },
      ],
    },
    3: {
      subclassChoice: true,
      abilities: [{ name: 'Radiant Judgment (2)', desc: 'Your Judgment Dice are d8s.' }],
      choices: [
        poolChoice('sacred-decree', 'Sacred Decree: learn 1 Sacred Decree', ['sacred-decrees']),
      ],
    },
    4: {
      spellTier: 2,
      notes: [tierNote(2)],
      abilities: [{ name: 'My Life, for My Friends', desc: 'You can Interpose for free.' }],
      statIncrease: inc('STR', 'WIL'),
    },
    5: {
      notes: [UPGRADED_CANTRIPS],
      abilities: [{ name: 'Radiant Judgment (3)', desc: 'Your Judgment Dice are d10s.' }],
      statIncrease: inc('DEX', 'INT'),
    },
    6: { spellTier: 3, notes: [tierNote(3)], abilities: [], choices: [decree(2, '2nd')] },
    7: { abilities: [], choices: [radiance('Master of Radiance: choose 1 Radiant Utility Spell')] },
    8: {
      spellTier: 4,
      notes: [tierNote(4)],
      abilities: [{ name: 'Radiant Judgment (4)', desc: 'Your Judgment Dice are d12s.' }],
      statIncrease: inc('STR', 'WIL'),
    },
    9: { abilities: [], statIncrease: inc('DEX', 'INT'), choices: [decree(3, '3rd')] },
    10: {
      spellTier: 5,
      notes: [tierNote(5), UPGRADED_CANTRIPS],
      abilities: [{ name: 'Radiant Judgment (5)', desc: 'Your Judgment Dice are d20s.' }],
    },
    11: {
      abilities: [],
      choices: [radiance('Master of Radiance (2): choose a 2nd Radiant Utility Spell')],
    },
    12: { abilities: [], statIncrease: inc('STR', 'WIL'), choices: [decree(4, '4th')] },
    13: { spellTier: 6, notes: [tierNote(6)], abilities: [], statIncrease: inc('DEX', 'INT') },
    14: {
      abilities: [
        { name: 'Radiant Judgment (6)', desc: 'Whenever you roll Judgment Dice, roll 1 more.' },
      ],
      choices: [decree(5, '5th')],
    },
    15: { notes: [UPGRADED_CANTRIPS], abilities: [] },
    16: { abilities: [], statIncrease: inc('STR', 'WIL'), choices: [decree(6, '6th')] },
    17: { spellTier: 7, notes: [tierNote(7)], abilities: [], statIncrease: inc('DEX', 'INT') },
    18: {
      abilities: [
        {
          name: 'Unending Judgment',
          desc: 'While you have no Judgment Dice, gain +5 damage to melee attacks.',
        },
      ],
    },
    19: { abilities: [], choices: [EPIC_BOON] },
    20: {
      notes: [UPGRADED_CANTRIPS],
      abilities: [{ name: 'Glorious Paragon', desc: 'Defend for free whenever you Interpose.' }],
      statIncrease: CAPSTONE_STATS,
    },
  },
  subclasses: [
    {
      slug: 'vengeance',
      name: 'Oath of Vengeance',
      tagline: 'merciless avenger',
      levels: {
        3: {
          abilities: [
            {
              name: 'Aura of Zeal',
              desc: 'Whenever you roll Judgment Dice, roll 1 more. Gain an aura with a Reach of 4. Your Radiant Judgment also triggers when an ally within your aura is attacked while you have no Judgment Dice.',
            },
          ],
        },
        7: {
          abilities: [
            {
              name: 'Avenger',
              desc: 'Whenever you or an ally within your aura gain any Wounds, change up to that many Judgment Dice to their max. Then, move up to half your speed for free.',
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'Unerring Judgment',
              desc: 'Increase your primary die rolls on melee attacks by 1 whenever you have Judgment Dice.',
            },
          ],
        },
        15: {
          abilities: [
            {
              name: 'Maximum Judgment',
              desc: 'Whenever you are attacked, set a Judgment Die to its max.',
            },
          ],
        },
      },
    },
    {
      slug: 'refuge',
      name: 'Oath of Refuge',
      tagline: 'vigilant protector',
      levels: {
        3: {
          abilities: [
            {
              name: 'Aura of Refuge',
              desc: 'Your shields gain +WIL armor and count as your spellcasting focus. Gain an aura with a Reach of 4; you can Interpose for an ally anywhere within your aura.',
            },
          ],
        },
        7: {
          abilities: [
            {
              name: 'Face Me, Foul Creature!',
              desc: 'When you Interpose, the attacking enemy is also Taunted by you until the end of their next turn.',
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'Glorious Reprieve',
              desc: 'You and allies in your aura cannot drop below 1 HP. Whenever this triggers, they gain 1 Wound instead (heroes still die at max Wounds).',
            },
          ],
        },
        15: {
          abilities: [
            { name: 'Divine Grace', desc: 'You are resistant to all damage while Interposing.' },
          ],
        },
      },
    },
    {
      slug: 'oathbreaker',
      name: 'Oathbreaker',
      tagline: 'fallen, seeking redemption',
      story: true,
      utilityExtra: ['necrotic'],
      replacesAbilities: ['Paragon of Virtue'],
      introSpells: {
        lose: ['True Strike', 'Heal', 'Warding Bond'],
        learn: ['Entice', 'Shadow Trap', 'Dread Visage'],
      },
      intro: [
        {
          name: 'Dark Benediction',
          desc: 'Fallen from the light, but not entirely. You lose access to the Radiant spells True Strike, Heal, and Warding Bond, and gain the Necrotic spells Entice, Shadow Trap, and Dread Visage. Whenever you can choose a Utility Spell, you may choose a Radiant or Necrotic one.',
        },
        {
          name: 'Paragon of Power',
          desc: '(Replaces Paragon of Virtue) Advantage on Might checks when attempting to intimidate others.',
        },
        {
          name: 'Aura of Suffering',
          desc: 'You gain an aura with a Reach of 4 and can Interpose for an ally anywhere within it; however, your Radiant Judgment no longer triggers when attacked. Instead, it triggers whenever you could Interpose but don’t.',
        },
      ],
      levels: {
        3: {
          woundsMax: 2,
          abilities: [
            {
              name: 'We All Suffer',
              desc: 'Gain +2 max Wounds. When an ally within your aura would gain any Wounds or fail a save, you may suffer the effect instead and trigger your Radiant Judgment ability.',
            },
            {
              name: 'Bring Me Your Pain',
              desc: 'Reaction (when a willing ally within your aura would drop to 0 HP): Switch HP with them (if your current HP is higher than their max HP, they gain temp HP equal to the difference), dropping to 0 HP and gaining the Wound instead.',
            },
          ],
        },
        7: {
          abilities: [
            {
              name: 'Torment',
              desc: 'Your Lay on Hands heals you for twice as much, and others for half as much. When you deal damage, you can expend healing power from your Lay on Hands pool to increase the damage by the points spent (ignoring armor).',
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'Exploit',
              desc: 'Reaction (whenever an ally within your aura Defends): you may expend your Judgment Dice to force an enemy within your aura to Interpose (a creature cannot interpose against its own attack).',
            },
          ],
        },
        15: {
          abilities: [
            {
              name: 'Bloody Terror',
              desc: 'Attacks against you gain 1 instance of disadvantage for each Wound you have (max 3).',
            },
          ],
        },
      },
    },
  ],
}
