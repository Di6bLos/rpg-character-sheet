// Nimble Heroes, Shepherd (pp. 48–53).
import type { ChoiceDef, ClassDef, SpellSchool } from '../types'
import { CAPSTONE_STATS, EPIC_BOON, UPGRADED_CANTRIPS, inc, poolChoice, tierNote } from './shared'

const twilight = (school: SpellSchool, label: string): ChoiceDef => ({
  id: `master-of-twilight-${school}`,
  label,
  count: 1,
  source: { kind: 'utility', schools: [school] },
})

const grace = (n: number, ordinal: string) =>
  poolChoice('sacred-grace', `Sacred Grace (${n}): choose a ${ordinal} Sacred Grace`, [
    'sacred-graces',
  ])

export const shepherd: ClassDef = {
  slug: 'shepherd',
  name: 'Shepherd',
  tagline: 'Master life and death. Lead a faithful companion.',
  description:
    'Let all who are afflicted come. Shepherds revere the gifts of life and death, a beacon of light to those ensnared in darkness, and darkness to those who deem themselves the light. Their Lifebinding Spirits are steadfast companions in that stewardship.',
  highlights: [
    'Embrace the Balance: wield Radiant and Necrotic spells. Will the scales tip toward healing or harm?',
    'Lead a Faithful Companion: summon a Lifebinding Spirit that heals allies or smites foes.',
  ],
  complexity: 2,
  keyStats: ['WIL', 'STR'],
  hitDie: 10,
  startingHp: 17,
  saveAdv: 'WIL',
  saveDis: 'DEX',
  armor: 'Mail Armor, Shields',
  weapons: 'STR Weapons, Wands',
  startingGear: [
    { name: 'Rusty Mail', qty: '1' },
    { name: 'Mace', qty: '1' },
    { name: 'Wooden Buckler', qty: '1' },
    { name: 'Bell', qty: '1' },
  ],
  startingWeapons: ['Mace'],
  armorCalc: { base: 6, dexMax: 2, shield: 2 },
  mana: { label: '(WIL×3)+LVL', stat: 'WIL', mult: 3 },
  swapRule: {
    name: 'Serve',
    desc: 'After spending a day tending to a sacred place or serving others during a Safe Rest, you may choose different Shepherd options available to you.',
  },
  pools: [
    {
      id: 'sacred-graces',
      name: 'Sacred Graces',
      options: [
        {
          name: 'Assist Me, My Friend!',
          desc: 'Whenever you make your first melee attack each round, you may add your Lifebinding Spirit’s damage to the attack.',
        },
        {
          name: 'Empowered Companion',
          desc: 'Whenever you spend mana to call forth your Lifebinding Spirit, you cast it as if you spent 1 additional mana (ignoring the typical spell tier restrictions). The maximum die size is now a d20.',
        },
        {
          name: 'Guiding Spirit',
          desc: 'When your Lifebinding Spirit rolls a 6 or higher on its damage die, the target begins to glow with radiant light. The next attack against that target has advantage.',
        },
        {
          name: 'Hasty Companion',
          desc: '+4 Reach for your Lifebinding Spirit. It can also act for free when summoned.',
        },
        {
          name: 'Illuminate Soul',
          desc: 'Action: A creature within 6 spaces begins to glow with radiant light. For 1 round, attacks against them are made with your choice of advantage or disadvantage. You may do this WIL times per Safe Rest.',
        },
        {
          name: 'Light Bearer',
          desc: 'Regain 1 use of Searing Light when you roll Initiative (this expires if unspent at the end of combat).',
        },
        {
          name: 'Not Beyond MY Reach',
          desc: 'You may target creatures who have been dead less than 1 round for healing. For every 10 HP a dead creature is healed this way, you may have them recover 1 Wound instead (you must heal at least 1 Wound to revive them).',
        },
        {
          name: 'Vengeful Spirit',
          desc: 'Action: Your Lifebinding Spirit sacrifices itself to become a swirling vortex of radiant light. At the end of your turn, it damages all enemies within 3 spaces of you, ignoring armor and cover. This lasts for a number of rounds equal to the healing charges left on the spirit, and ends early if you summon your spirit again.',
        },
      ],
    },
  ],
  levels: {
    1: {
      schools: ['radiant', 'necrotic'],
      spellTier: 0,
      abilities: [
        { name: 'Keeper of Life & Death', desc: 'You know Radiant and Necrotic cantrips.' },
        {
          name: 'Searing Light',
          desc: '(WIL times/Safe Rest) Action: Heal WIL d8 HP to a Dying creature within Reach 6, OR inflict WIL d8 radiant damage to an undead or Bloodied enemy within Reach 6.',
        },
      ],
    },
    2: {
      spellTier: 1,
      abilities: [
        {
          name: 'Mana and Unlock Tier 1 Spells',
          desc: 'You unlock tier 1 Radiant and Necrotic spells and gain a mana pool to cast them. Its maximum is always (WIL×3)+LVL and it recharges on a Safe Rest.',
        },
        {
          name: 'Lifebinding Spirit',
          desc: '(Radiant spell, tier 1) Summon a spirit companion that follows you and is immune to harm; it can take the form of any small friendly animal (give it a name!). It shares your action pool but counts as a different creature, so you can each attack once without Rushed Attacks every round.',
        },
      ],
    },
    3: {
      subclassChoice: true,
      abilities: [],
      choices: [
        twilight('necrotic', 'Master of Twilight: choose 1 Necrotic Utility Spell'),
        twilight('radiant', 'Master of Twilight: choose 1 Radiant Utility Spell'),
      ],
    },
    4: { spellTier: 2, notes: [tierNote(2)], abilities: [], statIncrease: inc('WIL', 'STR') },
    5: {
      notes: [UPGRADED_CANTRIPS],
      abilities: [],
      statIncrease: inc('INT', 'DEX'),
      choices: [
        poolChoice('sacred-grace', 'Sacred Grace: choose 2 Sacred Graces', ['sacred-graces'], 2),
      ],
    },
    6: {
      spellTier: 3,
      notes: [tierNote(3)],
      abilities: [],
      choices: [
        twilight('necrotic', 'Master of Twilight (2): choose a 2nd Necrotic Utility Spell'),
        twilight('radiant', 'Master of Twilight (2): choose a 2nd Radiant Utility Spell'),
      ],
    },
    7: { abilities: [] },
    8: { spellTier: 4, notes: [tierNote(4)], abilities: [], statIncrease: inc('WIL', 'STR') },
    9: { abilities: [], statIncrease: inc('INT', 'DEX'), choices: [grace(2, '3rd')] },
    10: { spellTier: 5, notes: [tierNote(5), UPGRADED_CANTRIPS], abilities: [] },
    11: {
      grantUtility: ['necrotic', 'radiant'],
      abilities: [
        {
          name: 'Master of Twilight (3)',
          desc: 'You know all Necrotic and Radiant Utility Spells.',
        },
      ],
    },
    12: { spellTier: 6, notes: [tierNote(6)], abilities: [], statIncrease: inc('WIL', 'STR') },
    13: { abilities: [], statIncrease: inc('INT', 'DEX'), choices: [grace(3, '4th')] },
    14: { spellTier: 7, notes: [tierNote(7)], abilities: [] },
    15: { notes: [UPGRADED_CANTRIPS], abilities: [] },
    16: { spellTier: 8, notes: [tierNote(8)], abilities: [], statIncrease: inc('WIL', 'STR') },
    17: {
      abilities: [
        {
          name: 'Revitalizing Blessing',
          desc: '(1/round) Whenever you roll a 6 or higher on one or more healing dice, the target may recover one Wound.',
        },
      ],
      statIncrease: inc('INT', 'DEX'),
    },
    18: { spellTier: 9, notes: [tierNote(9)], abilities: [] },
    19: { abilities: [], choices: [EPIC_BOON] },
    20: {
      notes: [UPGRADED_CANTRIPS],
      abilities: [
        { name: 'Twilight Sage', desc: 'Your Lifebinding Spirit rolls twice as many dice.' },
      ],
      statIncrease: CAPSTONE_STATS,
    },
  },
  subclasses: [
    {
      slug: 'mercy',
      name: 'Luminary of Mercy',
      tagline: 'nurturing light',
      levels: {
        3: {
          abilities: [
            {
              name: 'Merciful Healing',
              desc: 'When an effect caused by you heals a Dying creature, they are healed for twice as much. (1/round) Your Lifebinding Spirit can act for free while you are Dying.',
            },
            {
              name: 'Life is Beautiful',
              desc: 'Harmless and lovely creatures such as butterflies and hummingbirds are attracted to your presence and often follow you. Flowers bloom more vibrantly near you.',
            },
          ],
        },
        7: {
          abilities: [
            {
              name: 'Conduit of Light',
              desc: 'When an effect caused by you would heal HP, you may expend 1 use of Searing Light to heal (or damage, ignoring armor) another target within 6 spaces of yourself for the same amount.',
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'Powerful Healer',
              desc: '(WIL times/Safe Rest) Whenever you would roll dice to heal damage, you may instead heal the max amount you could roll, or give that many temp HP.',
            },
          ],
        },
        15: {
          abilities: [
            {
              name: 'Empowered Conduit',
              desc: 'Your Conduit of Light may target 1 additional creature. Regain 1 charge of Searing Light when you roll Initiative (this expires if unspent at the end of combat).',
            },
          ],
        },
      },
    },
    {
      slug: 'malice',
      name: 'Luminary of Malice',
      tagline: 'ruinous harbinger of decay',
      levels: {
        3: {
          abilities: [
            {
              name: 'Soul Reaper',
              desc: 'When you use Searing Light to harm an enemy, make a 2nd enemy within range take the same amount of damage (ignoring armor).',
            },
            {
              name: 'Harbinger of Decay',
              desc: 'Vibrant colors and lovely smells are suppressed near you, food spoils faster, and flies find you wherever you lodge. Your Lifebinding Spirit may shift into a deathly version of itself (a zombie dog, a devious imp…) with necrotic damage.',
            },
          ],
        },
        7: {
          abilities: [
            {
              name: 'Veilwalker’s Blessing',
              desc: '(1/Safe Rest) Reaction (when you would drop to 0 HP): drop to 1 HP instead and force an enemy within 6 spaces to make a STR save. On a failure, they become Bloodied, or if they are already Bloodied, they drop to 0 HP.',
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'Deathbringer’s Touch',
              desc: 'Your first melee attack each round against a Bloodied creature is an automatic critical hit. Your Lifebinding Spirit deals additional damage equal to your STR.',
            },
          ],
        },
        15: {
          abilities: [
            {
              name: 'Conduit of Death',
              desc: 'Your Veilwalker’s Blessing recharges when you roll Initiative. This charge is lost if unspent at the end of combat.',
            },
          ],
        },
      },
    },
  ],
}
