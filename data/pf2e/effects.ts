// Structured effects for Pathfinder 2e abilities, hand-written from their rules text in
// `data/pf2e` (ORC; pages cited). `utils/pf2eEffects.ts` applies them. First wave: general
// feats with fixed numbers, Rage, Sneak Attack, the Precision edge, and the common buffs
// allies cast (Bless, Heroism, Courageous Anthem). Second wave: the Player Core classes'
// numeric features (Hunt Prey and its edges, Thief, Precise Strike, Strategic Strike, weapon
// specialization), monk stances, and spells heroes put on themselves (Shield, Mystic Armor,
// Rallying Anthem, Enlarge, Haste, Guidance). Situational text stays in `note`.
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
    effects: [],
    note: '+2 circumstance bonus to initiative rolls.',
  },

  // --- Class abilities ----------------------------------------------------------
  {
    name: 'Rage',
    source: { book: 'Player Core 2', page: 72 },
    mode: 'toggle',
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
    note: "Can't use concentrate actions unless they have the rage trait (Seek is fine). Lasts 1 minute, until unconscious or the encounter ends.",
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
    note: 'Also +2 circumstance to Recall Knowledge about your prey; the AC bonus is against its attacks.',
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
      { kind: 'modifier', selector: ['ac'], value: 4, type: 'item' },
      { kind: 'dexCap', value: 0 },
      { kind: 'modifier', selector: ['speed'], value: -5, type: 'untyped' },
    ],
    note: 'Only falling stone Strikes (1d8 bludgeoning; forceful, nonlethal, unarmed); +2 circumstance against forced movement.',
  },

  // --- Spells, on yourself or from an ally -------------------------------------
  {
    name: 'Shield',
    source: { book: 'Player Core', page: 356 },
    mode: 'toggle',
    effects: [{ kind: 'modifier', selector: ['ac'], value: 1, type: 'circumstance' }],
    note: 'Until the start of your next turn; Shield Block with Hardness 5, then you can’t cast it for 10 minutes.',
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
]
