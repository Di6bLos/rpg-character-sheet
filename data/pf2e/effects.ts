// Structured effects for Pathfinder 2e abilities, hand-written from their rules text in
// `data/pf2e` (ORC; pages cited). `utils/pf2eEffects.ts` applies them. First wave: general
// feats with fixed numbers, Rage, Sneak Attack, the Precision edge, and the common buffs
// allies cast (Bless, Heroism, Courageous Anthem). Second wave: the Player Core classes'
// numeric features (Hunt Prey and its edges, Thief, Precise Strike, Strategic Strike, weapon
// specialization), monk stances, and spells heroes put on themselves (Shield, Mystic Armor,
// Rallying Anthem, Enlarge, Haste, Guidance). Third wave: class features whose numbers the text
// reader in utils/pf2eAbilityRules.ts can't work out (bonuses that grow by level, resistances
// with a formula, stances); everything it can read (proficiency increases, Juggernaut-style
// degree upgrades, plain bonuses) is derived and needs no entry here. Situational text stays
// in `note`.
import type { Pf2eEffectDef } from './types'

export const PF2E_EFFECTS: Pf2eEffectDef[] = [
  // --- General feats ------------------------------------------------------------
  {
    name: 'Toughness',
    source: { book: 'Player Core', page: 263 },
    mode: 'permanent',
    effects: [{ kind: 'recoveryDc', value: -1 }],
    note: 'Maximum HP increases by your level (add it to max HP when you take the feat).',
  },
  {
    name: 'Diehard',
    source: { book: 'Player Core', page: 254 },
    mode: 'permanent',
    effects: [{ kind: 'deathAt', value: 5 }],
  },
  {
    name: 'Fleet',
    source: { book: 'Player Core', page: 256 },
    mode: 'permanent',
    effects: [{ kind: 'modifier', selector: ['speed'], value: 5, type: 'untyped' }],
  },
  {
    name: 'Incredible Initiative',
    source: { book: 'Player Core', page: 256 },
    mode: 'permanent',
    effects: [{ kind: 'modifier', selector: ['initiative'], value: 2, type: 'circumstance' }],
  },

  // --- Class abilities ----------------------------------------------------------
  {
    name: 'Rage',
    source: { book: 'Player Core 2', page: 72 },
    mode: 'toggle',
    endsWhenUnconscious: true,
    effects: [
      { kind: 'tempHp', formula: 'levelPlusCon' },
      {
        kind: 'modifier',
        selector: ['damage'],
        value: 2,
        type: 'untyped',
        melee: true,
        agileHalf: true,
      },
    ],
    note: "Can't use concentrate actions unless they have the rage trait (Seek is fine). Lasts 1 minute, until unconscious or the encounter ends; then its temporary HP go, and Rage gives none for 1 minute.",
  },
  {
    name: 'Sneak Attack',
    source: { book: 'Player Core', page: 164 },
    mode: 'permanent',
    effects: [
      {
        kind: 'damageDice',
        dice: [
          [1, '1d6'],
          [5, '2d6'],
          [11, '3d6'],
          [17, '4d6'],
        ],
        when: 'offGuard',
        weapons: 'agileFinesseRanged',
        label: 'sneak attack',
      },
    ],
  },
  {
    name: 'Precision',
    source: { book: 'Player Core', page: 154 },
    mode: 'permanent',
    requires: 'Hunt Prey',
    effects: [
      {
        kind: 'damageDice',
        dice: [
          [1, '1d8'],
          [11, '2d8'],
          [19, '3d8'],
        ],
        when: 'huntedPrey',
        label: 'precision (first hit on your prey this round)',
      },
    ],
  },

  {
    name: 'Hunt Prey',
    source: { book: 'Player Core', page: 154 },
    mode: 'toggle',
    effects: [],
    note: '+2 circumstance to Perception to Seek your prey and Survival to Track it; no penalty for your second range increment against it. Edge numbers below count against your prey.',
  },
  {
    name: 'Flurry',
    source: { book: 'Player Core', page: 154 },
    mode: 'permanent',
    requires: 'Hunt Prey',
    effects: [{ kind: 'map', second: -3, third: -6, agileSecond: -2, agileThird: -4 }],
    note: 'Only for attacks against your hunted prey: against anyone else the penalty is −5/−10 (agile −4/−8).',
  },
  {
    name: 'Outwit',
    source: { book: 'Player Core', page: 154 },
    mode: 'permanent',
    requires: 'Hunt Prey',
    effects: [
      {
        kind: 'modifier',
        selector: ['skills'],
        skills: ['Deception', 'Intimidation', 'Stealth'],
        value: 2,
        type: 'circumstance',
      },
      { kind: 'modifier', selector: ['ac'], value: 1, type: 'circumstance' },
    ],
    note: 'Only against your prey: the +2 to Deception, Intimidation and Stealth is for checks against it, the +1 AC against its attacks. Also +2 to Recall Knowledge about it.',
  },
  {
    name: 'Thief',
    source: { book: 'Player Core', page: 167 },
    mode: 'permanent',
    effects: [{ kind: 'damageAttribute', attr: 'DEX' }],
  },
  {
    name: 'Precise Strike',
    source: { book: 'Player Core 2', page: 158 },
    mode: 'permanent',
    effects: [
      {
        kind: 'modifier',
        selector: ['damage'],
        value: 2,
        type: 'untyped',
        melee: true,
        weapons: 'agileFinesse',
        byLevel: [
          [1, 2],
          [5, 3],
          [9, 4],
          [13, 5],
          [17, 6],
        ],
      },
    ],
    note: 'A finisher deals 2d6 precision instead (+1d6 at 5th, 9th, 13th and 17th).',
  },
  {
    name: 'Strategic Strike',
    source: { book: 'Player Core 2', page: 100 },
    mode: 'permanent',
    effects: [
      {
        kind: 'damageDice',
        dice: [
          [1, '1d6'],
          [5, '2d6'],
          [9, '3d6'],
          [13, '4d6'],
          [17, '5d6'],
        ],
        when: 'stratagem',
        label: 'strategic strike',
      },
    ],
  },
  {
    name: 'Weapon Specialization',
    source: { book: 'Player Core', page: 136 },
    mode: 'permanent',
    effects: [{ kind: 'specialization', damage: { E: 2, M: 3, L: 4 } }],
  },
  {
    name: 'Greater Weapon Specialization',
    source: { book: 'Player Core', page: 136 },
    mode: 'permanent',
    effects: [{ kind: 'specialization', damage: { E: 4, M: 6, L: 8 } }],
  },
  {
    name: 'Crane Stance',
    source: { book: 'Player Core 2', page: 118 },
    mode: 'toggle',
    effects: [{ kind: 'modifier', selector: ['ac'], value: 1, type: 'circumstance' }],
    note: 'Only crane wing Strikes (1d6 bludgeoning; agile, finesse, nonlethal, unarmed); High and Long Jump DCs −5.',
  },
  {
    name: 'Mountain Stance',
    source: { book: 'Player Core 2', page: 118 },
    mode: 'toggle',
    effects: [
      // Cumulative with mystic armor (and runes on explorer's clothing, already in base AC).
      {
        kind: 'modifier',
        selector: ['ac'],
        value: 4,
        type: 'item',
        cumulativeWith: ['Mystic Armor'],
      },
      { kind: 'dexCap', value: 0 },
      { kind: 'modifier', selector: ['speed'], value: -5, type: 'untyped' },
    ],
    note: 'Only falling stone Strikes (1d8 bludgeoning; forceful, nonlethal, unarmed); +2 circumstance against forced movement.',
  },

  // --- Class features with numbers by level -------------------------------------
  {
    name: 'Incredible Movement',
    source: { book: 'Player Core 2', page: 114 },
    mode: 'permanent',
    effects: [
      {
        kind: 'modifier',
        selector: ['speed'],
        value: 10,
        type: 'status',
        byLevel: [
          [3, 10],
          [7, 15],
          [11, 20],
          [15, 25],
          [19, 30],
        ],
      },
    ],
    note: 'Only while you’re not wearing armor.',
  },
  {
    name: 'Panache',
    source: { book: 'Player Core 2', page: 158 },
    mode: 'toggle',
    ends: 'encounter',
    effects: [
      {
        kind: 'modifier',
        selector: ['speed'],
        value: 5,
        type: 'status',
        byLevel: [
          [1, 5],
          [3, 10],
          [7, 15],
          [11, 20],
          [15, 25],
          [19, 30],
        ],
      },
    ],
    note: '+1 circumstance bonus to skill checks with the bravado trait in combat. Without panache, Vivacious Speed still gives half its bonus. Lost when the encounter ends or a finisher is used.',
  },
  {
    name: 'Stylish Combatant',
    source: { book: 'Player Core 2', page: 158 },
    mode: 'permanent',
    effects: [],
    note: 'Its Speed bonus while you have panache is in Panache.',
  },
  {
    name: 'Vivacious Speed',
    source: { book: 'Player Core 2', page: 158 },
    mode: 'permanent',
    effects: [],
    note: 'Its Speed bonus by level is in Panache.',
  },
  {
    name: 'Raging Resistance',
    source: { book: 'Player Core 2', page: 70 },
    mode: 'permanent',
    requires: 'Rage',
    effects: [{ kind: 'resistance', type: 'your instinct’s damage types', amount: 'con', add: 3 }],
  },
  {
    name: "Guardian's Armor",
    source: { book: 'Battlecry!', page: 37 },
    mode: 'permanent',
    effects: [{ kind: 'resistance', type: 'physical', amount: 'halfLevel', add: 1 }],
    note: 'Only while wearing medium or heavy armor.',
  },
  {
    name: 'Arcane Cascade',
    source: { book: 'Impossible Magic', page: 12 },
    mode: 'toggle',
    effects: [
      {
        kind: 'modifier',
        selector: ['damage'],
        value: 1,
        type: 'untyped',
        melee: true,
        byLevel: [
          [1, 1],
          [7, 2],
          [15, 3],
        ],
      },
      { kind: 'resistance', type: 'damage from spells', amount: 1 },
    ],
    note: 'Melee Strikes gain the arcane trait; the extra damage is force (or a type the spell you just cast could deal). Resistance to spells is 2 from 7th level (weapon specialization) and 3 from 15th.',
  },

  // --- Spells, on yourself or from an ally -------------------------------------
  {
    name: 'Shield',
    source: { book: 'Player Core', page: 356 },
    mode: 'toggle',
    effects: [{ kind: 'modifier', selector: ['ac'], value: 1, type: 'circumstance' }],
    note: 'Until the start of your next turn; Shield Block with Hardness 5, then you can’t cast it for 10 minutes.',
    ends: 'startOfTurn',
  },
  {
    name: 'Mystic Armor',
    source: { book: 'Player Core', page: 346 },
    mode: 'toggle',
    effects: [{ kind: 'modifier', selector: ['ac'], value: 1, type: 'item' }],
    note: 'Uses your unarmored proficiency, Dex cap +5. Heightened 4th: +1 item to saves; 6th: +2 AC, +1 saves; 8th: +2 and +2; 10th: +3 and +3.',
  },
  {
    name: 'Rallying Anthem',
    source: { book: 'Player Core', page: 371 },
    mode: 'toggle',
    effects: [{ kind: 'modifier', selector: ['ac', 'saves'], value: 1, type: 'status' }],
    note: 'Also resistance to physical damage equal to half the spell’s rank.',
  },
  {
    name: 'Rallying Anthem (ally)',
    source: { book: 'Player Core', page: 371 },
    mode: 'given',
    effects: [{ kind: 'modifier', selector: ['ac', 'saves'], value: 1, type: 'status' }],
    note: 'Also resistance to physical damage equal to half the spell’s rank.',
  },
  {
    name: 'Enlarge',
    source: { book: 'Player Core', page: 329 },
    mode: 'given',
    values: [2, 4],
    effects: [
      { kind: 'modifier', selector: ['damage'], value: 2, type: 'status', melee: true },
      { kind: 'condition', name: 'Clumsy', value: 1 },
    ],
    note: 'Large (Huge and +4 at 4th rank): reach +5 feet (+10 at 4th).',
  },
  {
    name: 'Haste',
    source: { book: 'Player Core', page: 335 },
    mode: 'given',
    effects: [{ kind: 'condition', name: 'Quickened' }],
    note: 'The extra action is only for Strike and Stride.',
  },
  {
    name: 'Guidance',
    source: { book: 'Player Core', page: 334 },
    mode: 'given',
    effects: [
      {
        kind: 'modifier',
        selector: ['attack', 'perception', 'saves', 'skills'],
        value: 1,
        type: 'status',
      },
    ],
    note: 'For one roll you choose: turn it off once you’ve used it.',
  },

  // --- Spells, on yourself or from an ally -------------------------------------
  {
    name: 'Courageous Anthem',
    source: { book: 'Player Core', page: 370 },
    mode: 'toggle',
    effects: [{ kind: 'modifier', selector: ['attack', 'damage'], value: 1, type: 'status' }],
    note: 'Also +1 status bonus to saves against fear effects.',
  },
  {
    name: 'Bless',
    source: { book: 'Player Core', page: 318 },
    mode: 'given',
    effects: [{ kind: 'modifier', selector: ['attack'], value: 1, type: 'status' }],
  },
  {
    name: 'Heroism',
    source: { book: 'Player Core', page: 335 },
    mode: 'given',
    values: [1, 2, 3],
    effects: [
      {
        kind: 'modifier',
        selector: ['attack', 'perception', 'saves', 'skills'],
        value: 1,
        type: 'status',
      },
    ],
    note: '+2 when heightened to 6th rank, +3 at 9th.',
  },
  {
    name: 'Courageous Anthem (ally)',
    source: { book: 'Player Core', page: 370 },
    mode: 'given',
    effects: [{ kind: 'modifier', selector: ['attack', 'damage'], value: 1, type: 'status' }],
    note: 'Also +1 status bonus to saves against fear effects.',
  },

  // --- Spells, fourth wave: buffs a hero casts on themselves or gets from an ally ----
  // Self-only spells are toggles the cast turns on, with the rank's number kept as the
  // toggle's value (`values`, by the spell's heightened ranks); spells cast on a target are
  // `given`, so an ally's cast is picked under From allies and the caster's own is offered.
  {
    name: 'Protection',
    source: { book: 'Player Core', page: 351 },
    mode: 'given',
    effects: [{ kind: 'modifier', selector: ['ac', 'saves'], value: 1, type: 'status' }],
    note: '1 minute. Heightened 3rd: can also cover allies in a 10-foot emanation around the target.',
  },
  {
    name: 'Runic Weapon',
    source: { book: 'Player Core', page: 354 },
    mode: 'given',
    values: [1, 2, 3],
    effects: [{ kind: 'modifier', selector: ['attack'], value: 1, type: 'item' }],
    note: 'Only Strikes with the target weapon. It is striking (two weapon dice); greater striking (three) at 6th, major striking (four) at 9th: change the Strike’s dice while it lasts. 1 minute.',
  },
  {
    name: 'Runic Body',
    source: { book: 'Player Core', page: 354 },
    mode: 'given',
    values: [1, 2, 3],
    effects: [{ kind: 'modifier', selector: ['attack'], value: 1, type: 'item' }],
    note: 'Only unarmed attacks. They are striking (two damage dice); greater striking (three) at 6th, major striking (four) at 9th. 1 minute.',
  },
  {
    name: 'Weapon Surge',
    source: { book: 'Player Core', page: 381 },
    mode: 'toggle',
    ends: 'startOfTurn',
    effects: [
      { kind: 'modifier', selector: ['attack'], value: 1, type: 'status' },
      {
        kind: 'damageDice',
        dice: [
          [1, '1d6'],
          [9, '2d6'],
          [17, '3d6'],
        ],
        when: 'always',
        label: 'spirit (weapon surge)',
      },
    ],
    note: 'Your next Strike with that weapon before your next turn; then turn it off. The spirit dice follow the spell’s rank (2d6 at 5th, 3d6 at 9th, half your level rounded up).',
  },
  {
    name: 'Fire Shield',
    source: { book: 'Player Core', page: 331 },
    mode: 'toggle',
    ends: 'minute',
    effects: [{ kind: 'resistance', type: 'cold', amount: 5 }],
    note: 'Raise it as a shield for +1 circumstance AC; Shield Block with Hardness 10 and 40 HP; an adjacent or unarmed attacker you block takes 2d6 fire. Heightened (+2): cold resistance +5, HP +15, fire +1d6.',
  },
  {
    name: 'Stoke the Heart',
    source: { book: 'Player Core', page: 387 },
    mode: 'given',
    values: [2, 3, 4, 5, 6],
    effects: [{ kind: 'modifier', selector: ['damage'], value: 2, type: 'status' }],
    note: 'Sustained up to 1 minute.',
  },
  {
    name: 'Song of Strength',
    source: { book: 'Player Core', page: 371 },
    mode: 'toggle',
    ends: 'startOfTurn',
    effects: [
      {
        kind: 'modifier',
        selector: ['skills'],
        skills: ['Athletics'],
        value: 1,
        type: 'status',
      },
    ],
    note: 'Also +1 to your DCs against Athletics actions (Disarm, Reposition, Shove, Trip). 1 round.',
  },
  {
    name: 'Inner Upheaval',
    source: { book: 'Player Core 2', page: 256 },
    mode: 'toggle',
    ends: 'endOfTurn',
    effects: [
      { kind: 'modifier', selector: ['attack'], value: 1, type: 'status' },
      {
        kind: 'damageDice',
        dice: [
          [1, '1d6'],
          [9, '2d6'],
          [17, '3d6'],
        ],
        when: 'always',
        weapons: 'unarmed',
        label: 'force, spirit, vitality or void (inner upheaval)',
      },
    ],
    note: 'For the unarmed Strike or Flurry of Blows it makes.',
  },
  {
    name: 'Qi Form',
    source: { book: 'Player Core 2', page: 257 },
    mode: 'toggle',
    ends: 'minute',
    effects: [
      {
        kind: 'damageDice',
        dice: [[1, '1d6']],
        when: 'always',
        label: 'force, spirit, vitality or void (qi form)',
      },
    ],
    note: 'Fly Speed equal to your land Speed; a 5-foot corona deals 2d6 of the chosen type to creatures starting their turn in it. 1 minute.',
  },
  {
    name: 'Wild Winds Stance',
    source: { book: 'Player Core 2', page: 257 },
    mode: 'toggle',
    effects: [],
    note: '+2 circumstance bonus to AC against ranged attacks (add it when one targets you). Wind crash ranged unarmed Strikes: 1d6 bludgeoning, 30 feet, agile, nonlethal, propulsive; ignore concealment and cover.',
  },
  {
    name: 'Clinging Shadows Stance',
    source: { book: 'Player Core 2', page: 257 },
    mode: 'toggle',
    effects: [
      {
        kind: 'modifier',
        selector: ['skills'],
        skills: ['Athletics'],
        actions: ['Grapple'],
        value: 2,
        type: 'circumstance',
      },
    ],
    note: 'Also +2 to the DC to Escape from you. Shadow grasp Strikes: 1d4 void, agile, grapple, reach, unarmed.',
  },
  {
    name: 'Shields of the Spirit (ally)',
    source: { book: 'Player Core 2', page: 255 },
    mode: 'given',
    ends: 'startOfTurn',
    effects: [{ kind: 'modifier', selector: ['ac'], value: 1, type: 'status' }],
    note: 'From a champion’s spirit shields while you’re in their aura; an enemy attacking you takes 1d4 spirit damage. The champion doesn’t get it themselves.',
  },
  {
    name: 'Lay on Hands (ally)',
    source: { book: 'Player Core 2', page: 255 },
    mode: 'given',
    ends: 'startOfTurn',
    effects: [{ kind: 'modifier', selector: ['ac'], value: 2, type: 'status' }],
    note: 'For 1 round when a champion lays hands on you (not on themselves).',
  },
  {
    name: 'Competitive Edge',
    source: { book: 'Player Core', page: 372 },
    mode: 'toggle',
    values: [1, 2],
    effects: [{ kind: 'modifier', selector: ['attack', 'skills'], value: 1, type: 'status' }],
    note: 'Sustained up to 1 minute. When an enemy within 20 feet critically succeeds at an attack roll or skill check, it’s +3 (+4 at 7th) for that kind of roll for 1 round.',
  },
  {
    name: "Magic's Vessel",
    source: { book: 'Player Core', page: 376 },
    mode: 'given',
    effects: [{ kind: 'modifier', selector: ['saves'], value: 1, type: 'status' }],
    note: 'Each time the caster casts from a slot, resistance to spells equal to that spell’s rank until their next turn. Sustained up to 1 minute.',
  },
  {
    name: 'Untamed Form',
    source: { book: 'Player Core', page: 382 },
    mode: 'toggle',
    effects: [],
    note: 'Use the battle form’s AC, attacks and Speeds from the polymorph spell it copies, at untamed form’s rank (pest form 10 minutes, others 1 minute).',
  },
  {
    name: 'Touch of the Moon',
    source: { book: 'Player Core', page: 377 },
    mode: 'given',
    effects: [
      { kind: 'modifier', selector: ['attack'], value: 1, type: 'status' },
      { kind: 'modifier', selector: ['damage'], value: 4, type: 'status' },
    ],
    note: 'Waxing moon numbers. Full moon adds +1 status to AC and saves; waning moon is only +1 AC and saves; new moon nothing. The phase moves on at the end of each of your turns.',
  },
  {
    name: 'Soothing Words',
    source: { book: 'Player Core', page: 374 },
    mode: 'given',
    values: [1, 2],
    effects: [{ kind: 'modifier', selector: ['will'], value: 1, type: 'status' }],
    note: '1 more against emotion effects. 1 minute.',
  },
  {
    name: 'Blood Ward',
    source: { book: 'Player Core', page: 384 },
    mode: 'given',
    values: [1, 2],
    effects: [{ kind: 'modifier', selector: ['ac', 'saves'], value: 1, type: 'status' }],
    note: 'Only against creatures with the trait the witch chose. Sustained up to 1 minute.',
  },
  {
    name: 'Foresight',
    source: { book: 'Player Core', page: 332 },
    mode: 'given',
    effects: [{ kind: 'modifier', selector: ['initiative'], value: 2, type: 'status' }],
    note: 'Not off-guard against undetected creatures or when flanked; the caster can react to make an attack against you roll twice. 1 hour.',
  },
  {
    name: 'Fly',
    source: { book: 'Player Core', page: 332 },
    mode: 'given',
    effects: [],
    note: 'Fly Speed equal to your Speed or 20 feet, whichever is greater. 5 minutes (1 hour at 7th).',
  },
  {
    name: 'Invisibility',
    source: { book: 'Player Core', page: 339 },
    mode: 'given',
    effects: [{ kind: 'condition', name: 'Invisible' }],
    note: 'Ends after a hostile action (not at 4th rank, which lasts 1 minute). 10 minutes.',
  },
  {
    name: 'Blur',
    source: { book: 'Player Core', page: 318 },
    mode: 'given',
    effects: [{ kind: 'condition', name: 'Concealed' }],
    note: 'Can’t use the concealment to Hide or Sneak. 1 minute.',
  },
  {
    name: 'False Vitality',
    source: { book: 'Player Core', page: 331 },
    mode: 'toggle',
    values: [10, 13, 16, 19, 22, 25, 28, 31, 34],
    effects: [{ kind: 'tempHp', formula: 10 }],
    note: '8 hours; the temporary Hit Points go when it ends.',
  },
  {
    name: 'Sure Strike',
    source: { book: 'Player Core', page: 361 },
    mode: 'toggle',
    ends: 'endOfTurn',
    effects: [],
    note: 'Your next attack roll this turn: roll twice and use the better; ignore circumstance penalties and the flat check for a concealed or hidden target. Then immune for 10 minutes.',
  },

  // --- Fifth wave: Strike-modifying class features (Player Core 2) -----------------
  // A barbarian instinct's Rage damage, as the extra over Rage's own 2 (pp. 74–75; Elemental,
  // Rage of Elements p. 54; Bloodrager, War of Immortals p. 60): the instinct ability at 1st,
  // its specialization ability at 7th, greater weapon specialization at 15th. The ones that
  // hold only with a choice made when raging (draconic rage, spirit rage, a larger weapon) are
  // toggles. The text reader's `rageDamage` misses half of these sentences, so they're written.
  {
    name: 'Animal (Rage damage)',
    source: { book: 'Player Core 2', page: 74 },
    mode: 'permanent',
    has: { name: 'Animal', type: 'Instinct' },
    requires: 'Rage',
    effects: [
      {
        kind: 'modifier',
        selector: ['damage'],
        value: 0,
        byLevel: [
          [7, 3],
          [15, 10],
        ],
        type: 'untyped',
        melee: true,
        agileHalf: true,
        weapons: 'unarmed',
      },
    ],
    note: 'Only your chosen animal’s unarmed attacks (5 at 7th, 12 at 15th).',
  },
  {
    name: 'Bloodrager (Rage damage)',
    source: { book: 'War of Immortals', page: 60 },
    mode: 'permanent',
    has: { name: 'Bloodrager', type: 'Instinct' },
    requires: 'Rage',
    effects: [
      {
        kind: 'modifier',
        selector: ['damage'],
        value: 0,
        byLevel: [
          [7, 2],
          [15, 6],
        ],
        type: 'untyped',
        melee: true,
        agileHalf: true,
      },
    ],
    note: 'Blood rage: your physical attacks also deal persistent bleed equal to half your Rage damage, and spell attack spells add it.',
  },
  {
    name: 'Dragon (Rage damage)',
    source: { book: 'Player Core 2', page: 74 },
    mode: 'toggle',
    has: { name: 'Dragon', type: 'Instinct' },
    requires: 'Rage',
    effects: [
      {
        kind: 'modifier',
        selector: ['damage'],
        value: 2,
        byLevel: [
          [1, 2],
          [7, 6],
          [15, 14],
        ],
        type: 'untyped',
        melee: true,
        agileHalf: true,
      },
    ],
    note: 'Draconic rage, chosen when you Rage: Rage damage 4 (8 at 7th, 16 at 15th) of your dragon breath’s type instead of the weapon’s.',
  },
  {
    name: 'Elemental (Rage damage)',
    source: { book: 'Rage of Elements', page: 54 },
    mode: 'permanent',
    has: { name: 'Elemental', type: 'Instinct' },
    requires: 'Rage',
    effects: [
      {
        kind: 'modifier',
        selector: ['damage'],
        value: 2,
        byLevel: [
          [1, 2],
          [7, 4],
          [15, 10],
        ],
        type: 'untyped',
        melee: true,
        agileHalf: true,
      },
    ],
    note: 'Rage damage 4 (6 at 7th, 12 at 15th), of your element’s damage type.',
  },
  {
    name: 'Fury (Rage damage)',
    source: { book: 'Player Core 2', page: 75 },
    mode: 'permanent',
    has: { name: 'Fury', type: 'Instinct' },
    requires: 'Rage',
    effects: [
      {
        kind: 'modifier',
        selector: ['damage'],
        value: 1,
        byLevel: [
          [1, 1],
          [7, 5],
          [15, 11],
        ],
        type: 'untyped',
        melee: true,
        agileHalf: true,
      },
    ],
  },
  {
    name: 'Giant (Rage damage)',
    source: { book: 'Player Core 2', page: 75 },
    mode: 'toggle',
    has: { name: 'Giant', type: 'Instinct' },
    requires: 'Rage',
    effects: [
      {
        kind: 'modifier',
        selector: ['damage'],
        value: 4,
        byLevel: [
          [1, 4],
          [7, 8],
          [15, 16],
        ],
        type: 'untyped',
        melee: true,
        agileHalf: true,
      },
      { kind: 'condition', name: 'Clumsy', value: 1 },
    ],
    note: 'While wielding a larger weapon: Rage damage 6 (10 at 7th, 18 at 15th), and you’re clumsy 1 while you wield it.',
  },
  {
    name: 'Spirit (Rage damage)',
    source: { book: 'Player Core 2', page: 75 },
    mode: 'toggle',
    has: { name: 'Spirit', type: 'Instinct' },
    requires: 'Rage',
    effects: [
      {
        kind: 'modifier',
        selector: ['damage'],
        value: 1,
        byLevel: [
          [1, 1],
          [7, 5],
          [15, 11],
        ],
        type: 'untyped',
        melee: true,
        agileHalf: true,
      },
    ],
    note: 'Spirit rage, chosen when you Rage: Rage damage 3 (7 at 7th, 13 at 15th) as spirit damage, with ghost touch.',
  },
  {
    name: 'Superstition (Rage damage)',
    source: { book: 'Player Core 2', page: 75 },
    mode: 'permanent',
    has: { name: 'Superstition', type: 'Instinct' },
    requires: 'Rage',
    effects: [
      {
        kind: 'modifier',
        selector: ['damage'],
        value: 1,
        byLevel: [
          [1, 1],
          [7, 5],
          [15, 11],
        ],
        type: 'untyped',
        melee: true,
        agileHalf: true,
      },
    ],
    note: '4 against creatures you’ve seen Cast a Spell in the last hour (8 at 7th, 16 at 15th). +2 status to saves against magic while raging.',
  },

  // Panache gained from a failed bravado check lasts only until the end of your next turn
  // (Player Core 2 p. 163); utils/pf2eClassActions.ts turns it on.
  {
    name: 'Panache (until your next turn ends)',
    source: { book: 'Player Core 2', page: 163 },
    mode: 'toggle',
    has: { name: 'Panache' },
    ends: 'endOfNextTurn',
    effects: [
      {
        kind: 'modifier',
        selector: ['speed'],
        value: 5,
        type: 'status',
        byLevel: [
          [1, 5],
          [3, 10],
          [7, 15],
          [11, 20],
          [15, 25],
          [19, 30],
        ],
      },
    ],
    note: 'From a failed bravado check. A finisher spends it.',
  },

  // A champion's reaction against damage to themself (pp. 91–93): Selfish Shield's resistance to
  // the triggering damage (2 + half level; its value is set when used), and the extra spirit
  // damage the three causes give their Strikes until the end of their next turn.
  {
    name: 'Selfish Shield',
    source: { book: 'Player Core 2', page: 91 },
    mode: 'toggle',
    ends: 'trigger',
    effects: [{ kind: 'resistance', type: 'all damage', amount: 'halfLevel', add: 2 }],
    note: 'Only against the triggering damage.',
  },
  {
    name: 'Selfish Shield (Strikes)',
    source: { book: 'Player Core 2', page: 91 },
    mode: 'toggle',
    has: { name: 'Desecration', type: 'Cause' },
    ends: 'endOfNextTurn',
    effects: [
      {
        kind: 'modifier',
        selector: ['damage'],
        value: 1,
        byLevel: [
          [1, 1],
          [9, 2],
          [16, 3],
        ],
        type: 'untyped',
      },
    ],
    note: 'Spirit damage, only on Strikes against the creature that triggered Selfish Shield.',
  },
  {
    name: 'Destructive Vengeance (Strikes)',
    source: { book: 'Player Core 2', page: 92 },
    mode: 'toggle',
    has: { name: 'Iniquity', type: 'Cause' },
    ends: 'endOfNextTurn',
    effects: [
      {
        kind: 'modifier',
        selector: ['damage'],
        value: 2,
        byLevel: [
          [1, 2],
          [9, 4],
          [16, 6],
        ],
        type: 'untyped',
      },
    ],
    note: 'Spirit damage, only on Strikes against the creature that triggered Destructive Vengeance.',
  },
  {
    name: 'Iron Command (Strikes)',
    source: { book: 'Player Core 2', page: 93 },
    mode: 'toggle',
    has: { name: 'Obedience', type: 'Cause' },
    ends: 'endOfNextTurn',
    effects: [
      {
        kind: 'modifier',
        selector: ['damage'],
        value: 1,
        byLevel: [
          [1, 1],
          [9, 2],
          [16, 3],
        ],
        type: 'untyped',
      },
    ],
    note: 'Spirit damage, only on Strikes against the creature you gave the Iron Command.',
  },

  // Blood magic (p. 144): after a sorcerous gift or bloodline spell, the bloodline's effect on
  // the sorcerer for 1 round (pp. 149–152; Aesir, Battlecry! p. 71). The target options are
  // worked out by `bloodMagic` in utils/pf2eClassActions.ts.
  {
    name: 'Eerie Veil',
    source: { book: 'Player Core 2', page: 149 },
    mode: 'toggle',
    has: { name: 'Aberrant', type: 'Bloodline' },
    ends: 'startOfTurn',
    effects: [{ kind: 'modifier', selector: ['will'], value: 2, type: 'status' }],
    note: 'Or instead one target takes −1 status to Will saves for 1 round.',
  },
  {
    name: 'Call the Storm',
    source: { book: 'Battlecry!', page: 71 },
    mode: 'toggle',
    has: { name: 'Aesir', type: 'Bloodline' },
    ends: 'startOfTurn',
    effects: [{ kind: 'modifier', selector: ['reflex'], value: 2, type: 'status' }],
    note: 'Or instead a target takes 1 electricity damage per spell rank.',
  },
  {
    name: 'Divine Aura',
    source: { book: 'Player Core 2', page: 150 },
    mode: 'toggle',
    has: { name: 'Angelic', type: 'Bloodline' },
    ends: 'startOfTurn',
    effects: [{ kind: 'modifier', selector: ['saves'], value: 1, type: 'status' }],
    note: 'You or one target, for 1 round.',
  },
  {
    name: 'Corruption of Sin',
    source: { book: 'Player Core 2', page: 150 },
    mode: 'toggle',
    has: { name: 'Demonic', type: 'Bloodline' },
    ends: 'startOfTurn',
    effects: [
      {
        kind: 'modifier',
        selector: ['skills'],
        value: 2,
        type: 'status',
        skills: ['Intimidation'],
      },
    ],
    note: 'Or instead a target takes −1 status to AC for 1 round.',
  },
  {
    name: 'Tongue of Flame',
    source: { book: 'Player Core 2', page: 150 },
    mode: 'toggle',
    has: { name: 'Diabolic', type: 'Bloodline' },
    ends: 'startOfTurn',
    effects: [
      { kind: 'modifier', selector: ['skills'], value: 2, type: 'status', skills: ['Deception'] },
    ],
    note: 'Or instead a target takes 1 fire damage per spell rank.',
  },
  {
    name: 'Scaly Hide',
    source: { book: 'Player Core 2', page: 150 },
    mode: 'toggle',
    has: { name: 'Draconic', type: 'Bloodline' },
    ends: 'startOfTurn',
    effects: [{ kind: 'modifier', selector: ['ac'], value: 1, type: 'status' }],
    note: 'You or one target, for 1 round.',
  },
  {
    name: 'Elemental Fury',
    source: { book: 'Player Core 2', page: 151 },
    mode: 'toggle',
    has: { name: 'Elemental', type: 'Bloodline' },
    ends: 'startOfTurn',
    effects: [
      {
        kind: 'modifier',
        selector: ['skills'],
        value: 2,
        type: 'status',
        skills: ['Intimidation'],
      },
    ],
    note: 'Or instead a target takes 1 damage per spell rank of your element’s type.',
  },
  {
    name: 'Cloak of Ribbons (Performance)',
    source: { book: 'Player Core 2', page: 151 },
    mode: 'toggle',
    has: { name: 'Fey', type: 'Bloodline' },
    ends: 'startOfTurn',
    effects: [
      { kind: 'modifier', selector: ['skills'], value: 2, type: 'status', skills: ['Performance'] },
    ],
    note: 'Or instead become concealed for 1 round (it can’t be used to Hide).',
  },
  {
    name: 'Cloak of Ribbons (concealed)',
    source: { book: 'Player Core 2', page: 151 },
    mode: 'toggle',
    has: { name: 'Fey', type: 'Bloodline' },
    ends: 'startOfTurn',
    effects: [{ kind: 'condition', name: 'Concealed' }],
    note: 'Obvious concealment: it can’t be used to Hide.',
  },
  {
    name: 'Imperious Defense (AC)',
    source: { book: 'Player Core 2', page: 152 },
    mode: 'toggle',
    has: { name: 'Imperial', type: 'Bloodline' },
    ends: 'startOfTurn',
    effects: [{ kind: 'modifier', selector: ['ac'], value: 1, type: 'status' }],
    note: 'Until the start of your next turn; or +1 to saves instead.',
  },
  {
    name: 'Imperious Defense (saves)',
    source: { book: 'Player Core 2', page: 152 },
    mode: 'toggle',
    has: { name: 'Imperial', type: 'Bloodline' },
    ends: 'startOfTurn',
    effects: [{ kind: 'modifier', selector: ['saves'], value: 1, type: 'status' }],
    note: 'Until the start of your next turn; or +1 to AC instead.',
  },
  {
    name: 'Retributive Spite',
    source: { book: 'Player Core 2', page: 152 },
    mode: 'toggle',
    has: { name: 'Hag', type: 'Bloodline' },
    ends: 'endOfNextTurn',
    effects: [],
    note: 'The first creature to damage you before the end of your next turn takes 4 mental damage per spell rank (basic Will); if none does, gain temp HP equal to the spell rank at the start of your next turn.',
  },
  {
    name: 'Stolen Life',
    source: { book: 'Player Core 2', page: 152 },
    mode: 'toggle',
    has: { name: 'Undead', type: 'Bloodline' },
    ends: 'startOfTurn',
    effects: [{ kind: 'tempHp', formula: 1 }],
    note: 'Temporary Hit Points equal to the spell rank until the start of your next turn; or a target takes 1 void damage per spell rank.',
  },
]
