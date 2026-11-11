// Nimble Heroes, The Cheat (pp. 12–17).
import type { ClassDef } from '../types'
import { CAPSTONE_STATS, EPIC_BOON, inc, poolChoice } from './shared'

const underhanded = (n: number) =>
  poolChoice('underhanded', `Underhanded Ability (${n}): choose an Underhanded Ability`, [
    'underhanded',
  ])

export const cheat: ClassDef = {
  slug: 'cheat',
  name: 'The Cheat',
  tagline: 'A sneaky, backstabbing, dirty-fighting rogue.',
  description:
    'Cloak and dagger… and dagger. Masters of stealth, pickpocketing, and smooth talking. It’s a cruel, merciless world, and those who aim to survive don’t have time for silly things like “morals” or “honor.”',
  highlights: [
    'Break the rules! Change the dice you roll to whatever numbers suit you best.',
    'Sneak in and backstab enemies with devastating critical hits.',
    'Fight dirty with pocket sand, low blows, and vicious blades.',
  ],
  complexity: 1,
  keyStats: ['DEX', 'INT'],
  hitDie: 6,
  startingHp: 10,
  saveAdv: 'DEX',
  saveDis: 'WIL',
  armor: 'Leather Armor',
  weapons: 'DEX Weapons',
  startingGear: [
    { name: 'Dagger', qty: '2' },
    { name: 'Sling', qty: '1' },
    { name: 'Cheap Hides', qty: '1' },
    { name: 'Chalk', qty: '1' },
  ],
  startingWeapons: ['Dagger', 'Sling'],
  armorCalc: { base: 3 },
  resource: {
    name: 'Sneak Attack',
    diceName: 'Sneak Attack',
    die: 6,
    kind: 'info',
    ability: 'Sneak Attack',
  },
  swapRule: {
    name: 'Trade Secrets',
    desc: 'Whenever you spend a night talking shop with other roguish types during a Safe Rest, you may choose different Cheat options available to you.',
  },
  pools: [
    {
      id: 'underhanded',
      name: 'Underhanded Abilities',
      options: [
        {
          name: '“Creative” Accounting',
          desc: 'Steal up to INT actions from your next turn (gain up to INT actions now; the next time you would gain actions, subtract the number stolen). You cannot use this 2 turns in a row.',
        },
        {
          name: 'Exploit Weakness',
          desc: 'Action: Make a contested INT check against an enemy. If you win, you can use Vicious Opportunist against them, even if they are not Distracted. This lasts for 1 minute or until you use this ability against another target.',
        },
        {
          name: 'Feinting Attack',
          desc: 'If you miss for the 2nd time in a single round, you may change the primary die roll to any result instead.',
        },
        {
          name: 'How’d YOU get here?!',
          desc: '2 actions: “Teleport” up to 4 spaces away, adjacent to a Distracted target, and make a melee attack against them. If you crit, you may “teleport” again.',
        },
        {
          name: 'I’m Outta Here!',
          desc: 'When an ally within 4 spaces is crit, you may turn invisible until the end of your next turn and then move up to half your speed for free.',
        },
        {
          name: 'Misdirection',
          desc: 'Gain INT armor. Whenever you Defend, you may halve the damage instead.',
        },
        {
          name: 'Steal Tempo',
          desc: 'When you land a critical hit for the second time on a turn, your target loses 1 action and you gain 1 action.',
        },
        {
          name: 'Sunder Armor (Medium)',
          desc: 'Action: When you crit an enemy with medium armor, sunder their armor. Until the start of your next turn, ALL melee attacks against that target ignore its armor.',
        },
        {
          name: 'Sunder Armor (Heavy)',
          requires: 'Sunder Armor (Medium)',
          desc: 'Your Sunder Armor ability now also applies to enemies wearing heavy armor.',
        },
        {
          name: 'Trickshot',
          desc: 'When you throw a dagger, it returns to your hand at the end of your turn. On a hit, it ricochets to another creature within 2 spaces, dealing half as much damage to them.',
        },
      ],
    },
  ],
  levels: {
    1: {
      abilities: [
        { name: 'Sneak Attack', desc: '(1/turn) When you crit, deal +1d6 damage.' },
        {
          name: 'Vicious Opportunist',
          desc: '(1/turn) When you hit a Distracted target with a melee attack, you may change the Primary Die roll to whatever you like (changing it to the max value counts as a crit). A target is Distracted if it is adjacent to or Taunted by an ally, or if it cannot see you.',
        },
      ],
    },
    2: {
      abilities: [
        {
          name: 'Cheat',
          desc: '(1/round) You may either Move or Hide for free. (1/day) You may change any skill check to 10+INT. If you roll less than 10 on Initiative, you may change it to 10 instead. You may gain advantage on skill checks while playing any games, competitions, or placing wagers. If you’re caught though…',
        },
      ],
    },
    3: {
      subclassChoice: true,
      abilities: [
        { name: 'Sneak Attack (2)', desc: 'Your Sneak Attack becomes 1d8.' },
        {
          name: 'Thieves’ Cant',
          desc: 'You learn the secret language of rogues and scoundrels.',
        },
      ],
    },
    4: { abilities: [], statIncrease: inc('DEX', 'INT'), choices: [underhanded(1)] },
    5: {
      abilities: [
        {
          name: 'Twist the Blade',
          desc: 'Action: Change one of your Sneak Attack dice to whatever you like.',
        },
        {
          name: 'Quick Read',
          desc: '(1/encounter) Gain advantage on an Assess check. (1/day) Gain advantage on an Examination check.',
        },
      ],
      statIncrease: inc('WIL', 'STR'),
    },
    6: {
      abilities: [
        {
          name: 'THAT’S Not What Happened!',
          desc: '(1/Safe Rest) Action: After a Distracted enemy attacks you, you may change the Primary Die roll to whatever you like (changing the die to the minimum value counts as a miss).',
        },
      ],
      choices: [underhanded(2)],
    },
    7: { abilities: [{ name: 'Sneak Attack (3)', desc: 'Your Sneak Attack becomes 2d8.' }] },
    8: { abilities: [], statIncrease: inc('DEX', 'INT'), choices: [underhanded(3)] },
    9: {
      abilities: [{ name: 'Sneak Attack (4)', desc: 'Your Sneak Attack becomes 2d10.' }],
      statIncrease: inc('WIL', 'STR'),
    },
    10: { abilities: [], choices: [underhanded(4)] },
    11: { abilities: [{ name: 'Sneak Attack (5)', desc: 'Your Sneak Attack becomes 2d12.' }] },
    12: { abilities: [], statIncrease: inc('DEX', 'INT'), choices: [underhanded(5)] },
    13: {
      abilities: [
        { name: 'Twist the Blade (2)', desc: '(1/turn) You can Twist the Blade for free.' },
      ],
      statIncrease: inc('WIL', 'STR'),
    },
    14: { abilities: [], choices: [underhanded(6)] },
    15: { abilities: [{ name: 'Sneak Attack (6)', desc: 'Your Sneak Attack becomes 2d20.' }] },
    16: { abilities: [], statIncrease: inc('DEX', 'INT'), choices: [underhanded(7)] },
    17: {
      abilities: [{ name: 'Sneak Attack (7)', desc: 'Your Sneak Attack becomes 3d20.' }],
      statIncrease: inc('WIL', 'STR'),
    },
    18: { abilities: [], choices: [underhanded(8)] },
    19: { abilities: [], choices: [EPIC_BOON] },
    20: {
      abilities: [
        {
          name: 'Supreme Execution',
          desc: 'When you attack with a blade, you do not require targets to be Distracted to trigger Vicious Opportunist.',
        },
      ],
      statIncrease: CAPSTONE_STATS,
    },
  },
  subclasses: [
    {
      slug: 'silent-blade',
      name: 'Tools of the Silent Blade',
      tagline: 'murderous, unseen',
      levels: {
        3: {
          abilities: [
            {
              name: 'Amidst All This Commotion…',
              desc: 'If a creature dies while you Sneak Attack them, you may turn Invisible until you attack again or until the beginning of your next turn.',
            },
            {
              name: 'Leave No Trace',
              desc: 'Advantage on Stealth checks when you are at full health.',
            },
          ],
        },
        7: {
          abilities: [
            {
              name: 'Cunning Strike',
              desc: '(2/encounter) When you land a Sneak Attack, you may force the target to make a STR save (DC 10+INT). On a failure, instead of rolling your Sneak Attack dice, they deal the maximum amount of damage (if your target saves, regain 1 use).',
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'Professional Skulker',
              desc: 'Gain a climbing speed and advantage on Stealth checks (replaces Leave No Trace).',
            },
          ],
        },
        15: {
          abilities: [
            { name: 'KILL', desc: 'When you crit an enemy with fewer max HP than you, it dies.' },
          ],
        },
      },
    },
    {
      slug: 'scoundrel',
      name: 'Tools of the Scoundrel',
      tagline: 'trickster with pocket sand',
      levels: {
        3: {
          abilities: [
            {
              name: 'Low Blow',
              desc: 'When you Sneak Attack, you may spend 2 additional actions to Incapacitate your target for their next turn on a failed STR save (DC 10+INT). Save or fail, they are Taunted by you until you drop to 0 HP.',
            },
            {
              name: 'Sweet Talk',
              desc: 'You may gain advantage on all Influence checks with NPCs you’ve just met for the first time. This lasts until you fail an Influence check with them or until you meet a 2nd time. You then have disadvantage on Influence checks with them (until you get back on their good side).',
            },
          ],
        },
        7: {
          abilities: [
            {
              name: 'Pocket Sand',
              desc: '(2/encounter) When you Defend against a melee attack, Blind the attacker until the start of their next turn and force them to reroll the attack (Blinded creatures attack with disadvantage).',
            },
          ],
        },
        11: {
          abilities: [
            {
              name: 'Escape Plan',
              desc: '(1/Safe Rest) When you would drop to 0 HP or gain a Wound, you don’t. Instead, you turn Invisible for 1 minute or until you attack.',
            },
          ],
        },
        15: {
          abilities: [
            {
              name: 'Heads I Win, Tails You Lose',
              desc: '(1/encounter) Attacks you make this round don’t miss, you crit on 1 less than normally needed, and you gain LVL temp HP.',
            },
          ],
        },
      },
    },
  ],
}
