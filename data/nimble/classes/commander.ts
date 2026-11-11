// Nimble Heroes, Commander (pp. 18–23) and the Spellblade story subclass (pp. 76–77).
import type { ClassDef } from '../types'
import { CAPSTONE_STATS, EPIC_BOON, inc, poolChoice } from './shared'

const fit = (n: number) =>
  poolChoice(
    'fit-for-any-battlefield',
    `Fit for Any Battlefield (${n}): choose another Combat Ability or gain +1 max Combat Dice`,
    ['commander-orders', 'combat-tactics', 'combat-extra'],
  )

export const commander: ClassDef = {
  slug: 'commander',
  name: 'Commander',
  tagline: 'A battlefield tactician, leader, and weapon master.',
  description:
    'Soldier… Warrior… Fearless Leader. Commanders are masters of every weapon and form of close combat. A small cohort led by a trained Commander is more feared than innumerable legions without one.',
  highlights: [
    'Tactical Commands: issue powerful orders and coordinate devastating strikes.',
    'Weapon Mastery: wield every weapon type with deadly efficiency.',
    'Strategic Leadership: outwit and outmaneuver foes with cunning strategy.',
  ],
  complexity: 2,
  keyStats: ['STR', 'INT'],
  hitDie: 10,
  startingHp: 17,
  saveAdv: 'STR',
  saveDis: 'DEX',
  armor: 'Mail Armor, Shields',
  weapons: 'All Martial Weapons',
  startingGear: [
    { name: 'Hand Axe', qty: '1' },
    { name: 'Javelins', qty: '4' },
    { name: 'Rusty Mail', qty: '1' },
  ],
  startingWeapons: ['Hand Axe', 'Javelins'],
  armorCalc: { base: 6, dexMax: 2 },
  resource: {
    name: 'Combat Dice',
    diceName: 'Combat',
    die: 6,
    kind: 'dice',
    ability: 'Fit for Any Battlefield',
    stat: 'STR',
  },
  swapRule: {
    name: 'Rigorous Training',
    desc: 'Whenever you train with your party or other soldiers during a Safe Rest, you may choose different Commander options available to you.',
  },
  pools: [
    {
      id: 'commander-orders',
      name: 'Commander’s Orders',
      options: [
        {
          name: 'Face Me!',
          desc: 'Reaction (after an ally is crit within 12 spaces): Taunt that enemy until you drop to 0 HP.',
        },
        {
          name: 'Hold the Line!',
          desc: '(1/encounter) Reaction (when an ally drops to 0 HP): Command them to continue the fight! Set their HP to 3× your LVL.',
        },
        {
          name: 'I Can Do This ALL DAY!',
          desc: '(1/encounter) Reaction (when you would drop to 0 HP): You may expend any number of Hit Dice and set your HP to the sum rolled instead (do not add your STR).',
        },
        {
          name: 'Move it! Move it!',
          desc: 'When you roll Initiative you may give yourself and an ally advantage on the roll and +3 speed for 1 round.',
        },
        {
          name: 'Reposition!',
          desc: 'Action/Reaction (on an ally’s turn): Command 1 ally to move up to their speed (or 2 allies up to half their speed) for free.',
        },
      ],
    },
    {
      id: 'combat-tactics',
      name: 'Combat Tactics',
      note: '1/attack, you can expend a Combat Die to add one of these effects to your attack.',
      options: [
        {
          name: 'Commanding Presence',
          desc: 'Action: Shout a command up to 2 words long at an enemy. On a failed WIL save (DC 10+STR), they must spend their entire next turn obeying it to the best of their ability, provided it is not obviously harmful to themselves. They then become immune to this effect for 1 day.',
        },
        {
          name: 'Heavy Strike',
          desc: 'When you hit, push a Medium creature STR spaces and deal extra damage equal to a roll of your Combat Die. A Small creature is pushed twice as far; Large, half as far (round down).',
        },
        {
          name: 'Inerrant Strike',
          desc: 'Reroll a missed attack, add 1 to the Primary Die, and deal extra damage equal to a roll of your Combat Die.',
        },
        {
          name: 'Lunging Strike',
          desc: 'Gain +1 Reach on an attack and deal extra damage equal to 2× a roll of your Combat Die.',
        },
        {
          name: 'Sweeping Strike',
          desc: '2 actions: Select any contiguous area within your weapon’s Reach and damage ALL targets there. This attack does not miss on a 1.',
        },
      ],
    },
    {
      id: 'combat-extra',
      name: 'Combat Dice',
      options: [
        { name: '+1 max Combat Dice', desc: 'Gain 1 additional Combat Die.', repeatable: true },
      ],
    },
    {
      id: 'weapon-mastery',
      name: 'Weapon Mastery',
      options: [
        {
          name: 'Slashing Mastery',
          desc: 'Your attacks with slashing weapons cannot miss unarmored enemies.',
        },
        {
          name: 'Bludgeoning Mastery',
          desc: 'When your primary die rolls a 7 or higher with a bludgeoning weapon, ignore Heavy Armor.',
        },
        {
          name: 'Piercing Mastery',
          desc: 'Your attacks with piercing weapons ignore Medium Armor.',
        },
      ],
    },
  ],
  levels: {
    1: {
      abilities: [
        {
          name: 'Coordinated Strike!',
          desc: 'Commander’s Order. (1/round) Free action: you and an ally within 6 spaces both immediately make a weapon attack or cast a cantrip for free. You can do this INT times/Safe Rest.',
        },
      ],
    },
    2: {
      abilities: [
        {
          name: 'Field Medic',
          desc: 'Roll 1 additional die for any health potion you administer. Whenever you or an ally spends Hit Dice to recover HP, if you spent at least ten minutes examining their wounds, they can add your Examination bonus to the HP recovered.',
        },
      ],
      choices: [
        poolChoice(
          'commander-orders',
          'Commander’s Orders: choose 2 Commander’s Orders',
          ['commander-orders'],
          2,
        ),
      ],
    },
    3: { subclassChoice: true, abilities: [] },
    4: {
      abilities: [
        {
          name: 'Fit for Any Battlefield',
          desc: 'When you roll Initiative, gain STR Combat Dice, each a d6. (1/attack) You may expend a Combat Die to perform a special maneuver. Combat Dice are lost when combat ends.',
        },
      ],
      statIncrease: inc('STR', 'INT'),
      choices: [poolChoice('combat-tactic', 'Choose a Combat Tactic', ['combat-tactics'])],
    },
    5: {
      abilities: [
        {
          name: 'Master Commander',
          desc: 'When you roll Initiative, regain 1 spent use of Coordinated Strike (it is lost if not spent during that encounter). Attacks made from your Coordinated Strikes also ignore disadvantage.',
        },
        { name: 'Combat Tactics', desc: 'Your Combat Dice are now d8s.' },
      ],
      resourceDie: 8,
      statIncrease: inc('DEX', 'WIL'),
    },
    6: {
      abilities: [
        {
          name: 'Weapon Mastery',
          desc: 'You may sheathe a weapon and draw a different one 2×/round for free.',
        },
      ],
      choices: [
        fit(2),
        poolChoice('weapon-mastery', 'Weapon Mastery: choose a weapon type to specialize in', [
          'weapon-mastery',
        ]),
      ],
    },
    7: { abilities: [] },
    8: { abilities: [], statIncrease: inc('STR', 'INT'), choices: [fit(3)] },
    9: {
      abilities: [
        { name: 'Master Commander (2)', desc: '+1 use of Coordinated Strike/Safe Rest.' },
        { name: 'Combat Tactics (2)', desc: 'Your Combat Dice are now d10s.' },
      ],
      resourceDie: 10,
      statIncrease: inc('DEX', 'WIL'),
    },
    10: {
      abilities: [],
      choices: [
        fit(4),
        poolChoice(
          'weapon-mastery',
          'Weapon Mastery (2): choose a 2nd weapon type to specialize in',
          ['weapon-mastery'],
        ),
      ],
    },
    11: { abilities: [] },
    12: { abilities: [], statIncrease: inc('STR', 'INT'), choices: [fit(5)] },
    13: {
      abilities: [
        { name: 'Master Commander (3)', desc: '+1 use of Coordinated Strike/Safe Rest.' },
        { name: 'Combat Tactics (3)', desc: 'Your Combat Dice are now d12s.' },
      ],
      resourceDie: 12,
      statIncrease: inc('DEX', 'WIL'),
    },
    14: {
      abilities: [
        { name: 'Weapon Mastery (3)', desc: 'You have complete mastery of all weapon types.' },
      ],
    },
    15: { abilities: [] },
    16: { abilities: [], statIncrease: inc('STR', 'INT'), choices: [fit(6)] },
    17: {
      abilities: [
        { name: 'Master Commander (4)', desc: '+1 use of Coordinated Strike/Safe Rest.' },
        { name: 'Combat Tactics (4)', desc: 'Your Combat Dice are now d20s.' },
      ],
      resourceDie: 20,
      statIncrease: inc('DEX', 'WIL'),
    },
    18: {
      abilities: [
        {
          name: 'Unparalleled Tactics',
          desc: 'The first time each encounter you use Coordinated Strike, an ally who can hear you also gains 1 action to use on their next turn.',
        },
      ],
    },
    19: { abilities: [], choices: [EPIC_BOON] },
    20: {
      replacesAbilities: ['Unparalleled Tactics'],
      abilities: [
        {
          name: 'Captain of Legions',
          desc: 'The first time each encounter you use Coordinated Strike, EVERY ally within 12 spaces gains +1 action (replaces Unparalleled Tactics).',
        },
      ],
      statIncrease: CAPSTONE_STATS,
    },
  },
  subclasses: [
    {
      slug: 'bulwark',
      name: 'Champion of the Bulwark',
      tagline: 'unassailable shield wall',
      levels: {
        3: {
          abilities: [
            { name: 'Armor Master', desc: 'You are proficient with plate armor.' },
            {
              name: 'Shield Expert',
              desc: 'While wearing a shield, you may Defend 2× each round. The first time each round you block all of the damage from an attack, you may make an opportunity attack against the attacker for free.',
            },
          ],
        },
        7: {
          abilities: [
            {
              name: 'Juggernaut',
              desc: 'When you use Coordinated Strike, you deal extra damage equal to your armor, and you can add 1 to your primary die.',
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'Taunting Strike',
              desc: '(1/turn) You may Taunt a creature you hit until the end of their next turn.',
            },
          ],
        },
        15: {
          abilities: [
            {
              name: 'Shield Wall',
              desc: 'Allies within 2 spaces gain ALL the benefits of the shield you have equipped.',
            },
          ],
        },
      },
    },
    {
      slug: 'vanguard',
      name: 'Champion of the Vanguard',
      tagline: 'relentless, always advancing',
      levels: {
        3: {
          abilities: [
            {
              name: 'Advance!',
              desc: '(1/round) After you move toward an enemy, gain advantage on the first melee attack you make against it. When you use your Coordinated Strike, you and all allies within 12 spaces can first move up to half their speed for free.',
            },
          ],
        },
        7: {
          abilities: [
            {
              name: 'Experienced Commander',
              desc: 'Your Coordinated Strike may target 1 additional ally. Gain +1 use of Coordinated Strike/Safe Rest.',
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'Survey the Battlefield',
              desc: 'When you roll Initiative, regain 1 use of Coordinated Strike. +1 max Combat Dice.',
            },
          ],
        },
        15: {
          abilities: [
            {
              name: 'As One!',
              desc: 'Attacks made with your Coordinated Strike also grant advantage and ignore all disadvantage. Your chosen allies gain 1 additional action to use on their next turn.',
            },
          ],
        },
      },
    },
    {
      slug: 'spellblade',
      name: 'Spellblade',
      tagline: 'steel meets spell',
      story: true,
      // Combat Tactics die upgrades stay: Withering Strike reads the Combat Die.
      replacesAbilities: ['Weapon Mastery'],
      encounterMana: 'INT',
      poolSwap: {
        replace: ['combat-tactics', 'weapon-mastery'],
        withPools: ['commander-orders'],
        spellMaxTier: 1,
      },
      intro: [
        {
          name: 'Arcane Command',
          desc: 'You lose access to Weapon Mastery and Combat Tactics, but gain INT mana when you roll Initiative (lost if unspent when combat ends). Whenever you could choose a Combat Tactic or Weapon Mastery, instead choose another Commander’s Order or a tier 1 (or lower) spell from any spell school.',
        },
        {
          name: 'Empowered Orders',
          desc: 'Face Me! (Glimmering Decree): the enemy also takes STR d8 radiant damage (ignoring armor) and is pulled up to 4 spaces toward you. Move it! Move it! (Borne upon the Wind): you and the ally can also fly for 1 round, then both move for free. Hold the Line! (Crystalline Armor): they also gain that many temp HP; enemies who reduce it in melee have their speed halved until the end of their next turn. Reposition! (Flashstep): you may exchange places with one of them. I Can Do This ALL DAY! (Rising Phoenix): also deal that much fire damage to each enemy within 2 spaces; they gain Smoldering. Coordinated Strike! (Withering Strike): attacks deal extra Necrotic damage equal to the max value of your Combat Die; an enemy damaged this way is considered undead for 1 round.',
        },
      ],
      levels: {
        3: {
          spells: { learn: ['Enchant Weapon'] },
          abilities: [
            {
              name: 'Firebrand',
              desc: 'When you roll Initiative you may cast Enchant Weapon for free (can be upcast as normal by spending additional mana).',
            },
          ],
          choices: [
            {
              id: 'deep-knowledge-spell',
              label: 'Deep Knowledge: choose any tier 1 (or lower) spell',
              count: 1,
              source: { kind: 'spell', maxTier: 1 },
            },
            {
              id: 'deep-knowledge-utility',
              label: 'Deep Knowledge: choose any Utility Spell',
              count: 1,
              source: {
                kind: 'utility',
                schools: ['fire', 'ice', 'lightning', 'wind', 'radiant', 'necrotic'],
              },
            },
          ],
        },
        7: {
          abilities: [],
          choices: [
            {
              id: 'deep-knowledge-spell',
              label: 'Deep Knowledge (2): choose any tier 2 (or lower) spell',
              count: 1,
              source: { kind: 'spell', maxTier: 2 },
            },
            {
              id: 'deep-knowledge-utility',
              label: 'Deep Knowledge (2): choose any Utility Spell',
              count: 1,
              source: {
                kind: 'utility',
                schools: ['fire', 'ice', 'lightning', 'wind', 'radiant', 'necrotic'],
              },
            },
          ],
        },
        11: {
          abilities: [],
          choices: [
            {
              id: 'deep-knowledge-spell',
              label: 'Deep Knowledge (3): choose any tier 3 (or lower) spell',
              count: 1,
              source: { kind: 'spell', maxTier: 3 },
            },
            {
              id: 'deep-knowledge-utility',
              label: 'Deep Knowledge (3): choose any Utility Spell',
              count: 1,
              source: {
                kind: 'utility',
                schools: ['fire', 'ice', 'lightning', 'wind', 'radiant', 'necrotic'],
              },
            },
          ],
        },
        15: {
          abilities: [],
          choices: [
            {
              id: 'deep-knowledge-spell',
              label: 'Deep Knowledge (4): choose any tier 4 (or lower) spell',
              count: 1,
              source: { kind: 'spell', maxTier: 4 },
            },
            {
              id: 'deep-knowledge-utility',
              label: 'Deep Knowledge (4): choose any Utility Spell',
              count: 1,
              source: {
                kind: 'utility',
                schools: ['fire', 'ice', 'lightning', 'wind', 'radiant', 'necrotic'],
              },
            },
          ],
        },
      },
    },
  ],
}
