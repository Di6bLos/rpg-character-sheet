// Structured effects for Pathfinder 2e abilities, hand-written from their rules text in
// `data/pf2e` (ORC; pages cited). `utils/pf2eEffects.ts` applies them. First wave: general
// feats with fixed numbers, Rage, Sneak Attack, the Precision edge, and the common buffs
// allies cast (Bless, Heroism, Courageous Anthem). Situational text stays in `note`.
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
