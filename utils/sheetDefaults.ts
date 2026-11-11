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
    hitDiceUsed: 0,
    tempHp: 0,
    dying: false,
    actionsSpent: 0,
    rushed: 0,
    reactionsUsed: [],
    concentration: '',
    casting: { spell: '', actions: 0 },
    conditions: [],
    resource: { name: '', diceName: '', kind: 'rage', active: false, dice: 0, die: 4, count: 0 },
    uses: {},
    attacks: [],
    skills: NIMBLE_SKILLS.map(([name, stat]) => ({ name, stat, points: 0 })),
    abilities: [],
    spells: { schools: [], tier: 0, learned: [], lost: [], utility: [] },
    mana: { current: 0, max: 0, temp: 0 },
    inventory: [],
    coins: { gp: 0, sp: 0 },
    languages: '',
    heightWeight: '',
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
  const sheet = mergeDefaults(defaultSheet(system), stored) as SheetBySystem[K]
  if (system === 'nimble') migrateNimble(sheet as NimbleSheet, stored)
  return sheet
}

/** Upgrades older Nimble saves in place: the Dying flag and the free-text Gold field. */
function migrateNimble(sheet: NimbleSheet, stored: unknown) {
  const saved = isPlainObject(stored) ? stored : {}
  // Saves from before the flag existed: a hero at 0 HP was Dying.
  if (!('dying' in saved) && typeof saved.hp === 'number' && saved.hp <= 0 && sheet.hpMax > 0)
    sheet.dying = true

  const loose = sheet as unknown as Record<string, unknown>
  const old = loose.gold
  delete loose.gold
  if (typeof old !== 'string' || !old.trim() || isPlainObject(saved.coins)) return
  const { gp, sp, rest } = parseLegacyGold(old)
  sheet.coins = { gp, sp }
  // Keep anything that couldn't be converted (copper, decimals, notes) where the player can see it.
  if (rest)
    sheet.notes = [sheet.notes.trimEnd(), `Old Gold field: ${old.trim()}`]
      .filter(Boolean)
      .join('\n\n')
}

// A whole amount ("12", "1,200") not glued to other digits, letters or a decimal point.
const AMOUNT = String.raw`(?<![\w.,])(\d{1,3}(?:,\d{3})+|\d+)(?![\d.,]*\d)`
const COIN = new RegExp(
  String.raw`${AMOUNT}\s*(gp|gold(?:\s+pieces?)?|sp|silver(?:\s+pieces?)?)(?!\w)`,
  'gi',
)

/** Reads gp and sp out of the old Gold text; `rest` is whatever was left unconverted. */
export function parseLegacyGold(text: string): { gp: number; sp: number; rest: string } {
  const bare = new RegExp(String.raw`^\s*${AMOUNT}\s*$`).exec(text)
  if (bare) return { gp: Number((bare[1] ?? '0').replace(/,/g, '')), sp: 0, rest: '' }
  let gp = 0
  let sp = 0
  const rest = text.replace(COIN, (_, amount: string, unit: string) => {
    const n = Number(amount.replace(/,/g, ''))
    if (/^s/i.test(unit)) sp += n
    else gp += n
    return ' '
  })
  return { gp, sp, rest: rest.replace(/[\s,;&+]|\band\b/gi, '') }
}

/** One-line "Half-Elf Ranger" style summary for cards and rosters. */
export function lineageLine(sheet: Pick<AnySheet, 'lineage' | 'class'>): string {
  return [sheet.lineage, sheet.class].filter(Boolean).join(' ') || 'New adventurer'
}
