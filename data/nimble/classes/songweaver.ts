// Nimble Heroes, Songweaver (pp. 54–59).
import type { ChoiceDef, ClassDef } from '../types'
import { CAPSTONE_STATS, EPIC_BOON, UPGRADED_CANTRIPS, inc, poolChoice, tierNote } from './shared'

const windbag = (label: string): ChoiceDef => ({
  id: 'windbag',
  label,
  count: 'perSchool',
  source: { kind: 'utility', schools: 'known' },
})

const lyrical = (n: number, ordinal: string) =>
  poolChoice(
    'lyrical-weaponry',
    `Lyrical Weaponry (${n}): choose a ${ordinal} ability from the Lyrical Weaponry list`,
    ['lyrical-weaponry'],
  )

export const songweaver: ClassDef = {
  slug: 'songweaver',
  name: 'Songweaver',
  tagline: 'Inspiring presence, sharp wit, sharper tongue.',
  description:
    'Just TRY and resist my charm… wait—NO, don’t! A muse’s spark fuels a sharp wit, relentless humor, or moving art. Songweavers bolster their allies, redirect attacks, and make their enemies’ brains leak out through their ears.',
  highlights: [
    'Charm the hapless people you meet and inspire allies to fantastic heroism.',
    'Use Lyrical Weaponry to dominate enemies and call special friends to your aid.',
    'Control the battlefield: make allies and enemies alike dance to your tune.',
  ],
  complexity: 3,
  keyStats: ['WIL', 'INT'],
  hitDie: 8,
  startingHp: 13,
  saveAdv: 'WIL',
  saveDis: 'STR',
  armor: 'Cloth, Leather',
  weapons: 'DEX, Wands',
  startingGear: [
    { name: 'Adventurer’s Garb', qty: '1' },
    { name: 'Instrument', qty: '1' },
    { name: 'Dagger', qty: '1' },
    { name: 'Mirror', qty: '1' },
  ],
  startingWeapons: ['Dagger'],
  armorCalc: { base: 2 },
  mana: { label: '(INT×3)+LVL', stat: 'INT', mult: 3 },
  swapRule: {
    name: 'Perform!',
    desc: 'Whenever you perform in a place that inspires you, or exchange barbs with another competent wordsmith during a Safe Rest, you may choose different Songweaver options available to you.',
  },
  pools: [
    {
      id: 'lyrical-weaponry',
      name: 'Lyrical Weaponry',
      options: [
        {
          name: 'Heroic Ballad',
          desc: '+2 max Songweaver’s Inspiration charges. When used to reroll an ally’s attack, your Songweaver’s Inspiration also grants them +WIL damage on the attack.',
        },
        {
          name: 'Inspiring Anthem',
          desc: '(1/encounter) Action: Grant all friendly Dying creatures who can hear you 1 HP and 1 action.',
        },
        {
          name: 'Not My Beautiful Faaace!',
          desc: '(1/encounter) When you Defend, force the attacker to choose another target within range on a failed WIL save (if there is none, the attack fails). If they fail by 5 or more, they attack themselves! On a save, they attack you with disadvantage.',
        },
        {
          name: 'Rhapsody of the Normal',
          desc: 'When you roll 4 or more on your Vicious Mockery, you may spend a Songweaver’s Inspiration charge to suppress the target’s special abilities until the end of their next turn: they can only attack once for 1d4 damage and move up to 6 spaces (no armor, spellcasting, flying, regeneration, or other features).',
        },
        {
          name: 'Song of Domination',
          desc: '(1/encounter) 2 actions: All enemies within 6 spaces who hear your bewitching tune must make a WIL save. If they fail, you move them up to 6 spaces in any direction, and they cannot move on their next turn.',
        },
      ],
    },
    {
      id: 'people-person',
      name: 'A “People” Person',
      note: 'Each friend can be summoned via song 1/Safe Rest. You can work with your GM to swap these for your own creations.',
      options: [
        {
          name: 'Stompy',
          desc: '3 actions: Summon a huge hill giant for 1 round. As he enters adjacent to you, use Stompy’s Stomp: make a DC 10 Influence check. On a success, he moves 6 spaces in a direction you choose; on a failure, he moves towards YOU (“YOU NOT FRIEND!”). He deals everything in his path damage equal to LVL+Influence check. ANY creature within 6 spaces of Stompy can use this ability once instead of an attack.',
        },
        {
          name: 'Mal, the Malevolent Imp',
          desc: 'Summon a tiny fiend for 1 night. He can find out dangerous information you have no right to know, or “take care” of a problem with only the slightest chance of things going wrong. Make an Influence check to convince him (advantage for mischievous or fun requests; disadvantage for good or menial ones).',
        },
        {
          name: 'Gran Gran (NOT a hag)',
          desc: 'When resting, summon her for 1 hour to soothe your wounds (and hassle you for not eating enough). She hands out pastries equal to your WIL+INT; eating one recovers one mana, Hit Die, or Wound. They expire in 10 minutes.',
        },
        {
          name: 'Linos, the Everfriendly',
          desc: 'Summon a legendary flying (but friendly) creature to take you and your party wherever you need to go. He may request a very large amount of food as payment.',
        },
      ],
    },
  ],
  levels: {
    1: {
      schools: ['wind'],
      spellTier: 0,
      abilities: [
        {
          name: 'Wind Spellcasting and…',
          desc: 'You know cantrips from the Wind school and 1 other school of your choice, plus the cantrip Vicious Mockery (Range 12, 1d4+INT psychic ignoring armor; on hit the target is Taunted during their next turn).',
        },
        {
          name: 'Songweaver’s Inspiration',
          desc: '(2×WIL times/Safe Rest) Free Reaction: Allow an ally to reroll a single die related to an attack or save (must keep either result).',
        },
      ],
      choices: [
        {
          id: 'second-school',
          label: 'Choose 1 other spell school',
          count: 1,
          source: { kind: 'school', schools: ['fire', 'ice', 'lightning', 'radiant', 'necrotic'] },
        },
      ],
    },
    2: {
      spellTier: 1,
      abilities: [
        {
          name: 'Mana and Unlock Tier 1 Spells',
          desc: 'You unlock tier 1 spells in the schools you know and gain a mana pool to cast them. Its maximum is always (INT×3)+LVL and it recharges on a Safe Rest.',
        },
        {
          name: 'Jack of All Trades',
          desc: 'When you Safe Rest, you may move a skill point as if you just leveled up.',
        },
        {
          name: 'Song of Rest',
          desc: '(1/day) Whenever you Field Rest, you may play a song and allow anyone who spends Hit Dice to heal additional HP equal to your WIL.',
        },
      ],
    },
    3: {
      subclassChoice: true,
      abilities: [
        {
          name: 'Quick Wit',
          desc: 'When you roll Initiative, you may regain 2 spent uses of your Songweaver’s Inspiration (these expire at the end of combat if left unused).',
        },
      ],
      choices: [windbag('Windbag: choose 1 Utility Spell from each spell school you know')],
    },
    4: {
      spellTier: 2,
      notes: [tierNote(2)],
      abilities: [],
      statIncrease: inc('WIL', 'INT'),
      choices: [
        poolChoice(
          'lyrical-weaponry',
          'Lyrical Weaponry: choose 1 ability from the Lyrical Weaponry list',
          ['lyrical-weaponry'],
        ),
      ],
    },
    5: {
      notes: [UPGRADED_CANTRIPS],
      abilities: [
        {
          name: 'A “People” Person',
          desc: 'You’ve met many people in your travels; some have agreed to come to your aid should you need it. You can temporarily summon your chosen friends via song (1/Safe Rest each).',
        },
      ],
      statIncrease: inc('STR', 'DEX'),
      choices: [
        poolChoice(
          'people-person',
          'A “People” Person: choose 2 friends you know',
          ['people-person'],
          2,
        ),
      ],
    },
    6: {
      spellTier: 3,
      notes: [tierNote(3)],
      abilities: [],
      choices: [windbag('Windbag (2): choose a 2nd Utility Spell from each spell school you know')],
    },
    7: { abilities: [] },
    8: { spellTier: 4, notes: [tierNote(4)], abilities: [], statIncrease: inc('WIL', 'INT') },
    9: { abilities: [], statIncrease: inc('STR', 'DEX'), choices: [lyrical(2, '2nd')] },
    10: { spellTier: 5, notes: [tierNote(5), UPGRADED_CANTRIPS], abilities: [] },
    11: { abilities: [] },
    12: { spellTier: 6, notes: [tierNote(6)], abilities: [], statIncrease: inc('WIL', 'INT') },
    13: { abilities: [], statIncrease: inc('STR', 'DEX'), choices: [lyrical(3, '3rd')] },
    14: {
      spellTier: 7,
      notes: [tierNote(7)],
      grantUtility: 'known',
      abilities: [
        {
          name: 'Windbag (3)',
          desc: 'You know all Utility Spells from the spell schools you know.',
        },
      ],
    },
    15: { notes: [UPGRADED_CANTRIPS], abilities: [] },
    16: { spellTier: 8, notes: [tierNote(8)], abilities: [], statIncrease: inc('WIL', 'INT') },
    17: { abilities: [], statIncrease: inc('STR', 'DEX'), choices: [lyrical(4, '4th')] },
    18: { spellTier: 9, notes: [tierNote(9)], abilities: [] },
    19: { abilities: [], choices: [EPIC_BOON] },
    20: {
      notes: [UPGRADED_CANTRIPS],
      abilities: [
        {
          name: 'I’m So Famous!',
          desc: 'Your Songweaver’s Inspiration cannot fail (your target succeeds).',
        },
      ],
      statIncrease: CAPSTONE_STATS,
    },
  },
  subclasses: [
    {
      slug: 'snark',
      name: 'Herald of Snark',
      tagline: 'sharper tongue, deadlier barbs',
      levels: {
        3: {
          abilities: [
            {
              name: 'Opportunistic Snark',
              desc: 'Reaction (when an enemy within Range 12 misses an attack): you may cast Vicious Mockery at them; it deals double damage when cast this way.',
            },
          ],
        },
        7: {
          abilities: [
            {
              name: 'Fight Picker',
              desc: '(1/turn) When an enemy is damaged by your Vicious Mockery, you may have one of your allies Taunt them until the end of the enemy’s turn instead.',
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'Chord of Chaos',
              desc: '(1/encounter) Action: You may move ALL creatures within hearing of your song up to 3 spaces as long as they do not move into an obviously dangerous place.',
            },
          ],
        },
        15: {
          abilities: [
            {
              name: 'Words Like Swords',
              desc: 'Your Vicious Mockery damage becomes 1d6+INT+WIL.',
            },
          ],
        },
      },
    },
    {
      slug: 'courage',
      name: 'Herald of Courage',
      tagline: 'heroism heard of only in legend',
      levels: {
        3: {
          abilities: [
            {
              name: 'Inspiring Presence',
              desc: 'Whenever you use Songweaver’s Inspiration, your allies within 12 spaces who can hear you gain WIL temp HP.',
            },
          ],
        },
        7: {
          abilities: [
            {
              name: 'Unfailing Courage',
              desc: 'Your Songweaver’s Inspiration allows your target to roll with advantage.',
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'Fire in my Bones',
              desc: 'Your Songweaver’s Inspiration also grants your target 1 additional action.',
            },
          ],
        },
        15: {
          abilities: [
            {
              name: 'Chorus of Champions',
              desc: '(1/encounter) Free Reaction: Give all party members 1 action.',
            },
          ],
        },
      },
    },
  ],
}
