import type { GameSystem } from '~/types'
import type {
  AnySheet,
  Dnd5eSheet,
  NimbleSheet,
  NimbleStat,
  Pf2eAttr,
  Pf2eSheet,
  SheetBySystem,
} from '~/types/sheets'

const PF2E_SKILLS: [string, Pf2eAttr][] = [
  ['Acrobatics', 'DEX'],
  ['Arcana', 'INT'],
  ['Athletics', 'STR'],
  ['Crafting', 'INT'],
  ['Deception', 'CHA'],
  ['Diplomacy', 'CHA'],
  ['Intimidation', 'CHA'],
  ['Lore', 'INT'],
  ['Medicine', 'WIS'],
  ['Nature', 'WIS'],
  ['Occultism', 'INT'],
  ['Performance', 'CHA'],
  ['Religion', 'WIS'],
  ['Society', 'INT'],
  ['Stealth', 'DEX'],
  ['Survival', 'WIS'],
  ['Thievery', 'DEX'],
]

const NIMBLE_SKILLS: [string, NimbleStat][] = [
  ['Arcana', 'INT'],
  ['Examination', 'INT'],
  ['Finesse', 'DEX'],
  ['Influence', 'WIL'],
  ['Insight', 'WIL'],
  ['Lore', 'INT'],
  ['Might', 'STR'],
  ['Naturecraft', 'WIL'],
  ['Perception', 'WIL'],
  ['Stealth', 'DEX'],
]

export const PF2E_CONDITIONS = [
  'Frightened',
  'Off-guard',
  'Clumsy',
  'Enfeebled',
  'Sickened',
  'Prone',
]

export const NIMBLE_REACTIONS = [
  { name: 'Defend', desc: 'Reduce damage by your Armor' },
  { name: 'Interpose', desc: 'Take a hit for an ally' },
  { name: 'Opportunity', desc: 'Strike a foe that leaves' },
  { name: 'Help', desc: 'Give an ally advantage' },
]

function dnd5e(): Dnd5eSheet {
  return {
    lineage: '',
    class: '',
    background: '',
    alignment: '',
    hp: 10,
    hpMax: 10,
    ac: 10,
    initMod: 0,
    passivePerception: 10,
    xp: 0,
    xpNext: 300,
    abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    saveProfs: [],
    hitDie: 8,
    speed: '30 ft',
    profBonus: 2,
    deathSaves: { successes: 0, failures: 0 },
    weapons: [],
    features: [],
    inventory: [],
    notes: '',
  }
}

function pf2e(): Pf2eSheet {
  return {
    lineage: '',
    heritage: '',
    background: '',
    class: '',
    subclass: '',
    deity: '',
    hp: 15,
    hpMax: 15,
    ac: 10,
    acRank: 'T',
    initMod: 0,
    passivePerception: 10,
    xp: 0,
    xpNext: 1000,
    heroPoints: 1,
    keyAttr: 'STR',
    attrs: { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 },
    hpPerLevel: 8,
    shield: { name: '', hardness: 0, hp: 0, hpMax: 0, bt: 0, raised: false },
    saves: [
      { label: 'Fortitude', rank: 'T', value: 3 },
      { label: 'Reflex', rank: 'T', value: 3 },
      { label: 'Will', rank: 'T', value: 3 },
      { label: 'Perception', rank: 'T', value: 3 },
      { label: 'Class DC', rank: 'T', value: 13 },
    ],
    tempHp: 0,
    dying: 0,
    wounded: 0,
    speed: '25 ft',
    conditions: [],
    skills: PF2E_SKILLS.map(([name, attr]) => ({ name, attr, rank: 'U', value: 0 })),
    strikes: [],
    focus: { max: 0, current: 0, note: '' },
    feats: [],
    inventory: [],
    bulkLimit: 5,
    coins: { gp: 15, sp: 0, cp: 0 },
    notes: '',
  }
}

function nimble(): NimbleSheet {
  return {
    classSlug: '',
    subclassSlug: '',
    ancestrySlug: '',
    backgroundSlug: '',
    choices: {},
    lineage: '',
    class: '',
    subclass: '',
    background: '',
    hp: 10,
    hpMax: 10,
    ac: 10,
    initMod: 0,
    passivePerception: 10,
    xp: 0,
    xpNext: 3,
    stats: { STR: 0, DEX: 0, INT: 0, WIL: 0 },
    saveAdv: '',
    saveDis: '',
    wounds: 0,
    woundsMax: 6,
    speed: '6',
    hitDie: 8,
    hitDice: 1,
    actionsSpent: 0,
    resource: { name: '', diceName: '', active: false, dice: 0, die: 4 },
    attacks: [],
    skills: NIMBLE_SKILLS.map(([name, stat]) => ({ name, stat, points: 0 })),
    abilities: [],
    spells: { schools: [], tier: 0, learned: [], lost: [], utility: [] },
    mana: { current: 0, max: 0 },
    inventory: [],
    gold: '0 gp',
    notes: '',
  }
}

const FACTORIES: { [K in GameSystem]: () => SheetBySystem[K] } = { dnd5e, pf2e, nimble }

export function defaultSheet<K extends GameSystem>(system: K): SheetBySystem[K] {
  return FACTORIES[system]()
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergeDefaults(defaults: unknown, stored: unknown): unknown {
  if (stored === undefined || stored === null) return defaults
  if (isPlainObject(defaults) && isPlainObject(stored)) {
    const out: Record<string, unknown> = { ...stored }
    for (const key of Object.keys(defaults)) out[key] = mergeDefaults(defaults[key], stored[key])
    return out
  }
  // Arrays and primitives: trust what was saved if the type matches.
  if (Array.isArray(defaults) !== Array.isArray(stored)) return defaults
  if (typeof defaults !== typeof stored) return defaults
  return stored
}

/** Fills any fields missing from a stored sheet so older saves keep working. */
export function normalizeSheet<K extends GameSystem>(system: K, stored: unknown): SheetBySystem[K] {
  return mergeDefaults(defaultSheet(system), stored) as SheetBySystem[K]
}

/** One-line "Half-Elf Ranger" style summary for cards and rosters. */
export function lineageLine(sheet: Pick<AnySheet, 'lineage' | 'class'>): string {
  return [sheet.lineage, sheet.class].filter(Boolean).join(' ') || 'New adventurer'
}
