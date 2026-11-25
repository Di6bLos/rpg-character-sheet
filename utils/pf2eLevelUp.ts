// Pathfinder 2e level-ups (Player Core p. 29) for heroes made in the builder, on the class data
// in `data/pf2e/`: what a level grants (`pf2eLevelPlan`: Hit Points, class features and the
// subclass's later benefits, proficiency increases, feat slots, skill increases, attribute
// boosts, spell slots and spells), what the picks still need (`pf2eLevelProblems`) and writing a
// level onto the sheet (`applyPf2eLevel`). Proficiency increases are read from the features'
// text the way `utils/pf2eBuild.ts` reads the 1st-level lines. Archetypes (Player Core pp.
// 215–216) come from `utils/pf2eArchetypes.ts`.
import type {
  Pf2eClassDef,
  Pf2eFeatDef,
  Pf2eSpellDef,
  Pf2eSubclassOption,
  Pf2eWeaponDef,
} from '~/data/pf2e/types'
import type {
  Pf2eAttr,
  Pf2eFeat,
  Pf2eLevelInput,
  Pf2eRank,
  Pf2eSheet,
  Pf2eSpellRef,
  Pf2eStrike,
} from '~/types/sheets'
import { recordLevel } from '~/utils/levelHistory'
import {
  applyArchetypeCasting,
  archetypeFeatOptions,
  dedicationArchetype,
  dedicationLock,
  archetypeCastingPlan,
  dedicationNotes,
  featSkillChoices,
  featSkillRanks,
  freeArchetypeSlot,
  grantedFeat,
  heroArchetypes,
  isDedication,
  lockClause,
  tagArchetype,
  trainsSkills,
} from '~/utils/pf2eArchetypes'
import {
  GENERIC_FEATURE,
  PF2E_ATTRS,
  PF2E_SKILL_NAMES,
  type Pf2eBuildData,
  type WeaponRule,
  EXTRA_TRACK,
  armorPenalties,
  armorRank,
  classSlotRow,
  curriculumRules,
  featEntry,
  featureAction,
  heritageFeatLists,
  higher,
  isClassSpell,
  listedSpellNames,
  plain,
  resolve,
  shortKind,
  spellNamed,
  strikeAttributes,
  subclassTraining,
  uniqueNames,
  weaponRules,
} from '~/utils/pf2eBuild'
import { proficiency } from '~/utils/pf2ePlay'
import { fontSlots, setSlotMax } from '~/utils/pf2eSpells'

const RANKS: Pf2eRank[] = ['U', 'T', 'E', 'M', 'L']
const RANK_WORD: Record<string, Pf2eRank> = {
  trained: 'T',
  expert: 'E',
  master: 'M',
  legendary: 'L',
}
export const RANK_NAME: Record<Pf2eRank, string> = {
  U: 'Untrained',
  T: 'Trained',
  E: 'Expert',
  M: 'Master',
  L: 'Legendary',
}
const ATTR_BY_NAME: Record<string, Pf2eAttr> = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
}
const SKILL_ATTR = new Map<string, Pf2eAttr>([
  ['Acrobatics', 'DEX'],
  ['Arcana', 'INT'],
  ['Athletics', 'STR'],
  ['Crafting', 'INT'],
  ['Deception', 'CHA'],
  ['Diplomacy', 'CHA'],
  ['Intimidation', 'CHA'],
  ['Medicine', 'WIS'],
  ['Nature', 'WIS'],
  ['Occultism', 'INT'],
  ['Performance', 'CHA'],
  ['Religion', 'WIS'],
  ['Society', 'INT'],
  ['Stealth', 'DEX'],
  ['Survival', 'WIS'],
  ['Thievery', 'DEX'],
])
const SAVES = ['Fortitude', 'Reflex', 'Will'] as const
type Stat = 'perception' | 'fortitude' | 'reflex' | 'will' | 'classDc' | 'spell'
type ArmorCat = 'unarmored' | 'light' | 'medium' | 'heavy'
const ARMOR_CATS: ArmorCat[] = ['unarmored', 'light', 'medium', 'heavy']
const SAVE_STAT: Record<string, Stat> = {
  Fortitude: 'fortitude',
  Reflex: 'reflex',
  Will: 'will',
  Perception: 'perception',
  'Class DC': 'classDc',
}

const MAX_LEVEL = 20
const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'")
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const rankUp = (r: Pf2eRank) => RANKS[Math.min(RANKS.length - 1, RANKS.indexOf(r) + 1)]!
const rankAbove = (a: Pf2eRank, b: Pf2eRank) => RANKS.indexOf(a) > RANKS.indexOf(b)

/** The class row for a level, found by level (the generated rows aren't guaranteed in order). */
const tableRow = (cls: Pf2eClassDef, level: number) =>
  (cls.advancement.find((a) => a.level === level)?.features ?? []).map((f) => norm(f.trim()))

/** What the hero was built from, looked up once. Null for hand-made sheets. */
export function pf2eContext(sheet: Pf2eSheet, data: Pf2eBuildData) {
  const c = sheet.creation
  const cls = data.classes.find((x) => x.slug === sheet.classSlug)
  if (!c || !cls) return null
  const r = resolve(c, data)
  return {
    cls,
    creation: c,
    deity: r.deity,
    picks: r.subclassPicks,
    heritage: r.heritage,
    ancestry: r.ancestry,
  }
}
type Ctx = NonNullable<ReturnType<typeof pf2eContext>>

// --- Rules text by level --------------------------------------------------------

/**
 * A class feature's or subclass option's text split into sentences with the level each starts
 * at: its heading ("## Specialization Ability · Level 7"), its label ("**Third Doctrine (7th)**",
 * "**Deeper Psi Cantrip (Level 6)**"), or "At 13th level, …" at the start of the sentence.
 * Lines that continue a sentence (a doctrine's "spell\nattack modifier") are joined first.
 */
export function gatedParts(text: string, base = 1): { level: number; text: string }[] {
  const lines: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const prev = lines.at(-1)
    if (line && prev && !prev.startsWith('#') && !/^(?:[-#|]|\*\*)/.test(line))
      lines[lines.length - 1] = `${prev} ${line}`
    else lines.push(line)
  }
  const out: { level: number; text: string }[] = []
  let section = base
  for (const line of lines) {
    if (!line) continue
    if (line.startsWith('#')) {
      const at = /·\s*Level (\d+)/.exec(line)
      section = at ? Number(at[1]) : base
      continue
    }
    const label = /^(?:- )?\*\*[^*]*?\((?:(\d+)(?:st|nd|rd|th)|Level (\d+))\)/.exec(line)
    const lineLevel = label ? Number(label[1] ?? label[2]) : section
    for (const s of plain(line).split(/(?<=\.)\s+/)) {
      const at = /^(?:- )?At (\d+)(?:st|nd|rd|th) level\b/i.exec(s)
      if (s) out.push({ level: at ? Math.max(lineLevel, Number(at[1])) : lineLevel, text: s })
    }
  }
  return out
}

/** A subclass option's later benefits, by the level they start at (above 1st). */
const laterParts = (o: Pf2eSubclassOption) => gatedParts(o.text).filter((p) => p.level > 1)

// --- Proficiencies --------------------------------------------------------------

/** The hero's proficiency ranks at a level (Player Core p. 11), from the class data. */
export interface Pf2eProfile {
  stats: Record<Stat, Pf2eRank>
  armor: Record<ArmorCat, Pf2eRank>
  weapons: WeaponRule[]
  /** Skills a feature raises ("You become an expert in Crafting"). */
  skills: Record<string, Pf2eRank>
}

interface Grant {
  rank: Pf2eRank
  stats: Stat[]
  armor: ArmorCat[]
  weapon?: Omit<WeaponRule, 'rank'>
  skills: string[]
}

interface ReadContext {
  /** The feature or option the text belongs to, to find its choice. */
  key: string
  choices: Record<string, string[]>
  favored: string[]
  /** The hero has spells of their own (for "If you have qi spells, …"). */
  hasSpells: boolean
}

/** What a list like "simple weapons, martial weapons, and unarmed attacks" names. */
function readTargets(list: string, rank: Pf2eRank, rc: ReadContext): Grant[] {
  let l = norm(list)
  const out: Grant = { rank, stats: [], armor: [], skills: [] }
  const extra: Grant[] = []
  const group = /\bin that (?:weapon )?group\b/.test(l)
  const fire =
    /((?:simple|martial|advanced)(?:,? and (?:simple|martial|advanced))*) firearms and crossbows/.exec(
      l,
    )
  if (fire) {
    const categories = ['simple', 'martial', 'advanced'].filter((k) => fire[1]!.includes(k))
    extra.push({
      rank,
      stats: [],
      armor: [],
      skills: [],
      weapon: { categories, groups: ['Firearm', 'Crossbow'] },
    })
    l = l.replace(fire[0], '')
  }
  if (/\bfortitude\b/.test(l)) out.stats.push('fortitude')
  if (/\breflex\b/.test(l)) out.stats.push('reflex')
  if (/\bwill\b/.test(l)) out.stats.push('will')
  if (/\bperception\b/.test(l)) out.stats.push('perception')
  if (/\bclass dc\b|\branger dc\b/.test(l)) out.stats.push('classDc')
  if (/\bspell (?:attack|dc)/.test(l)) out.stats.push('spell')
  if (/\barmor\b/.test(l))
    out.armor.push(
      ...(/\ball armor\b/.test(l)
        ? (['light', 'medium', 'heavy'] as const)
        : (['light', 'medium', 'heavy'] as const).filter((k) => new RegExp(`\\b${k}\\b`).test(l))),
    )
  if (/\bunarmored defense\b|\bunarmed defense\b/.test(l)) out.armor.push('unarmored')
  const categories = /\bweapons?\b/.test(l)
    ? ['simple', 'martial', 'advanced'].filter((k) => new RegExp(`\\b${k}\\b`).test(l))
    : []
  if (/\bunarmed attacks?\b/.test(l)) categories.push('unarmed')
  const groups = group ? (rc.choices[`group:${rc.key}`] ?? []) : undefined
  if (categories.length && (!group || groups?.length))
    out.weapon = { categories, ...(groups ? { groups } : {}) }
  if (/\bfavored weapon\b/.test(l) && rc.favored.length)
    extra.push({
      rank,
      stats: [],
      armor: [],
      skills: [],
      weapon: { categories: [], names: rc.favored },
    })
  if (/\balchemical bombs\b/.test(l))
    extra.push({
      rank,
      stats: [],
      armor: [],
      skills: [],
      weapon: { categories: [], groups: ['Bomb'] },
    })
  if (!out.stats.length && !out.armor.length && !out.weapon && !extra.length) {
    for (const s of PF2E_SKILL_NAMES) if (new RegExp(`\\b${s}\\b`).test(list)) out.skills.push(s)
    for (const m of list.matchAll(/\b([A-Z][\w'’-]*(?: [A-Z][\w'’-]*)* Lore)\b/g))
      out.skills.push(m[1]!)
  }
  return [out, ...extra]
}

const RANKS_RE = '(trained|expert|master|legendary)'
const P_FOR = new RegExp(`proficiency ranks? (?:for|in|with) (.+?) increases? to ${RANKS_RE}`, 'gi')
const P_TO = new RegExp(
  `\\bto ${RANKS_RE} (?:with|for) (?:all )?(?:the )?(.+?)(?=,? and to ${RANKS_RE}\\b|$)`,
  'gi',
)
const P_GAIN = new RegExp(
  `\\b(?:gain|have) ${RANKS_RE} proficiency (?:in|with) (.+?)(?=$|;|,? and (?:you|when)\\b)`,
  'gi',
)
const P_TRAINED =
  /\b(?:you're|you are|you become)(?: also)? trained in (.+?)(?=$|;|,? and (?:you|gain)\b)/gi
const P_BECOME = new RegExp(
  `\\byou become (?:an? )?${RANKS_RE} in (.+?)(?=$|[,;]|\\s+and\\b)`,
  'gi',
)
const P_CHOSEN_SAVE = new RegExp(
  `proficiency rank for the chosen (?:saving throw|type of save) increases? to ${RANKS_RE}`,
  'i',
)

/** The proficiency increases a sentence grants, with what they apply to. */
export function readGrants(sentence: string, rc: ReadContext): Grant[] {
  const s = sentence.replace(/\.$/, '')
  // The eidolon's or a companion's own proficiencies ("Their proficiency rank…").
  if (/^(?:Their|Its)\b/.test(s)) return []
  if (/^If you have [\w ]*spells\b/i.test(s) && !rc.hasSpells) return []
  const out: Grant[] = []
  const chosen = P_CHOSEN_SAVE.exec(s)
  if (chosen) {
    const stats = (rc.choices[`save:${rc.key}`] ?? [])
      .map((x) => SAVE_STAT[x])
      .filter((x): x is Stat => !!x)
    return [{ rank: RANK_WORD[chosen[1]!.toLowerCase()]!, stats, armor: [], skills: [] }]
  }
  for (const m of s.matchAll(P_FOR))
    out.push(...readTargets(m[1]!, RANK_WORD[m[2]!.toLowerCase()]!, rc))
  if (/proficiency ranks? increases? to|increase your proficiency ranks? to/i.test(s)) {
    const from = s.search(/(?:proficiency ranks? increases?|increase your proficiency ranks?) to/i)
    for (const m of s.slice(from).matchAll(P_TO))
      out.push(...readTargets(m[2]!, RANK_WORD[m[1]!.toLowerCase()]!, rc))
  }
  for (const m of s.matchAll(P_GAIN))
    out.push(...readTargets(m[2]!, RANK_WORD[m[1]!.toLowerCase()]!, rc))
  for (const m of s.matchAll(P_TRAINED)) out.push(...readTargets(m[1]!, 'T', rc))
  for (const m of s.matchAll(P_BECOME)) {
    const skills = readTargets(m[2]!, 'T', rc).flatMap((g) => g.skills)
    if (skills.length)
      out.push({ rank: RANK_WORD[m[1]!.toLowerCase()]!, stats: [], armor: [], skills })
  }
  return out
}

function applyGrant(p: Pf2eProfile, g: Grant) {
  for (const s of g.stats) p.stats[s] = higher(p.stats[s], g.rank)
  for (const a of g.armor) p.armor[a] = higher(p.armor[a], g.rank)
  if (g.weapon) p.weapons.push({ rank: g.rank, ...g.weapon })
  for (const s of g.skills) p.skills[s] = higher(p.skills[s] ?? 'U', g.rank)
}

/** Ranks at 1st level: the class's lines plus what the 1st-level choices train. */
function levelOneProfile(ctx: Ctx): Pf2eProfile {
  const { cls, deity, picks } = ctx
  const saves = subclassTraining(picks).expertSaves
  const save = (k: 'fortitude' | 'reflex' | 'will') =>
    saves.has(k) ? higher('E', cls.saves[k]) : cls.saves[k]
  return {
    stats: {
      perception: cls.perception,
      fortitude: save('fortitude'),
      reflex: save('reflex'),
      will: save('will'),
      classDc: 'T',
      spell: 'T',
    },
    armor: Object.fromEntries(ARMOR_CATS.map((a) => [a, armorRank(cls, a, picks)])) as Record<
      ArmorCat,
      Pf2eRank
    >,
    weapons: weaponRules(cls, deity, picks),
    skills: {},
  }
}

/** Class features above 1st level, without the generic rows (feats, boosts, skill increases). */
const realFeatures = (cls: Pf2eClassDef, level: number) =>
  cls.features.filter((f) => f.level === level && !GENERIC_FEATURE.test(f.name.trim()))

/**
 * The hero's proficiency ranks at `level`: the 1st-level ranks raised by every class feature up
 * to it and the subclass's later benefits ("**Third Doctrine (7th)** You gain expert
 * proficiency with…"), with the choices made on the way (a weapon group, a saving throw).
 */
export function profileAt(
  sheet: Pf2eSheet,
  level: number,
  data: Pf2eBuildData,
  choices: Record<string, string[]> = sheet.levelChoices ?? {},
): Pf2eProfile | null {
  const ctx = pf2eContext(sheet, data)
  if (!ctx) return null
  const p = levelOneProfile(ctx)
  const rc = (key: string): ReadContext => ({
    key,
    choices,
    favored: ctx.deity?.favoredWeapons ?? [],
    hasSpells: !!sheet.spellcasting || !!sheet.focusSpells?.length,
  })
  for (const f of ctx.cls.features) {
    if (f.level > level || GENERIC_FEATURE.test(f.name.trim())) continue
    for (const part of gatedParts(f.text, f.level))
      if (part.level > 1 && part.level <= level)
        for (const g of readGrants(part.text, rc(f.name))) applyGrant(p, g)
  }
  for (const o of ctx.picks)
    for (const part of laterParts(o))
      if (part.level <= level) for (const g of readGrants(part.text, rc(o.name))) applyGrant(p, g)
  // Archetype feats (Player Core p. 215): Fighter Dedication's martial weapons, the skills a
  // dedication trains and the ones picked in their place.
  for (const e of sheet.feats) {
    const at = Number(e.level) || 1
    const def = e.archetype && at <= level ? data.feats.find((f) => f.id === e.id) : undefined
    if (!def) continue
    for (const part of gatedParts(def.text.split(LEADS_TO)[0] ?? '', at))
      if (part.level <= level && !trainsSkills(part.text))
        for (const g of readGrants(part.text, rc(def.name))) applyGrant(p, g)
    for (const skill of featSkillRanks(def, choices))
      p.skills[skill] = higher(p.skills[skill] ?? 'U', 'T')
  }
  followArmor(p, ctx.picks)
  return p
}

/**
 * An armor category that rises with another: "When you gain light armor expertise, you also
 * gain expert proficiency in medium armor, and when you gain light armor mastery, you also gain
 * master proficiency in medium armor" (a ruffian, Player Core p. 166; an avenger, War of
 * Immortals p. 58).
 */
function followArmor(p: Pf2eProfile, picks: Pf2eSubclassOption[]) {
  const re =
    /when you gain (light|medium|heavy) armor (expertise|mastery), you also gain (expert|master) proficiency in (light|medium|heavy) armor/gi
  for (const o of picks)
    for (const m of plain(o.text).matchAll(re)) {
      const need: Pf2eRank = m[2]!.toLowerCase() === 'expertise' ? 'E' : 'M'
      const from = m[1]!.toLowerCase() as ArmorCat
      const to = m[4]!.toLowerCase() as ArmorCat
      if (!rankAbove(need, p.armor[from]))
        p.armor[to] = higher(p.armor[to], RANK_WORD[m[3]!.toLowerCase()]!)
    }
}

/** A feat's "## X leads to..." list, which names feats rather than granting anything. */
const LEADS_TO = /\n#+ [^\n]* leads to\.\.\./

const weaponFits = (r: WeaponRule, w: Pick<Pf2eWeaponDef, 'name' | 'category' | 'group'>) =>
  !!r.names?.includes(w.name) ||
  ((r.categories.length ? r.categories.includes(w.category.toLowerCase()) : !!r.groups) &&
    (!r.groups || r.groups.includes(w.group)))

/** A weapon's rank under the profile's weapon rules. */
export const weaponRankIn = (
  p: Pf2eProfile,
  w: Pick<Pf2eWeaponDef, 'name' | 'category' | 'group'>,
) => p.weapons.reduce<Pf2eRank>((best, r) => (weaponFits(r, w) ? higher(r.rank, best) : best), 'U')

const CATEGORY_LABEL: [string, Pick<Pf2eWeaponDef, 'name' | 'category' | 'group'>][] = [
  ['Simple weapons', { name: '', category: 'Simple', group: '' }],
  ['Martial weapons', { name: '', category: 'Martial', group: '' }],
  ['Advanced weapons', { name: '', category: 'Advanced', group: '' }],
  ['Unarmed attacks', { name: '', category: 'Unarmed', group: '' }],
]
const STAT_LABEL: Record<Stat, string> = {
  perception: 'Perception',
  fortitude: 'Fortitude',
  reflex: 'Reflex',
  will: 'Will',
  classDc: 'Class DC',
  spell: 'Spell attack and DC',
}

/** The weapon a Strike on the sheet is (by name; the Fist is an unarmed attack). */
const strikeWeapon = (s: Pf2eStrike, data: Pf2eBuildData) =>
  data.weapons.find((w) => w.name === s.name)

// --- Feats ----------------------------------------------------------------------

/** `archetype`: the free archetype slot; `granted`: the feat another feat grants (Basic Maneuver). */
export type Pf2eLevelFeatKind = 'class' | 'skill' | 'general' | 'ancestry' | 'archetype' | 'granted'
export interface Pf2eFeatSlotPlan {
  key: string
  kind: Pf2eLevelFeatKind
  label: string
  /** What the slot takes, when the kind alone doesn't say it. */
  help?: string
  /** A granted feat: a feat of this class up to this level, from that feat. */
  grant?: { className: string; maxLevel: number; from: string }
}

/**
 * The levels a class feature's text says it applies at: "At 3rd level and every odd-numbered
 * level thereafter", "At 3rd level, 7th level, and 15th level", else its own level.
 */
function featureLevels(text: string, base: number): number[] {
  const t = plain(text)
  const every =
    /^At (\d+)(?:st|nd|rd|th) level and every (?:odd|even)-numbered level thereafter/i.exec(t)
  if (every)
    return Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).filter(
      (l) => l >= Number(every[1]) && (l - Number(every[1])) % 2 === 0,
    )
  const list = /^At ((?:\d+(?:st|nd|rd|th) level(?:,? and |, )?)+)/i.exec(t)
  if (list) return [...list[1]!.matchAll(/(\d+)(?:st|nd|rd|th)/g)].map((m) => Number(m[1]))
  return [base]
}

/**
 * Skill feats and skill increases a class feature adds to a level beyond the table's: Skillful
 * Lessons' skill feat "At 3rd level and every odd-numbered level thereafter" (investigator,
 * Player Core 2 p. 100), Stylish Tricks' "additional skill increase" and "additional skill feat"
 * at 3rd, 7th and 15th (swashbuckler, p. 158), Thaumaturgic Expertise's skill increase (Dark
 * Archive p. 31). Each with what it's limited to, which the player checks.
 */
export function featureSkillBonuses(cls: Pf2eClassDef, level: number) {
  const feats: { from: string; help?: string }[] = []
  const increases: { from: string; note?: string }[] = []
  for (const f of cls.features) {
    if (f.level > level || GENERIC_FEATURE.test(f.name.trim())) continue
    const t = plain(f.text)
    const feat = /\byou (?:also )?gain (?:a|an additional) skill feat\b/i.test(t)
    const increase = /\byou (?:also )?gain an additional skill increase\b/i.test(t)
    if ((!feat && !increase) || !featureLevels(f.text, f.level).includes(level)) continue
    if (feat) feats.push({ from: f.name, help: /This feat must be for [^.]+\./i.exec(t)?.[0] })
    if (increase)
      increases.push({
        from: f.name,
        note: /additional skill increase,? (?:which )?you can apply only to ([^.]+)\./i.exec(
          t,
        )?.[1],
      })
  }
  return { feats, increases }
}

/**
 * The feat slots a level's table row lists (Player Core p. 29): class, skill, general, ancestry;
 * plus the skill feats a class feature adds (`featureSkillBonuses`).
 */
export function levelFeatSlots(cls: Pf2eClassDef, level: number): Pf2eFeatSlotPlan[] {
  const row = tableRow(cls, level)
  const kinds: [Pf2eLevelFeatKind, RegExp, string][] = [
    ['class', new RegExp(`^${escape(norm(cls.name))} feat`), `${cls.name} feat`],
    ['ancestry', /^ancestry feat/, 'Ancestry feat'],
    ['skill', /^skill feat/, 'Skill feat'],
    ['general', /^general feat/, 'General feat'],
  ]
  const slots: Pf2eFeatSlotPlan[] = kinds.flatMap(([kind, re, label]) =>
    row
      .filter((f) => re.test(f))
      .map((_, i) => ({ key: i ? `${kind}${i + 1}` : kind, kind, label })),
  )
  for (const b of featureSkillBonuses(cls, level).feats) {
    const n = slots.filter((x) => x.kind === 'skill').length
    slots.push({
      key: n ? `skill${n + 1}` : 'skill',
      kind: 'skill',
      label: `Skill feat (${b.from})`,
      ...(b.help ? { help: b.help } : {}),
    })
  }
  return slots
}

const known = new WeakMap<object, Set<string>>()
/** Every feat and class feature name in the data, lowercased: a prerequisite that names one. */
function knownNames(data: Pick<Pf2eBuildData, 'feats' | 'classes'>) {
  let names = known.get(data.feats)
  if (!names) {
    names = new Set([
      ...data.feats.map((f) => norm(f.name)),
      ...data.classes.flatMap((c) => c.features.map((x) => norm(x.name))),
    ])
    known.set(data.feats, names)
  }
  return names
}

/** Feats the sheet has, by lowercased name. */
const featNames = (sheet: Pf2eSheet) => new Set(sheet.feats.map((f) => norm(f.name)))

/**
 * Feats a slot can take at a level: of the slot's list (the class's, the ancestry's and its
 * versatile heritage's, skill or general feats), of that level or lower, not taken already
 * unless the feat says it can be taken more than once. A class slot from 2nd level can also
 * take a dedication or the feats of the hero's archetypes (Player Core p. 215), listed after
 * the class's own; the free archetype slot takes only those (GM Core p. 84); a granted slot,
 * the class feats its feat names.
 */
export function levelFeatOptions(
  slot: Pf2eLevelFeatKind | Pf2eFeatSlotPlan,
  sheet: Pf2eSheet,
  level: number,
  data: Pf2eBuildData,
): Pf2eFeatDef[] {
  const ctx = pf2eContext(sheet, data)
  if (!ctx) return []
  const kind = typeof slot === 'string' ? slot : slot.kind
  if (kind === 'archetype') return archetypeFeatOptions(sheet, level, data)
  const grant = typeof slot === 'string' ? undefined : slot.grant
  if (kind === 'granted' && !grant) return []
  const lists = [ctx.ancestry?.name, ...heritageFeatLists(ctx.heritage)].filter(Boolean)
  const have = featNames(sheet)
  const own = uniqueNames(
    data.feats.filter((f) => {
      if (f.level > (grant?.maxLevel ?? level)) return false
      if (have.has(norm(f.name)) && !/more than once/i.test(f.text)) return false
      if (grant) return f.classes.includes(grant.className) && !isDedication(f)
      if (kind === 'class') return f.classes.includes(ctx.cls.name)
      if (kind === 'ancestry') return f.ancestries.some((a) => lists.includes(a))
      if (kind === 'skill') return f.skill
      return f.general
    }),
  )
  return kind === 'class' ? uniqueNames([...own, ...archetypeFeatOptions(sheet, level, data)]) : own
}

/**
 * Whether the hero meets a feat's prerequisites, clause by clause ("trained in Athletics",
 * "expert in Arcana, expert in Nature, or …", "Strength +2", a feat or class feature, a subclass
 * like "enigma muse"). `unmet` are the clauses the sheet shows the hero lacks; `unknown` the
 * ones it can't tell (left to the player and GM).
 */
export function featPrerequisites(
  f: Pick<Pf2eFeatDef, 'prerequisites'> & Partial<Pick<Pf2eFeatDef, 'name' | 'traits'>>,
  sheet: Pf2eSheet,
  data?: Pick<Pf2eBuildData, 'feats' | 'classes'>,
  pending: string[] = [],
) {
  const unmet: string[] = []
  const unknown: string[] = []
  // A dedication waits until the last one has two more feats (Player Core p. 215); `pending`
  // are the feats picked in the level's other slots.
  const lock =
    data && f.name && f.traits && isDedication({ name: f.name, traits: f.traits })
      ? dedicationLock(sheet, data, pending)
      : null
  if (lock) unmet.push(lockClause(lock))
  if (!f.prerequisites) return { unmet, unknown }
  const names = new Set<string>()
  for (const x of sheet.feats) {
    names.add(norm(x.name))
    names.add(norm(`${x.name} ${x.type}`))
  }
  // The class's subclass options by name and kind ("zoophonia muse", "leaf order"): one the
  // hero didn't pick is unmet.
  const cls = data?.classes.find((c) => c.slug === sheet.classSlug)
  const options = new Set(
    (cls?.subclasses ?? []).flatMap((o) => [
      norm(`${o.name} ${shortKind(cls!, o.kind)}`),
      norm(`${o.name} ${shortKind(cls!, o.kind).split(' ').at(-1)}`),
    ]),
  )
  const check = (alt: string): boolean | null => {
    const a = plain(alt)
      .replace(/^(?:a|an|the) /i, '')
      .trim()
    const prof = /^(trained|expert|master|legendary) in (.+)$/i.exec(a)
    if (prof) {
      const need = RANK_WORD[prof[1]!.toLowerCase()]!
      const what = prof[2]!.trim()
      const save = /^(Fortitude|Reflex|Will) saves?$/i.exec(what)
      const row =
        sheet.skills.find((s) => norm(s.name) === norm(what)) ??
        sheet.saves.find(
          (s) => norm(s.label) === norm(save ? save[1]! : what) && SAVE_STAT[s.label] !== undefined,
        )
      return row ? !rankAbove(need, row.rank) : null
    }
    const attr = /^(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) \+(\d)$/i.exec(a)
    if (attr) return sheet.attrs[ATTR_BY_NAME[attr[1]!.toLowerCase()]!] >= Number(attr[2])
    if (names.has(norm(a))) return true
    if (options.has(norm(a))) return false
    return data && knownNames(data).has(norm(a)) ? false : null
  }
  for (const clause of f.prerequisites.split(/;\s*/)) {
    const alts = clause.split(/,? or |, (?=(?:trained|expert|master|legendary) in )/i)
    const results = alts.map(check)
    if (results.some((r) => r === true)) continue
    if (results.every((r) => r === false)) unmet.push(clause)
    else unknown.push(clause)
  }
  return { unmet, unknown }
}

// --- The plan -------------------------------------------------------------------

export interface Pf2eSpellPick {
  key: string
  label: string
  count: number
  /** Highest spell rank to pick from; cantrips for `cantrip`. */
  rank: number
  /** Spontaneous casters learn a spell at this rank (it can be a lower-rank spell heightened). */
  learnAt?: number
  cantrip?: boolean
  /** List casters (cleric, druid) prepare from their whole list; adding spells is optional. */
  optional?: boolean
  /** For an archetype's spellcasting (Player Core p. 215), of its tradition. */
  archetype?: string
  tradition?: string
  /** Only spells of `rank` itself ("two common spells of that rank"). */
  exact?: boolean
  /** Only these spells, by name (a wizard school's curriculum), of any tradition. */
  only?: string[]
}

export interface Pf2eChoicePlan {
  key: string
  label: string
  /** The class feature (or archetype feat) that asks for it, shown above the options. */
  feature?: { name: string; text: string; from?: string }
  options: { id: string; name: string; text?: string }[]
  count: number
}

export interface Pf2eLevelPlan {
  level: number
  /** Class HP, the new CON, CON's rise times the earlier levels, Toughness-style feats. */
  hp: { cls: number; con: number; retro: number; feats: number; total: number }
  features: { name: string; text: string; from: string }[]
  proficiencies: { label: string; from: Pf2eRank; to: Pf2eRank }[]
  feats: Pf2eFeatSlotPlan[]
  skillIncreases: number
  /** Highest rank a skill increase reaches at this level (Player Core p. 29). */
  skillMax: Pf2eRank
  /** Skills to train from an Intelligence increase. */
  trained: number
  boosts: number
  /**
   * Spell slots by rank; `archetype` for a multiclass archetype's own (Player Core p. 215) or
   * the class's second track (an animist's apparition slots), `label` for the latter.
   */
  slots: { rank: number; from: number; to: number; archetype?: string; label?: string }[]
  font?: { from: number; to: number }
  spells: Pf2eSpellPick[]
  /** Spells the level adds by itself (a bloodline's sorcerous gift). */
  granted: Pf2eSpellRef[]
  focus: Pf2eSpellRef[]
  /** The focus pool's size before and after the level, when it grows. */
  focusPoints?: { from: number; to: number }
  choices: Pf2eChoicePlan[]
  notes: string[]
}

/**
 * The level's feat slots: the table's, the free archetype slot at even levels (GM Core p. 84),
 * and a slot for each feat a picked feat grants (Basic Maneuver's fighter feat).
 */
function planFeatSlots(
  cls: Pf2eClassDef,
  level: number,
  pending: Pf2eLevelInput,
  data: Pf2eBuildData,
  freeArchetype: boolean | undefined,
): Pf2eFeatSlotPlan[] {
  const slots = levelFeatSlots(cls, level)
  if (freeArchetypeSlot(level, freeArchetype))
    slots.push({
      key: 'archetype',
      kind: 'archetype',
      label: 'Free archetype feat',
      help: `A dedication or a feat of your archetypes, of level ${level} or lower (the free archetype variant, GM Core p. 84).`,
    })
  const classNames = data.classes.map((c) => c.name)
  const granted = slots.flatMap((slot): Pf2eFeatSlotPlan[] => {
    const f = data.feats.find((x) => x.id === pending.feats[slot.key])
    const grant = f ? grantedFeat(f, level, classNames) : null
    if (!grant) return []
    return [
      {
        key: `${slot.key}:grant`,
        kind: 'granted',
        label: `${grant.className} feat from ${grant.from}`,
        help: `A ${grant.className.toLowerCase()} feat of level ${grant.maxLevel} or lower. It counts as one feat with ${grant.from} for your dedication (Player Core p. 215).`,
        grant,
      },
    ]
  })
  return [...slots, ...granted]
}

const featType = (slot: Pf2eFeatSlotPlan) =>
  slot.grant
    ? `${slot.grant.className} feat`
    : `${slot.kind[0]!.toUpperCase()}${slot.kind.slice(1)} feat`

/**
 * The feat entries a level's picks add, each tagged with the archetype it's taken for and a
 * granted feat with the feat that granted it (Player Core p. 215).
 */
function levelFeatEntries(
  sheet: Pf2eSheet,
  cls: Pf2eClassDef,
  slots: Pf2eFeatSlotPlan[],
  picks: Pf2eLevelInput,
  level: number,
  data: Pf2eBuildData,
): Pf2eFeat[] {
  const held = new Set(heroArchetypes(sheet.feats).map((a) => a.name))
  const out: Pf2eFeat[] = []
  for (const slot of slots) {
    const f = data.feats.find((x) => x.id === picks.feats[slot.key])
    if (!f) continue
    const entry = featEntry(featType(slot), f, level)
    if (!slot.grant) {
      if (isDedication(f)) held.add(dedicationArchetype(f))
      out.push(tagArchetype(entry, f, held, cls.name))
      continue
    }
    const parent = out.find((e) => e.name === slot.grant!.from)
    out.push({
      ...entry,
      via: slot.grant.from,
      ...(parent?.archetype ? { archetype: parent.archetype } : {}),
    })
  }
  return out
}

/** Empty picks for a level. */
export const emptyLevelInput = (): Pf2eLevelInput => ({
  boosts: [],
  feats: {},
  skills: [],
  trained: [],
  spells: {},
  choices: {},
})

/** An attribute after a set of boosts: +1, or a partial boost at +4 and over (Player Core p. 19). */
export function boostAttrs(
  attrs: Record<Pf2eAttr, number>,
  partial: Pf2eAttr[],
  boosts: Pf2eAttr[],
) {
  const out = { ...attrs }
  const left = new Set(partial)
  for (const a of new Set(boosts)) {
    if (out[a] < 4) out[a]++
    else if (left.has(a)) {
      out[a]++
      left.delete(a)
    } else left.add(a)
  }
  return { attrs: out, partial: PF2E_ATTRS.filter((a) => left.has(a)) }
}

const TOUGHNESS = /Increase your maximum Hit Points by your level/i

/** Subclass kinds chosen during daily preparations, not on level-up (animist apparitions). */
const DAILY_KINDS = ['Animist Apparition']
const WORD_COUNT: Record<string, number> = { two: 2, three: 3, four: 4 }

/** The rule a feature or later subclass choice follows when the class data can't say it. */
const LATER_PICKS: Record<string, { kind: string; table: string }> = {
  // Runesmith: "Runic Repertoire" table, runes known by level.
  Runesmith: { kind: 'Runesmith Rune', table: 'Runic Repertoire' },
}

/** A count by level from a feature's markdown table ("| 5 | 6 | 3 |"). */
function tableCount(text: string, level: number) {
  const rows = [...text.matchAll(/^\|\s*(\d+)\s*\|\s*(\d+)\s*\|/gm)]
  return Number(rows.find((r) => Number(r[1]) === level)?.[2] ?? 0)
}

const findSpell = (data: Pf2eBuildData, name: string) =>
  data.spells.find((s) => norm(s.name) === norm(name.replace(/[_*]/g, '').trim()))
const ref = (s: Pf2eSpellDef, rank = s.rank): Pf2eSpellRef => ({ id: s.id, name: s.name, rank })

/** Each time the class learns spells on a level-up ("you add two arcane spells to your spellbook"). */
function bookSpells(cls: Pf2eClassDef) {
  const text = plain(cls.features.map((f) => f.text).join(' '))
  const m =
    /Each time you gain a level, (?:you add|your patron teaches your familiar) (\w+) (?:new |more )?(?:\w+ )?spells/i.exec(
      text,
    )
  if (!m) return 0
  return ({ one: 1, two: 2, three: 3 } as Record<string, number>)[m[1]!.toLowerCase()] ?? 0
}

/** The class's focus spells and class cantrips (`isClassSpell`). */
const classFocus = (cls: Pf2eClassDef, data: Pf2eBuildData) =>
  data.spells.filter((s) => isClassSpell(s, cls.name))

/**
 * Focus spells a feature or feat grants: italic spell names (_fortissimo composition_) in a
 * sentence where the hero gains or learns them, not ones it changes ("You can cast _touch of the
 * void_ using 2 actions").
 */
function grantedFocus(text: string, cls: Pf2eClassDef, data: Pf2eBuildData) {
  const names = new Set(
    text
      .replace(/\s+/g, ' ')
      .split(/(?<=\.)\s+/)
      .filter((s) => /\b(?:gain|learn)s?\b/i.test(s))
      .flatMap((s) => [...s.matchAll(/_([^_]+)_/g)].map((m) => norm(m[1]!.trim()))),
  )
  return uniqueNames(classFocus(cls, data).filter((s) => names.has(norm(s.name))))
}

/** Focus spells a subclass's later text lists ("**Deeper Psi Cantrip (Level 6)** Vector Screen"). */
function listedFocus(text: string, cls: Pf2eClassDef, data: Pf2eBuildData) {
  const lower = text.replace(/[_*]/g, ' ').replace(/\s+/g, ' ').toLowerCase()
  return uniqueNames(classFocus(cls, data).filter((s) => spellNamed(lower, s.name)))
}

/**
 * A feat that grants a subclass's next focus spell ("You gain an advanced bloodline spell"):
 * the spell the hero's subclass lists under that label ("- **Advanced** Aberrant Whispers",
 * "Advanced: Rune of Observation").
 */
function labelledFocusSpell(featText: string, ctx: Ctx, data: Pf2eBuildData) {
  const m = /\b(advanced|greater) [\w ]*?spell\b/i.exec(plain(featText))
  if (!m) return []
  const label = m[1]!.replace(/^\w/, (x) => x.toUpperCase())
  return ctx.picks.flatMap((o) => {
    const line = new RegExp(`(?:\\*\\*${label}\\*\\*|\\b${label}:)\\s*([^\\n]+)`).exec(o.text)
    const sp = line ? findSpell(data, line[1]!) : undefined
    return sp ? [sp] : []
  })
}

/**
 * What reaching `level` grants (Player Core p. 29 and the class's table): Hit Points (class HP
 * plus CON, and a CON increase raises every earlier level too), class features and the
 * subclass's later benefits with their text, the proficiency increases they bring, feat slots,
 * skill increases (expert from the start, master from 7th, legendary from 15th), attribute
 * boosts, spell slots and the spells to learn, and choices (a weapon group, a saving throw, a
 * later subclass option). `pending` are the picks so far: boosts change HP and Intelligence,
 * feats can grant focus spells, choices change ranks.
 */
export function pf2eLevelPlan(
  sheet: Pf2eSheet,
  level: number,
  data: Pf2eBuildData,
  pending: Pf2eLevelInput = emptyLevelInput(),
): Pf2eLevelPlan | null {
  const ctx = pf2eContext(sheet, data)
  if (!ctx || level < 2 || level > MAX_LEVEL) return null
  const { cls } = ctx
  const row = tableRow(cls, level)
  const boosts = row.some((f) => /^attribute boosts?/.test(f)) ? 4 : 0
  const boosted = boostAttrs(
    sheet.attrs,
    sheet.partialBoosts ?? [],
    pending.boosts.slice(0, boosts),
  )
  const con = boosted.attrs.CON
  const retro = (con - sheet.attrs.CON) * (level - 1)
  const featSlotsNow = planFeatSlots(
    cls,
    level,
    pending,
    data,
    pending.freeArchetype ?? ctx.creation.freeArchetype,
  )
  const pickedFeats = featSlotsNow
    .map((slot) => data.feats.find((f) => f.id === pending.feats[slot.key]))
    .filter((f): f is Pf2eFeatDef => !!f)
  const added = levelFeatEntries(sheet, cls, featSlotsNow, pending, level, data)
  const toughness =
    sheet.feats.filter((f) => TOUGHNESS.test(f.desc)).length +
    pickedFeats.filter((f) => TOUGHNESS.test(f.text)).length * level
  const hpCls = cls.hp

  const features = realFeatures(cls, level).map((f) => ({
    name: f.name,
    text: f.text,
    from: cls.name,
  }))
  for (const o of ctx.picks) {
    const parts = laterParts(o).filter((p) => p.level === level)
    if (parts.length)
      features.push({
        name: o.name,
        text: parts.map((p) => p.text).join(' '),
        from: shortKind(cls, o.kind).replace(/^\w/, (x) => x.toUpperCase()),
      })
  }

  // Choices the level's features ask for.
  const prior = sheet.levelChoices ?? {}
  const choices: Pf2eChoicePlan[] = []
  const handled = new Set<string>()
  const groups = [
    ...new Set(data.weapons.filter((w) => w.category !== 'Ammunition').map((w) => w.group)),
  ]
    .filter(Boolean)
    .sort()
  for (const f of realFeatures(cls, level)) {
    const t = plain(f.text)
    if (/\b(?:choose|select) one weapon group\b/i.test(t)) {
      handled.add(f.name)
      choices.push({
        key: `group:${f.name}`,
        label: 'Weapon group',
        feature: { name: f.name, text: f.text },
        options: groups.map((g) => ({ id: g, name: g })),
        count: 1,
      })
    }
    const save =
      /Choose (your Fortitude, Reflex, or Will saving throw|a different saving throw|one of the saving throws you selected)/i.exec(
        t,
      )
    if (save) {
      handled.add(f.name)
      const before = Object.entries(prior)
        .filter(([k]) => k.startsWith('save:'))
        .flatMap(([, v]) => v)
      const options = /different/i.test(save[1]!)
        ? SAVES.filter((x) => !before.includes(x))
        : /you selected/i.test(save[1]!)
          ? SAVES.filter((x) => before.includes(x))
          : [...SAVES]
      choices.push({
        key: `save:${f.name}`,
        label: 'Saving throw',
        feature: { name: f.name, text: f.text },
        options: options.map((x) => ({ id: x, name: x })),
        count: 1,
      })
    }
  }
  const known = new Set([
    ...Object.values(ctx.creation.subclasses).flat(),
    ...Object.entries(prior)
      .filter(([k]) => k.startsWith('subclass:'))
      .flatMap(([, v]) => v),
  ])
  const kinds = [...new Set(cls.subclasses.map((s) => s.kind))]
  const later = LATER_PICKS[cls.name]
  for (const kind of kinds) {
    if (DAILY_KINDS.includes(kind)) continue
    const short = shortKind(cls, kind)
    const word = escape(short.split(' ').at(-1) ?? short)
    const levelled = cls.subclasses.some((s) => s.kind === kind && (s.level ?? 1) > 1)
    // "You choose a second implement", "you add two new tactics to your folio".
    const asks = new RegExp(
      `\\b(?:choose|add) (?:a |an |one |(two|three|four) )?(?:second |third |new |more )?${word}s?\\b`,
      'i',
    )
    const named = levelled
      ? undefined
      : realFeatures(cls, level)
          .map((f) => ({ f, m: asks.exec(plain(f.text)) }))
          .find((x) => x.m && !/\beither\b/i.test(x.f.text))
    let options: Pf2eSubclassOption[] = []
    let count = 1
    let feature: Pf2eChoicePlan['feature']
    if (later?.kind === kind) {
      const table = cls.features.find((f) => f.name === later.table)?.text ?? ''
      count = tableCount(table, level) - tableCount(table, level - 1)
      if (count > 0)
        options = cls.subclasses.filter((s) => s.kind === kind && (s.level ?? 1) <= level)
    } else if (levelled) {
      options = cls.subclasses.filter((s) => s.kind === kind && s.level === level)
      const f = realFeatures(cls, level).find((x) => norm(x.name) === short)
      if (f && options.length) {
        handled.add(f.name)
        feature = { name: f.name, text: f.text }
      }
    } else if (named) {
      options = cls.subclasses.filter((s) => s.kind === kind)
      count = WORD_COUNT[named.m![1]?.toLowerCase() ?? ''] ?? 1
      handled.add(named.f.name)
      feature = { name: named.f.name, text: named.f.text }
    }
    options = options.filter((o) => !known.has(o.id))
    if (options.length && count > 0)
      choices.push({
        key: `subclass:${kind}@${level}`,
        label: short.replace(/^\w/, (x) => x.toUpperCase()),
        options: options.map((o) => ({ id: o.id, name: o.name, text: o.text })),
        count,
        ...(feature ? { feature } : {}),
      })
  }

  // Archetype feats: the skills they train or leave to the player (Player Core pp. 216–223).
  const trained = new Set(sheet.skills.filter((x) => x.rank !== 'U').map((x) => x.name))
  const archetypeNotes: string[] = []
  for (const e of added) {
    const def = e.archetype ? data.feats.find((f) => f.id === e.id) : undefined
    if (!def) continue
    for (const c of featSkillChoices(def, trained))
      choices.push({
        key: c.key,
        label: c.label,
        feature: { name: def.name, text: c.help, from: `${e.archetype} archetype` },
        options: c.options.map((o) => ({ id: o, name: o })),
        count: Math.min(c.count, c.options.length),
      })
    if (e.dedication) archetypeNotes.push(...dedicationNotes(def))
  }

  const choicesNow = { ...prior, ...pending.choices }
  const before = profileAt(sheet, level - 1, data, choicesNow)!
  const after = profileAt({ ...sheet, feats: [...sheet.feats, ...added] }, level, data, choicesNow)!
  const proficiencies: Pf2eLevelPlan['proficiencies'] = []
  const diff = (label: string, from: Pf2eRank, to: Pf2eRank) => {
    if (rankAbove(to, from)) proficiencies.push({ label, from, to })
  }
  for (const s of Object.keys(STAT_LABEL) as Stat[])
    if (s !== 'spell' || sheet.spellcasting) diff(STAT_LABEL[s], before.stats[s], after.stats[s])
  for (const a of ARMOR_CATS)
    diff(
      a === 'unarmored' ? 'Unarmored defense' : `${a[0]!.toUpperCase()}${a.slice(1)} armor`,
      before.armor[a],
      after.armor[a],
    )
  for (const [label, w] of CATEGORY_LABEL)
    diff(label, weaponRankIn(before, w), weaponRankIn(after, w))
  for (const s of sheet.strikes) {
    const w = strikeWeapon(s, data)
    if (!w || w.name === 'Fist') continue
    const cat = CATEGORY_LABEL.find(([, x]) => x.category === w.category)?.[1]
    const from = weaponRankIn(before, w)
    const to = weaponRankIn(after, w)
    if (rankAbove(to, from) && (!cat || to !== weaponRankIn(after, cat))) diff(w.name, from, to)
  }
  for (const c of choices.filter((x) => x.key.startsWith('group:')))
    for (const g of choicesNow[c.key] ?? []) {
      const w = { name: '', category: 'Martial', group: g }
      diff(`${g} group`, weaponRankIn(before, w), weaponRankIn(after, w))
    }
  for (const [skill, rank] of Object.entries(after.skills))
    diff(skill, before.skills[skill] ?? 'U', rank)

  const bonuses = featureSkillBonuses(cls, level)
  const skillIncreases =
    row.filter((f) => f.startsWith('skill increase')).length + bonuses.increases.length
  const intUp = boosted.attrs.INT > sheet.attrs.INT

  // Spells.
  const sc = sheet.spellcasting
  const prevRow = classSlotRow(cls, ctx.picks, level - 1)
  const nowRow = classSlotRow(cls, ctx.picks, level)
  const slots: Pf2eLevelPlan['slots'] = []
  const spells: Pf2eSpellPick[] = []
  const granted: Pf2eSpellRef[] = []
  let font: Pf2eLevelPlan['font']
  if (sc && prevRow && nowRow) {
    nowRow.slots.forEach((n, i) => {
      const was = prevRow.slots[i] ?? 0
      if (n !== was) slots.push({ rank: i + 1, from: was, to: n })
    })
    if (sc.font && fontSlots(level) !== fontSlots(level - 1))
      font = { from: fontSlots(level - 1), to: fontSlots(level) }
    const top = nowRow.slots.reduce((t, n, i) => (n > 0 ? i + 1 : t), 1)
    const newCantrips = nowRow.cantrips - prevRow.cantrips
    if (newCantrips > 0)
      spells.push({ key: 'cantrip', label: 'Cantrips', count: newCantrips, rank: 1, cantrip: true })
    const book = bookSpells(cls)
    const gifts = sc.kind === 'spontaneous' ? ctx.picks.map(listedSpellNames) : []
    const giftFirst = /first new spell is always/i.test(cls.features.map((f) => f.text).join(' '))
    for (const s of slots) {
      const gained = s.to - s.from
      if (gained <= 0) continue
      const isNew = s.from === 0
      let count = gained
      if (sc.kind === 'spontaneous' && isNew)
        for (const g of gifts) {
          const sp = g[s.rank] ? findSpell(data, g[s.rank]!) : undefined
          if (!sp) continue
          granted.push(ref(sp, s.rank))
          if (giftFirst) count--
        }
      if (sc.kind === 'spontaneous' && count > 0)
        spells.push({
          key: `rank${s.rank}`,
          label: `Rank ${s.rank} repertoire spell${count === 1 ? '' : 's'}`,
          count,
          rank: s.rank,
          learnAt: s.rank,
        })
      else if (sc.kind === 'prepared' && !book && count > 0)
        spells.push({
          key: `rank${s.rank}`,
          label: `Rank ${s.rank} spell${count === 1 ? '' : 's'} to prepare from`,
          count,
          rank: s.rank,
          optional: true,
        })
    }
    if (sc.kind === 'prepared' && book)
      spells.push({
        key: 'book',
        label: `${book} new spell${book === 1 ? '' : 's'} of rank ${top} or lower`,
        count: book,
        rank: top,
      })
    // A wizard's curriculum spell with each new rank (Player Core p. 197).
    const curriculum = curriculumRules(cls, ctx.picks)
    if (curriculum?.newRank)
      for (const s of slots) {
        const names = curriculum.list[s.rank] ?? []
        if (s.from || !s.to || !names.some((n) => findSpell(data, n))) continue
        spells.push({
          key: `curriculum${s.rank}`,
          label: `Rank ${s.rank} curriculum spell`,
          count: 1,
          rank: s.rank,
          exact: true,
          only: names,
        })
      }
    // A second track of slots (an animist's apparition spellcasting, War of Immortals p. 10).
    const track = EXTRA_TRACK[cls.name]
    if (track && prevRow.extra && nowRow.extra)
      nowRow.extra.slots.forEach((n, i) => {
        const was = prevRow.extra!.slots[i] ?? 0
        if (n !== was)
          slots.push({ rank: i + 1, from: was, to: n, archetype: track.key, label: track.label })
      })
  }

  // Archetype spellcasting: cantrips, slots by level, spells and rank (Player Core p. 215).
  const archetypeCasting = archetypeCastingPlan(
    sheet,
    level,
    data,
    choicesNow,
    added,
    boosted.attrs,
  )
  choices.push(...archetypeCasting.choices)
  slots.push(...archetypeCasting.slots)
  spells.push(...archetypeCasting.spells)
  proficiencies.push(...archetypeCasting.ranks)

  // Focus spells from the level's features, the subclass's later text and the feats picked.
  const have = new Set((sheet.focusSpells ?? []).map((f) => f.id))
  const focusDefs = [
    ...grantedFocus(
      realFeatures(cls, level)
        .map((f) => f.text)
        .join(' '),
      cls,
      data,
    ),
    ...listedFocus(
      features
        .filter((f) => f.from !== cls.name)
        .map((f) => f.text)
        .join(' '),
      cls,
      data,
    ),
    ...pickedFeats.flatMap((f) => [
      ...grantedFocus(f.text, cls, data),
      ...labelledFocusSpell(f.text, ctx, data),
    ]),
  ]
  const focus = uniqueNames(focusDefs)
    .filter((s) => !have.has(s.id))
    .map((s) => ref(s))
  // Focus Points (p. 298): one more for each new focus spell that costs one, and for each
  // feature or feat that says so ("Increase the number of Focus Points in your focus pool by
  // 1", a psychic's Clarity of Focus; an animist's third apparition), up to 3.
  const costs = focus.filter(
    (f) => !data.spells.find((s) => s.id === f.id)?.traits.includes('Cantrip'),
  )
  const raises = [...features.map((f) => f.text), ...pickedFeats.map((f) => f.text)].filter((t) =>
    FOCUS_UP.test(plain(t)),
  ).length
  const poolFrom = sheet.focus.max
  const poolTo = Math.max(poolFrom, Math.min(3, poolFrom + costs.length + raises))

  const notes: string[] = []
  for (const f of realFeatures(cls, level))
    if (/\b(?:choose|select)\b/i.test(plain(f.text)) && !handled.has(f.name))
      notes.push(`${f.name}: make its choice on the sheet.`)
  for (const b of bonuses.increases)
    if (b.note) notes.push(`${b.from}: its skill increase applies only to ${b.note}.`)
  if (intUp)
    notes.push('Intelligence went up: you also learn a new language (note it on the sheet).')
  notes.push(...archetypeNotes)

  return {
    level,
    hp: {
      cls: hpCls,
      con,
      retro,
      feats: toughness,
      total: hpCls + con + retro + toughness,
    },
    features,
    proficiencies,
    feats: featSlotsNow,
    skillIncreases,
    skillMax: skillCap(level),
    trained: intUp ? 1 : 0,
    boosts,
    slots,
    ...(font ? { font } : {}),
    spells,
    granted,
    focus,
    ...(poolTo !== poolFrom ? { focusPoints: { from: poolFrom, to: poolTo } } : {}),
    choices,
    notes,
  }
}

const FOCUS_UP =
  /\b(?:Increase the number of Focus Points in your focus pool by 1|The number of Focus Points in your focus pool increases by 1)\b/i

/** Skill ranks after a list of increases, each one step, as far as the level allows. */
function raiseSkills(
  ranks: Record<string, Pf2eRank>,
  increases: string[],
  max: Pf2eRank,
): { ranks: Record<string, Pf2eRank>; problems: string[] } {
  const out = { ...ranks }
  const problems: string[] = []
  for (const s of increases) {
    const now = out[s] ?? 'U'
    const next = rankUp(now)
    if (now === 'L' || rankAbove(next, max)) {
      problems.push(
        now === 'L'
          ? `${s} is already legendary`
          : `${s} can't go past ${RANK_NAME[max].toLowerCase()} at this level`,
      )
      continue
    }
    out[s] = next
  }
  return { ranks: out, problems }
}

/** Highest skill rank a skill increase can reach at a level (Player Core p. 29). */
export const skillCap = (level: number): Pf2eRank => (level >= 15 ? 'L' : level >= 7 ? 'M' : 'E')

/** "a" or "an" before a word (Player Core's feat names start with either). */
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a')

/** One thing a level-up still needs, with the dialog section that asks for it. */
export interface Pf2eLevelProblem {
  /** `boosts`, `choice:<key>`, `feat:<key>`, `skills` or `spells:<key>`. */
  section: string
  text: string
}

/**
 * What the picks still need, in the order the dialog shows them. With `data`, picks that no
 * longer fit are problems too (Reconfigure replays a level's recorded picks onto a sheet that
 * changed): a feat its slot doesn't offer or whose prerequisites the hero now lacks (read
 * against `projected`, the sheet after this level's boosts and skills), a spell its pick
 * doesn't offer.
 */
export function pf2eLevelProblems(
  plan: Pf2eLevelPlan,
  picks: Pf2eLevelInput,
  sheet: Pf2eSheet,
  data?: Pf2eBuildData,
  projected: Pf2eSheet = sheet,
): Pf2eLevelProblem[] {
  const out: Pf2eLevelProblem[] = []
  const add = (section: string, text: string) => out.push({ section, text })
  if (plan.boosts) {
    if (picks.boosts.length !== plan.boosts) add('boosts', `Choose ${plan.boosts} attribute boosts`)
    else if (new Set(picks.boosts).size !== picks.boosts.length)
      add('boosts', 'Each attribute boost must go to a different attribute')
  }
  for (const c of plan.choices) {
    if ((picks.choices[c.key] ?? []).length === c.count) continue
    const what = c.label.toLowerCase()
    add(
      `choice:${c.key}`,
      c.count === 1 ? `Choose ${article(what)} ${what}` : `Choose ${c.count}: ${what}`,
    )
  }
  for (const slot of plan.feats) {
    const id = picks.feats[slot.key]
    const what = slot.label.toLowerCase()
    if (!id) {
      add(`feat:${slot.key}`, `Choose ${article(what)} ${what}`)
      continue
    }
    const stale = data && staleFeat(slot, id, picks, sheet, projected, plan.level, data)
    if (stale) add(`feat:${slot.key}`, stale)
  }
  const ranks = Object.fromEntries(sheet.skills.map((s) => [s.name, s.rank]))
  const increases = picks.skills.filter(Boolean)
  if (increases.length !== plan.skillIncreases)
    add(
      'skills',
      plan.skillIncreases === 1
        ? 'Choose the skill increase'
        : `Choose ${plan.skillIncreases} skill increases`,
    )
  const raised = raiseSkills(ranks, increases, plan.skillMax)
  for (const p of raised.problems) add('skills', p)
  const trained = picks.trained ?? []
  if (trained.length !== plan.trained)
    add('skills', 'Choose a skill to train (your Intelligence went up)')
  for (const s of trained)
    if ((raised.ranks[s] ?? 'U') !== 'U') add('skills', `${s} is already trained`)
  for (const sp of plan.spells) {
    const ids = picks.spells[sp.key] ?? []
    const n = ids.length
    if (sp.optional ? n > sp.count : n !== sp.count)
      add(
        `spells:${sp.key}`,
        `${sp.optional ? 'Up to' : 'Choose'} ${sp.count}: ${sp.label.toLowerCase()}`,
      )
    if (!data) continue
    const offered = new Set(levelSpellOptions(sp, sheet, data).map((s) => s.id))
    for (const id of ids.filter((x) => !offered.has(x)))
      add(
        `spells:${sp.key}`,
        `${data.spells.find((s) => s.id === id)?.name ?? 'A spell'} isn't an option for ${sp.label.toLowerCase()} any more: pick again`,
      )
  }
  return out
}

/** Why a picked feat no longer fits its slot, or null when it does. */
function staleFeat(
  slot: Pf2eFeatSlotPlan,
  id: string,
  picks: Pf2eLevelInput,
  sheet: Pf2eSheet,
  projected: Pf2eSheet,
  level: number,
  data: Pf2eBuildData,
) {
  const f = data.feats.find((x) => x.id === id)
  const name = f?.name ?? 'That feat'
  const what = slot.label.toLowerCase()
  if (!f || !levelFeatOptions(slot, sheet, level, data).some((x) => x.id === id))
    return `${name} isn't an option for the ${what} any more: pick again`
  const others = Object.entries(picks.feats)
    .filter(([k]) => k !== slot.key)
    .map(([, v]) => v)
  const { unmet } = featPrerequisites(f, projected, data, others)
  return unmet.length ? `${name} needs ${unmet.join('; ')}: pick again` : null
}

/**
 * Spells a pick can take: the tradition's common-or-better spells up to its rank, not known.
 * An archetype's pick uses its own tradition and list (Player Core p. 215).
 */
export function levelSpellOptions(pick: Pf2eSpellPick, sheet: Pf2eSheet, data: Pf2eBuildData) {
  const sc = pick.archetype
    ? sheet.archetypeCasting?.find((e) => e.archetype === pick.archetype)
    : sheet.spellcasting
  const tradition = pick.tradition ?? sc?.tradition
  if (!tradition) return []
  const known = new Set(
    [...(sc?.spells ?? []), ...(sc?.cantrips ?? [])]
      .filter((s) => pick.learnAt === undefined || s.rank === pick.learnAt)
      .map((s) => s.id),
  )
  const only = pick.only && new Set(pick.only.map(norm))
  return uniqueNames(
    data.spells.filter(
      (s) =>
        (only ? only.has(norm(s.name)) : s.traditions.includes(tradition)) &&
        (pick.cantrip
          ? s.kind === 'cantrip'
          : s.kind === 'spell' && (pick.exact ? s.rank === pick.rank : s.rank <= pick.rank)) &&
        !known.has(s.id),
    ),
  )
}

// --- Applying a level -----------------------------------------------------------

/** "1d8+4" with its modifier moved by `by`. */
function shiftDamage(dmg: string, by: number) {
  if (!by) return dmg
  const m = /^(.*?)([+-]\d+)?$/.exec(dmg.trim())!
  const total = Number(m[2] ?? 0) + by
  return total ? `${m[1]}${total > 0 ? '+' : ''}${total}` : m[1]!
}

/**
 * Applies reaching `level` to the sheet in place (Player Core p. 29), recording the sheet first
 * so the level can be undone or replayed. Writes the boosts, skill increases, features, feats,
 * spells and choices, then moves every number by what changed: the level's +1 to trained
 * proficiencies, rank increases, attribute changes (CON raises HP for every level), keeping
 * anything added by hand (item bonuses, runes). Play state stays. The caller saves the level.
 */
export function applyPf2eLevel(
  sheet: Pf2eSheet,
  level: number,
  picks: Pf2eLevelInput,
  data: Pf2eBuildData,
): void {
  const ctx = pf2eContext(sheet, data)
  if (!ctx) throw new Error(`Not a PF2e sheet made from class data (“${sheet.classSlug}”)`)
  const plan = pf2eLevelPlan(sheet, level, data, picks)
  if (!plan) return
  recordLevel(sheet, level, undefined, picks)
  if (picks.freeArchetype !== undefined && sheet.creation)
    sheet.creation.freeArchetype = picks.freeArchetype
  const prev = level - 1
  const choices = Object.fromEntries(
    plan.choices
      .map((c) => [c.key, picks.choices[c.key] ?? []] as const)
      .filter(([, v]) => v.length),
  )
  const was = profileAt(sheet, prev, data)!
  sheet.levelChoices = { ...sheet.levelChoices, ...choices }

  const oldMods = { ...sheet.attrs }
  const boosted = boostAttrs(
    sheet.attrs,
    sheet.partialBoosts ?? [],
    picks.boosts.slice(0, plan.boosts),
  )
  sheet.attrs = boosted.attrs
  if (boosted.partial.length || sheet.partialBoosts) sheet.partialBoosts = boosted.partial
  const mods = sheet.attrs
  const d = (a: Pf2eAttr) => mods[a] - oldMods[a]

  // Feats and features (their entries drive the effects engine: Weapon Specialization…).
  const entries = [
    ...realFeatures(ctx.cls, level).map((f) =>
      featEntry(
        'Class feature',
        { ...f, ...featureAction(f, data), source: ctx.cls.source, rarity: 'common', traits: [] },
        level,
      ),
    ),
    ...plan.choices
      .filter((c) => c.key.startsWith('subclass:'))
      .flatMap((c) =>
        (picks.choices[c.key] ?? []).flatMap((id) => {
          const o = ctx.cls.subclasses.find((s) => s.id === id)
          return o ? [featEntry(c.label, o, level)] : []
        }),
      ),
  ]
  const added = levelFeatEntries(sheet, ctx.cls, plan.feats, picks, level, data)
  sheet.feats = [...sheet.feats, ...entries, ...added]

  const now = profileAt(sheet, level, data)!
  const lift = (stored: Pf2eRank, from: Pf2eRank, to: Pf2eRank) =>
    rankAbove(to, from) ? higher(stored, to) : stored
  const profGain = (old: Pf2eRank, rank: Pf2eRank) =>
    proficiency(rank, level) - proficiency(old, prev)

  // Saves, Perception, class DC.
  const statOf: Record<string, [Stat, Pf2eAttr]> = {
    Fortitude: ['fortitude', 'CON'],
    Reflex: ['reflex', 'DEX'],
    Will: ['will', 'WIS'],
    Perception: ['perception', 'WIS'],
    'Class DC': ['classDc', sheet.keyAttr],
  }
  let perceptionGain = 0
  for (const row of sheet.saves) {
    const [stat, attr] = statOf[row.label] ?? []
    if (!stat || !attr) continue
    const rank = lift(row.rank, was.stats[stat], now.stats[stat])
    const gain = profGain(row.rank, rank) + d(attr)
    row.rank = rank
    row.value += gain
    if (row.label === 'Perception') perceptionGain = gain
  }
  sheet.initMod += perceptionGain
  sheet.passivePerception += perceptionGain

  // AC: the rank for the armor the hero was built with, less its Dex cap.
  const armor = data.armor.find((a) => a.id === ctx.creation.armor)
  const cat = (armor?.category.toLowerCase() ?? 'unarmored') as ArmorCat
  const acRank = lift(sheet.acRank, was.armor[cat], now.armor[cat])
  const capped = (m: Record<Pf2eAttr, number>) =>
    armor?.dexCap === undefined ? m.DEX : Math.min(m.DEX, armor.dexCap)
  sheet.ac += profGain(sheet.acRank, acRank) + capped(mods) - capped(oldMods)
  sheet.acRank = acRank

  // Armor penalties change when Strength reaches the armor's Strength value (p. 271).
  const shield = data.shields.find((s) => s.id === ctx.creation.shield)
  const penaltyBefore = armorPenalties(oldMods, armor, shield)
  const penaltyNow = armorPenalties(mods, armor, shield)
  const speedGain = penaltyNow.speed - penaltyBefore.speed
  if (speedGain)
    sheet.speed = sheet.speed.replace(/^(\d+)(?= ft)/, (n) =>
      String(Math.max(5, Number(n) + speedGain)),
    )

  // Skills: increases, an Intelligence increase's training, features' ranks.
  const raised = raiseSkills(
    Object.fromEntries(sheet.skills.map((s) => [s.name, s.rank])),
    picks.skills.filter(Boolean).slice(0, plan.skillIncreases),
    plan.skillMax,
  ).ranks
  for (const s of (picks.trained ?? []).slice(0, plan.trained))
    if ((raised[s] ?? 'U') === 'U') raised[s] = 'T'
  for (const [s, r] of Object.entries(now.skills))
    if (rankAbove(r, was.skills[s] ?? 'U')) raised[s] = higher(raised[s] ?? 'U', r)
  for (const name of Object.keys(raised))
    if (!sheet.skills.some((s) => s.name === name) && raised[name] !== 'U') {
      const attr = SKILL_ATTR.get(name) ?? 'INT'
      sheet.skills.push({ name, attr, rank: 'U', value: oldMods[attr] })
    }
  for (const row of sheet.skills) {
    const rank = raised[row.name] ?? row.rank
    const check =
      row.attr === 'STR' || row.attr === 'DEX' ? penaltyNow.check - penaltyBefore.check : 0
    row.value += profGain(row.rank, rank) + d(row.attr) + check
    row.rank = rank
  }

  // Strikes: rank, attack and damage.
  for (const s of sheet.strikes) {
    const w = strikeWeapon(s, data)
    const traits = s.traits.split(/,\s*/).filter(Boolean)
    const ranged = !!s.ranged
    const rank = s.rank ?? 'U'
    const next = w ? lift(rank, weaponRankIn(was, w), weaponRankIn(now, w)) : rank
    const a = strikeAttributes(traits, ranged, oldMods)
    const b = strikeAttributes(traits, ranged, mods)
    s.bonus += profGain(rank, next) + b.attack - a.attack
    s.attr = b.attr
    s.dmg = shiftDamage(s.dmg, b.damage - a.damage)
    if (s.rank !== undefined || next !== 'U') s.rank = next
  }
  sheet.bulkLimit += d('STR')

  // Hit Points (p. 29): class HP + CON, every earlier level's CON too, Toughness. A dying
  // hero doesn't heal by levelling: at 0 HP the gain goes to max HP only.
  sheet.hpMax += plan.hp.total
  if (sheet.hp > 0) sheet.hp += plan.hp.total

  // Spellcasting.
  const sc = sheet.spellcasting
  if (sc) {
    sc.rank = lift(sc.rank, was.stats.spell, now.stats.spell)
    for (const s of plan.slots)
      if (!s.archetype) setSlotMax(sc, s.rank, (sc.slots[s.rank - 1]?.max ?? 0) + s.to - s.from)
    if (sc.font && plan.font) sc.font.max += plan.font.to - plan.font.from
    for (const g of plan.granted)
      if (!sc.spells.some((x) => x.id === g.id && x.rank === g.rank)) sc.spells.push({ ...g })
    for (const p of plan.spells.filter((x) => !x.archetype))
      for (const id of (picks.spells[p.key] ?? []).slice(0, p.count)) {
        const def = data.spells.find((s) => s.id === id)
        if (!def) continue
        const entry = ref(def, p.learnAt ?? def.rank)
        if (p.cantrip) sc.cantrips.push(entry)
        else sc.spells.push(entry)
      }
  }

  applyArchetypeCasting(sheet, plan, picks, data, added)
  // The class's second track (apparition spells) casts with the class's rank.
  const track = EXTRA_TRACK[ctx.cls.name]
  const second = track && sheet.archetypeCasting?.find((e) => e.archetype === track.key)
  if (second && sc) second.rank = sc.rank

  // Focus spells and the pool (p. 298).
  if (plan.focus.length) sheet.focusSpells = [...(sheet.focusSpells ?? []), ...plan.focus]
  if (plan.focusPoints) {
    sheet.focus.current += plan.focusPoints.to - sheet.focus.max
    sheet.focus.max = plan.focusPoints.to
  }

  sheet.level = level
}
