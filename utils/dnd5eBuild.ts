// Pure rules logic that turns the 5e (2024) data (data/dnd5e) into a sheet: the level 1 build
// (SRD 5.2.1 pp. 19–23), what each level grants and asks for, and the numbers that follow from
// them. One engine walks a hero's levels in order with the picks recorded on the sheet, so the
// builder, the level-up and Reconfigure all read the same choices. Level-ups live in
// `utils/dnd5eLevelUp.ts`. A level may go to another class (multiclassing, SRD 5.2.1 pp. 24–26):
// each class keeps its own level, subclass and spells (`Dnd5eClassTrack`), while the
// Proficiency Bonus and the spell slots come from the whole hero.
import type { Dnd5eData } from '~/data/dnd5e'
import { type Dnd5eSourceBook, dnd5eSource } from '~/data/dnd5e/sources'
import type {
  Dnd5eArmorDef,
  Dnd5eBackgroundDef,
  Dnd5eChoice,
  Dnd5eClassDef,
  Dnd5eFeatCategory,
  Dnd5eFeatDef,
  Dnd5eFeature,
  Dnd5eGrant,
  Dnd5eLineage,
  Dnd5eMechanics,
  Dnd5eOption,
  Dnd5eOptionEntry,
  Dnd5ePrerequisite,
  Dnd5eSpeciesDef,
  Dnd5eSpellDef,
  Dnd5eSpellcasting,
  Dnd5eSubclassDef,
  Dnd5eUses,
  Dnd5eWeaponDef,
} from '~/data/dnd5e/types'
import type {
  Dnd5eAbility,
  Dnd5eCasting,
  Dnd5eClassCasting,
  Dnd5eCoins,
  Dnd5eCreation,
  Dnd5eFeatureEntry,
  Dnd5eResource,
  Dnd5eSheet,
  Dnd5eSpellRef,
  Dnd5eWeapon,
  InventoryItem,
} from '~/types/sheets'
import { abilityMod, sign } from '~/utils/dice'
import { defaultSheet } from '~/utils/sheetDefaults'

/** The data sets the builder and level-up need. */
export const DND5E_BUILD_SETS = [
  'classes',
  'subclasses',
  'species',
  'backgrounds',
  'feats',
  'spells',
  'options',
  'weapons',
  'armor',
  'gear',
] as const
export type Dnd5eBuildData = Pick<Dnd5eData, (typeof DND5E_BUILD_SETS)[number]>

export const DND5E_ABILITIES: Dnd5eAbility[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
export const DND5E_ABILITY_NAME: Record<Dnd5eAbility, string> = {
  STR: 'Strength',
  DEX: 'Dexterity',
  CON: 'Constitution',
  INT: 'Intelligence',
  WIS: 'Wisdom',
  CHA: 'Charisma',
}

/** The skills and the ability each uses (SRD 5.2.1 pp. 8–9). */
export const DND5E_SKILLS: { name: string; ability: Dnd5eAbility }[] = [
  { name: 'Acrobatics', ability: 'DEX' },
  { name: 'Animal Handling', ability: 'WIS' },
  { name: 'Arcana', ability: 'INT' },
  { name: 'Athletics', ability: 'STR' },
  { name: 'Deception', ability: 'CHA' },
  { name: 'History', ability: 'INT' },
  { name: 'Insight', ability: 'WIS' },
  { name: 'Intimidation', ability: 'CHA' },
  { name: 'Investigation', ability: 'INT' },
  { name: 'Medicine', ability: 'WIS' },
  { name: 'Nature', ability: 'INT' },
  { name: 'Perception', ability: 'WIS' },
  { name: 'Performance', ability: 'CHA' },
  { name: 'Persuasion', ability: 'CHA' },
  { name: 'Religion', ability: 'INT' },
  { name: 'Sleight of Hand', ability: 'DEX' },
  { name: 'Stealth', ability: 'DEX' },
  { name: 'Survival', ability: 'WIS' },
]
const SKILL_NAMES = new Set(DND5E_SKILLS.map((s) => s.name))

/** Standard and rare languages (SRD 5.2.1 p. 20). Every character knows Common plus two. */
export const STANDARD_LANGUAGES = [
  'Common Sign Language',
  'Draconic',
  'Dwarvish',
  'Elvish',
  'Giant',
  'Gnomish',
  'Goblin',
  'Halfling',
  'Orc',
]
export const RARE_LANGUAGES = [
  'Abyssal',
  'Celestial',
  'Deep Speech',
  'Druidic',
  'Infernal',
  'Primordial',
  'Sylvan',
  "Thieves' Cant",
  'Undercommon',
]

/** Standard Array, Point Cost and its 27-point budget (SRD 5.2.1 p. 21). */
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8]
export const POINT_BUY_BUDGET = 27
export const POINT_BUY_COST: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
}

/**
 * Standard Array by Class (SRD 5.2.1 p. 21). The Artificer isn't in it: Lantern's suggestion
 * (derived) puts the highest scores in INT, then CON and DEX.
 */
export const SUGGESTED_ARRAY: Record<string, Record<Dnd5eAbility, number>> = {
  artificer: { STR: 8, DEX: 13, CON: 14, INT: 15, WIS: 12, CHA: 10 },
  barbarian: { STR: 15, DEX: 13, CON: 14, INT: 10, WIS: 12, CHA: 8 },
  bard: { STR: 8, DEX: 14, CON: 12, INT: 13, WIS: 10, CHA: 15 },
  cleric: { STR: 14, DEX: 8, CON: 13, INT: 10, WIS: 15, CHA: 12 },
  druid: { STR: 8, DEX: 12, CON: 14, INT: 13, WIS: 15, CHA: 10 },
  fighter: { STR: 15, DEX: 14, CON: 13, INT: 8, WIS: 10, CHA: 12 },
  monk: { STR: 12, DEX: 15, CON: 13, INT: 10, WIS: 14, CHA: 8 },
  paladin: { STR: 15, DEX: 10, CON: 13, INT: 8, WIS: 12, CHA: 14 },
  ranger: { STR: 12, DEX: 15, CON: 13, INT: 8, WIS: 14, CHA: 10 },
  rogue: { STR: 12, DEX: 15, CON: 13, INT: 14, WIS: 10, CHA: 8 },
  sorcerer: { STR: 10, DEX: 13, CON: 14, INT: 8, WIS: 12, CHA: 15 },
  warlock: { STR: 8, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 15 },
  wizard: { STR: 8, DEX: 12, CON: 13, INT: 15, WIS: 14, CHA: 10 },
}

/** The highest a character's ability score goes, outside Epic Boons (SRD 5.2.1 p. 6). */
export const ABILITY_CAP = 20

/**
 * Subclass numbers the data has no class-table column for: Battle Master maneuvers known and
 * Superiority Dice, Psi Warrior and Soulknife Psionic Energy Dice (PHB 2024), Arcane Archer
 * shots known and their die (Arcana Unleashed), by class level, as the authored summaries in
 * data/dnd5e/authored state them.
 */
const SUBCLASS_SCALING: Record<
  string,
  {
    groups?: Record<string, Record<number, number>>
    uses?: Record<string, { count?: Record<number, number>; dice?: Record<number, string> }>
  }
> = {
  'arcane-archer': {
    groups: { 'arcane-shot': { 3: 2, 7: 3, 10: 4, 15: 5, 18: 6 } },
    uses: { 'Arcane Shot': { dice: { 3: '1d6', 10: '1d8', 15: '1d10', 18: '1d12' } } },
  },
  'battle-master': {
    groups: { maneuvers: { 3: 3, 7: 5, 10: 7, 15: 9 } },
    uses: { 'Combat Superiority': { count: { 3: 4, 7: 5, 15: 6 } } },
  },
  'psi-warrior': {
    uses: {
      'Psionic Power': {
        count: { 3: 4, 5: 6, 9: 8, 13: 10, 17: 12 },
        dice: { 3: '1d6', 5: '1d8', 11: '1d10', 17: '1d12' },
      },
    },
  },
  soulknife: {
    uses: {
      'Psionic Power': {
        count: { 3: 4, 5: 6, 9: 8, 13: 10, 17: 12 },
        dice: { 3: '1d6', 5: '1d8', 11: '1d10', 17: '1d12' },
      },
    },
  },
}

/** Unarmored Defense that stops working with a Shield (Monk, College of Dance). */
const NO_SHIELD_AC = new Set(['monk', 'college-of-dance'])
/** Classes whose Weapon Mastery is limited to melee weapons (Barbarian, SRD 5.2.1 p. 29). */
const MELEE_MASTERY = new Set(['barbarian'])

// --- Small helpers -----------------------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim()
const keyPart = (s: string) =>
  norm(s)
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
const bySlug = <T extends { slug: string }>(list: T[], slug: string | undefined) =>
  slug ? list.find((x) => x.slug === slug) : undefined

/** A class table column's number at a level ("+10 ft." → 10, "–" → 0). */
export function columnNumber(cls: Dnd5eClassDef, level: number, column: string): number {
  const v = cls.levels.find((l) => l.level === level)?.columns[column] ?? ''
  const n = /-?\d+/.exec(v.replace(/^[+]/, ''))
  return n ? Number(n[0]) : 0
}
function columnText(cls: Dnd5eClassDef, level: number, column: string): string {
  return cls.levels.find((l) => l.level === level)?.columns[column] ?? ''
}

export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4)
}

/** Fixed Hit Point value per level (SRD 5.2.1 p. 23): d6 4, d8 5, d10 6, d12 7. */
export const fixedHp = (die: number) => die / 2 + 1

/** A Musical Instrument's or Gaming Set's variants, from the gear entry's "Variants:" line. */
function toolVariants(data: Dnd5eBuildData, name: string): string[] {
  const text = data.gear.find((g) => norm(g.name) === norm(name))?.text ?? ''
  const line = /\*\*Variants:\*\*\s*(.+)/.exec(text)?.[1] ?? ''
  return line
    .split(/,\s*/)
    .map((v) => v.replace(/\s*\(.*$/, '').trim())
    .filter(Boolean)
    .map((v) => v.charAt(0).toUpperCase() + v.slice(1))
}

/** The 17 Artisan's Tools (SRD 5.2.1 p. 93): the tools before the Disguise Kit in the data. */
function artisanTools(data: Dnd5eBuildData): string[] {
  const tools = data.gear.filter((g) => g.kind === 'tool').map((g) => g.name)
  const end = tools.findIndex((t) => norm(t) === 'disguise kit')
  return end > 0 ? tools.slice(0, end) : tools
}

/** A tool choice's names with categories spread out ("Artisan’s Tools" → the 17 tools). */
function expandTools(data: Dnd5eBuildData, from: string[] | undefined): string[] {
  const all = from?.length ? from : data.gear.filter((g) => g.kind === 'tool').map((g) => g.name)
  return all.flatMap((t) => {
    if (norm(t) === norm('Artisan’s Tools')) return artisanTools(data)
    const variants = toolVariants(data, t)
    return variants.length ? variants : [t]
  })
}

// --- The walk ------------------------------------------------------------------------

/** One option of a pick, shaped like `Pf2eOption` so `Pf2eOptionCards` can show it. */
export interface Dnd5ePickOption {
  id: string
  name: string
  meta?: string
  text?: string
  /** Why it can't be picked right now. */
  disabled?: string
  /** The book it comes from, for the source filter. */
  source?: Dnd5eSourceBook
}

export type Dnd5ePickKind =
  | Dnd5eChoice['kind']
  | 'subclass'
  | 'asi'
  | 'size'
  | 'lineage'
  | 'swapOut'
  | 'swapIn'
  | 'class'

/** A pick the builder or level-up asks for. */
export interface Dnd5ePick {
  /** Where its values are recorded: "L1:class:skills", "L4:asi", "L4:asi>asi". */
  key: string
  label: string
  /** What asks for it ("Fighter 1", "Elf", "Magic Initiate"). */
  from: string
  kind: Dnd5ePickKind
  count: number
  options: Dnd5ePickOption[]
  /** The same value can be picked more than once (+2 to one ability is that ability twice). */
  repeat?: boolean
  /** May be left empty (swaps). */
  optional?: boolean
  note?: string
}

interface Ctx {
  data: Dnd5eBuildData
  cls: Dnd5eClassDef
  species: Dnd5eSpeciesDef
  background: Dnd5eBackgroundDef
}

interface Uses {
  name: string
  from: string
  uses: Dnd5eUses
  dice?: string
  /** A pool of this many points per use count (Lay on Hands: 5 × Paladin level). */
  times?: number
  /** The class being walked when it came: its level and table set "level" and column counts. */
  cls: string
}

/** One class a hero has levels in, with what belongs to that class alone (SRD 5.2.1 p. 25). */
export interface Dnd5eClassTrack {
  cls: Dnd5eClassDef
  level: number
  sub?: Dnd5eSubclassDef
  /** The class level the subclass was chosen at. */
  subLevel?: number
  /** Spells are prepared per class, with that class's ability. */
  cantrips: string[]
  prepared: string[]
  book: string[]
  /** Bard's Magical Secrets: prepared spells may come from these lists too. */
  extraLists: string[]
  /** Another subclass whose spell table a pick lends (Vestige Patron's domain). */
  borrowed: { sub: Dnd5eSubclassDef; from: string }[]
}

function newTrack(cls: Dnd5eClassDef): Dnd5eClassTrack {
  return { cls, level: 0, cantrips: [], prepared: [], book: [], extraLists: [], borrowed: [] }
}

/** What a feat added, so a swap can take it back (a Fighter's Fighting Style). */
interface FeatTrace {
  feat: { slug: string; name: string; level: number }
  features: Dnd5eFeatureEntry[]
  extra: Dnd5eSpellRef[]
  uses: Uses[]
  senses: [string, number | undefined][]
}

/** Pools the data states only in prose: Lay on Hands, 5 × Paladin level a Long Rest (SRD 5.2.1 p. 53). */
const POOLS: Record<string, { count: Dnd5eUses['count']; times: number }> = {
  'Lay on Hands': { count: 'level', times: 5 },
}

/**
 * What a hero has, built up level by level. `ctx.cls`, `sub`, `subLevel`, `cantrips`,
 * `prepared`, `book`, `extraLists` and `borrowed` are the class being walked (`track`, the same
 * arrays); `tracks` holds every class, the first class first.
 */
export interface Dnd5eBuildState {
  ctx: Ctx
  /** Character level. */
  level: number
  /** The walked class's own level. */
  classLevel: number
  tracks: Dnd5eClassTrack[]
  track: Dnd5eClassTrack
  abilities: Record<Dnd5eAbility, number>
  sub?: Dnd5eSubclassDef
  size: string
  lineage?: Dnd5eLineage
  lineageAbility?: Dnd5eAbility
  saves: Set<Dnd5eAbility>
  skills: Set<string>
  expertise: Set<string>
  tools: Set<string>
  languages: Set<string>
  weapons: Set<string>
  armor: Set<string>
  feats: { slug: string; name: string; level: number }[]
  options: { group: string; slug: string; name: string; level: number }[]
  masteries: string[]
  cantrips: string[]
  prepared: string[]
  book: string[]
  extra: Dnd5eSpellRef[]
  features: Dnd5eFeatureEntry[]
  /** Option names picked anywhere (a Land type), for options that follow them (Nature's Ward). */
  picked: Set<string>
  senses: Map<string, number>
  resistances: Set<string>
  immunities: Set<string>
  conditionImmunities: Set<string>
  walkBonus: number
  speeds: Map<string, number | 'walk'>
  ac: { formula: string; noShield: boolean }[]
  hpPerLevel: number
  uses: Uses[]
  /** Fighting Style feature reached (the Fighting Style feats' prerequisite). */
  fightingStyle: boolean
  /** Bard's Magical Secrets: prepared spells may come from these lists too. */
  extraLists: string[]
  /** The picks asked for at the level being planned, in order. */
  asked: Dnd5ePick[]
  /** Ability increases at the level being planned. */
  increases: Partial<Record<Dnd5eAbility, number>>
  /** The spellcasting ability a feat being taken uses (Magic Initiate's choice). */
  featAbility?: Dnd5eAbility
  /** The increase the last Ability Score Increase made (Resilient's save follows it). */
  lastIncrease?: Partial<Record<Dnd5eAbility, number>>
  /** Alert: Proficiency Bonus added to Initiative. */
  initiativePb?: boolean
  /**
   * Spells a grant gives at a later level ("at": 5), added when the walk reaches it: a class's
   * (`cls`) at that class level, a species' or feat's at that character level.
   */
  later: { at: number; slug: string; from: string; extra: Partial<Dnd5eSpellRef>; cls?: string }[]
  /** Another subclass whose spell table a pick lends (Vestige Patron's domain), by its row levels. */
  borrowed: { sub: Dnd5eSubclassDef; from: string }[]
  /** The level the subclass was chosen at. */
  subLevel?: number
  /** Fighting Style feats a later level of their class may replace, by class slug. */
  styles: Map<string, FeatTrace>
  /** Options picked for each repeatable feat ("a different spell list each time"), by feat slug. */
  featPicks: Map<string, string[]>
}

type Picks = Record<string, string[]>

interface Walker {
  st: Dnd5eBuildState
  /** Character level: pick keys, feats, species traits. */
  level: number
  /** The walked class's level: its table, features and spells. */
  cl: number
  /** Inside a class or subclass feature, whose "at" levels are class levels. */
  classScope: boolean
  picks: Picks
  /** Record what is asked (the level being planned). */
  asking: boolean
}

function newState(ctx: Ctx, abilities: Record<Dnd5eAbility, number>): Dnd5eBuildState {
  const first = newTrack(ctx.cls)
  return {
    ctx,
    level: 0,
    classLevel: 0,
    tracks: [first],
    track: first,
    abilities: { ...abilities },
    size: ctx.species.sizes[0] ?? 'Medium',
    saves: new Set(),
    skills: new Set(),
    expertise: new Set(),
    tools: new Set(),
    languages: new Set(['Common']),
    weapons: new Set(),
    armor: new Set(),
    feats: [],
    options: [],
    masteries: [],
    cantrips: first.cantrips,
    prepared: first.prepared,
    book: first.book,
    extra: [],
    features: [],
    picked: new Set(),
    senses: new Map(),
    resistances: new Set(),
    immunities: new Set(),
    conditionImmunities: new Set(),
    walkBonus: 0,
    speeds: new Map(),
    ac: [],
    hpPerLevel: 0,
    uses: [],
    fightingStyle: false,
    extraLists: first.extraLists,
    asked: [],
    increases: {},
    later: [],
    borrowed: first.borrowed,
    styles: new Map(),
    featPicks: new Map(),
  }
}

/** Makes `t` the walked class: `ctx.cls`, the subclass and the spell lists become its own. */
function enterTrack(st: Dnd5eBuildState, t: Dnd5eClassTrack) {
  st.track = t
  st.ctx = { ...st.ctx, cls: t.cls }
  st.sub = t.sub
  st.subLevel = t.subLevel
  st.cantrips = t.cantrips
  st.prepared = t.prepared
  st.book = t.book
  st.extraLists = t.extraLists
  st.borrowed = t.borrowed
}

function leaveTrack(st: Dnd5eBuildState, t: Dnd5eClassTrack) {
  t.sub = st.sub
  t.subLevel = st.subLevel
}

const trackOf = (st: Pick<Dnd5eBuildState, 'tracks'>, slug: string | undefined) =>
  st.tracks.find((t) => t.cls.slug === slug) ?? st.tracks[0]!

/** Replaces `out` with `inn` in place, so a class's spell list stays the track's own array. */
function replaceIn(list: string[], out: string, inn: string) {
  const i = list.indexOf(out)
  if (i >= 0) list.splice(i, 1, inn)
}

/** Records a pick (when planning) and returns its values, cut to its count. */
function ask(w: Walker, pick: Dnd5ePick): string[] {
  if (w.asking) w.st.asked.push(pick)
  const values = (w.picks[pick.key] ?? []).slice(0, pick.count)
  return pick.repeat ? values : [...new Set(values)]
}

function spellName(data: Dnd5eBuildData, slug: string) {
  return data.spells.find((s) => s.slug === slug)?.name ?? slug
}

function addFeature(
  st: Dnd5eBuildState,
  name: string,
  from: string,
  m: { text?: string; summary?: string },
) {
  if (st.features.some((f) => f.name === name && f.from === from)) return
  st.features.push({ name, desc: m.summary ?? m.text ?? '', from })
}

/** The casting a hero has at a level: the class's, or a subclass's (Eldritch Knight). */
function castingOf(st: Dnd5eBuildState): Dnd5eSpellcasting | undefined {
  return st.ctx.cls.spellcasting ?? st.sub?.spellcasting
}

/** The highest spell level the hero has slots for at `level` (0 without casting). */
export function maxSpellLevel(sc: Dnd5eSpellcasting | undefined, level: number): number {
  if (!sc) return 0
  if (sc.pact) return sc.pact[level - 1]?.slotLevel ?? 0
  const slots = sc.slots?.[level - 1] ?? []
  let max = 0
  slots.forEach((n, i) => n > 0 && (max = i + 1))
  return max
}

function spellAbility(st: Dnd5eBuildState): Dnd5eAbility {
  return castingOf(st)?.ability ?? 'INT'
}

function addExtraSpell(
  st: Dnd5eBuildState,
  slug: string,
  from: string,
  extra: Partial<Dnd5eSpellRef> = {},
) {
  if (st.extra.some((s) => s.slug === slug && s.from === from)) return
  const def = st.ctx.data.spells.find((s) => s.slug === slug)
  st.extra.push({
    slug,
    name: def?.name ?? slug,
    level: def?.level ?? 0,
    from,
    ability: extra.ability ?? spellAbility(st),
    always: true,
    ...extra,
  })
}

function grantSkill(w: Walker, value: string, from: string, key: string) {
  const st = w.st
  if (!st.skills.has(value) && !st.tools.has(value)) {
    if (SKILL_NAMES.has(value)) st.skills.add(value)
    else st.tools.add(value)
    return
  }
  // 2024 rules: a proficiency you'd gain twice lets you pick another of the same kind.
  const skill = SKILL_NAMES.has(value)
  const options = (skill ? [...SKILL_NAMES] : expandTools(st.ctx.data, undefined))
    .filter((v) => !st.skills.has(v) && !st.tools.has(v))
    .map((v) => ({ id: v, name: v }))
  const values = ask(w, {
    key: `${key}>dup-${keyPart(value)}`,
    label: `Replace ${value} (already proficient)`,
    from,
    kind: skill ? 'skill' : 'tool',
    count: 1,
    options,
    note: `You already have ${value}, so you pick another ${skill ? 'skill' : 'tool'} instead.`,
  })
  for (const v of values) (skill ? st.skills : st.tools).add(v)
}

function applyGrants(w: Walker, grants: Dnd5eGrant[] | undefined, from: string, key: string) {
  const st = w.st
  for (const g of grants ?? []) {
    switch (g.kind) {
      case 'skill':
      case 'tool':
        grantSkill(w, g.value, from, key)
        break
      case 'expertise':
        st.expertise.add(g.value)
        break
      case 'save':
        st.saves.add(g.value as Dnd5eAbility)
        break
      case 'armor':
        st.armor.add(g.value)
        break
      case 'weapon':
        st.weapons.add(g.value)
        break
      case 'language':
        st.languages.add(g.value)
        break
      case 'resistance':
        st.resistances.add(g.value)
        break
      case 'immunity':
        st.immunities.add(g.value)
        break
      case 'conditionImmunity':
        st.conditionImmunities.add(g.value)
        break
      case 'sense':
        st.senses.set(g.value, Math.max(st.senses.get(g.value) ?? 0, g.range))
        break
      case 'speed':
        if (g.bonus && g.value === 'walk') st.walkBonus += g.bonus
        else if (g.amount !== undefined) st.speeds.set(g.value, g.amount)
        break
      case 'spell': {
        const extra: Partial<Dnd5eSpellRef> = {
          ...(g.free ? { free: g.free } : {}),
          ...(g.atWill ? { atWill: true } : {}),
          ...(st.featAbility ? { ability: st.featAbility } : {}),
        }
        if (!g.at || g.at <= (w.classScope ? w.cl : w.level))
          addExtraSpell(st, g.spell, from, extra)
        else
          st.later.push({
            at: g.at,
            slug: g.spell,
            from,
            extra,
            ...(w.classScope ? { cls: st.ctx.cls.slug } : {}),
          })
        break
      }
      case 'hp':
        st.hpPerLevel += g.perLevel
        break
      case 'ac':
        st.ac.push({
          formula: g.formula,
          noShield: [...NO_SHIELD_AC].some((s) => keyPart(from).startsWith(s)),
        })
        break
      case 'feat':
        takeFeat(w, g.feat, `${key}>feat`, from)
        break
    }
  }
}

/** Uses that refresh on a rest become resources; per-turn limits don't. */
function addUses(st: Dnd5eBuildState, name: string, from: string, m: Dnd5eMechanics) {
  const pool = POOLS[name]
  const cls = st.ctx.cls.slug
  if (pool && !st.uses.some((u) => u.name === name))
    st.uses.push({
      name,
      from,
      uses: { count: pool.count, recharge: 'long' },
      times: pool.times,
      cls,
    })
  if (!m.uses || m.uses.recharge === 'turn') return
  if (st.uses.some((u) => u.name === name)) return
  st.uses.push({ name, from, uses: m.uses, ...(m.dice ? { dice: m.dice } : {}), cls })
}

// --- Prerequisites -------------------------------------------------------------------

/** What a prerequisite asks that the hero lacks; empty when met. */
export function unmetPrerequisite(
  st: Dnd5eBuildState,
  pre: Dnd5ePrerequisite | undefined,
  level: number,
): string[] {
  if (!pre) return []
  const out: string[] = []
  if (pre.level && level < pre.level) out.push(`level ${pre.level}+`)
  if (pre.abilities) {
    const { abilities, min, any } = pre.abilities
    const ok = (a: Dnd5eAbility) => st.abilities[a] >= min
    if (any ? !abilities.some(ok) : !abilities.every(ok))
      out.push(
        `${abilities.map((a) => DND5E_ABILITY_NAME[a]).join(any ? ' or ' : ' and ')} ${min}+`,
      )
  }
  if (
    pre.species?.length &&
    !pre.species.some((s) => [st.ctx.species.slug, norm(st.ctx.species.name)].includes(norm(s)))
  )
    out.push(pre.species.join(' or '))
  if (pre.classes?.length && !st.tracks.some((t) => pre.classes!.includes(t.cls.slug)))
    out.push(pre.classes.join(' or '))
  if (pre.spellcasting && !st.tracks.some((t) => t.cls.spellcasting ?? t.sub?.spellcasting))
    out.push('Spellcasting or Pact Magic')
  if (pre.feature)
    for (const r of requirementsOf(pre.feature))
      if (!r.any.some((f) => hasFeature(st, f))) out.push(r.text)
  if (
    /cantrip that deals damage/i.test(pre.text) &&
    !damageCantrip(st, /attack roll/i.test(pre.text))
  )
    out.push('a damaging Warlock cantrip')
  return out
}

function damageCantrip(st: Dnd5eBuildState, attack: boolean) {
  return damagingCantrips(st, attack).length > 0
}

function damagingCantrips(st: Dnd5eBuildState, attack: boolean): Dnd5eSpellDef[] {
  const known = new Set([...st.cantrips, ...st.extra.map((s) => s.slug)])
  return st.ctx.data.spells.filter(
    (s) =>
      s.level === 0 &&
      known.has(s.slug) &&
      s.classes.includes(st.ctx.cls.slug) &&
      !!s.damage?.length &&
      (!attack || !!s.attack),
  )
}

const requirementCache = new Map<string, { text: string; any: string[] }[]>()

/**
 * A prerequisite's feature line as its separate requirements, each met by any of its
 * alternatives ("Eberron Campaign, Can’t Have Another Dragonmark Feat"; "Purple Dragon Rook Feat
 * or Martial Weapon Proficiency"). A tool list ("Proficiency with A, B, or C") is one.
 */
function requirementsOf(line: string) {
  let out = requirementCache.get(line)
  if (!out) {
    const parts = /^proficiency with /i.test(line) ? [line] : line.split(/,\s*/).filter(Boolean)
    out = parts.map((text) => ({
      text,
      any: /^proficiency with /i.test(text) ? [norm(text)] : text.split(/\s+or\s+/i).map(norm),
    }))
    requirementCache.set(line, out)
  }
  return out
}

const featCategory = (st: Dnd5eBuildState, slug: string) =>
  st.ctx.data.feats.find((f) => f.slug === slug)?.category

function hasFeature(st: Dnd5eBuildState, feature: string): boolean {
  const f = norm(feature)
  // The campaign a feat belongs to (Ravenloft, Eberron) is the table's choice, not the hero's.
  if (f.endsWith(' campaign')) return true
  const another = /^can't have another (.+) feat$/.exec(f)
  if (another) return !st.feats.some((x) => featCategory(st, x.slug) === keyPart(another[1]!))
  const any = /^any (.+) feat$/.exec(f)
  if (any) return st.feats.some((x) => featCategory(st, x.slug) === keyPart(any[1]!))
  const feat = /^(.+) feat$/.exec(f)
  if (feat) return st.feats.some((x) => norm(x.name) === feat[1])
  const species = /^(.+) species$/.exec(f)
  if (species) return norm(baseName(st.ctx.species.name)) === species[1]
  const tools = /^proficiency with (.+)$/.exec(f)
  if (tools)
    return tools[1]!
      .split(/,\s*(?:or\s+)?|\s+or\s+/)
      .some((t) => [...st.tools].some((x) => norm(x) === t))
  const weapons = /^(.+) weapon proficiency$/.exec(f)
  if (weapons) return [...st.weapons].some((x) => norm(x).startsWith(weapons[1]!))
  if (f === 'fighting style feature') return st.fightingStyle
  const training = /^(light|medium|heavy) armor training$/.exec(f)
  if (training) return [...st.armor].some((a) => norm(a) === `${training[1]} armor`)
  if (f === 'shield training') return [...st.armor].some((a) => norm(a) === 'shields')
  const invocation = /^(.+) invocation$/.exec(f)
  if (invocation) return st.options.some((o) => norm(o.name) === invocation[1])
  const named = /^(.+) feature$/.exec(f)?.[1] ?? f
  return st.features.some((x) => norm(x.name) === named)
}

// --- Choices -------------------------------------------------------------------------

const allSkills = () => DND5E_SKILLS.map((s) => s.name)

/** A non-SRD record's book as its short tag ("Arcana Unleashed"); SRD entries carry none. */
const sourceTag = (r: { srd: boolean; source: Dnd5eSourceBook }) =>
  r.srd ? '' : (dnd5eSource(r.source)?.short ?? r.source)

function spellOption(s: Dnd5eSpellDef, disabled?: string): Dnd5ePickOption {
  const tags = [
    s.level ? `Level ${s.level}` : 'Cantrip',
    s.school,
    s.concentration ? 'Concentration' : '',
    s.ritual ? 'Ritual' : '',
    sourceTag(s),
  ].filter(Boolean)
  return {
    id: s.slug,
    name: s.name,
    meta: tags.join(' · '),
    ...(s.text || s.summary ? { text: s.text ?? s.summary } : {}),
    ...(disabled ? { disabled } : {}),
    source: s.source,
  }
}

/** The class lists a spell choice draws on: its `list`, or the classes its label names. */
function choiceLists(st: Dnd5eBuildState, c: Dnd5eChoice): string[] | null {
  if (c.list) return [c.list]
  const named = st.ctx.data.classes
    .filter((k) => c.label && new RegExp(`\\b${k.name}\\b`).test(c.label))
    .map((k) => k.slug)
  return named.length ? named : null
}

/** The school a choice's label names in parentheses ("Evocation Savant (Evocation)"). */
function labelSchool(label: string | undefined): string | undefined {
  return /\((Abjuration|Conjuration|Divination|Enchantment|Evocation|Illusion|Necromancy|Transmutation)\)/.exec(
    label ?? '',
  )?.[1]
}

/** "Mystic Arcanum (Level 7 Spell)": a spell of exactly that level. */
const exactLevel = (label: string | undefined) =>
  Number(/\(Level (\d) Spell\)/i.exec(label ?? '')?.[1] ?? 0)

/** Every spell the hero knows, from any class. */
function knownSpellSlugs(st: Dnd5eBuildState) {
  return new Set([
    ...st.tracks.flatMap((t) => [...t.cantrips, ...t.prepared]),
    ...st.extra.map((s) => s.slug),
  ])
}

const KIND_WORD: Partial<Record<Dnd5eChoice['kind'], string>> = {
  skill: 'skill',
  expertise: 'Expertise',
  tool: 'tool',
  language: 'language',
  cantrip: 'cantrip',
  spell: 'spell',
  feat: 'feat',
  ability: 'ability',
  weaponMastery: 'weapon mastery',
  damageType: 'damage type',
}

/** "Magic Initiate (Wizard): 2 cantrips" for a choice the data leaves unnamed. */
function defaultLabel(c: Dnd5eChoice, from: string, owner: string | undefined): string {
  const who = owner && owner !== from ? `${from} (${owner})` : (owner ?? from)
  const word = KIND_WORD[c.kind]
  if (!word) return who
  return `${who}: ${c.count > 1 ? `${c.count} ${word}s` : word}`
}

/**
 * Asks for a choice of a feature, trait, feat, option or lineage and applies what's picked, and
 * returns an `option` or `damageType` choice's values. `owner` gives the record whose named
 * `options` an `option` choice picks among; `taken` are options an earlier copy of a repeatable
 * feat chose, which this one can't (Magic Initiate's spell list).
 */
function runChoice(
  w: Walker,
  c: Dnd5eChoice,
  key: string,
  from: string,
  owner: { options?: Dnd5eOption[]; uses?: Dnd5eUses; name?: string },
  fixed?: string,
  taken: string[] = [],
): string[] {
  const again = (v: string) =>
    taken.includes(v) ? { disabled: `Chosen when you took ${owner.name ?? from} before` } : {}
  const st = w.st
  const data = st.ctx.data
  const label = c.label ?? defaultLabel(c, from, owner.name)
  const base = { key, label, from, count: c.count, ...(c.note ? { note: c.note } : {}) }
  switch (c.kind) {
    case 'skill': {
      const pool = c.from?.length ? c.from : allSkills()
      const expertIfHad = /expertise if already proficient/i.test(c.label ?? '')
      const values = ask(w, {
        ...base,
        kind: 'skill',
        options: pool.map((v) => {
          const had = st.skills.has(v) || st.tools.has(v)
          return {
            id: v,
            name: v,
            ...(SKILL_NAMES.has(v) ? {} : { meta: 'Tool' }),
            ...(had && !(expertIfHad && !st.expertise.has(v))
              ? { disabled: 'Already proficient' }
              : {}),
          }
        }),
      })
      for (const v of values)
        if (expertIfHad && st.skills.has(v)) st.expertise.add(v)
        else if (SKILL_NAMES.has(v)) st.skills.add(v)
        else st.tools.add(v)
      return []
    }
    case 'expertise': {
      const pool = [...st.skills].filter((s) => !c.from?.length || c.from.includes(s))
      const values = ask(w, {
        ...base,
        kind: 'expertise',
        options: pool.map((v) => ({
          id: v,
          name: v,
          ...(st.expertise.has(v) ? { disabled: 'Already has Expertise' } : {}),
        })),
        note: c.note ?? 'Expertise doubles your Proficiency Bonus for the skill.',
      })
      values.forEach((v) => st.expertise.add(v))
      return []
    }
    case 'tool': {
      const values = ask(w, {
        ...base,
        kind: 'tool',
        options: expandTools(data, c.from).map((v) => ({
          id: v,
          name: v,
          ...(st.tools.has(v) ? { disabled: 'Already proficient' } : {}),
        })),
      })
      values.forEach((v) => st.tools.add(v))
      return []
    }
    case 'language': {
      const values = ask(w, {
        ...base,
        kind: 'language',
        options: [...STANDARD_LANGUAGES, ...RARE_LANGUAGES].map((v) => ({
          id: v,
          name: v,
          meta: STANDARD_LANGUAGES.includes(v) ? 'Standard' : 'Rare',
          ...(st.languages.has(v) ? { disabled: 'Already known' } : {}),
        })),
      })
      values.forEach((v) => st.languages.add(v))
      return []
    }
    case 'cantrip':
    case 'spell': {
      const cantrip = c.kind === 'cantrip'
      const lists = choiceLists(st, c)
      const exact = exactLevel(c.label)
      const top = exact || c.maxLevel || Math.max(1, maxSpellLevel(castingOf(st), w.cl))
      const school = c.school?.length
        ? c.school
        : labelSchool(c.label)
          ? [labelSchool(c.label)!]
          : undefined
      const ritual = c.ritual || /ritual/i.test(c.label ?? '')
      const bookMode = !cantrip && usesSpellbook(st) && /spellbook|savant/i.test(c.label ?? '')
      const fromBook =
        !cantrip && usesSpellbook(st) && /spell mastery|signature/i.test(c.label ?? '')
      const allowCantrips = /cantrips allowed/i.test(c.label ?? '')
      const known = knownSpellSlugs(st)
      const pool = data.spells.filter((s) => {
        if (c.from?.length && !c.from.includes(s.slug)) return false
        if (lists && !s.classes.some((k) => lists.includes(k))) return false
        if (cantrip) return s.level === 0
        if (s.level === 0) return allowCantrips
        if (exact ? s.level !== exact : s.level > top) return false
        if (school && !school.includes(s.school)) return false
        if (ritual && !s.ritual) return false
        if (fromBook && !st.book.includes(s.slug)) return false
        return true
      })
      const values = ask(w, {
        ...base,
        kind: c.kind,
        options: pool.map((s) =>
          spellOption(
            s,
            bookMode
              ? st.book.includes(s.slug)
                ? 'In your spellbook'
                : undefined
              : !fromBook && known.has(s.slug)
                ? 'Already known'
                : undefined,
          ),
        ),
      })
      for (const v of values)
        if (bookMode) {
          if (!st.book.includes(v)) st.book.push(v)
        } else
          addExtraSpell(st, v, label, {
            ...(owner.uses ? { free: owner.uses } : {}),
            ...(w.st.featAbility ? { ability: w.st.featAbility } : {}),
          })
      return []
    }
    case 'feat':
      featChoice(w, key, label, from, c.category ?? ['general'], c.from)
      return []
    case 'ability': {
      const values = ask(w, {
        ...base,
        kind: 'ability',
        options: (c.from ?? DND5E_ABILITIES).map((a) => ({
          id: a,
          name: DND5E_ABILITY_NAME[a as Dnd5eAbility] ?? a,
        })),
      })
      if (values[0]) st.featAbility = values[0] as Dnd5eAbility
      return []
    }
    case 'weaponMastery': {
      masteryChoice(w, key, label, from, c.count)
      return []
    }
    case 'damageType': {
      const values = ask(w, {
        ...base,
        kind: 'damageType',
        options: (c.from ?? []).map((v) => ({ id: v, name: v, ...again(v) })),
      })
      if (/resist|resilience|affinity|ward/i.test(`${from} ${owner.name ?? ''} ${label}`))
        values.forEach((v) => st.resistances.add(v))
      values.forEach((v) => st.picked.add(v))
      return values
    }
    case 'option': {
      if (c.group) {
        groupChoice(w, key, label, from, c.group, c.count)
        return []
      }
      const opts: Dnd5eOption[] = owner.options?.length
        ? owner.options
        : (c.from ?? []).map((name) => ({ name }))
      const values = fixed
        ? [fixed]
        : ask(w, {
            ...base,
            kind: 'option',
            options: opts.map((o) => ({
              id: o.name,
              name: o.name,
              ...(o.text || o.summary ? { text: o.text ?? o.summary } : {}),
              ...again(o.name),
            })),
          })
      for (const v of values) {
        const o = opts.find((x) => x.name === v)
        if (!o) continue
        st.picked.add(o.name)
        addFeature(st, `${label}: ${o.name}`, from, o)
        applyMechanics(w, o, `${key}>${keyPart(o.name)}`, from, o.name)
        const lent = data.subclasses.find((x) => norm(x.name) === norm(o.name))
        if (lent?.spells?.length) st.borrowed.push({ sub: lent, from })
      }
      return values
    }
  }
  return []
}

/** Grants, uses and choices of a feature, trait, option, feat benefit or lineage. */
function applyMechanics(
  w: Walker,
  m: Dnd5eMechanics & { name?: string },
  key: string,
  from: string,
  name: string,
) {
  applyGrants(w, m.grants, from, key)
  addUses(w.st, name, from, m)
  m.choices?.forEach((c, i) => runChoice(w, c, `${key}:${i}`, from, { ...m, name }))
}

function usesSpellbook(st: Dnd5eBuildState): boolean {
  return st.ctx.cls.features.some((f) => f.choices?.some((c) => /spellbook/i.test(c.label ?? '')))
}

// --- Feats ---------------------------------------------------------------------------

/** The feat categories an Ability Score Improvement or Epic Boon offers (2024 rules). */
const ASI_CATEGORIES: Dnd5eFeatDef['category'][] = ['general', 'origin', 'fighting-style']
const BOON_CATEGORIES: Dnd5eFeatDef['category'][] = ['epic-boon', ...ASI_CATEGORIES]

/** Why a feat can't be taken now, or empty. */
export function featBlocked(st: Dnd5eBuildState, f: Dnd5eFeatDef, level: number): string {
  if (!f.repeatable && st.feats.some((x) => x.slug === f.slug)) return 'Already taken'
  const unmet = unmetPrerequisite(st, f.prerequisite, level)
  return unmet.length ? `Needs ${unmet.join(', ')}` : ''
}

/** Feat categories as the books name them. */
export const DND5E_FEAT_CATEGORY_NAME: Record<Dnd5eFeatCategory, string> = {
  origin: 'Origin',
  general: 'General',
  'fighting-style': 'Fighting Style',
  'epic-boon': 'Epic Boon',
  dragonmark: 'Dragonmark',
  'planar-pact': 'Planar Pact',
  'dark-gift': 'Dark Gift',
}

function featOption(f: Dnd5eFeatDef, disabled: string): Dnd5ePickOption {
  const meta = [
    DND5E_FEAT_CATEGORY_NAME[f.category],
    f.prerequisite?.text ?? '',
    f.repeatable ? 'Repeatable' : '',
    sourceTag(f),
  ].filter(Boolean)
  return {
    id: f.slug,
    name: f.name,
    meta: meta.join(' · '),
    ...(f.text || f.summary ? { text: f.text ?? f.summary } : {}),
    ...(disabled ? { disabled } : {}),
    source: f.source,
  }
}

function featChoice(
  w: Walker,
  key: string,
  label: string,
  from: string,
  categories: Dnd5eFeatDef['category'][],
  only?: string[],
) {
  const st = w.st
  const feats = st.ctx.data.feats.filter(
    (f) => categories.includes(f.category) && (!only?.length || only.includes(f.slug)),
  )
  const values = ask(w, {
    key,
    label,
    from,
    kind: 'feat',
    count: 1,
    options: feats.map((f) => featOption(f, featBlocked(st, f, w.level))),
  })
  for (const v of values) takeFeat(w, v, key, from)
}

/** What the hero has now, so `traceSince` can tell what a feat taken after it added. */
function traceMark(st: Dnd5eBuildState) {
  return {
    feats: st.feats.length,
    features: st.features.length,
    extra: st.extra.length,
    uses: st.uses.length,
    senses: new Map(st.senses),
  }
}

function traceSince(
  st: Dnd5eBuildState,
  mark: ReturnType<typeof traceMark>,
): FeatTrace | undefined {
  const feat = st.feats[mark.feats]
  if (!feat) return undefined
  return {
    feat,
    features: st.features.slice(mark.features),
    extra: st.extra.slice(mark.extra),
    uses: st.uses.slice(mark.uses),
    senses: [...st.senses.keys()]
      .filter((k) => st.senses.get(k) !== mark.senses.get(k))
      .map((k) => [k, mark.senses.get(k)]),
  }
}

/** Takes back a feat and what it added (a swapped Fighting Style). */
function dropFeat(st: Dnd5eBuildState, t: FeatTrace) {
  st.feats = st.feats.filter((x) => x !== t.feat)
  st.features = st.features.filter((x) => !t.features.includes(x))
  st.extra = st.extra.filter((x) => !t.extra.includes(x))
  st.uses = st.uses.filter((x) => !t.uses.includes(x))
  for (const [k, v] of t.senses)
    if (v === undefined) st.senses.delete(k)
    else st.senses.set(k, v)
}

/** Takes a feat: its benefits' grants and uses, its increase and its own picks. */
function takeFeat(w: Walker, slug: string, key: string, from: string, fixedOption?: string) {
  const st = w.st
  const f = bySlug(st.ctx.data.feats, slug)
  if (!f) return
  const scope = w.classScope
  w.classScope = false
  st.feats.push({ slug: f.slug, name: f.name, level: w.level })
  addFeature(st, f.name, `Feat${from ? ` · ${from}` : ''}`, f)
  const saved = st.featAbility
  st.featAbility = undefined
  if (f.asi) asiChoice(w, f, `${key}>asi`)
  applyGrants(w, f.grants, f.name, key)
  addUses(st, f.name, f.name, f)
  const sameAsAsi = (c: Dnd5eChoice) =>
    c.kind === 'ability' &&
    !!f.asi &&
    f.asi.amount === 1 &&
    (c.from ?? []).length === f.asi.abilities.length &&
    (c.from ?? []).every((a) => f.asi!.abilities.includes(a as Dnd5eAbility))
  // The spellcasting ability first, so the spells the feat's option picks use it.
  const order = (f.choices ?? []).map((c, i) => [c, i] as const)
  order.sort(([a], [b]) => Number(b.kind === 'ability') - Number(a.kind === 'ability'))
  // "You must choose a different spell list each time" (Magic Initiate, SRD 5.2.1 p. 87).
  const different = !!f.repeatable && /different .+ each time/i.test(f.text ?? f.summary ?? '')
  for (const [c, i] of order) {
    const values = runChoice(
      w,
      c,
      `${key}>${i}`,
      f.name,
      f,
      c.kind === 'option' && !c.group ? fixedOption : undefined,
      different ? (st.featPicks.get(f.slug) ?? []) : [],
    )
    if (different && values.length)
      st.featPicks.set(f.slug, [...(st.featPicks.get(f.slug) ?? []), ...values])
  }
  f.benefits.forEach((b, bi) => {
    applyGrants(w, b.grants, f.name, `${key}>b${bi}`)
    addUses(st, `${f.name}: ${b.name}`, f.name, b)
    b.choices?.forEach((c, i) => {
      // Resilient: the save is the ability the feat raised, one pick (quirk in the data).
      if (sameAsAsi(c)) {
        const raised = Object.keys(st.lastIncrease ?? {})[0] as Dnd5eAbility | undefined
        if (raised && /saving throw/i.test(b.name)) st.saves.add(raised)
        return
      }
      runChoice(w, c, `${key}>b${bi}:${i}`, f.name, { ...b, name: b.name })
    })
  })
  if (/initiative proficiency/i.test(f.benefits.map((b) => b.name).join())) st.initiativePb = true
  st.featAbility = saved
  w.classScope = scope
}

/** A feat's Ability Score Increase: +2 to one or +1 to two for the ASI feat, else +1. */
function asiChoice(w: Walker, f: Dnd5eFeatDef, key: string) {
  const st = w.st
  const asi = f.asi!
  const double = asi.amount === 2
  const auto = !double && asi.abilities.length === 1
  const values = auto
    ? [asi.abilities[0]!]
    : ask(w, {
        key,
        label: double
          ? 'Ability Score Improvement: +2 to one or +1 to two'
          : `${f.name}: +${asi.amount} to one ability`,
        from: f.name,
        kind: 'asi',
        count: double ? 2 : 1,
        repeat: double,
        options: asi.abilities.map((a) => ({
          id: a,
          name: DND5E_ABILITY_NAME[a],
          meta: `Now ${st.abilities[a]}`,
          ...(st.abilities[a] >= asi.max ? { disabled: `Already ${asi.max}` } : {}),
        })),
        note: double ? 'Pick one ability twice for +2, or two abilities for +1 each.' : undefined,
      })
  const inc: Partial<Record<Dnd5eAbility, number>> = {}
  for (const v of values) {
    const a = v as Dnd5eAbility
    const add = double ? 1 : asi.amount
    const room = Math.max(0, asi.max - st.abilities[a])
    const step = Math.min(add, room)
    st.abilities[a] += step
    inc[a] = (inc[a] ?? 0) + step
    st.increases[a] = (st.increases[a] ?? 0) + step
  }
  st.lastIncrease = inc
}

// --- Masteries and option groups -----------------------------------------------------

/** Whether the hero's weapon training covers a weapon ("Simple weapons", "Martial … Finesse"). */
export function proficientWith(profs: Iterable<string>, w: Dnd5eWeaponDef): boolean {
  for (const p of profs) {
    const n = norm(p)
    if (n === norm(w.name) || n === norm(`${w.name}s`)) return true
    if (n === `${w.category.toLowerCase()} weapons`) return true
    if (n === `${w.category.toLowerCase()} ${w.type.toLowerCase()} weapons`) return true
    if (n.startsWith('martial weapons that have') && w.category === 'Martial')
      if (w.properties.some((prop) => n.includes(prop.toLowerCase()))) return true
  }
  return false
}

function masteryChoice(w: Walker, key: string, label: string, from: string, count: number) {
  const st = w.st
  if (count <= 0) return
  const melee = MELEE_MASTERY.has(st.ctx.cls.slug)
  const values = ask(w, {
    key,
    label: label === from ? 'Weapon Mastery' : label,
    from,
    kind: 'weaponMastery',
    count,
    options: st.ctx.data.weapons
      .filter((x) => !melee || x.type === 'Melee')
      .map((x) => ({
        id: x.slug,
        name: x.name,
        meta: `${x.mastery} · ${x.category} ${x.type}`,
        ...(st.masteries.includes(x.slug)
          ? { disabled: 'Already mastered' }
          : !proficientWith(st.weapons, x)
            ? { disabled: 'Not proficient' }
            : {}),
      })),
    note: melee ? 'Melee weapons only.' : 'Weapons you are proficient with.',
  })
  values.forEach((v) => st.masteries.includes(v) || st.masteries.push(v))
}

function optionGroupEntries(st: Dnd5eBuildState, group: string): Dnd5eOptionEntry[] {
  return st.ctx.data.options.find((g) => g.slug === group)?.entries ?? []
}

/** An invocation that targets a damaging cantrip ("Agonizing Blast"), and whether it needs an attack roll. */
const cantripTarget = (e: Dnd5eOptionEntry) =>
  /cantrip that deals damage/i.test(e.prerequisite?.text ?? '')
    ? { attack: /attack roll/i.test(e.prerequisite?.text ?? '') }
    : null

function entryOption(st: Dnd5eBuildState, e: Dnd5eOptionEntry, level: number): Dnd5ePickOption {
  const times = st.options.filter((o) => o.slug === e.slug).length
  // A repeatable invocation goes to a different cantrip each time.
  const target = cantripTarget(e)
  const room = target ? damagingCantrips(st, target.attack).length : Infinity
  const taken = e.repeatable ? times > 0 && times >= room : times > 0
  const unmet = unmetPrerequisite(st, e.prerequisite, level)
  const meta = [
    e.prerequisite?.text ?? '',
    e.cost ?? '',
    e.repeatable ? 'Repeatable' : '',
    sourceTag(e),
  ]
  return {
    id: e.slug,
    name: e.name,
    meta: meta.filter(Boolean).join(' · '),
    ...(e.text || e.summary ? { text: e.text ?? e.summary } : {}),
    source: e.source,
    ...(taken
      ? { disabled: 'Already known' }
      : unmet.length
        ? { disabled: `Needs ${unmet.join(', ')}` }
        : {}),
  }
}

function groupName(st: Dnd5eBuildState, group: string) {
  return st.ctx.data.options.find((g) => g.slug === group)?.name ?? group
}

function takeEntry(w: Walker, group: string, slug: string, key: string) {
  const st = w.st
  const e = optionGroupEntries(st, group).find((x) => x.slug === slug)
  if (!e) return
  st.options.push({ group, slug: e.slug, name: e.name, level: w.level })
  addFeature(st, e.name, groupName(st, group), e)
  applyGrants(w, e.grants, e.name, `${key}>${e.slug}`)
  addUses(st, e.name, e.name, e)
  e.choices?.forEach((c, i) => {
    // "A Warlock cantrip that deals damage": one the hero knows, a different one each time.
    const target = cantripTarget(e)
    if (c.kind === 'cantrip' && target) {
      const values = ask(w, {
        key: `${key}>${e.slug}:${i}`,
        label: `${e.name}: cantrip`,
        from: e.name,
        kind: 'cantrip',
        count: 1,
        options: damagingCantrips(st, target.attack).map((s) =>
          spellOption(
            s,
            st.picked.has(`${e.slug}:${s.slug}`) ? `Already has ${e.name}` : undefined,
          ),
        ),
      })
      values.forEach((v) => st.picked.add(`${e.slug}:${v}`))
      return
    }
    runChoice(w, c, `${key}>${e.slug}:${i}`, e.name, e)
  })
}

function groupChoice(
  w: Walker,
  key: string,
  label: string,
  from: string,
  group: string,
  count: number,
) {
  const st = w.st
  if (count <= 0) return
  const values = ask(w, {
    key,
    label,
    from,
    kind: 'option',
    count,
    options: optionGroupEntries(st, group).map((e) => entryOption(st, e, w.cl)),
  })
  for (const v of values) takeEntry(w, group, v, key)
}

// --- Spells --------------------------------------------------------------------------

const subclassListCache = new WeakMap<Dnd5eSubclassDef, string[]>()

/**
 * The spell lists a subclass names as its own ("Paladin (Death Knight)"): its name, and the
 * "<Class> (…)" lists of the spells it grants.
 */
function subclassLists(st: Dnd5eBuildState): string[] {
  const sub = st.sub
  if (!sub) return []
  const cached = subclassListCache.get(sub)
  if (cached) return cached
  const prefix = `${st.ctx.cls.name} (`
  const own = new Set([
    ...(sub.spells ?? []).flatMap((r) => r.spells),
    ...sub.features
      .flatMap((f) => [...(f.grants ?? []), ...(f.options ?? []).flatMap((o) => o.grants ?? [])])
      .flatMap((g) => (g.kind === 'spell' ? [g.spell] : [])),
  ])
  const lists = new Set([`${prefix}${sub.name})`])
  for (const s of st.ctx.data.spells)
    if (own.has(s.slug)) for (const l of s.extraLists ?? []) if (l.startsWith(prefix)) lists.add(l)
  const out = [...lists]
  subclassListCache.set(sub, out)
  return out
}

/** Whether a spell is on one of the hero's lists: the class's, Magical Secrets' or the subclass's own. */
function onHeroLists(st: Dnd5eBuildState, s: Dnd5eSpellDef, lists: string[]): boolean {
  if (s.classes.some((k) => lists.includes(k))) return true
  const own = subclassLists(st)
  return !!s.extraLists?.some((l) => own.includes(l))
}

/** Cantrip and prepared-spell picks a caster gets at a level, plus the wizard's spellbook. */
function spellPicks(w: Walker) {
  const st = w.st
  const sc = castingOf(st)
  if (!sc) return
  const L = w.cl
  const K = w.level
  const from = st.sub?.spellcasting ? st.sub.name : st.ctx.cls.name
  const at = (arr: number[], l: number) => (l >= 1 ? (arr[l - 1] ?? 0) : 0)
  const newCantrips = at(sc.cantrips, L) - at(sc.cantrips, L - 1)
  const newPrepared = at(sc.prepared, L) - at(sc.prepared, L - 1)
  const top = maxSpellLevel(sc, L)
  const lists = [sc.list, ...st.extraLists]
  const data = st.ctx.data
  const always = new Set(st.extra.map((s) => s.slug))
  const known = knownSpellSlugs(st)
  const classSpells = data.spells.filter((s) => onHeroLists(st, s, lists))

  if (newCantrips > 0) {
    const values = ask(w, {
      key: `L${K}:spells:cantrips`,
      label: 'Cantrips',
      from,
      kind: 'cantrip',
      count: newCantrips,
      options: classSpells
        .filter((s) => s.level === 0)
        .map((s) =>
          spellOption(s, known.has(s.slug) || always.has(s.slug) ? 'Already known' : undefined),
        ),
    })
    values.forEach((v) => st.cantrips.includes(v) || st.cantrips.push(v))
  }

  const book = usesSpellbook(st)
  if (book && L > 1) {
    const values = ask(w, {
      key: `L${K}:spells:book`,
      label: 'Spellbook: two new spells',
      from,
      kind: 'spell',
      count: 2,
      options: classSpells
        .filter((s) => s.level >= 1 && s.level <= top)
        .map((s) => spellOption(s, st.book.includes(s.slug) ? 'In your spellbook' : undefined)),
      note: `Wizard spells of level ${top} or lower.`,
    })
    values.forEach((v) => st.book.includes(v) || st.book.push(v))
  }

  if (newPrepared > 0) {
    const pool = book
      ? data.spells.filter((s) => st.book.includes(s.slug))
      : classSpells.filter((s) => s.level >= 1 && s.level <= top)
    const values = ask(w, {
      key: `L${K}:spells:prepared`,
      label: 'Prepared spells',
      from,
      kind: 'spell',
      count: newPrepared,
      options: pool.map((s) =>
        spellOption(
          s,
          st.prepared.includes(s.slug)
            ? 'Already prepared'
            : always.has(s.slug)
              ? 'Always prepared'
              : undefined,
        ),
      ),
      note: book
        ? 'Prepare spells from your spellbook.'
        : `${st.ctx.cls.name} spells of level ${top} or lower${st.extraLists.length ? `, or from the ${st.extraLists.join(', ')} lists` : ''}${st.sub && classSpells.some((s) => s.extraLists?.some((l) => subclassLists(st).includes(l))) ? `, with the ${st.sub.name} list` : ''}.`,
    })
    values.forEach((v) => st.prepared.includes(v) || st.prepared.push(v))
  }
}

/**
 * Optional swaps at a level-up: one cantrip, one prepared spell and one of each option group of
 * the class gaining the level, its Fighting Style feat where its text allows (Fighter, SRD 5.2.1
 * p. 47), and one weapon mastery.
 */
function swaps(w: Walker) {
  const st = w.st
  const L = w.level
  const CL = w.cl
  const data = st.ctx.data
  const sc = castingOf(st)
  const swap = (
    what: string,
    current: { id: string; name: string }[],
    offer: (out: string) => Dnd5ePickOption[],
    replace: (out: string, inn: string) => void,
    kind: Dnd5ePickKind,
  ) => {
    if (!current.length) return
    const key = `L${L}:swap:${what}`
    const out = ask(w, {
      key: `${key}:out`,
      label: `Replace a ${what === 'mastery' ? 'weapon mastery' : what.replace(/-/g, ' ')}`,
      from: 'Level-up',
      kind: 'swapOut',
      count: 1,
      optional: true,
      options: current.map((c) => ({ id: c.id, name: c.name })),
    })[0]
    if (!out) return
    const inn = ask(w, {
      key: `${key}:in`,
      label: `Replacement for ${current.find((c) => c.id === out)?.name ?? out}`,
      from: 'Level-up',
      kind: kind === 'swapOut' ? 'swapIn' : kind,
      count: 1,
      options: offer(out),
    })[0]
    if (inn) replace(out, inn)
  }
  if (sc && maxSpellLevel(sc, CL - 1) + (sc.cantrips[CL - 2] ?? 0) > 0) {
    const lists = [sc.list, ...st.extraLists]
    const known = knownSpellSlugs(st)
    swap(
      'cantrip',
      st.cantrips.map((s) => ({ id: s, name: spellName(data, s) })),
      () =>
        data.spells
          .filter((s) => s.level === 0 && onHeroLists(st, s, lists))
          .map((s) => spellOption(s, known.has(s.slug) ? 'Already known' : undefined)),
      (out, inn) => replaceIn(st.cantrips, out, inn),
      'cantrip',
    )
    const top = maxSpellLevel(sc, CL)
    swap(
      'prepared-spell',
      st.prepared.map((s) => ({ id: s, name: spellName(data, s) })),
      () =>
        (usesSpellbook(st)
          ? data.spells.filter((s) => st.book.includes(s.slug))
          : data.spells.filter((s) => s.level >= 1 && s.level <= top && onHeroLists(st, s, lists))
        ).map((s) => spellOption(s, known.has(s.slug) ? 'Already known' : undefined)),
      (out, inn) => replaceIn(st.prepared, out, inn),
      'spell',
    )
  }
  // Another class's invocations or maneuvers change only on that class's levels.
  const others = new Set(
    st.tracks
      .filter((t) => t !== st.track)
      .flatMap((t) => [...t.cls.optionGroups, ...(t.sub?.optionGroups ?? [])]),
  )
  const own = new Set([...st.ctx.cls.optionGroups, ...(st.sub?.optionGroups ?? [])])
  for (const group of new Set(st.options.map((o) => o.group))) {
    if (others.has(group) && !own.has(group)) continue
    const mine = st.options.filter((o) => o.group === group)
    swap(
      group,
      mine.map((o) => ({ id: o.slug, name: o.name })),
      () => optionGroupEntries(st, group).map((e) => entryOption(st, e, CL)),
      (out, inn) => {
        const i = st.options.findIndex((o) => o.group === group && o.slug === out)
        const e = optionGroupEntries(st, group).find((x) => x.slug === inn)
        const old = st.options[i]
        if (i < 0 || !e || !old) return
        st.options.splice(i, 1, { group, slug: e.slug, name: e.name, level: L })
        st.features = st.features.filter(
          (f) => !(f.name === old.name && f.from === groupName(st, group)),
        )
        addFeature(st, e.name, groupName(st, group), e)
        applyGrants(w, e.grants, e.name, `L${L}:swap:${group}>${e.slug}`)
        addUses(st, e.name, e.name, e)
      },
      'option',
    )
  }
  styleSwap(w)
  if (st.masteries.length)
    swap(
      'mastery',
      st.masteries.map((m) => ({ id: m, name: bySlug(data.weapons, m)?.name ?? m })),
      () =>
        data.weapons
          .filter((x) => !MELEE_MASTERY.has(st.ctx.cls.slug) || x.type === 'Melee')
          .map((x) => ({
            id: x.slug,
            name: x.name,
            meta: x.mastery,
            ...(st.masteries.includes(x.slug)
              ? { disabled: 'Already mastered' }
              : !proficientWith(st.weapons, x)
                ? { disabled: 'Not proficient' }
                : {}),
          })),
      (out, inn) => (st.masteries = st.masteries.map((m) => (m === out ? inn : m))),
      'weaponMastery',
    )
}

/** A class feature whose feat a later level of the class may replace (Fighter's Fighting Style). */
const STYLE_SWAP = /replace the feat you chose with a different fighting style feat/i
const swapsStyle = (f: Dnd5eFeature) => STYLE_SWAP.test(f.text ?? f.summary ?? '')

/**
 * "Whenever you gain a Fighter level, you can replace the feat you chose with a different
 * Fighting Style feat" (SRD 5.2.1 p. 47): one optional pick of another Fighting Style feat; the
 * old feat and what it gave go, the new one's own picks are asked at this level.
 */
function styleSwap(w: Walker) {
  const st = w.st
  const cls = st.ctx.cls
  const old = st.styles.get(cls.slug)
  if (!old) return
  const key = `L${w.level}:swap:fighting-style`
  const from = `${cls.name} ${w.cl}`
  const v = ask(w, {
    key,
    label: `Replace your Fighting Style feat (${old.feat.name})`,
    from,
    kind: 'feat',
    count: 1,
    optional: true,
    options: st.ctx.data.feats
      .filter((f) => f.category === 'fighting-style')
      .map((f) => featOption(f, featBlocked(st, f, w.level))),
    note: 'Whenever you gain a level in this class, you can replace the feat with a different Fighting Style feat.',
  })[0]
  if (!v) return
  dropFeat(st, old)
  const mark = traceMark(st)
  takeFeat(w, v, key, from)
  const now = traceSince(st, mark)
  if (now) st.styles.set(cls.slug, now)
}

// --- Levels --------------------------------------------------------------------------

const baseName = (name: string) => name.replace(/\s*\(.*\)\s*$/, '')

function findClassFeature(cls: Dnd5eClassDef, name: string): Dnd5eFeature | undefined {
  const n = norm(baseName(name))
  return cls.features.find((f) => norm(f.name) === n)
}

/** A choice whose count follows a class table column ("Eldritch Invocations", "Weapon Mastery"). */
function choiceColumn(cls: Dnd5eClassDef, f: Dnd5eFeature, c: Dnd5eChoice): string | undefined {
  if (c.column) return c.column
  for (const name of [c.label, f.name]) if (name && cls.columns.includes(name)) return name
  return undefined
}

const isAsi = (name: string) => norm(name) === 'ability score improvement'
const isBoon = (name: string) => norm(name) === 'epic boon'
const isSubclassRow = (name: string) => /subclass$/i.test(name)

/**
 * Features a hero gains once whatever classes give them (SRD 5.2.1 p. 25): a second Extra Attack
 * doesn't stack, and Unarmored Defense stays the first class's.
 */
const ONCE_ONLY = new Set(['extra attack', 'unarmored defense'])
const hasAlready = (st: Dnd5eBuildState, name: string) =>
  ONCE_ONLY.has(norm(name)) && st.features.some((x) => norm(x.name) === norm(name))

function classFeature(w: Walker, f: Dnd5eFeature, tableName: string) {
  const st = w.st
  const cls = st.ctx.cls
  const CL = w.cl
  const repeat = CL !== f.level
  if (!repeat && hasAlready(st, f.name)) return
  const from = `${cls.name} ${CL}`
  const key = `L${w.level}:${keyPart(f.name)}`
  w.classScope = true
  if (!repeat) {
    addFeature(st, f.name, from, f)
    if (norm(f.name).includes('fighting style')) st.fightingStyle = true
    if (norm(f.name) === 'magical secrets')
      st.extraLists.splice(0, st.extraLists.length, 'cleric', 'druid', 'wizard')
    applyGrants(w, f.grants, from, key)
    addUses(st, f.name, cls.name, f)
  }
  const exact = exactLevel(tableName)
  const extra = subclassOptions(st, f, CL)
  const owner = extra.length ? { ...f, options: [...(f.options ?? []), ...extra] } : f
  const mark = !repeat && swapsStyle(f) ? traceMark(st) : null
  f.choices?.forEach((c, i) => {
    if (choiceColumn(cls, f, c)) return
    if (c.group && cls.optionGroups.includes(c.group)) {
      groupChoice(w, `${key}:${i}`, c.label ?? f.name, from, c.group, c.count)
      return
    }
    // Spellbook picks at level 1 are the wizard's starting book.
    const choice = exact ? { ...c, maxLevel: exact, label: tableName } : c
    runChoice(w, choice, `${key}:${i}`, from, owner)
  })
  const style = mark && traceSince(st, mark)
  if (style) st.styles.set(cls.slug, style)
  if (!repeat) featureParts(w, f, key, from)
  w.classScope = false
}

/** A class feature that asks to pick one of its named options (Fighting Style). */
const asksOption = (f: Dnd5eFeature | undefined) =>
  !!f?.choices?.some((c) => c.kind === 'option' && !c.group)

/**
 * Options a subclass adds to a class feature of the same name (Demon Hunter's Void Warrior
 * Fighting Style), offered beside the class's own.
 */
function subclassOptions(st: Dnd5eBuildState, f: Dnd5eFeature, level: number): Dnd5eOption[] {
  if (!st.sub || !asksOption(f)) return []
  return st.sub.features
    .filter((x) => x.level <= level && norm(x.name) === norm(f.name))
    .flatMap((x) => x.options ?? [])
}

/**
 * A subclass feature that replaces a class feature ("Replaces Lay On Hands; …"): the class
 * feature, its uses and its spells go.
 */
function replaceClassFeature(st: Dnd5eBuildState, f: Dnd5eFeature) {
  const name = /^Replaces (?:the )?([^;:.]+?)(?: feature)?[;:.]/.exec(f.summary ?? '')?.[1]
  const old = name ? findClassFeature(st.ctx.cls, name) : undefined
  if (!old) return
  const cls = st.ctx.cls.name
  const spells = new Set((old.grants ?? []).flatMap((g) => (g.kind === 'spell' ? [g.spell] : [])))
  st.features = st.features.filter(
    (x) => !(norm(x.name) === norm(old.name) && x.from?.startsWith(cls)),
  )
  st.uses = st.uses.filter((u) => norm(u.name) !== norm(old.name))
  st.extra = st.extra.filter((x) => !(spells.has(x.slug) && x.from.startsWith(cls)))
}

/**
 * A feature's named options when it doesn't ask to pick one: the parts it's made of (Dazzling
 * Footwork's Unarmored Defense), or, when their names are ones the hero picked elsewhere, only
 * those (Nature's Ward follows the Land type).
 */
function featureParts(w: Walker, f: Dnd5eFeature, key: string, from: string) {
  if (!f.options?.length || f.choices?.some((c) => c.kind === 'option' && !c.group)) return
  const matching = f.options.filter((o) => w.st.picked.has(o.name))
  const keyed = f.options.some((o) =>
    w.st.ctx.data.subclasses.some((s) => s.spells?.some((r) => r.group === o.name)),
  )
  for (const o of matching.length || keyed ? matching : f.options)
    applyMechanics(w, o, `${key}>${keyPart(o.name)}`, from, `${f.name}: ${o.name}`)
}

/** Picks whose count is the growth of a class table column at this level. */
function columnChoices(w: Walker) {
  const st = w.st
  const cls = st.ctx.cls
  const L = w.cl
  w.classScope = true
  for (const f of cls.features) {
    if (f.level > L) continue
    f.choices?.forEach((c, i) => {
      const column = choiceColumn(cls, f, c)
      if (!column) return
      const count =
        L === f.level
          ? columnNumber(cls, L, column)
          : columnNumber(cls, L, column) - columnNumber(cls, L - 1, column)
      if (count <= 0) return
      const key = `L${w.level}:${keyPart(f.name)}:${i}`
      const from = `${cls.name} ${L}`
      if (c.kind === 'weaponMastery') masteryChoice(w, key, c.label ?? f.name, from, count)
      else if (c.group) groupChoice(w, key, c.label ?? f.name, from, c.group, count)
      else runChoice(w, { ...c, count }, key, from, f)
    })
  }
  w.classScope = false
}

function subclassFeatures(w: Walker) {
  const st = w.st
  const sub = st.sub
  if (!sub) return
  const L = w.cl
  const from = sub.name
  w.classScope = true
  // Chosen past its first features (a level 1 subclass taken at level 3): those come now too.
  const due = (x: Dnd5eFeature) => x.level === L || (L === st.subLevel && x.level < L)
  for (const f of sub.features.filter(due)) {
    if (hasAlready(st, f.name)) continue
    const key = `L${w.level}:${keyPart(sub.slug)}:${keyPart(f.name)}`
    addFeature(st, f.name, `${from} ${f.level}`, f)
    if (norm(f.name).includes('fighting style')) st.fightingStyle = true
    replaceClassFeature(st, f)
    applyGrants(w, f.grants, from, key)
    addUses(st, f.name, from, f)
    f.choices?.forEach((c, i) => {
      if (c.group && sub.optionGroups.includes(c.group)) return
      runChoice(w, c, `${key}:${i}`, from, f)
    })
    if (!asksOption(findClassFeature(st.ctx.cls, f.name))) featureParts(w, f, key, from)
  }
  // Option groups a subclass learns more of with level (Battle Master maneuvers).
  for (const [group, table] of Object.entries(SUBCLASS_SCALING[sub.slug]?.groups ?? {})) {
    const count = countAt(table, L) - countAt(table, L - 1)
    if (count > 0) {
      const f = sub.features.find((x) => x.choices?.some((c) => c.group === group))
      groupChoice(
        w,
        `L${w.level}:${keyPart(sub.slug)}:${group}`,
        f?.name ?? groupName(st, group),
        `${from} ${L}`,
        group,
        count,
      )
    }
  }
  // Always-prepared subclass spells: the `spells` field and spell grants, read as one set.
  const groups = new Set(st.picked)
  for (const row of sub.spells ?? [])
    if (row.level === L && (!row.group || groups.has(row.group)))
      for (const s of row.spells) addExtraSpell(st, s, sub.name)
  borrowedSpells(st)
  w.classScope = false
}

/** A lent subclass's always-prepared spells, row by row as the class's level reaches them. */
function borrowedSpells(st: Dnd5eBuildState) {
  for (const { sub, from } of st.borrowed)
    for (const row of sub.spells ?? [])
      if (row.level <= st.classLevel && !row.group)
        for (const s of row.spells) addExtraSpell(st, s, from)
}

const countAt = (table: Record<number, number>, level: number) =>
  Object.entries(table).reduce((n, [l, v]) => (Number(l) <= level ? v : n), 0)

/** Subclasses with features before the class's subclass level (World of Warcraft's Death Knight). */
export function earlySubclasses(cls: Dnd5eClassDef, data: Pick<Dnd5eBuildData, 'subclasses'>) {
  return data.subclasses.filter(
    (s) => s.class === cls.slug && s.features.some((f) => f.level < cls.subclassLevel),
  )
}

function subclassOption(s: Dnd5eSubclassDef): Dnd5ePickOption {
  return {
    id: s.slug,
    name: s.name,
    meta: s.srd ? 'SRD 5.2.1' : sourceTag(s),
    ...(s.text || s.summary ? { text: s.summary ?? s.text } : {}),
    source: s.source,
  }
}

function subclassChoice(w: Walker) {
  const st = w.st
  if (st.sub) return
  const cls = st.ctx.cls
  const subs = st.ctx.data.subclasses.filter((s) => s.class === cls.slug)
  const values = ask(w, {
    key: `L${w.level}:subclass`,
    label: `${cls.name} subclass`,
    from: `${cls.name} ${w.cl}`,
    kind: 'subclass',
    count: 1,
    options: subs.map(subclassOption),
  })
  const sub = bySlug(subs, values[0])
  if (sub) {
    st.sub = sub
    st.subLevel = w.cl
  }
}

/**
 * A class's level 1: a subclass whose features start before the subclass level may be chosen
 * now, so its level 1 and 2 features apply (leave it empty to choose at the usual level).
 */
function earlySubclassChoice(w: Walker) {
  const st = w.st
  const cls = st.ctx.cls
  const early = earlySubclasses(cls, st.ctx.data)
  if (!early.length || cls.subclassLevel <= 1) return
  const values = ask(w, {
    key: `L${w.level}:subclass`,
    label: `${cls.name} subclass now`,
    from: `${cls.name} 1`,
    kind: 'subclass',
    count: 1,
    optional: true,
    options: early.map(subclassOption),
    note: `${listOr(early.map((s) => s.name))} ${early.length > 1 ? 'have' : 'has'} features from level 1. Choose ${early.length > 1 ? 'one' : 'it'} now, or leave this empty and choose your subclass at level ${cls.subclassLevel}.`,
  })
  const sub = bySlug(early, values[0])
  if (sub) {
    st.sub = sub
    st.subLevel = 1
  }
}

/**
 * The level 1 origin: what is fixed first (background, its Origin feat, class core traits), then
 * the species, then the class's tool and skill picks, then languages.
 */
function origin(w: Walker) {
  const st = w.st
  const { cls, species, background } = st.ctx
  const key = 'L1'
  // Background first: its skills and tool are fixed, so later duplicates pick another.
  for (const s of background.skills) grantSkill(w, s, background.name, `${key}:background`)
  if (background.tool) grantSkill(w, background.tool, background.name, `${key}:background`)
  if (background.toolChoice)
    runChoice(
      w,
      { ...background.toolChoice, label: `${background.name} tool` },
      `${key}:background:tool`,
      background.name,
      {},
    )
  // The background's Origin feat (its fixed option: Magic Initiate's spell list), taken first so
  // a species' feat pick (Versatile) can't take it again.
  if (background.slug) addFeature(st, background.name, 'Background', background)
  if (background.slug === CUSTOM_BACKGROUND) customPicks(w)
  else if (background.featChoice) backgroundFeatChoice(w, background)
  else
    takeFeat(
      w,
      background.feat.slug,
      `${key}:background:feat`,
      background.name,
      background.feat.option,
    )
  // Class core traits.
  cls.saves.forEach((a) => st.saves.add(a))
  cls.armor.forEach((a) => st.armor.add(a))
  cls.weapons.forEach((x) => st.weapons.add(x))
  for (const t of cls.tools) grantSkill(w, t, cls.name, `${key}:class`)
  // Species.
  if (species.sizes.length > 1) {
    const v = ask(w, {
      key: `${key}:species:size`,
      label: 'Size',
      from: species.name,
      kind: 'size',
      count: 1,
      options: species.sizes.map((s) => ({ id: s, name: s })),
    })[0]
    if (v) st.size = v
  }
  if (species.lineages) {
    const lin = species.lineages
    const v = ask(w, {
      key: `${key}:species:lineage`,
      label: lin.label,
      from: species.name,
      kind: 'lineage',
      count: 1,
      options: lin.options.map((o) => ({
        id: o.name,
        name: o.name,
        ...(o.text || o.summary ? { text: o.text ?? o.summary } : {}),
      })),
    })[0]
    st.lineage = lin.options.find((o) => o.name === v)
    if (lin.spellAbility?.length) {
      const a = ask(w, {
        key: `${key}:species:spell-ability`,
        label: `${lin.label} spellcasting ability`,
        from: species.name,
        kind: 'ability',
        count: 1,
        options: lin.spellAbility.map((x) => ({ id: x, name: DND5E_ABILITY_NAME[x] })),
      })[0]
      if (a) st.lineageAbility = a as Dnd5eAbility
    }
    if (st.lineage) {
      st.picked.add(st.lineage.name)
      addFeature(st, `${lin.label}: ${st.lineage.name}`, species.name, st.lineage)
      applyMechanics(
        w,
        st.lineage,
        `${key}:species:lineage>${keyPart(st.lineage.name)}`,
        species.name,
        st.lineage.name,
      )
    }
  }
  speciesTraits(w)
  // The class's picks come after the species', so they skip what the species gave.
  if (cls.toolChoice)
    runChoice(
      w,
      { ...cls.toolChoice, label: `${cls.name} tool${cls.toolChoice.count > 1 ? 's' : ''}` },
      `${key}:class:tool`,
      cls.name,
      {},
    )
  runChoice(
    w,
    {
      kind: 'skill',
      count: cls.skills.count,
      from: cls.skills.options,
      label: `${cls.name} skills`,
    },
    `${key}:class:skills`,
    cls.name,
    {},
  )
  // Two languages besides Common (SRD 5.2.1 p. 20).
  runChoice(
    w,
    { kind: 'language', count: 2, label: 'Languages', note: 'Common plus two languages.' },
    `${key}:languages`,
    'Origin',
    {},
  )
}

/**
 * A background that lets any feat of a category replace its own ("Survivor or a Dark Gift feat
 * of your choice"): one pick among the named feat and that category's feats.
 */
function backgroundFeatChoice(w: Walker, background: Dnd5eBackgroundDef) {
  const st = w.st
  const key = 'L1:background:feat'
  const categories = background.featChoice?.category ?? []
  const named = bySlug(st.ctx.data.feats, background.feat.slug)
  const feats = st.ctx.data.feats.filter(
    (f) => f.slug === named?.slug || categories.includes(f.category),
  )
  const kinds = listOr(categories.map((k) => `a ${DND5E_FEAT_CATEGORY_NAME[k]} feat`))
  const values = ask(w, {
    key,
    label: `${background.name}: ${named ? `${named.name} or ` : ''}${kinds}`,
    from: background.name,
    kind: 'feat',
    count: 1,
    options: feats.map((f) => featOption(f, featBlocked(st, f, w.level))),
  })
  for (const v of values)
    takeFeat(w, v, key, background.name, v === named?.slug ? background.feat.option : undefined)
}

const listOr = (items: string[]) =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`

/** A custom background's picks (SRD 5.2.1 p. 193): an Origin feat, two skills and a tool. */
function customPicks(w: Walker) {
  const name = w.st.ctx.background.name
  const key = 'L1:background'
  featChoice(w, `${key}:feat`, `${name}: Origin feat`, name, ['origin'])
  runChoice(
    w,
    { kind: 'skill', count: 2, from: allSkills(), label: `${name}: two skills` },
    `${key}:skills`,
    name,
    {},
  )
  runChoice(w, { kind: 'tool', count: 1, label: `${name}: a tool` }, `${key}:tool`, name, {})
}

function speciesTraits(w: Walker) {
  const st = w.st
  const { species } = st.ctx
  for (const t of species.traits) {
    if ((t.level ?? 1) !== w.level) continue
    const key = `L${w.level}:species:${keyPart(t.name)}`
    addFeature(st, t.name, species.name, t)
    applyGrants(w, t.grants, species.name, key)
    addUses(st, t.name, species.name, t)
    t.choices?.forEach((c, i) => runChoice(w, c, `${key}:${i}`, species.name, t))
  }
  // Lineage spells: the cantrip at will, the others once a Long Rest without a slot.
  for (const s of st.lineage?.spells ?? [])
    if (s.level === w.level)
      addExtraSpell(st, s.spell, st.lineage!.name, {
        ability: st.lineageAbility ?? 'CHA',
        ...(st.ctx.data.spells.find((x) => x.slug === s.spell)?.level
          ? { free: { count: 1, recharge: 'long' as const } }
          : {}),
      })
}

// --- Multiclassing (SRD 5.2.1 pp. 24–26) ----------------------------------------------

/** The score a class's primary ability needs for multiclassing (SRD 5.2.1 p. 24). */
export const MULTICLASS_MIN = 13

/**
 * What taking a first level in `cls` still needs, or empty: 13 or more in the primary ability
 * of the new class and of every class the hero has (SRD 5.2.1 p. 24).
 */
export function multiclassBlocked(
  st: Pick<Dnd5eBuildState, 'abilities' | 'tracks'>,
  cls: Dnd5eClassDef,
): string {
  const unmet = [...st.tracks.map((t) => t.cls), cls].flatMap((c) => {
    const { abilities, any } = c.multiclass.prerequisite
    const ok = (a: Dnd5eAbility) => st.abilities[a] >= MULTICLASS_MIN
    if (any ? abilities.some(ok) : abilities.every(ok)) return []
    const names = abilities.map((a) => DND5E_ABILITY_NAME[a]).join(any ? ' or ' : ' and ')
    return [`${names} ${MULTICLASS_MIN}+ (${c.name})`]
  })
  return unmet.length ? `Needs ${unmet.join(', ')}` : ''
}

/**
 * The proficiencies a class's first level gives a hero who takes it as a new class, read from
 * its Core Traits line ("As a Multiclass Character", SRD 5.2.1 p. 25 and each class): armor,
 * weapons and tools it names, one skill (from its list when the line says so) and one Musical
 * Instrument. Never saving throws or starting equipment.
 */
export function multiclassGains(cls: Dnd5eClassDef) {
  const n = norm(cls.multiclass.gains)
  const word = (x: string) => new RegExp(`\\b${norm(x).replace(/ armor$/, '')}\\b`).test(n)
  const skill = /\bone (?:\w+ )?skill\b/.test(n)
    ? /skill list|\bone (?!skill)\w+ skill\b/.test(n)
      ? cls.skills.options
      : allSkills()
    : null
  return {
    armor: cls.armor.filter(word),
    weapons: cls.weapons.filter((x) => n.includes(norm(x))),
    tools: cls.tools.filter((t) => n.includes(norm(t))),
    skill,
    instrument: /musical instrument/.test(n),
  }
}

function classOption(st: Dnd5eBuildState, c: Dnd5eClassDef): Dnd5ePickOption {
  const t = st.tracks.find((x) => x.cls.slug === c.slug)
  if (t)
    return {
      id: c.slug,
      name: c.name,
      meta: `${c.name} ${t.level} → ${t.level + 1}`,
      ...(t.level >= 20 ? { disabled: 'Already level 20' } : {}),
      source: c.source,
    }
  const blocked = multiclassBlocked(st, c)
  return {
    id: c.slug,
    name: c.name,
    meta: [
      'New class',
      `d${c.hitDie}`,
      `${c.multiclass.prerequisite.abilities.join(c.multiclass.prerequisite.any ? ' or ' : ' and ')} ${MULTICLASS_MIN}+`,
      sourceTag(c),
    ]
      .filter(Boolean)
      .join(' · '),
    text: `As a new class you gain: ${c.multiclass.gains}, and its level 1 features.`,
    ...(blocked ? { disabled: blocked } : {}),
    source: c.source,
  }
}

/**
 * The class a level after the first goes to (SRD 5.2.1 p. 24): one the hero has, or a new one
 * whose prerequisites they meet. Left empty, the first class, as every save before
 * multiclassing.
 */
function classForLevel(w: Walker): Dnd5eClassTrack {
  const st = w.st
  const data = st.ctx.data
  const first = st.tracks[0]!
  const v = ask(w, {
    key: `L${w.level}:class`,
    label: 'Class for this level',
    from: `Level ${w.level}`,
    kind: 'class',
    count: 1,
    optional: true,
    options: [
      ...st.tracks.map((t) => t.cls),
      ...data.classes.filter((c) => !st.tracks.some((t) => t.cls.slug === c.slug)),
    ].map((c) => classOption(st, c)),
    note: `Go on in a class you have, or take a level in a new one (multiclassing): it needs ${MULTICLASS_MIN} or more in its primary ability and in your current classes' (SRD 5.2.1 p. 24). Left empty: ${first.cls.name}.`,
  })[0]
  const cls = bySlug(data.classes, v) ?? first.cls
  let t = st.tracks.find((x) => x.cls.slug === cls.slug)
  if (!t) {
    t = newTrack(cls)
    st.tracks.push(t)
  }
  return t
}

/** A new class's first level: its multiclass proficiencies (no saves, no equipment). */
function multiclassStart(w: Walker) {
  const st = w.st
  const cls = st.ctx.cls
  const key = `L${w.level}:multiclass`
  const g = multiclassGains(cls)
  g.armor.forEach((a) => st.armor.add(a))
  g.weapons.forEach((x) => st.weapons.add(x))
  for (const t of g.tools) grantSkill(w, t, cls.name, key)
  if (g.instrument && cls.toolChoice)
    runChoice(
      w,
      { ...cls.toolChoice, count: 1, label: `${cls.name} tool` },
      `${key}:tool`,
      cls.name,
      {},
    )
  if (g.skill)
    runChoice(
      w,
      { kind: 'skill', count: 1, from: g.skill, label: `${cls.name} skill` },
      `${key}:skill`,
      cls.name,
      {},
    )
  addFeature(st, 'Multiclass proficiencies', `${cls.name} 1`, {
    summary: `As a new class, the ${cls.name} gives: ${cls.multiclass.gains}.`,
  })
}

/**
 * One level of the walk: the class it goes to, then what that class's table, its subclass and
 * the species give and ask for. Class tables, features and spells read the class's own level;
 * keys, feats and species traits the character level.
 */
function walkLevel(w: Walker) {
  const st = w.st
  const L = w.level
  st.level = L
  const track = L === 1 ? st.tracks[0]! : classForLevel(w)
  enterTrack(st, track)
  track.level += 1
  const CL = track.level
  w.cl = CL
  st.classLevel = CL
  const { cls } = st.ctx
  const reached = (x: Dnd5eBuildState['later'][number]) =>
    x.cls ? x.cls === cls.slug && x.at <= CL : x.at <= L
  for (const s of st.later.filter(reached)) addExtraSpell(st, s.slug, s.from, s.extra)
  st.later = st.later.filter((x) => !reached(x))
  if (L === 1) {
    origin(w)
    earlySubclassChoice(w)
  } else {
    speciesTraits(w)
    if (CL === 1) {
      multiclassStart(w)
      earlySubclassChoice(w)
    }
  }
  const row = cls.levels.find((l) => l.level === CL)
  let asi = false
  let boon = false
  for (const name of row?.features ?? []) {
    if (isAsi(name)) asi = true
    else if (isBoon(name)) boon = true
    else if (isSubclassRow(name) && CL === cls.subclassLevel) subclassChoice(w)
    else if (norm(name) === 'subclass feature') continue
    else {
      const f = findClassFeature(cls, name)
      if (f) classFeature(w, f, name)
    }
  }
  if (CL === cls.subclassLevel && !st.sub && !(row?.features ?? []).some(isSubclassRow))
    subclassChoice(w)
  // ASI and Epic Boon come from `asiLevels` and `epicBoonLevel` (class levels); their features'
  // own feat choices are the same pick and aren't asked twice (data quirk 1).
  if (asi || cls.asiLevels.includes(CL))
    featChoice(
      w,
      `L${L}:asi`,
      'Ability Score Improvement or a feat',
      `${cls.name} ${CL}`,
      ASI_CATEGORIES,
    )
  if (boon || CL === cls.epicBoonLevel)
    featChoice(w, `L${L}:boon`, 'Epic Boon or a feat', `${cls.name} ${CL}`, BOON_CATEGORIES)
  subclassFeatures(w)
  columnChoices(w)
  spellPicks(w)
  if (L > 1) swaps(w)
  leaveTrack(st, track)
}

export interface Dnd5eWalkInput {
  creation: Dnd5eCreation
  choices: Picks
}

/** A background not picked yet: the builder asks the species' picks before it. */
const NO_BACKGROUND: Dnd5eBackgroundDef = {
  slug: '',
  name: '',
  srd: true,
  source: 'SRD 5.2.1',
  abilities: [],
  feat: { slug: '' },
  skills: [],
  equipment: [],
}

/** The slug of a background the player makes (SRD 5.2.1 p. 193). */
export const CUSTOM_BACKGROUND = 'custom'
/** A custom background's equipment budget: 50 GP, unspent gold included (SRD 5.2.1 p. 193). */
export const CUSTOM_GEAR_CP = 5000

/**
 * What a custom background can buy (SRD 5.2.1 p. 193): adventuring gear, tools, packs, foci,
 * ammunition and Simple weapons, but no Martial weapons or armor. Costs in copper pieces.
 */
export function customGearOptions(
  data: Dnd5eBuildData,
): { slug: string; name: string; cost: number; kind: string }[] {
  return [
    ...data.gear
      .filter(
        (g) => g.kind !== 'mount' && g.kind !== 'vehicle' && g.cost > 0 && g.cost <= CUSTOM_GEAR_CP,
      )
      .map((g) => ({ slug: g.slug, name: g.name, cost: g.cost, kind: g.kind })),
    ...data.weapons
      .filter((x) => x.category === 'Simple' && x.cost <= CUSTOM_GEAR_CP)
      .map((x) => ({ slug: x.slug, name: x.name, cost: x.cost, kind: 'weapon' })),
  ]
}

/**
 * A custom background as a background record: the player's name and abilities, no fixed feat,
 * skills or tool (they're picks), and two equipment options: the gear bought with its leftover
 * gold, or the 50 GP.
 */
export function customBackground(c: Dnd5eCreation, data: Dnd5eBuildData): Dnd5eBackgroundDef {
  const custom = c.custom ?? { name: '', abilities: [], gear: [] }
  const shop = customGearOptions(data)
  const bought = custom.gear.flatMap((slug) => shop.filter((g) => g.slug === slug).slice(0, 1))
  const spent = bought.reduce((n, g) => n + g.cost, 0)
  // What isn't spent stays as coins, silver and copper included.
  const left = cpToCoins(CUSTOM_GEAR_CP - spent)
  return {
    slug: CUSTOM_BACKGROUND,
    name: custom.name.trim() || 'Custom background',
    srd: true,
    source: 'SRD 5.2.1',
    page: 193,
    summary:
      'A background of your own making: three abilities, an Origin feat, two skills, a tool and 50 GP of equipment.',
    abilities: [...custom.abilities],
    feat: { slug: '' },
    skills: [],
    equipment: [
      {
        option: 'A',
        items: [...bought.map((g) => g.name), coinsText(left)].join(', '),
        gp: left.gp,
      },
      { option: 'B', items: '50 GP', gp: 50 },
    ],
  }
}

/** What a custom background still needs: a name and three different abilities. */
export function customProblem(c: Dnd5eCreation, data: Dnd5eBuildData): string | null {
  if (c.backgroundSlug !== CUSTOM_BACKGROUND) return null
  const custom = c.custom
  if (!custom?.name.trim()) return 'Name your background'
  if (new Set(custom.abilities).size !== 3) return 'Choose three abilities for your background'
  const shop = customGearOptions(data)
  const spent = custom.gear.reduce(
    (n, slug) => n + (shop.find((g) => g.slug === slug)?.cost ?? 0),
    0,
  )
  if (spent > CUSTOM_GEAR_CP) return 'The background’s gear costs more than 50 GP'
  return null
}

/**
 * The hero's records, or null when one of them isn't in the data. A background left empty
 * (the builder before its Background step) gives nothing; "custom" is the player's own.
 */
export function dnd5eContext(creation: Dnd5eCreation, data: Dnd5eBuildData): Ctx | null {
  const cls = bySlug(data.classes, creation.classSlug)
  const species = bySlug(data.species, creation.speciesSlug)
  const background = !creation.backgroundSlug
    ? NO_BACKGROUND
    : creation.backgroundSlug === CUSTOM_BACKGROUND
      ? customBackground(creation, data)
      : bySlug(data.backgrounds, creation.backgroundSlug)
  return cls && species && background ? { data, cls, species, background } : null
}

/** Scores after the background's increases (none above 20). */
export function startingAbilities(c: Dnd5eCreation): Record<Dnd5eAbility, number> {
  return Object.fromEntries(
    DND5E_ABILITIES.map((a) => [a, Math.min(ABILITY_CAP, c.base[a] + (c.bonus[a] ?? 0))]),
  ) as Record<Dnd5eAbility, number>
}

/**
 * Walks a hero from level 1 to `level` with the recorded picks. The last level is "planned":
 * what it asks for ends up in `asked`, and its ability increases in `increases`. `abilities`
 * replaces the scores at the start of the last level (the sheet's own, which the player may
 * have changed by hand).
 */
export function walkDnd5e(
  input: Dnd5eWalkInput,
  level: number,
  data: Dnd5eBuildData,
  abilities?: Record<Dnd5eAbility, number>,
): Dnd5eBuildState | null {
  const ctx = dnd5eContext(input.creation, data)
  if (!ctx) return null
  const st = newState(ctx, startingAbilities(input.creation))
  for (let L = 1; L <= level; L++) {
    const last = L === level
    if (last) {
      st.asked = []
      st.increases = {}
      if (abilities) st.abilities = { ...abilities }
    }
    walkLevel({ st, level: L, cl: 0, classScope: false, picks: input.choices, asking: last })
  }
  return st
}

// --- Problems ------------------------------------------------------------------------

/** The element id of a pick's section, for the builder's and level-up's jump links. */
export const pickElementId = (key: string) =>
  `dnd5e-pick-${key.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

/** What a pick still needs, or null when it's done. */
export function pickProblem(p: Dnd5ePick, values: string[] | undefined): string | null {
  const v = values ?? []
  if (p.optional && !v.length) return null
  const ok = new Set(p.options.filter((o) => !o.disabled).map((o) => o.id))
  const counted = p.repeat ? v : [...new Set(v)]
  if (counted.some((x) => !p.options.some((o) => o.id === x)))
    return 'a pick is no longer an option'
  if (counted.some((x) => !ok.has(x))) {
    const bad = p.options.find((o) => counted.includes(o.id) && o.disabled)
    // A value can be its own reason only for the pick that took it (asked in order).
    if (bad) return `${bad.name}: ${bad.disabled}`
  }
  if (counted.length < p.count) {
    const left = p.count - counted.length
    return `choose ${left} more`
  }
  return null
}

// --- The sheet -----------------------------------------------------------------------

/** The five coins (SRD 5.2.1 p. 89), each worth this many copper pieces. */
export const COIN_CP = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 } as const
type Coin = keyof typeof COIN_CP

/** No coins: all five, so a sheet never loses silver or copper. */
export const noCoins = (): Required<Dnd5eCoins> => ({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 })

/** Copper pieces as gold, silver and copper: 3766 cp → 37 gp, 6 sp, 6 cp. */
export function cpToCoins(cp: number): Required<Dnd5eCoins> {
  const n = Math.max(0, Math.round(cp))
  return { ...noCoins(), gp: Math.floor(n / 100), sp: Math.floor((n % 100) / 10), cp: n % 10 }
}

/** "37 GP, 6 SP, 6 CP": the coins that aren't zero, largest first ("0 GP" for none). */
export function coinsText(c: Dnd5eCoins): string {
  const order: Coin[] = ['pp', 'gp', 'ep', 'sp', 'cp']
  const parts = order.filter((k) => (c[k] ?? 0) > 0).map((k) => `${c[k]} ${k.toUpperCase()}`)
  return parts.join(', ') || '0 GP'
}

/** Parses "Chain Mail, Greatsword, 8 Javelins, …, and 4 GP" into items and coins. */
export function parseEquipment(
  items: string,
  data: Dnd5eBuildData,
  tools: { background?: string; cls?: string } = {},
): { items: InventoryItem[]; gp: number; coins: Required<Dnd5eCoins> } {
  const coins = noCoins()
  const out: InventoryItem[] = []
  const parts = items
    .split(/,\s*|\s+and\s+(?=\d|[A-Z])/)
    .map((p) => p.replace(/^and\s+/, '').trim())
    .filter(Boolean)
  for (const part of parts) {
    const money = /^(\d+)\s*(CP|SP|EP|GP|PP)$/i.exec(part)
    if (money) {
      coins[money[2]!.toLowerCase() as Coin] += Number(money[1])
      continue
    }
    const m = /^(\d+)\s+(.+)$/.exec(part)
    const qty = m ? Number(m[1]) : 1
    let name = m ? m[2]! : part
    if (/same as above|chosen for the tool proficiency above/i.test(name))
      name = tools.background ?? tools.cls ?? name.replace(/\s*\(.*\)|\s+chosen.*$/i, '')
    else if (/of your choice/i.test(name))
      name = tools.cls ?? name.replace(/\s+of your choice/i, '')
    const known = matchItem(data, name)
    out.push({
      name: qty > 1 && known ? known.name : name,
      qty: String(qty),
      ...(known?.tag ? { tag: known.tag } : {}),
    })
  }
  return { items: out, gp: coins.gp, coins }
}

function matchItem(data: Dnd5eBuildData, name: string): { name: string; tag?: string } | null {
  const tries = [name, name.replace(/es$/, ''), name.replace(/s$/, '')].map(norm)
  for (const t of tries) {
    const w = data.weapons.find((x) => norm(x.name) === t)
    if (w) return { name: w.name, tag: 'Weapon' }
    const a = data.armor.find((x) => norm(x.name) === t)
    if (a) return { name: a.name, tag: a.category === 'Shield' ? 'Shield' : 'Armor' }
    const g = data.gear.find((x) => norm(x.name) === t)
    if (g) return { name: g.name }
  }
  return null
}

function armorOf(data: Dnd5eBuildData, name: string): Dnd5eArmorDef | undefined {
  return data.armor.find((a) => norm(a.name) === norm(name))
}

/** A weapon in the inventory, by its own name or its parenthesis ("Arcane Focus (Quarterstaff)"). */
function weaponOf(data: Dnd5eBuildData, name: string): Dnd5eWeaponDef | undefined {
  const inner = /\(([^)]+)\)/.exec(name)?.[1]
  return data.weapons.find(
    (x) => norm(x.name) === norm(name) || (inner && norm(x.name) === norm(inner)),
  )
}

/** Evaluates an AC formula like "10 + DEX + CON". */
function acFormula(formula: string, abilities: Record<Dnd5eAbility, number>): number {
  return formula.split('+').reduce((n, part) => {
    const p = part.trim().toUpperCase() as Dnd5eAbility
    return n + (DND5E_ABILITIES.includes(p) ? abilityMod(abilities[p]) : Number(part) || 0)
  }, 0)
}

/** Armor Class from worn armor and shield, else the best unarmored formula (SRD 5.2.1 p. 7). */
export function armorClass(
  st: Pick<Dnd5eBuildState, 'ac'>,
  abilities: Record<Dnd5eAbility, number>,
  inventory: InventoryItem[],
  data: Dnd5eBuildData,
): number {
  const worn = inventory
    .filter((i) => i.worn)
    .map((i) => armorOf(data, i.name))
    .filter((a) => !!a)
  const body = worn.find((a) => a.category !== 'Shield')
  const shield = worn.find((a) => a.category === 'Shield')
  const dex = abilityMod(abilities.DEX)
  let base: number
  if (body)
    base = body.ac + (body.dex === 'full' ? dex : body.dex === 'max2' ? Math.min(2, dex) : 0)
  else
    base = Math.max(
      10 + dex,
      ...st.ac.filter((f) => !shield || !f.noShield).map((f) => acFormula(f.formula, abilities)),
    )
  return base + (shield?.ac ?? 0)
}

function weaponEntry(
  w: Dnd5eWeaponDef,
  abilities: Record<Dnd5eAbility, number>,
  pb: number,
  proficient: boolean,
): Dnd5eWeapon {
  const str = abilityMod(abilities.STR)
  const dex = abilityMod(abilities.DEX)
  const mod = w.properties.includes('Finesse')
    ? Math.max(str, dex)
    : w.type === 'Ranged'
      ? dex
      : str
  const range = w.range
    ? `${w.range.normal}/${w.range.long} ft`
    : w.properties.includes('Reach')
      ? '10 ft'
      : '5 ft'
  return {
    name: w.name,
    atk: mod + (proficient ? pb : 0),
    dmg: mod ? `${w.damage}${sign(mod)}` : w.damage,
    type: w.damageType,
    range,
    slug: w.slug,
  }
}

function resolveCount(
  u: Uses,
  st: Dnd5eBuildState,
  level: number,
  abilities: Record<Dnd5eAbility, number>,
): number {
  const c = u.uses.count
  const t = trackOf(st, u.cls)
  const cl = t.level
  const sub = t.sub && SUBCLASS_SCALING[t.sub.slug]?.uses?.[u.name]
  if (sub?.count && u.from === t.sub?.name) return countAt(sub.count, cl)
  if (u.times) return u.times * (c === 'level' ? cl : typeof c === 'number' ? c : 1)
  if (typeof c === 'number') return c
  if (c === 'PB') return proficiencyBonus(level)
  if (c === 'level') return cl
  if (c.startsWith('column:')) return columnNumber(t.cls, cl, c.slice(7))
  return Math.max(1, abilityMod(abilities[c as Dnd5eAbility]))
}

function resourceDice(u: Uses, st: Dnd5eBuildState): string | undefined {
  const t = trackOf(st, u.cls)
  const cl = t.level
  const sub = t.sub && SUBCLASS_SCALING[t.sub.slug]?.uses?.[u.name]
  if (sub?.dice)
    return Object.entries(sub.dice).reduce<string | undefined>(
      (d, [l, v]) => (Number(l) <= cl ? v : d),
      undefined,
    )
  if (!u.dice) return undefined
  if (u.dice.startsWith('column:')) return columnText(t.cls, cl, u.dice.slice(7))
  // A later feature that changes the die (Improved Combat Superiority's d10).
  const later = (t.sub?.features ?? [])
    .filter((f) => f.level <= cl && f.dice && /improved|ultimate/i.test(f.name))
    .sort((a, b) => b.level - a.level)[0]
  return later && u.from === t.sub?.name ? later.dice : u.dice
}

/** The casting a class gives: its own, or its subclass's (Eldritch Knight). */
const trackSpellcasting = (t: Dnd5eClassTrack) => t.cls.spellcasting ?? t.sub?.spellcasting

/**
 * One class's casting numbers at its own level, as if single-classed (SRD 5.2.1 p. 25): its
 * cantrips, prepared spells, slots and Pact Magic, with the hero's Proficiency Bonus. Undefined
 * for a class without casting (yet).
 */
function trackCasting(
  t: Dnd5eClassTrack,
  level: number,
  abilities: Record<Dnd5eAbility, number>,
): Dnd5eCasting | undefined {
  const sc = trackSpellcasting(t)
  if (!sc) return undefined
  const cl = t.level
  const cantrips = sc.cantrips[cl - 1] ?? 0
  const prepared = sc.prepared[cl - 1] ?? 0
  const slots = sc.slots?.[cl - 1] ?? Array<number>(9).fill(0)
  const pact = sc.pact?.[cl - 1]
  if (!cantrips && !prepared && !slots.some(Boolean) && !pact?.slots) return undefined
  const pb = proficiencyBonus(level)
  const mod = abilityMod(abilities[sc.ability])
  return {
    ability: sc.ability,
    kind: sc.kind,
    list: sc.list,
    saveDc: 8 + mod + pb,
    attack: mod + pb,
    slots: [...slots],
    ...(pact ? { pact: { slots: pact.slots, level: pact.slotLevel } } : {}),
    cantrips,
    prepared,
  }
}

/**
 * The level a class adds on the Multiclass Spellcaster table (SRD 5.2.1 pp. 25–26): all of a
 * full caster's levels, half a Paladin's or Ranger's rounded up (the Artificer's too, Forge of
 * the Artificer), a third of an Eldritch Knight's or Arcane Trickster's rounded down (PHB 2024).
 */
export function casterLevel(kind: Dnd5eCasting['kind'], level: number): number {
  if (kind === 'full') return level
  if (kind === 'half') return Math.ceil(level / 2)
  if (kind === 'third') return Math.floor(level / 3)
  return 0
}

/**
 * Spell slots of a hero with Spellcasting from several classes (SRD 5.2.1 pp. 25–26): the
 * Multiclass Spellcaster table, the full casters' slot table, at the sum of `casterLevel`. One
 * class with slots keeps its own table, and Pact Magic stays apart.
 */
function heroSlots(st: Dnd5eBuildState, per: { t: Dnd5eClassTrack; c: Dnd5eCasting }[]) {
  const slotted = per.filter((p) => p.c.slots.some(Boolean))
  if (slotted.length < 2) return slotted[0]?.c.slots ?? Array<number>(9).fill(0)
  const n = slotted.reduce((sum, p) => sum + casterLevel(p.c.kind, p.t.level), 0)
  const table = st.ctx.data.classes.find((c) => c.spellcasting?.kind === 'full')?.spellcasting
  return [...(table?.slots?.[Math.min(20, n) - 1] ?? Array<number>(9).fill(0))]
}

/**
 * The hero's casting: one class's numbers (its DC, attack, cantrips and prepared spells; the
 * first casting class's when several cast), with the slots of every class and any class's Pact
 * Magic; and each casting class's own numbers when the hero has more than one class.
 */
function castingStats(
  st: Dnd5eBuildState,
  level: number,
  abilities: Record<Dnd5eAbility, number>,
): { main?: Dnd5eCasting; classes: Dnd5eClassCasting[] } {
  const per = st.tracks.flatMap((t) => {
    const c = trackCasting(t, level, abilities)
    return c ? [{ t, c }] : []
  })
  const first = per[0]
  if (!first) return { classes: [] }
  const pact = per.find((p) => p.c.pact)?.c.pact
  const main: Dnd5eCasting = { ...first.c, slots: heroSlots(st, per) }
  if (pact) main.pact = pact
  else delete main.pact
  const classes =
    st.tracks.length > 1
      ? per.map(({ t, c }): Dnd5eClassCasting => {
          const sc = trackSpellcasting(t)
          return {
            ability: c.ability,
            kind: c.kind,
            list: c.list,
            saveDc: c.saveDc,
            attack: c.attack,
            ...(c.pact ? { pact: c.pact } : {}),
            cantrips: c.cantrips,
            prepared: c.prepared,
            classSlug: t.cls.slug,
            className: sc === t.cls.spellcasting ? t.cls.name : (t.sub?.name ?? t.cls.name),
            level: t.level,
            maxSpellLevel: maxSpellLevel(sc, t.level),
          }
        })
      : []
  return { main, classes }
}

/** Speed as the sheet shows it: "30 ft", "30 ft, climb 30 ft". */
function speedText(st: Dnd5eBuildState): string {
  const unarmored = st.tracks.reduce(
    (n, t) =>
      n +
      (t.cls.columns.includes('Unarmored Movement')
        ? columnNumber(t.cls, t.level, 'Unarmored Movement')
        : 0),
    0,
  )
  const fast = st.tracks.some((t) =>
    t.cls.features.some((f) => f.level <= t.level && norm(f.name) === 'fast movement'),
  )
    ? 10
    : 0
  const walk = st.ctx.species.speed + st.walkBonus + unarmored + fast
  const rest = [...st.speeds].map(([k, v]) => `${k} ${v === 'walk' ? walk : v} ft`)
  return [`${walk} ft`, ...rest].join(', ')
}

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']

/** Summary entries the existing sheet layouts show in Features: proficiencies, spells, resources. */
function summaryFeatures(sheet: Dnd5eSheet, masteries: string[]): Dnd5eFeatureEntry[] {
  const p = sheet.proficiencies
  const out: Dnd5eFeatureEntry[] = []
  if (p) {
    const skills = p.skills.map((s) => (p.expertise.includes(s) ? `${s} (Expertise)` : s))
    const lines = [
      `Saving throws: ${sheet.saveProfs.join(', ') || 'none'}`,
      `Skills: ${skills.join(', ') || 'none'}`,
      p.tools.length ? `Tools: ${p.tools.join(', ')}` : '',
      `Languages: ${p.languages.join(', ')}`,
      p.armor.length ? `Armor: ${p.armor.join(', ')}` : '',
      p.weapons.length ? `Weapons: ${p.weapons.join(', ')}` : '',
      masteries.length ? `Weapon mastery: ${masteries.join(', ')}` : '',
      sheet.senses?.length
        ? `Senses: ${sheet.senses.map((s) => `${s.name} ${s.range} ft`).join(', ')}`
        : '',
      sheet.defenses?.resistances.length
        ? `Resistances: ${sheet.defenses.resistances.join(', ')}`
        : '',
      sheet.defenses?.conditionImmunities.length
        ? `Condition immunities: ${sheet.defenses.conditionImmunities.join(', ')}`
        : '',
    ].filter(Boolean)
    out.push({ name: 'Proficiencies', desc: lines.join('\n'), from: 'Summary' })
  }
  const c = sheet.castingStats
  const spells = sheet.spells ?? []
  if (c || spells.length) {
    const names = (f: (s: Dnd5eSpellRef) => boolean) =>
      spells
        .filter(f)
        .map((s) => s.name)
        .join(', ')
    const slots = c?.slots
      .map((n, i) => (n ? `${ORDINAL[i]} ×${n}` : ''))
      .filter(Boolean)
      .join(', ')
    const lines = [
      c ? `Save DC ${c.saveDc} · spell attack ${sign(c.attack)} (${c.ability})` : '',
      slots ? `Spell slots: ${slots}` : '',
      c?.pact ? `Pact Magic: ${c.pact.slots} × level ${c.pact.level} slots (Short Rest)` : '',
      names((s) => s.level === 0) ? `Cantrips: ${names((s) => s.level === 0)}` : '',
      names((s) => s.level > 0 && !s.always && !s.book)
        ? `Prepared: ${names((s) => s.level > 0 && !s.always && !s.book)}`
        : '',
      names((s) => s.level > 0 && !!s.always)
        ? `Always prepared: ${names((s) => s.level > 0 && !!s.always)}`
        : '',
      names((s) => !!s.book) ? `Spellbook (not prepared): ${names((s) => !!s.book)}` : '',
    ].filter(Boolean)
    out.push({ name: 'Spells', desc: lines.join('\n'), from: 'Summary' })
  }
  if (sheet.resources?.length) {
    const rest = { short: 'Short Rest', long: 'Long Rest', dawn: 'dawn', turn: 'turn' }
    const lines = sheet.resources.map(
      (r) =>
        `${r.name}: ${r.max}${r.dice ? ` × ${r.dice}` : ''} per ${rest[r.recharge]}${r.short ? ` (${r.short === 'all' ? 'all' : r.short} back on a Short Rest)` : ''}`,
    )
    out.push({ name: 'Resources', desc: lines.join('\n'), from: 'Summary' })
  }
  return out
}

/** The numbers a level-up moves by their change, so hand edits to them survive. */
export interface Dnd5eNumbers {
  ac: number
  initMod: number
  passivePerception: number
  hpPerLevel: number
  con: number
}

export function dnd5eNumbers(
  st: Dnd5eBuildState,
  sheet: Pick<Dnd5eSheet, 'abilities' | 'inventory'>,
  level: number,
): Dnd5eNumbers {
  const pb = proficiencyBonus(level)
  const wis = abilityMod(sheet.abilities.WIS)
  const perception = st.expertise.has('Perception') ? 2 * pb : st.skills.has('Perception') ? pb : 0
  return {
    ac: armorClass(st, sheet.abilities, sheet.inventory, st.ctx.data),
    initMod: abilityMod(sheet.abilities.DEX) + (st.initiativePb ? pb : 0),
    passivePerception: 10 + wis + perception,
    hpPerLevel: st.hpPerLevel,
    con: abilityMod(sheet.abilities.CON),
  }
}

/**
 * Writes what the walk built onto the sheet: proficiencies, features, feats, options, spells,
 * casting, resources, and the level-tied numbers that aren't moved by their change (the
 * Proficiency Bonus, Hit Die, speed, built weapons). Entries typed in by hand (features without
 * `from`, weapons without `slug`) stay.
 */
export function writeBuild(sheet: Dnd5eSheet, st: Dnd5eBuildState, level: number): void {
  const { species, background, data } = st.ctx
  const first = st.tracks[0]!
  const cls = first.cls
  const pb = proficiencyBonus(level)
  const named = (t: Dnd5eClassTrack) => (t.sub ? `${t.cls.name} (${t.sub.name})` : t.cls.name)
  sheet.classSlug = cls.slug
  sheet.class =
    st.tracks.length > 1
      ? st.tracks
          .map((t) => `${t.cls.name} ${t.level}${t.sub ? ` (${t.sub.name})` : ''}`)
          .join(' / ')
      : named(first)
  sheet.subclassSlug = first.sub?.slug ?? ''
  sheet.classes = st.tracks.map((t) => ({
    slug: t.cls.slug,
    name: t.cls.name,
    level: t.level,
    hitDie: t.cls.hitDie,
    ...(t.sub ? { subclassSlug: t.sub.slug, subclass: t.sub.name } : {}),
  }))
  sheet.speciesSlug = species.slug
  sheet.lineage = st.lineage ? `${species.name} (${st.lineage.name})` : species.name
  sheet.backgroundSlug = background.slug
  sheet.background = background.name
  sheet.hitDie = cls.hitDie
  // Hit Point Dice of the same size pool together; different sizes are tracked apart (p. 24).
  const dice = new Map<number, number>()
  for (const t of st.tracks) dice.set(t.cls.hitDie, (dice.get(t.cls.hitDie) ?? 0) + t.level)
  sheet.hitDice = [...dice].map(([die, count]) => ({ die, count }))
  sheet.profBonus = pb
  sheet.size = st.size
  sheet.speed = speedText(st)
  sheet.saveProfs = DND5E_ABILITIES.filter((a) => st.saves.has(a))
  sheet.proficiencies = {
    skills: allSkills().filter((s) => st.skills.has(s)),
    expertise: allSkills().filter((s) => st.expertise.has(s)),
    tools: [...st.tools],
    languages: [...st.languages],
    weapons: [...st.weapons],
    armor: [...st.armor],
  }
  sheet.featsTaken = st.feats.map((f) => ({ ...f }))
  sheet.options = st.options.map((o) => ({ ...o }))
  sheet.masteries = [...st.masteries]
  // Each class's spells use that class's ability (SRD 5.2.1 p. 25).
  sheet.spells = [
    ...st.tracks.flatMap((t) => {
      const ability = trackSpellcasting(t)?.ability ?? 'INT'
      const from = t.sub?.spellcasting ? t.sub.name : t.cls.name
      const ref = (slug: string, extra: Partial<Dnd5eSpellRef> = {}): Dnd5eSpellRef => {
        const def = data.spells.find((s) => s.slug === slug)
        return {
          slug,
          name: def?.name ?? slug,
          level: def?.level ?? 0,
          from,
          ability,
          ...extra,
        }
      }
      return [
        ...t.cantrips.map((s) => ref(s)),
        ...t.prepared.map((s) => ref(s)),
        ...t.book.filter((s) => !t.prepared.includes(s)).map((s) => ref(s, { book: true })),
      ]
    }),
    ...st.extra.map((s) => ({ ...s })),
  ]
  const casting = castingStats(st, level, sheet.abilities)
  if (casting.main) sheet.castingStats = casting.main
  else delete sheet.castingStats
  if (casting.classes.length) sheet.castingClasses = casting.classes
  else delete sheet.castingClasses
  sheet.resources = st.uses
    .map((u): Dnd5eResource => {
      const dice = resourceDice(u, st)
      return {
        name: u.name,
        from: u.from,
        max: resolveCount(u, st, level, sheet.abilities),
        recharge: u.uses.recharge,
        ...(u.uses.short !== undefined ? { short: u.uses.short } : {}),
        ...(dice ? { dice } : {}),
      }
    })
    .filter((r) => r.max > 0)
  sheet.senses = [...st.senses].map(([name, range]) => ({ name, range }))
  sheet.defenses = {
    resistances: [...st.resistances],
    immunities: [...st.immunities],
    conditionImmunities: [...st.conditionImmunities],
  }
  // Built weapons follow the scores and Proficiency Bonus; hand-made ones stay as typed.
  sheet.weapons = sheet.weapons.map((w) => {
    const def = w.slug ? bySlug(data.weapons, w.slug) : undefined
    return def
      ? { ...weaponEntry(def, sheet.abilities, pb, proficientWith(st.weapons, def)), name: w.name }
      : w
  })
  const hand = sheet.features.filter((f) => !f.from)
  sheet.features = [...st.features, ...hand]
  const masteryNames = st.masteries.map((m) => {
    const w = bySlug(data.weapons, m)
    return w ? `${w.name} (${w.mastery})` : m
  })
  sheet.features = [...summaryFeatures(sheet, masteryNames), ...sheet.features]
}

// --- Level 1 -------------------------------------------------------------------------

/** An empty creation for the builder. */
export function emptyCreation(): Dnd5eCreation {
  return {
    classSlug: '',
    speciesSlug: '',
    backgroundSlug: '',
    method: 'standard',
    base: { STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 },
    bonus: {},
    equipment: { class: 'A', background: 'A' },
  }
}

/** What the level 1 build asks for, in order, with the picks so far. */
export function creationPicks(c: Dnd5eCreation, choices: Picks, data: Dnd5eBuildData): Dnd5ePick[] {
  return walkDnd5e({ creation: c, choices }, 1, data)?.asked ?? []
}

/** What a background's increases still need (SRD 5.2.1 p. 21): +2/+1 or +1/+1/+1 among its three. */
export function bonusProblem(c: Dnd5eCreation, bg: Dnd5eBackgroundDef | undefined): string | null {
  if (!bg) return 'Choose a background'
  const entries = Object.entries(c.bonus).filter(([, v]) => v)
  if (entries.some(([a]) => !bg.abilities.includes(a as Dnd5eAbility)))
    return `The increases go to ${bg.abilities.join(', ')}`
  const values = entries.map(([, v]) => v!).sort()
  const ok = values.join() === '1,2' || values.join() === '1,1,1'
  return ok ? null : 'Give +2 and +1, or +1 to all three'
}

/** What the scores still need: the Standard Array once each, or 27 points of 8–15. */
export function scoresProblem(c: Dnd5eCreation): string | null {
  const v = DND5E_ABILITIES.map((a) => c.base[a])
  if (c.method === 'standard')
    return [...v].sort((a, b) => b - a).join() === STANDARD_ARRAY.join()
      ? null
      : 'Use each Standard Array score once: 15, 14, 13, 12, 10, 8'
  if (c.method === 'pointBuy') {
    if (v.some((x) => x < 8 || x > 15)) return 'Point Cost scores run from 8 to 15'
    const spent = v.reduce((n, x) => n + (POINT_BUY_COST[x] ?? 0), 0)
    return spent > POINT_BUY_BUDGET ? `${spent} of ${POINT_BUY_BUDGET} points: lower a score` : null
  }
  return v.some((x) => !Number.isInteger(x) || x < 3 || x > 18)
    ? 'Rolled scores run from 3 to 18'
    : null
}

export function pointsSpent(c: Dnd5eCreation): number {
  return DND5E_ABILITIES.reduce((n, a) => n + (POINT_BUY_COST[c.base[a]] ?? 0), 0)
}

/** Every problem the level 1 picks still have, each with what asks for it. */
export function creationProblems(
  c: Dnd5eCreation,
  choices: Picks,
  data: Dnd5eBuildData,
): { key: string; text: string }[] {
  return creationPicks(c, choices, data).flatMap((p) => {
    const e = pickProblem(p, choices[p.key])
    return e ? [{ key: p.key, text: `${p.label}: ${e}` }] : []
  })
}

/** The builder steps that ask level 1 picks. */
export type Dnd5ePickStep = 'subclass' | 'species' | 'background' | 'choices' | 'spells'

/** The builder step a level 1 pick belongs to. */
export function pickStep(p: Dnd5ePick): Dnd5ePickStep {
  if (p.kind === 'cantrip' || p.kind === 'spell') return 'spells'
  if (p.kind === 'subclass') return 'subclass'
  if (p.key.startsWith('L1:species')) return 'species'
  if (p.key.startsWith('L1:background')) return 'background'
  return 'choices'
}

/**
 * Picks of a step before the current one that a later choice broke (a Skillful skill the
 * background now gives): the builder asks them on the current step instead of going back.
 * `stepIndex` gives a step's place in the builder, or -1 when it isn't shown.
 */
export function clashPicks(
  picks: Dnd5ePick[],
  choices: Picks,
  stepIndex: (s: Dnd5ePickStep) => number,
  current: number,
): Dnd5ePick[] {
  return picks.filter((p) => {
    const at = stepIndex(pickStep(p))
    return at >= 0 && at < current && !!pickProblem(p, choices[p.key])
  })
}

/** Builds the level 1 sheet: everything the walk gives, the starting gear and the numbers. */
export function buildDnd5eSheet(
  c: Dnd5eCreation,
  choices: Picks,
  data: Dnd5eBuildData,
): Dnd5eSheet {
  const st = c.backgroundSlug ? walkDnd5e({ creation: c, choices }, 1, data) : null
  if (!st) throw new Error('A 5e build needs a class, species and background from the data')
  const { cls, background } = st.ctx
  const sheet = defaultSheet('dnd5e')
  sheet.creation = JSON.parse(JSON.stringify(c)) as Dnd5eCreation
  if (c.backgroundSlug !== CUSTOM_BACKGROUND) delete sheet.creation.custom
  // Only the picks the build asked for: a changed species or feat leaves old keys behind.
  const asked = new Set(st.asked.map((p) => p.key))
  sheet.choices = Object.fromEntries(
    Object.entries(choices).filter(([k, v]) => asked.has(k) && v.length),
  )
  sheet.abilities = { ...st.abilities }
  // Starting equipment: the chosen options, with the tools they say to fill in.
  const toolPick = (k: string) => choices[k]?.[0]
  const tools = { background: toolPick('L1:background:tool'), cls: toolPick('L1:class:tool') }
  const pack = [
    cls.equipment.find((e) => e.option === c.equipment.class) ?? cls.equipment[0],
    background.equipment.find((e) => e.option === c.equipment.background) ??
      background.equipment[0],
  ].filter((e) => !!e)
  const coins = noCoins()
  const inventory: InventoryItem[] = []
  pack.forEach((e, i) => {
    const parsed = parseEquipment(
      e.items,
      data,
      i === 0 ? { cls: tools.cls } : { background: tools.background },
    )
    for (const k of Object.keys(coins) as Coin[]) coins[k] += parsed.coins[k]
    inventory.push(...parsed.items)
  })
  // Wear the first armor and shield the hero is trained in.
  const trained = (a: Dnd5eArmorDef) =>
    [...st.armor].some(
      (x) =>
        norm(x) === (a.category === 'Shield' ? 'shields' : `${a.category.toLowerCase()} armor`),
    )
  for (const kind of ['body', 'shield'] as const) {
    const item = inventory.find((i) => {
      const a = armorOf(data, i.name)
      return a && (kind === 'shield') === (a.category === 'Shield') && trained(a)
    })
    if (item) item.worn = true
  }
  sheet.inventory = inventory
  sheet.coins = coins
  const pb = proficiencyBonus(1)
  sheet.weapons = inventory.flatMap((i) => {
    const w = weaponOf(data, i.name)
    return w ? [weaponEntry(w, sheet.abilities, pb, proficientWith(st.weapons, w))] : []
  })
  writeBuild(sheet, st, 1)
  const n = dnd5eNumbers(st, sheet, 1)
  sheet.hpMax = Math.max(1, cls.hitDie + n.con + n.hpPerLevel)
  sheet.hp = sheet.hpMax
  sheet.ac = n.ac
  sheet.initMod = n.initMod
  sheet.passivePerception = n.passivePerception
  return sheet
}

/** The creation a built sheet records, or null for a hand-made one. */
export function dnd5eCreation(sheet: Dnd5eSheet): Dnd5eCreation | null {
  return sheet.classSlug && sheet.creation ? sheet.creation : null
}
