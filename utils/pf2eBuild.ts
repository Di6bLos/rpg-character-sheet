// Pathfinder 2e character creation (Player Core pp. 22–27) from the generated rules data in
// `data/pf2e/`: what a level 1 hero has to choose, what is still missing, and the sheet the
// choices make. Level-ups come later (`_features.md` Phase 8.3).
import type { Pf2eData } from '~/data/pf2e'
import type {
  Pf2eActionCost,
  Pf2eAncestryDef,
  Pf2eArmorDef,
  Pf2eBackgroundDef,
  Pf2eClassDef,
  Pf2eDeityDef,
  Pf2eFeatDef,
  Pf2eRecord,
  Pf2eSpellDef,
  Pf2eSubclassOption,
  Pf2eWeaponDef,
} from '~/data/pf2e/types'
import type {
  Pf2eAttr,
  Pf2eCreation,
  Pf2eFeat,
  Pf2eRank,
  Pf2eSheet,
  Pf2eStrike,
} from '~/types/sheets'
import { proficiency } from '~/utils/pf2ePlay'
import { focusPoolMax, fontSlots, slotsFor } from '~/utils/pf2eSpells'
import { PF2E_SKILLS, defaultSheet } from '~/utils/sheetDefaults'

/** The data sets the builder reads. */
export type Pf2eBuildData = Pick<
  Pf2eData,
  | 'classes'
  | 'ancestries'
  | 'heritages'
  | 'backgrounds'
  | 'feats'
  | 'deities'
  | 'weapons'
  | 'armor'
  | 'shields'
  | 'spells'
>

export const PF2E_ATTRS: Pf2eAttr[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
const ATTR_BY_NAME: Record<string, Pf2eAttr> = {
  Strength: 'STR',
  Dexterity: 'DEX',
  Constitution: 'CON',
  Intelligence: 'INT',
  Wisdom: 'WIS',
  Charisma: 'CHA',
}
const SKILL_ATTR = new Map(PF2E_SKILLS.filter(([n]) => n !== 'Lore'))
export const PF2E_SKILL_NAMES = [...SKILL_ATTR.keys()]
const isSkill = (s: string) => SKILL_ATTR.has(s) || s.endsWith(' Lore')

/** Starting wealth: 15 gp (Player Core p. 25), in copper. */
export const STARTING_CP = 1500
/** Highest attribute modifier at 1st level (Player Core p. 19). */
const MAX_MOD = 4
const RANK_ORDER: Pf2eRank[] = ['U', 'T', 'E', 'M', 'L']
const RANK_WORD: Record<string, Pf2eRank> = {
  Untrained: 'U',
  Trained: 'T',
  Expert: 'E',
  Master: 'M',
  Legendary: 'L',
}

export { proficiency }

export const ACTION_GLYPH: Record<string, string> = {
  1: '◆',
  2: '◆◆',
  3: '◆◆◆',
  reaction: '↺',
  free: '◇',
}
export const actionGlyph = (a?: Pf2eActionCost) =>
  a === undefined ? '' : (ACTION_GLYPH[String(a)] ?? String(a))

const byId = <T extends { id: string }>(list: T[], id?: string) =>
  id ? list.find((x) => x.id === id) : undefined
const present = <T>(x: T | undefined): x is T => x !== undefined
/** Bulk as the sheet writes it: L for light items. */
const bulkLabel = (b: number) => (b > 0 && b < 1 ? 'L' : String(b))
const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'")
const higher = (a: Pf2eRank, b: Pf2eRank) =>
  RANK_ORDER.indexOf(a) >= RANK_ORDER.indexOf(b) ? a : b

export function emptyCreation(): Pf2eCreation {
  return {
    ancestry: '',
    heritage: '',
    background: '',
    class: '',
    freeAncestryBoosts: false,
    ancestryBoosts: [],
    backgroundBoosts: [],
    keyAttribute: 'STR',
    freeBoosts: [],
    subclasses: {},
    skills: [],
    feats: {},
    weapons: [],
  }
}

/** What the choices point at, looked up once. */
export function resolve(c: Pf2eCreation, data: Pf2eBuildData) {
  return {
    ancestry: byId(data.ancestries, c.ancestry),
    heritage: byId(data.heritages, c.heritage),
    background: byId(data.backgrounds, c.background),
    cls: byId(data.classes, c.class),
    deity: byId(data.deities, c.deity),
  }
}

// --- Attribute boosts ---------------------------------------------------------

const WORD_COUNT: Record<string, number> = { one: 1, two: 2, three: 3 }

/** An ancestry's boosts and flaws (Player Core p. 23), or two free boosts instead. */
export function ancestryBoostPlan(a: Pf2eAncestryDef, freeInstead: boolean) {
  if (freeInstead) return { fixed: [] as Pf2eAttr[], free: 2, flaws: [] as Pf2eAttr[] }
  const toAttr = (n: string) => ATTR_BY_NAME[n]
  // Human and Orc list "Two free ability boosts" rather than two "Free" entries.
  const free = (b: string) =>
    b === 'Free' ? 1 : (WORD_COUNT[/^(\w+) free/i.exec(b)?.[1]?.toLowerCase() ?? ''] ?? 0)
  return {
    fixed: a.boosts.map(toAttr).filter((x): x is Pf2eAttr => !!x),
    free: a.boosts.reduce((n, b) => n + free(b), 0),
    flaws: a.flaws.map(toAttr).filter((x): x is Pf2eAttr => !!x),
  }
}

/** The background's two listed attributes; its first boost goes to one of them. */
export const backgroundBoostOptions = (b: Pf2eBackgroundDef) =>
  b.boosts.map((n) => ATTR_BY_NAME[n]).filter((x): x is Pf2eAttr => !!x)

/** Attribute modifiers from every boost and flaw chosen so far. */
export function attributeMods(c: Pf2eCreation, data: Pf2eBuildData) {
  const { ancestry, background, cls } = resolve(c, data)
  const mods = Object.fromEntries(PF2E_ATTRS.map((a) => [a, 0])) as Record<Pf2eAttr, number>
  if (ancestry) {
    const plan = ancestryBoostPlan(ancestry, c.freeAncestryBoosts)
    for (const a of [...plan.fixed, ...c.ancestryBoosts]) mods[a]++
    for (const a of plan.flaws) mods[a]--
  }
  if (background) for (const a of c.backgroundBoosts) mods[a]++
  if (cls) mods[c.keyAttribute]++
  for (const a of c.freeBoosts) mods[a]++
  return mods
}

/** Problems with the boosts: each set to different attributes, nothing over +4. */
export function boostProblems(c: Pf2eCreation, data: Pf2eBuildData) {
  const { ancestry, background, cls } = resolve(c, data)
  const out: string[] = []
  const distinct = (xs: Pf2eAttr[]) => new Set(xs).size === xs.length
  if (ancestry) {
    const plan = ancestryBoostPlan(ancestry, c.freeAncestryBoosts)
    if (c.ancestryBoosts.length !== plan.free)
      out.push(`Choose ${plan.free} free ancestry boost${plan.free === 1 ? '' : 's'}`)
    else if (!distinct([...plan.fixed, ...c.ancestryBoosts]))
      out.push('Each ancestry boost must go to a different attribute')
  }
  if (background) {
    const [first, second] = c.backgroundBoosts
    if (!first || !second) out.push('Choose both background boosts')
    else if (!backgroundBoostOptions(background).includes(first))
      out.push(`The first background boost goes to ${background.boosts.join(' or ')}`)
    else if (first === second) out.push('The two background boosts must differ')
  }
  if (cls && !cls.keyAttributes.includes(c.keyAttribute))
    out.push(`Choose your key attribute: ${cls.keyAttributes.join(' or ')}`)
  if (c.freeBoosts.length !== 4) out.push('Choose four free attribute boosts')
  else if (!distinct(c.freeBoosts)) out.push('Each free boost must go to a different attribute')
  const mods = attributeMods(c, data)
  for (const a of PF2E_ATTRS)
    if (mods[a] > MAX_MOD) out.push(`${a} can't be higher than +${MAX_MOD} at 1st level`)
  return out
}

// --- Subclasses, deity and feats ----------------------------------------------

export interface Pf2eSubclassChoice {
  key: string
  label: string
  options: Pf2eSubclassOption[]
  count: { min: number; max: number }
  note?: string
}

/**
 * Level 1 choices whose name differs from the class's subclass kinds, or that pick more
 * than one option. Counts from the class text.
 */
const SUBCLASS_RULES: Record<
  string,
  {
    skip?: string[]
    choices?: (Omit<Pf2eSubclassChoice, 'options'> & { kinds: string[]; maxLevel?: number })[]
  }
> = {
  // Apparitions are chosen during daily preparations, not at creation (War of Immortals).
  Animist: { skip: ['Animist Apparition'] },
  Commander: {
    skip: ['Commander Tactic'],
    choices: [
      {
        key: 'Commander Tactic',
        label: 'Tactics',
        kinds: ['Commander Tactic'],
        count: { min: 5, max: 5 },
        note: 'Your folio starts with five tactics; at 1st level choose mobility or offensive tactics.',
      },
    ],
  },
  Exemplar: {
    skip: [
      'Exemplar Body Ikon',
      'Exemplar Worn Ikon',
      'Exemplar Weapon Ikon',
      'Exemplar Root Epithet',
      'Exemplar Dominion Epithet',
      'Exemplar Sovereignty Epithet',
    ],
    choices: [
      {
        key: 'Exemplar Ikons',
        label: 'Ikons',
        kinds: ['Exemplar Body Ikon', 'Exemplar Worn Ikon', 'Exemplar Weapon Ikon'],
        count: { min: 3, max: 3 },
      },
    ],
  },
  Kineticist: {
    skip: ['Kineticist Element'],
    choices: [
      {
        key: 'Kineticist Element',
        label: 'Kinetic gate',
        kinds: ['Kineticist Element'],
        count: { min: 1, max: 2 },
        note: 'One element for a single gate, two for a dual gate.',
      },
    ],
  },
  Runesmith: {
    skip: ['Runesmith Rune'],
    choices: [
      {
        key: 'Runesmith Rune',
        label: 'Runic repertoire',
        kinds: ['Runesmith Rune'],
        count: { min: 4, max: 4 },
        maxLevel: 1,
      },
    ],
  },
}

/** A subclass kind without its class's name: "Rogue Racket" → "racket". */
const shortKind = (cls: Pf2eClassDef, kind: string) =>
  norm(kind.startsWith(`${cls.name} `) ? kind.slice(cls.name.length + 1) : kind)

/** The subclass choices a class makes at 1st level (a muse, a racket, five tactics…). */
export function subclassChoices(cls: Pf2eClassDef): Pf2eSubclassChoice[] {
  const rules = SUBCLASS_RULES[cls.name] ?? {}
  const l1 = norm(cls.advancement[0]?.features.join(', ') ?? '')
  const kinds = [...new Set(cls.subclasses.map((s) => s.kind))].filter(
    (k) => !rules.skip?.includes(k),
  )
  const found = kinds
    .filter((k) => {
      const short = shortKind(cls, k)
      return l1.includes(short) || l1.includes(short.split(' ')[0]!)
    })
    .map((k) => ({
      key: k,
      label: shortKind(cls, k).replace(/^\w/, (x) => x.toUpperCase()),
      options: cls.subclasses.filter((s) => s.kind === k),
      count: { min: 1, max: 1 },
    }))
  const extra = (rules.choices ?? []).map(({ kinds: ks, maxLevel, ...rest }) => ({
    ...rest,
    options: cls.subclasses.filter(
      (s) => ks.includes(s.kind) && (maxLevel === undefined || (s.level ?? 1) <= maxLevel),
    ),
  }))
  return [...found, ...extra]
}

/** Clerics and champions choose a deity at 1st level. */
export const needsDeity = (cls: Pf2eClassDef) =>
  /\bdeity\b/i.test(cls.advancement[0]?.features.join(', ') ?? '')

/** Deities a cleric or champion can follow: those that grant a divine font. */
export const deityOptions = (data: Pf2eBuildData) =>
  data.deities.filter((d) => d.divineFont.length > 0)

export type Pf2eFeatSlot = 'ancestry' | 'class' | 'skill'

/** Feats chosen at 1st level: always an ancestry feat, plus what the class table lists. */
export function featSlots(cls?: Pf2eClassDef): Pf2eFeatSlot[] {
  const l1 = norm(cls?.advancement[0]?.features.join(', ') ?? '')
  const slots: Pf2eFeatSlot[] = ['ancestry']
  if (cls && l1.includes(`${norm(cls.name)} feat`)) slots.push('class')
  if (l1.includes('skill feat')) slots.push('skill')
  return slots
}

/** 1st-level feats for a slot; prerequisites are shown, not checked. */
export function featOptions(slot: Pf2eFeatSlot, c: Pf2eCreation, data: Pf2eBuildData) {
  const { ancestry, heritage, cls } = resolve(c, data)
  const lists = [ancestry?.name, heritage?.versatile ? heritage.name : undefined].filter(Boolean)
  return data.feats.filter((f) => {
    if (f.level !== 1) return false
    if (slot === 'ancestry') return f.ancestries.some((a) => lists.includes(a))
    if (slot === 'class') return !!cls && f.classes.includes(cls.name)
    return f.skill
  })
}

// --- Skills -------------------------------------------------------------------

export interface Pf2eSkillPlan {
  /** Skills the build makes trained without a choice (background, class, subclass, deity). */
  fixed: string[]
  /** "Either Nature or Occultism", "your choice of Acrobatics or Athletics". */
  groups: { options: string[]; count: number }[]
  /** Skills of the player's choice; one more for each fixed skill that was already trained. */
  free: number
}

const splitSkills = (s: string) =>
  s
    .replace(/\.$/, '')
    .split(/,? and |, | or /)
    .map((x) => x.trim())
    .filter(isSkill)

/** Trained skills at 1st level (Player Core p. 24, Step 7), from the class's printed lines. */
export function skillPlan(c: Pf2eCreation, data: Pf2eBuildData): Pf2eSkillPlan {
  const { background, cls, deity } = resolve(c, data)
  const int = attributeMods(c, data).INT
  const fixed: string[] = [...(background?.skills ?? [])]
  const groups: Pf2eSkillPlan['groups'] = []
  let free = 0
  const add = (s: string) => {
    if (fixed.includes(s)) free++
    else fixed.push(s)
  }
  for (const line of cls?.skills ?? []) {
    const body = line.replace(/^Trained in /, '')
    const extra = /skills equal to (\d+) plus your Intelligence modifier/.exec(body)
    if (extra) free += Math.max(0, Number(extra[1]) + int)
    else if (/determined by/.test(body)) continue
    else if (body.startsWith('your choice of '))
      groups.push({ options: splitSkills(body.slice(15)), count: 1 })
    else if (/ and either /.test(body)) {
      const [must = '', rest = ''] = body.split(/ and either /)
      splitSkills(must).forEach(add)
      groups.push({ options: splitSkills(rest), count: 1 })
    } else splitSkills(body).forEach(add)
  }
  if (cls && deity && needsDeity(cls)) for (const s of deity.skill.slice(0, 1)) add(s)
  for (const ids of Object.values(c.subclasses))
    for (const o of cls?.subclasses.filter((s) => ids.includes(s.id)) ?? []) o.skills.forEach(add)
  // A choice whose options are all trained already becomes a free skill.
  const open = groups.filter((g) => {
    if (g.options.some((o) => !fixed.includes(o))) return true
    free += g.count
    return false
  })
  return { fixed, groups: open, free }
}

/** Problems with the skill picks: each group and the free count filled, nothing doubled. */
export function skillProblems(c: Pf2eCreation, data: Pf2eBuildData) {
  const plan = skillPlan(c, data)
  const picks = c.skills.filter((s) => !plan.fixed.includes(s))
  const out: string[] = []
  let left = [...picks]
  for (const g of plan.groups) {
    const hit = left.filter((s) => g.options.includes(s)).slice(0, g.count)
    if (hit.length < g.count) out.push(`Choose ${g.options.join(' or ')}`)
    left = left.filter((s) => !hit.includes(s))
  }
  if (left.length !== plan.free)
    out.push(
      left.length < plan.free
        ? `Choose ${plan.free - left.length} more trained skill${plan.free - left.length === 1 ? '' : 's'}`
        : `Only ${plan.free} free skill${plan.free === 1 ? '' : 's'}: remove ${left.length - plan.free}`,
    )
  return out
}

/** Every skill the hero ends up trained in. */
export const trainedSkills = (c: Pf2eCreation, data: Pf2eBuildData) => [
  ...new Set([...skillPlan(c, data).fixed, ...c.skills]),
]

// --- Spellcasting --------------------------------------------------------------

/** The subclass options the hero picked. */
const subclassPicks = (c: Pf2eCreation, cls: Pf2eClassDef) =>
  cls.subclasses.filter((s) => Object.values(c.subclasses).some((ids) => ids.includes(s.id)))

/**
 * A caster's 1st-level spellcasting (Player Core pp. 297–298, each class entry): the
 * tradition (a sorcerer's bloodline, witch's patron or summoner's eidolon sets it),
 * prepared or spontaneous (classes with a spell repertoire are spontaneous), and how many
 * cantrips and 1st-rank spells to choose, from the class's spells-per-day table.
 */
export function spellcastingPlan(c: Pf2eCreation, data: Pf2eBuildData) {
  const { cls, deity } = resolve(c, data)
  const row = cls?.spellSlots?.[0]
  if (!cls || !row) return null
  const l1 = norm(cls.advancement[0]?.features.join(', ') ?? '')
  const tradition =
    cls.traditions.length === 1
      ? cls.traditions[0]!
      : (subclassPicks(c, cls).find((s) => s.traditions.length)?.traditions[0] ?? '')
  const fonts = l1.includes('divine font') ? (deity?.divineFont ?? []) : []
  return {
    tradition,
    kind: l1.includes('spell repertoire') ? ('spontaneous' as const) : ('prepared' as const),
    cantrips: row.cantrips,
    rank1: row.slots[0] ?? 0,
    slots: row.slots,
    fonts,
  }
}

/** Common-or-better spells of the hero's tradition: cantrips, or 1st-rank spells. */
export function spellOptions(which: 'cantrip' | 'spell', c: Pf2eCreation, data: Pf2eBuildData) {
  const plan = spellcastingPlan(c, data)
  if (!plan?.tradition) return []
  return data.spells.filter(
    (s) =>
      s.kind === which &&
      (which === 'cantrip' || s.rank === 1) &&
      s.traditions.includes(plan.tradition),
  )
}

/**
 * Focus spells the 1st-level features and subclass picks grant: those of the class whose
 * name the features' text mentions (a bard's composition cantrips, a muse's spell…).
 */
export function creationFocusSpells(c: Pf2eCreation, data: Pf2eBuildData): Pf2eSpellDef[] {
  const { cls } = resolve(c, data)
  if (!cls) return []
  const text = [
    ...cls.features.filter((f) => f.level === 1).map((f) => f.text),
    ...subclassPicks(c, cls).map((s) => s.text),
  ]
    .join('\n')
    // Spell names are italic in the rules text (_courageous anthem_).
    .replace(/[_*]/g, ' ')
    .toLowerCase()
  return data.spells.filter(
    (s) =>
      (s.kind === 'focus' || s.kind === 'cantrip') &&
      s.classes.includes(cls.name) &&
      s.rank <= 1 &&
      new RegExp(`\\b${s.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text),
  )
}

/** The class's focus spells and class cantrips up to 1st rank, to pick from. */
export function focusSpellOptions(c: Pf2eCreation, data: Pf2eBuildData) {
  const { cls } = resolve(c, data)
  if (!cls) return []
  return data.spells.filter(
    (s) =>
      (s.kind === 'focus' || s.kind === 'cantrip') && s.classes.includes(cls.name) && s.rank <= 1,
  )
}

/** The focus spells the build uses: the player's picks, or the ones the features name. */
export const chosenFocusSpells = (c: Pf2eCreation, data: Pf2eBuildData) =>
  c.focus ? data.spells.filter((s) => c.focus!.includes(s.id)) : creationFocusSpells(c, data)

// --- Proficiencies --------------------------------------------------------------

interface WeaponRule {
  rank: Pf2eRank
  categories: string[]
  groups?: string[]
  names?: string[]
}

/** The class's weapon proficiencies, from lines like "Expert in simple and martial weapons". */
function weaponRules(cls: Pf2eClassDef, deity?: Pf2eDeityDef): WeaponRule[] {
  const rules: WeaponRule[] = []
  for (const line of cls.attacks) {
    const m = /^(\w+) in (.+)$/.exec(line)
    const rank = RANK_WORD[m?.[1] ?? '']
    if (!m || !rank) continue
    const what = m[2]!.toLowerCase()
    if (what.includes('favored weapon')) {
      if (deity) rules.push({ rank, categories: [], names: deity.favoredWeapons })
      continue
    }
    const categories = ['simple', 'martial', 'advanced', 'unarmed'].filter((k) => what.includes(k))
    const groups = /firearms and crossbows/.test(what) ? ['Firearm', 'Crossbow'] : undefined
    rules.push({ rank, categories, ...(groups ? { groups } : {}) })
  }
  return rules
}

export function weaponRank(w: Pf2eWeaponDef, cls: Pf2eClassDef, deity?: Pf2eDeityDef): Pf2eRank {
  const category = w.category.toLowerCase()
  return weaponRules(cls, deity).reduce<Pf2eRank>((best, r) => {
    const named = r.names?.includes(w.name)
    const fits = r.categories.includes(category) && (!r.groups || r.groups.includes(w.group))
    return named || fits ? higher(r.rank, best) : best
  }, 'U')
}

/** Rank in an armor category (`unarmored`, `light`, `medium`, `heavy`). */
export function armorRank(cls: Pf2eClassDef, category: string): Pf2eRank {
  const want = category.toLowerCase()
  return cls.defenses.reduce<Pf2eRank>((best, line) => {
    const m = /^(\w+) in (.+)$/.exec(line)
    const rank = RANK_WORD[m?.[1] ?? '']
    if (!m || !rank) return best
    const what = m[2]!.toLowerCase()
    const all = /all armor/.test(what) && want !== 'unarmored'
    const named = want === 'unarmored' ? /unarmored/.test(what) : what.includes(`${want} armor`)
    return all || named ? higher(rank, best) : best
  }, 'U')
}

const unarmedRank = (cls: Pf2eClassDef) =>
  weaponRules(cls).reduce<Pf2eRank>(
    (best, r) => (r.categories.includes('unarmed') ? higher(r.rank, best) : best),
    'U',
  )

// --- Gear -----------------------------------------------------------------------

export function gearCost(c: Pf2eCreation, data: Pf2eBuildData) {
  const items = [
    byId(data.armor, c.armor),
    byId(data.shields, c.shield),
    ...c.weapons.map((id) => byId(data.weapons, id)),
  ]
  return items.reduce((sum, i) => sum + (i?.price ?? 0), 0)
}

function strike(
  name: string,
  traits: string[],
  die: string,
  types: string[],
  ranged: boolean,
  rank: Pf2eRank,
  mods: Record<Pf2eAttr, number>,
): Pf2eStrike {
  const finesse = traits.includes('Finesse')
  const thrown = traits.some((t) => t.startsWith('Thrown'))
  const attr = ranged ? mods.DEX : finesse ? Math.max(mods.STR, mods.DEX) : mods.STR
  const propulsive = traits.includes('Propulsive')
  const dmgMod =
    !ranged || thrown
      ? mods.STR
      : propulsive
        ? mods.STR > 0
          ? Math.floor(mods.STR / 2)
          : mods.STR
        : 0
  const attrName: Pf2eAttr = ranged || (finesse && mods.DEX > mods.STR) ? 'DEX' : 'STR'
  return {
    name,
    bonus: proficiency(rank) + attr,
    agile: traits.includes('Agile'),
    attr: attrName,
    ranged,
    dmg: dmgMod ? `${die}${dmgMod > 0 ? '+' : ''}${dmgMod}` : die,
    type: types.join('/'),
    traits: traits.join(', '),
  }
}

// --- Problems and the sheet ---------------------------------------------------

/** What is missing, by builder step: ancestry, background, class, attributes, skills & feats, gear. */
export function creationProblems(c: Pf2eCreation, data: Pf2eBuildData) {
  const { ancestry, heritage, background, cls, deity } = resolve(c, data)
  const ancestryStep = [
    ancestry ? '' : 'Choose an ancestry',
    heritage ? '' : 'Choose a heritage',
  ].filter(Boolean)
  const classStep: string[] = []
  if (!cls) classStep.push('Choose a class')
  else {
    if (needsDeity(cls) && !deity) classStep.push('Choose a deity')
    for (const ch of subclassChoices(cls)) {
      const n = (c.subclasses[ch.key] ?? []).length
      if (n < ch.count.min || n > ch.count.max)
        classStep.push(
          ch.count.min === ch.count.max
            ? `Choose ${ch.count.min === 1 ? 'a' : ch.count.min} ${ch.label.toLowerCase()}`
            : `Choose ${ch.count.min}–${ch.count.max} for ${ch.label.toLowerCase()}`,
        )
    }
  }
  const featStep = [
    ...skillProblems(c, data),
    ...featSlots(cls)
      .filter((s) => !c.feats[s])
      .map((s) => `Choose ${s === 'ancestry' ? 'an' : 'a'} ${s} feat`),
  ]
  const cost = gearCost(c, data)
  return {
    spells: spellProblems(c, data),
    ancestry: ancestryStep,
    background: background ? [] : ['Choose a background'],
    class: classStep,
    attributes:
      ancestry && background && cls ? boostProblems(c, data) : ['Finish the steps before'],
    skills: cls && background ? featStep : ['Finish the steps before'],
    gear: cost > STARTING_CP ? [`That gear costs ${cost / 100} gp; you have 15 gp`] : [],
  }
}

/** What the spells step still needs: the picks the class's table asks for, a divine font. */
export function spellProblems(c: Pf2eCreation, data: Pf2eBuildData) {
  const plan = spellcastingPlan(c, data)
  if (!plan) return []
  if (!plan.tradition) return ['Choose the option that sets your tradition first (class step)']
  const out: string[] = []
  const n = (ids?: string[]) => ids?.length ?? 0
  if (n(c.spells?.cantrips) !== plan.cantrips) out.push(`Choose ${plan.cantrips} cantrips`)
  if (n(c.spells?.rank1) !== plan.rank1)
    out.push(`Choose ${plan.rank1} 1st-rank spell${plan.rank1 === 1 ? '' : 's'}`)
  if (plan.fonts.length > 1 && !c.font)
    out.push(`Choose your divine font: ${plan.fonts.join(' or ')}`)
  return out
}

const featEntry = (
  type: string,
  r: Pf2eRecord & { actions?: Pf2eActionCost; frequency?: string; trigger?: string },
  level = 1,
): Pf2eFeat => ({
  type,
  level: String(level),
  action: actionGlyph(r.actions),
  name: r.name,
  desc: r.text,
  id: r.id,
  ...(r.frequency ? { frequency: r.frequency } : {}),
  ...(r.trigger ? { trigger: r.trigger } : {}),
})

const GLYPH_COST: Record<string, Pf2eActionCost> = {
  '◆': 1,
  '◆◆': 2,
  '◆◆◆': 3,
  '↺': 'reaction',
  '◇': 'free',
}

/**
 * A class feature's action, which the feature itself doesn't record: the action it embeds
 * ("## Reactive Strike ↺" with its Trigger line), or the feat of the same name it grants
 * (Shield Block).
 */
function featureAction(f: { name: string; text: string }, data: Pf2eBuildData) {
  const esc = f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const glyph = new RegExp(`^#+ ${esc} ([◆↺◇]+)`, 'm').exec(f.text)?.[1]
  if (glyph) {
    const trigger = /^\*\*Trigger\*\* (.+)$/m.exec(f.text)?.[1]
    return { actions: GLYPH_COST[glyph], ...(trigger ? { trigger } : {}) }
  }
  const feat = data.feats.find((x) => x.name === f.name && x.actions)
  return feat
    ? {
        actions: feat.actions,
        ...(feat.trigger ? { trigger: feat.trigger } : {}),
        ...(feat.frequency ? { frequency: feat.frequency } : {}),
      }
    : {}
}

const GENERIC_FEATURE =
  /^(Ancestry and Background|Attribute Boosts|Initial Proficiencies|Skill Feats|General Feats|Skill Increases|Ancestry Feats|.+ Feats)$/

/** The level 1 sheet the choices make (Player Core Steps 3–10). */
export function buildPf2eSheet(c: Pf2eCreation, data: Pf2eBuildData): Pf2eSheet {
  const { ancestry, heritage, background, cls, deity } = resolve(c, data)
  if (!ancestry || !heritage || !background || !cls)
    throw new Error('A PF2e build needs an ancestry, heritage, background and class')
  const sheet = defaultSheet('pf2e')
  const mods = attributeMods(c, data)
  const trained = trainedSkills(c, data)
  const level = 1

  const armor: Pf2eArmorDef | undefined = byId(data.armor, c.armor)
  const armorCategory = armor?.category ?? 'Unarmored'
  const acRank = armorRank(cls, armorCategory)
  const dex = armor?.dexCap === undefined ? mods.DEX : Math.min(mods.DEX, armor.dexCap)
  const ac = 10 + dex + proficiency(acRank) + (armor?.ac ?? 0)

  const save = (label: string, rank: Pf2eRank, attr: Pf2eAttr) => ({
    label,
    rank,
    value: proficiency(rank) + mods[attr],
  })
  const perception = proficiency(cls.perception) + mods.WIS
  const lores = trained.filter((s) => s.endsWith(' Lore'))

  const weapons = c.weapons.map((id) => byId(data.weapons, id)).filter(present)
  const shield = byId(data.shields, c.shield)
  const subclassPicks = subclassChoices(cls).flatMap((ch) =>
    cls.subclasses.filter((s) => (c.subclasses[ch.key] ?? []).includes(s.id)),
  )
  const feats = (['ancestry', 'class', 'skill'] as const)
    .map((slot) => [slot, byId(data.feats, c.feats[slot])] as const)
    .filter((e): e is readonly [Pf2eFeatSlot, Pf2eFeatDef] => !!e[1])
  const backgroundFeats = background.feats
    .map((name) => data.feats.find((f) => f.name === name))
    .filter(present)
  const extraLanguages = Math.max(0, mods.INT)
  const spellRef = (id: string) => {
    const sp = data.spells.find((x) => x.id === id)
    return sp ? [{ id: sp.id, name: sp.name, rank: sp.rank }] : []
  }
  const plan = spellcastingPlan(c, data)
  const rank1 = (c.spells?.rank1 ?? []).flatMap(spellRef)
  const slots = plan ? slotsFor(plan.slots, plan.kind) : []
  // A prepared caster starts with the 1st-rank picks in its 1st-rank slots.
  slots[0]?.prepared?.forEach((p, i) => (p.id = rank1[i]?.id ?? null))
  const font = plan?.fonts.length ? (plan.fonts.length === 1 ? plan.fonts[0] : c.font) : undefined
  const focusDefs = chosenFocusSpells(c, data)
  const focusSpells = focusDefs.map((f) => ({ id: f.id, name: f.name, rank: f.rank }))
  const focusCantrips = new Set(
    focusDefs.filter((f) => f.traits.includes('Cantrip')).map((f) => f.id),
  )
  const focusMax = focusPoolMax(focusSpells, focusCantrips)
  const spent = gearCost(c, data)
  const left = STARTING_CP - spent

  return {
    ...sheet,
    lineage: ancestry.name,
    heritage: heritage.name,
    background: background.name,
    class: cls.name,
    subclass: subclassPicks.map((s) => s.name).join(', '),
    deity: deity?.name ?? '',
    keyAttr: c.keyAttribute,
    attrs: mods,
    hpPerLevel: cls.hp,
    hpMax: ancestry.hp + cls.hp + mods.CON,
    hp: ancestry.hp + cls.hp + mods.CON,
    ac,
    acRank,
    saves: [
      save('Fortitude', cls.saves.fortitude, 'CON'),
      save('Reflex', cls.saves.reflex, 'DEX'),
      save('Will', cls.saves.will, 'WIS'),
      { label: 'Perception', rank: cls.perception, value: perception },
      { label: 'Class DC', rank: 'T', value: 10 + proficiency('T') + mods[c.keyAttribute] },
    ],
    initMod: perception,
    passivePerception: 10 + perception,
    speed: `${ancestry.speed} ft`,
    skills: [
      ...PF2E_SKILLS.filter(([n]) => n !== 'Lore').map(([name, attr]) => {
        const rank: Pf2eRank = trained.includes(name) ? 'T' : 'U'
        return { name, attr, rank, value: proficiency(rank, level) + mods[attr] }
      }),
      ...(lores.length ? lores : ['Lore']).map((name) => {
        const rank: Pf2eRank = trained.includes(name) ? 'T' : 'U'
        return { name, attr: 'INT' as const, rank, value: proficiency(rank, level) + mods.INT }
      }),
    ],
    strikes: [
      strike(
        'Fist',
        ['Agile', 'Finesse', 'Nonlethal', 'Unarmed'],
        '1d4',
        ['Bludgeoning'],
        false,
        unarmedRank(cls),
        mods,
      ),
      ...weapons.map((w) =>
        strike(
          w.name,
          w.traits,
          w.damage,
          w.damageTypes,
          w.type === 'Ranged',
          weaponRank(w, cls, deity),
          mods,
        ),
      ),
    ],
    shield: shield
      ? {
          name: shield.name,
          hardness: shield.hardness,
          hp: shield.hp,
          hpMax: shield.hp,
          bt: Math.floor(shield.hp / 2),
          raised: false,
        }
      : sheet.shield,
    feats: [
      featEntry('Heritage', heritage),
      ...cls.features
        .filter((f) => f.level === 1 && !GENERIC_FEATURE.test(f.name))
        .map((f) =>
          featEntry('Class feature', {
            ...f,
            ...featureAction(f, data),
            source: cls.source,
            rarity: 'common',
            traits: [],
          }),
        ),
      ...subclassPicks.map((s) =>
        featEntry(
          shortKind(cls, s.kind).replace(/^\w/, (x) => x.toUpperCase()),
          s,
        ),
      ),
      ...feats.map(([slot, f]) => featEntry(`${slot[0]!.toUpperCase()}${slot.slice(1)} feat`, f)),
      ...backgroundFeats.map((f) => featEntry('Skill feat (background)', f)),
    ],
    inventory: [
      ...(armor ? [{ name: armor.name, qty: bulkLabel(armor.bulk) }] : []),
      ...(shield ? [{ name: shield.name, qty: bulkLabel(shield.bulk) }] : []),
      ...weapons.map((w) => ({ name: w.name, qty: bulkLabel(w.bulk) })),
    ],
    coins: { gp: Math.floor(left / 100), sp: Math.floor((left % 100) / 10), cp: left % 10 },
    bulkLimit: 5 + mods.STR,
    notes: `Languages: ${ancestry.languages.join(', ')}${extraLanguages ? ` (+${extraLanguages} of your choice)` : ''}`,
    ...(plan?.tradition
      ? {
          spellcasting: {
            tradition: plan.tradition,
            kind: plan.kind,
            attr: c.keyAttribute,
            rank: 'T' as const,
            cantrips: (c.spells?.cantrips ?? []).flatMap(spellRef),
            spells: rank1,
            slots,
            ...(font ? { font: { spell: font, max: fontSlots(1), used: 0 } } : {}),
          },
        }
      : {}),
    ...(focusSpells.length
      ? { focusSpells, focus: { max: focusMax, current: focusMax, note: '' } }
      : {}),
    classSlug: cls.slug,
    creation: c,
  }
}
