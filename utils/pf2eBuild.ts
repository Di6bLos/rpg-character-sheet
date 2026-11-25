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
  Pf2eHeritageDef,
  Pf2eRecord,
  Pf2eShieldDef,
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
const ATTR_NAME = Object.fromEntries(
  Object.entries(ATTR_BY_NAME).map(([name, a]) => [a, name]),
) as Record<Pf2eAttr, string>
const SKILL_ATTR = new Map(PF2E_SKILLS.filter(([n]) => n !== 'Lore'))
export const PF2E_SKILL_NAMES = [...SKILL_ATTR.keys()]
const isSkill = (s: string) => SKILL_ATTR.has(s) || s.endsWith(' Lore')

/** Starting wealth: 15 gp (Player Core p. 25), in copper. */
export const STARTING_CP = 1500
/** Highest attribute modifier at 1st level (Player Core p. 19). */
const MAX_MOD = 4
const RANK_BONUS: Record<Pf2eRank, number> = { U: 0, T: 2, E: 4, M: 6, L: 8 }
const RANK_ORDER: Pf2eRank[] = ['U', 'T', 'E', 'M', 'L']
const RANK_WORD: Record<string, Pf2eRank> = {
  Untrained: 'U',
  Trained: 'T',
  Expert: 'E',
  Master: 'M',
  Legendary: 'L',
}

/** Proficiency bonus (Player Core p. 11): untrained +0, otherwise level + 2/4/6/8. */
export const proficiency = (rank: Pf2eRank, level = 1) =>
  rank === 'U' ? 0 : level + RANK_BONUS[rank]

export const ACTION_GLYPH: Record<string, string> = {
  1: '◆',
  2: '◆◆',
  3: '◆◆◆',
  reaction: '↺',
  free: '◇',
}
/** Each part of a cost as its glyph: "1 to 3" → "◆ to ◆◆◆", "2 to 2 rounds" → "◆◆ to 2 rounds". */
export const actionGlyph = (a?: Pf2eActionCost) =>
  a === undefined
    ? ''
    : String(a)
        .split(/ (to|or) /)
        .map((p) => ACTION_GLYPH[p] ?? p)
        .join(' ')

const byId = <T extends { id: string }>(list: T[], id?: string) =>
  id ? list.find((x) => x.id === id) : undefined
const present = <T>(x: T | undefined): x is T => x !== undefined
/** Bulk as the sheet writes it: L for light items. */
const bulkLabel = (b: number) => (b > 0 && b < 1 ? 'L' : String(b))
const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'")
const higher = (a: Pf2eRank, b: Pf2eRank) =>
  RANK_ORDER.indexOf(a) >= RANK_ORDER.indexOf(b) ? a : b
/** Rules text as one line of plain words: no markdown emphasis, straight apostrophes. */
const plain = (s: string) => s.replace(/[*_]/g, '').replace(/[’]/g, "'").replace(/\s+/g, ' ').trim()
/** Attributes named in a text, in the order it names them. */
const attrsIn = (s: string) =>
  [...s.matchAll(/\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\b/g)]
    .map((m) => ATTR_BY_NAME[m[1]!]!)
    .filter((a, i, all) => all.indexOf(a) === i)

/**
 * What the class table lists at 1st level. Found by level, not position: the generated rows
 * aren't guaranteed to be in order.
 */
export const levelOneFeatures = (cls?: Pf2eClassDef) =>
  cls?.advancement.find((a) => a.level === 1)?.features ?? []

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
    lores: [],
    feats: {},
    weapons: [],
  }
}

/** What the choices point at, looked up once. */
export function resolve(c: Pf2eCreation, data: Pf2eBuildData) {
  const cls = byId(data.classes, c.class)
  const ids = Object.values(c.subclasses).flat()
  return {
    ancestry: byId(data.ancestries, c.ancestry),
    heritage: byId(data.heritages, c.heritage),
    background: byId(data.backgrounds, c.background),
    cls,
    deity: byId(data.deities, c.deity),
    /** Every subclass option picked (a racket, a doctrine, three ikons…). */
    subclassPicks: cls?.subclasses.filter((s) => ids.includes(s.id)) ?? [],
  }
}

// --- Attribute boosts ---------------------------------------------------------

const WORD_COUNT: Record<string, number> = { one: 1, two: 2, three: 3 }

/** An ancestry's boosts and flaws (Player Core p. 23), or two free boosts instead. */
export function ancestryBoostPlan(a: Pf2eAncestryDef, freeInstead: boolean) {
  if (freeInstead) return { fixed: [] as Pf2eAttr[], free: 2, flaws: [] as Pf2eAttr[] }
  const toAttr = (n: string) => ATTR_BY_NAME[n]
  return {
    fixed: a.boosts.map(toAttr).filter((x): x is Pf2eAttr => !!x),
    free: a.boosts.filter((b) => b === 'Free').length,
    flaws: a.flaws.map(toAttr).filter((x): x is Pf2eAttr => !!x),
  }
}

/** One attribute boost a background gives, and the attributes it may go to. */
export interface Pf2eBoostSlot {
  label: string
  allowed: Pf2eAttr[]
  /** A limit the builder can't check (your sign's attribute, a GM's pick). */
  note?: string
}

const freeSlot = (note?: string): Pf2eBoostSlot => ({
  label: 'Free boost',
  allowed: [...PF2E_ATTRS],
  ...(note ? { note } : {}),
})
const ORDINAL = ['first', 'second', 'third', 'fourth']
const listOr = (xs: string[]) =>
  xs.length > 2 ? `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}` : xs.join(' or ')

/**
 * A background's boosts (Player Core p. 24): usually one of two listed attributes plus a free
 * boost. The few the data lists none for say theirs in the text: "You gain three free
 * attribute boosts" (Amnesiac), "Choose one attribute boost. It must be to Strength,
 * Dexterity, or Constitution" (Feral Child), "One must be to the attribute tied to your sign,
 * and one is a free attribute boost" (Zodiac Bound). A limit only the table can settle (your
 * sign, your deity when you don't have one yet) is left free with a note.
 */
export function backgroundBoostSlots(b: Pf2eBackgroundDef, deity?: Pf2eDeityDef): Pf2eBoostSlot[] {
  const listed = attrsIn(b.boosts.join(' '))
  if (listed.length >= 2)
    return [{ label: listOr(b.boosts.filter((n) => ATTR_BY_NAME[n])), allowed: listed }, freeSlot()]
  const text = plain(b.text)
  const sentence = (at: number) => text.slice(at).split(/(?<=\.)\s/)[0] ?? ''
  const count = (w: string) => WORD_COUNT[w.toLowerCase()] ?? Number(w)
  const gain = /You gain (\w+) free (?:attribute|ability) boosts?/i.exec(text)
  if (gain) {
    const s = sentence(gain.index)
    const note = /\bGM\b/.test(s) ? s : undefined
    return Array.from({ length: count(gain[1]!) || 2 }, (_, i) => freeSlot(i ? undefined : note))
  }
  const choose = /Choose (\w+) (?:attribute|ability) boosts?\.\s*/i.exec(text)
  if (choose) {
    const n = count(choose[1]!) || 2
    const rule = sentence(choose.index + choose[0].length)
    const each = /^(?:It|Each boost) (?:must|has to) be to ([^.]+)/i.exec(rule)
    if (each) {
      const allowed = attrsIn(each[1]!)
      const label = listOr(allowed.map((a) => ATTR_NAME[a]))
      return Array.from({ length: n }, () => ({ label, allowed }))
    }
    const one = /^One must be to (.+?),? and (?:the other|one) is a free/i.exec(rule)
    if (one) {
      const what = one[1]!
      const named = attrsIn(what)
      const first: Pf2eBoostSlot = named.length
        ? { label: listOr(named.map((a) => ATTR_NAME[a])), allowed: named }
        : /deity/i.test(what) && deity?.attributes.length
          ? { label: `${deity.name}'s divine attribute`, allowed: deity.attributes }
          : {
              label: /deity/i.test(what)
                ? "Your deity's divine attribute"
                : /sign/i.test(what)
                  ? "Your sign's attribute"
                  : 'Listed attribute',
              allowed: [...PF2E_ATTRS],
              note: `Must go to ${what.replace(/^an? /, 'an ')}.`,
            }
      return [first, ...Array.from({ length: n - 1 }, () => freeSlot())]
    }
    return Array.from({ length: n }, () => freeSlot())
  }
  return [freeSlot("Check the background's rules text for its boosts"), freeSlot()]
}

/** The attributes slot `i` can't take: those another slot holds and can't swap for. */
export function slotTaken(boosts: Pf2eAttr[], slots: Pf2eBoostSlot[], i: number) {
  const mine = boosts[i]
  return boosts.filter((a, j) => j !== i && !(mine && slots[j]?.allowed.includes(mine)))
}

/**
 * Sets boost slot `i`. Slots fill in order; a boost another slot holds swaps places with this
 * slot's old one, so no attribute is boosted twice. Clearing a slot clears the ones after it.
 */
export function setSlotBoost(
  boosts: Pf2eAttr[],
  slots: Pf2eBoostSlot[],
  i: number,
  a?: Pf2eAttr,
): Pf2eAttr[] {
  const next = boosts.slice(0, slots.length)
  if (i > next.length) return next
  if (!a) return next.slice(0, i)
  if (!slots[i]?.allowed.includes(a) || slotTaken(next, slots, i).includes(a)) return next
  const j = next.indexOf(a)
  const before = next[i]
  next[i] = a
  if (j >= 0 && j !== i && before) next[j] = before
  return next
}

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

/** Problems with the background's boosts: every slot filled, within its limits, all different. */
export function backgroundBoostProblems(c: Pf2eCreation, data: Pf2eBuildData) {
  const { background, deity } = resolve(c, data)
  if (!background) return []
  const slots = backgroundBoostSlots(background, deity)
  const boosts = c.backgroundBoosts
  const n = slots.length
  if (boosts.length < n)
    return [
      n === 1
        ? 'Choose the background boost'
        : n === 2
          ? 'Choose both background boosts'
          : `Choose all ${n} background boosts`,
    ]
  if (boosts.length > n) return [`${background.name} gives only ${n} boost${n === 1 ? '' : 's'}`]
  const out: string[] = []
  slots.forEach((slot, i) => {
    if (!slot.allowed.includes(boosts[i]!))
      out.push(`The ${n === 1 ? '' : `${ORDINAL[i]} `}background boost goes to ${slot.label}`)
  })
  if (new Set(boosts).size !== boosts.length)
    out.push('Each background boost must go to a different attribute')
  return out
}

/**
 * The key attributes the class and its 1st-level choices allow: a racket that says "You can
 * choose Strength as your key attribute" adds one, a subconscious mind that says "Your key
 * attribute is Charisma" settles it.
 */
export function keyAttributeOptions(cls: Pf2eClassDef, picks: Pf2eSubclassOption[] = []) {
  let keys = [...cls.keyAttributes]
  const extra: Pf2eAttr[] = []
  for (const p of picks) {
    const text = plain(p.text)
    const is = /Your key attribute is (\w+)/i.exec(text)
    if (is && ATTR_BY_NAME[is[1]!]) keys = [ATTR_BY_NAME[is[1]!]!]
    const can = /You can choose (\w+) as your key (?:attribute|ability)/i.exec(text)
    if (can && ATTR_BY_NAME[can[1]!]) extra.push(ATTR_BY_NAME[can[1]!]!)
  }
  return [...new Set([...keys, ...extra])]
}

/** Problems with the boosts: each set to different attributes, nothing over +4. */
export function boostProblems(c: Pf2eCreation, data: Pf2eBuildData) {
  const { ancestry, cls, subclassPicks } = resolve(c, data)
  const out: string[] = []
  const distinct = (xs: Pf2eAttr[]) => new Set(xs).size === xs.length
  if (ancestry) {
    const plan = ancestryBoostPlan(ancestry, c.freeAncestryBoosts)
    if (c.ancestryBoosts.length !== plan.free)
      out.push(`Choose ${plan.free} free ancestry boost${plan.free === 1 ? '' : 's'}`)
    else if (!distinct([...plan.fixed, ...c.ancestryBoosts]))
      out.push('Each ancestry boost must go to a different attribute')
  }
  const keys = cls ? keyAttributeOptions(cls, subclassPicks) : []
  if (cls && !keys.includes(c.keyAttribute))
    out.push(`Choose your key attribute: ${keys.join(' or ')}`)
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
  const l1 = norm(levelOneFeatures(cls).join(', '))
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

/**
 * The 1st-level part of a subclass's text: what comes before its first level marker, plus the
 * parts marked "(1st)", without "At 13th level…" sentences. A warpriest's "Second Doctrine
 * (3rd) You're trained in martial weapons" is left out.
 */
export function levelOneText(text: string) {
  const parts = plain(text).split(/\((\d+)(?:st|nd|rd|th)\)/)
  let out = parts[0] ?? ''
  for (let i = 1; i < parts.length; i += 2) if (parts[i] === '1') out += ` ${parts[i + 1] ?? ''}`
  return out
    .split(/(?<=\.)\s+/)
    .filter((s) => !/^At \d+(?:st|nd|rd|th) level/i.test(s))
    .join(' ')
}

/**
 * What "You're trained in…" lines in the 1st-level choices add: armor and weapon categories,
 * plus saves they raise ("you have expert proficiency in Fortitude saves": a warpriest).
 */
function subclassTraining(picks: Pf2eSubclassOption[]) {
  const armor = new Set<string>()
  const weapons = new Set<string>()
  const expertSaves = new Set<string>()
  let favored = false
  for (const p of picks) {
    for (const m of levelOneText(p.text).matchAll(
      /\bexpert proficiency in (Fortitude|Reflex|Will) saves\b/gi,
    ))
      expertSaves.add(m[1]!.toLowerCase())
    for (const m of levelOneText(p.text).matchAll(
      /\b(?:you're|you are|you become)(?: also)? trained in ([^.;]+)/gi,
    )) {
      const what = m[1]!.split(/,? and (?:you|gain)\b/i)[0]!.toLowerCase()
      if (/\barmor\b/.test(what))
        for (const k of ['light', 'medium', 'heavy']) if (what.includes(k)) armor.add(k)
      if (/\bweapons\b/.test(what))
        for (const k of ['simple', 'martial', 'advanced']) if (what.includes(k)) weapons.add(k)
      if (/favored weapon/.test(what)) favored = true
    }
  }
  return { armor, weapons: [...weapons], favored, expertSaves }
}

/**
 * Clerics and champions choose a deity at 1st level, and so does a hero whose 1st-level choice
 * serves one (an avenger rogue is "trained in your deity's favored weapon").
 */
export const needsDeity = (cls: Pf2eClassDef, picks: Pf2eSubclassOption[] = []) =>
  /\bdeity\b/i.test(levelOneFeatures(cls).join(', ')) ||
  picks.some((p) => /\byour deity's\b/i.test(levelOneText(p.text)))

/** Deities a cleric or champion can follow: those that grant a divine font. */
export const deityOptions = (data: Pf2eBuildData) =>
  data.deities.filter((d) => d.divineFont.length > 0)

export type Pf2eFeatSlot = 'ancestry' | 'class' | 'skill'

/**
 * A class whose 1st-level class feat is a special kind names it on the table: the summoner's
 * "evolution feat" is a summoner feat with the evolution trait.
 */
export function classFeatTrait(cls?: Pf2eClassDef) {
  const plainKinds = ['ancestry', 'skill', 'general', norm(cls?.name ?? '')]
  for (const f of levelOneFeatures(cls)) {
    const m = /^(\w+) feat$/.exec(norm(f.trim()))
    if (m && !plainKinds.includes(m[1]!)) return m[1]!.replace(/^\w/, (x) => x.toUpperCase())
  }
  return undefined
}

/** Feats chosen at 1st level: always an ancestry feat, plus what the class table lists. */
export function featSlots(cls?: Pf2eClassDef): Pf2eFeatSlot[] {
  const l1 = norm(levelOneFeatures(cls).join(', '))
  const slots: Pf2eFeatSlot[] = ['ancestry']
  if (cls && (l1.includes(`${norm(cls.name)} feat`) || classFeatTrait(cls))) slots.push('class')
  if (l1.includes('skill feat')) slots.push('skill')
  return slots
}

/**
 * The feat lists a heritage opens: its own, plus those its text names ("you can choose from
 * aiuvarin and elf feats", "from ardande feats, geniekin feats, and feats from your ancestry").
 */
export function heritageFeatLists(h?: Pf2eHeritageDef) {
  if (!h?.versatile) return []
  const clause = /choose from ([^.]+)/i.exec(plain(h.text))?.[1] ?? ''
  const words = [...clause.matchAll(/\b([a-z][\w-]*)(?= feats\b| and [a-z][\w-]* feats\b)/gi)]
    .map((m) => m[1]!.toLowerCase())
    .filter((w) => !['and', 'ancestry', 'your', 'the', 'those'].includes(w))
    .map((w) => w.replace(/^\w/, (x) => x.toUpperCase()))
  return [...new Set([h.name, ...words])]
}

/** 1st-level feats for a slot; prerequisites are shown, not checked. */
export function featOptions(slot: Pf2eFeatSlot, c: Pf2eCreation, data: Pf2eBuildData) {
  const { ancestry, heritage, cls } = resolve(c, data)
  const lists = [ancestry?.name, ...heritageFeatLists(heritage)].filter(Boolean)
  const trait = classFeatTrait(cls)
  return data.feats.filter((f) => {
    if (f.level !== 1) return false
    if (slot === 'ancestry') return f.ancestries.some((a) => lists.includes(a))
    if (slot === 'class')
      return !!cls && f.classes.includes(cls.name) && (!trait || f.traits.includes(trait))
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
  /** Lore skills the player names ("Lore related to the terrain you worked in"), with the book's words. */
  lores: { hint: string }[]
}

const splitSkills = (s: string) =>
  s
    .replace(/\.$/, '')
    .split(/,? (?:and|or) |, /)
    .map((x) => x.trim())
    .filter(isSkill)

/** A background's skill entry without links, AoN's `{{traits 160 "undead"}}` tags or "Lore Lore". */
const cleanEntry = (s: string) =>
  s
    .replace(/<[^>]*>/g, '')
    .replace(/\{\{\w+ \d+ "([^"]*)"\}\}/g, '$1')
    .replace(/\bLore Lore\b/g, 'Lore')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * A background's skills: plain names are trained; "Genealogy Lore or Heraldry Lore" is a
 * choice; prose like "Lore related to the terrain you worked in" is a Lore the player names.
 */
export function backgroundSkills(b: Pf2eBackgroundDef) {
  const fixed: string[] = []
  const groups: Pf2eSkillPlan['groups'] = []
  const lores: Pf2eSkillPlan['lores'] = []
  for (const entry of b.skills) {
    const clean = cleanEntry(entry)
    const head = (clean.split(/[.,(]/)[0] ?? '').trim().replace(/ skill$/, '')
    const either = head.split(/ or /)
    const named = (x: string) => isSkill(x) && !x.startsWith('Lore ') && !/^an? /.test(x)
    if (either.length > 1 && either.every(named)) groups.push({ options: either, count: 1 })
    else if (either.length === 1 && named(head)) fixed.push(head)
    else lores.push({ hint: clean.replace(/\.$/, '') })
  }
  return { fixed, groups, lores }
}

/** A Lore the player named, as the sheet writes it: "desert" → "Desert Lore". */
export const loreName = (s: string) => {
  const name = s.trim().replace(/\s*\blore$/i, '')
  return name ? `${name.replace(/^\w/, (x) => x.toUpperCase())} Lore` : ''
}

/** Lores a class trains at 1st level in its feature text ("You become trained in Undead Lore"). */
function classLores(cls: Pf2eClassDef) {
  return cls.features
    .filter((f) => f.level === 1 && !/daily preparations/i.test(f.text))
    .flatMap((f) => [
      ...plain(f.text).matchAll(
        /\b(?:become|are|you're) trained in ([A-Z][\w'-]*(?: [A-Z][\w'-]*)* Lore)\b/g,
      ),
    ])
    .map((m) => m[1]!)
}

/** Trained skills at 1st level (Player Core p. 24, Step 7), from the class's printed lines. */
export function skillPlan(c: Pf2eCreation, data: Pf2eBuildData): Pf2eSkillPlan {
  const { background, cls, deity, subclassPicks } = resolve(c, data)
  const int = attributeMods(c, data).INT
  const bg = background
    ? backgroundSkills(background)
    : { fixed: [], groups: [], lores: [] as Pf2eSkillPlan['lores'] }
  const fixed: string[] = [...new Set(bg.fixed)]
  const groups: Pf2eSkillPlan['groups'] = [...bg.groups]
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
  if (cls) classLores(cls).forEach(add)
  if (cls && deity && needsDeity(cls, subclassPicks))
    for (const s of deity.skill.slice(0, 1)) add(s)
  for (const o of subclassPicks) {
    o.skills.forEach(add)
    // "You're trained in Society and one of the following skills of your choice: Arcana, …"
    const pick = /one of the following skills(?: of your choice)?: ([^.]+)/i.exec(
      levelOneText(o.text),
    )
    if (pick) groups.push({ options: splitSkills(pick[1]!), count: 1 })
  }
  // A choice whose options are all trained already becomes a free skill.
  const open = groups.filter((g) => {
    if (g.options.some((o) => !fixed.includes(o))) return true
    free += g.count
    return false
  })
  return { fixed, groups: open, free, lores: bg.lores }
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
  plan.lores.forEach((_, i) => {
    if (!loreName(c.lores?.[i] ?? '')) out.push('Name the Lore skill your background gives')
  })
  return out
}

/** Every skill the hero ends up trained in. */
export const trainedSkills = (c: Pf2eCreation, data: Pf2eBuildData) => {
  const plan = skillPlan(c, data)
  const named = plan.lores.map((_, i) => loreName(c.lores?.[i] ?? '')).filter(Boolean)
  return [...new Set([...plan.fixed, ...c.skills, ...named])]
}

// --- Proficiencies --------------------------------------------------------------

interface WeaponRule {
  rank: Pf2eRank
  categories: string[]
  groups?: string[]
  names?: string[]
}

/**
 * The class's weapon proficiencies, from lines like "Expert in simple and martial weapons",
 * plus what the 1st-level choices train (a reaper's martial weapons, an avenger's favored one).
 */
function weaponRules(
  cls: Pf2eClassDef,
  deity?: Pf2eDeityDef,
  picks: Pf2eSubclassOption[] = [],
): WeaponRule[] {
  const rules: WeaponRule[] = []
  const training = subclassTraining(picks)
  if (training.weapons.length) rules.push({ rank: 'T', categories: training.weapons })
  if (training.favored && deity)
    rules.push({ rank: 'T', categories: [], names: deity.favoredWeapons })
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

export function weaponRank(
  w: Pf2eWeaponDef,
  cls: Pf2eClassDef,
  deity?: Pf2eDeityDef,
  picks: Pf2eSubclassOption[] = [],
): Pf2eRank {
  const category = w.category.toLowerCase()
  return weaponRules(cls, deity, picks).reduce<Pf2eRank>((best, r) => {
    const named = r.names?.includes(w.name)
    const fits = r.categories.includes(category) && (!r.groups || r.groups.includes(w.group))
    return named || fits ? higher(r.rank, best) : best
  }, 'U')
}

/**
 * Rank in an armor category (`unarmored`, `light`, `medium`, `heavy`), from the class lines and
 * the 1st-level choices ("You're trained in light and medium armor": a warpriest, a ruffian).
 */
export function armorRank(
  cls: Pf2eClassDef,
  category: string,
  picks: Pf2eSubclassOption[] = [],
): Pf2eRank {
  const want = category.toLowerCase()
  const start: Pf2eRank = subclassTraining(picks).armor.has(want) ? 'T' : 'U'
  return cls.defenses.reduce<Pf2eRank>((best, line) => {
    const m = /^(\w+) in (.+)$/.exec(line)
    const rank = RANK_WORD[m?.[1] ?? '']
    if (!m || !rank) return best
    const what = m[2]!.toLowerCase()
    const all = /all armor/.test(what) && want !== 'unarmored'
    const named = want === 'unarmored' ? /unarmored/.test(what) : what.includes(`${want} armor`)
    return all || named ? higher(rank, best) : best
  }, start)
}

const unarmedRank = (cls: Pf2eClassDef) =>
  weaponRules(cls).reduce<Pf2eRank>(
    (best, r) => (r.categories.includes('unarmed') ? higher(r.rank, best) : best),
    'U',
  )

// --- Gear -----------------------------------------------------------------------

/** Highest item level a 1st-level hero can buy (Player Core p. 25: items of your level or lower). */
export const GEAR_MAX_LEVEL = 1

/** Ammunition needs no proficiency and makes no Strike of its own. */
export const isAmmunition = (w: Pf2eWeaponDef) => w.category === 'Ammunition'

/** One record per name (the data repeats a few reprints), in data order. */
const uniqueNames = <T extends { name: string }>(list: T[]) =>
  list.filter((x, i) => list.findIndex((y) => y.name === x.name) === i)

/** What the Gear step sells: level 0–1 items, no unarmed attacks (every hero has a fist). */
export function gearOptions(data: Pick<Pf2eBuildData, 'armor' | 'shields' | 'weapons'>) {
  const buyable = <T extends { level: number; name: string }>(list: T[]) =>
    uniqueNames(list.filter((x) => x.level <= GEAR_MAX_LEVEL))
  return {
    armor: buyable(data.armor),
    shields: buyable(data.shields),
    weapons: buyable(data.weapons).filter((w) => w.category !== 'Unarmed'),
  }
}

/** Armor and weapons picked that the hero isn't trained in (ammunition needs no training). */
export function untrainedGear(c: Pf2eCreation, data: Pf2eBuildData) {
  const { cls, deity, subclassPicks } = resolve(c, data)
  if (!cls) return []
  const armor = byId(data.armor, c.armor)
  return [
    ...(armor && armorRank(cls, armor.category, subclassPicks) === 'U' ? [armor] : []),
    ...c.weapons
      .map((id) => byId(data.weapons, id))
      .filter(present)
      .filter((w) => !isAmmunition(w) && weaponRank(w, cls, deity, subclassPicks) === 'U'),
  ]
}

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
  return {
    name,
    bonus: proficiency(rank) + attr,
    agile: traits.includes('Agile'),
    dmg: dmgMod ? `${die}${dmgMod > 0 ? '+' : ''}${dmgMod}` : die,
    type: types.join('/'),
    traits: traits.join(', '),
  }
}

// --- Problems and the sheet ---------------------------------------------------

/** What is missing, by builder step: ancestry, background, class, attributes, skills & feats, gear. */
export function creationProblems(c: Pf2eCreation, data: Pf2eBuildData) {
  const { ancestry, heritage, background, cls, deity, subclassPicks } = resolve(c, data)
  const ancestryStep = [
    ancestry ? '' : 'Choose an ancestry',
    heritage ? '' : 'Choose a heritage',
  ].filter(Boolean)
  const classStep: string[] = []
  if (!cls) classStep.push('Choose a class')
  else {
    // In the order the step shows them: the subclass choices come before the deity list.
    for (const ch of subclassChoices(cls)) {
      const n = (c.subclasses[ch.key] ?? []).length
      if (n < ch.count.min || n > ch.count.max)
        classStep.push(
          ch.count.min === ch.count.max
            ? `Choose ${ch.count.min === 1 ? 'a' : ch.count.min} ${ch.label.toLowerCase()}`
            : `Choose ${ch.count.min}–${ch.count.max} for ${ch.label.toLowerCase()}`,
        )
    }
    if (needsDeity(cls, subclassPicks) && !deity) classStep.push('Choose a deity')
  }
  const trait = classFeatTrait(cls)
  const featStep = [
    ...skillProblems(c, data),
    ...featSlots(cls)
      .filter((s) => !c.feats[s])
      .map((s) => {
        const kind = s === 'class' && trait ? trait.toLowerCase() : s
        return `Choose ${/^[aeiou]/.test(kind) ? 'an' : 'a'} ${kind} feat`
      }),
  ]
  const cost = gearCost(c, data)
  const untrained = untrainedGear(c, data)
  return {
    ancestry: ancestryStep,
    background: background ? backgroundBoostProblems(c, data) : ['Choose a background'],
    class: classStep,
    attributes:
      ancestry && background && cls ? boostProblems(c, data) : ['Finish the steps before'],
    skills: cls && background ? featStep : ['Finish the steps before'],
    gear: [
      ...(untrained.length
        ? [`Not trained in ${untrained.map((g) => g.name).join(', ')}: pick something else`]
        : []),
      ...(cost > STARTING_CP ? [`That gear costs ${cost / 100} gp; you have 15 gp`] : []),
    ],
  }
}

const featEntry = (
  type: string,
  r: Pf2eRecord & { actions?: Pf2eActionCost },
  level = 1,
): Pf2eFeat => ({
  type,
  level: String(level),
  action: actionGlyph(r.actions),
  name: r.name,
  desc: r.text,
})

const GENERIC_FEATURE =
  /^(Ancestry and Background|Attribute Boosts|Initial Proficiencies|Skill Feats|General Feats|Skill Increases|Ancestry Feats|.+ Feats)$/i

/**
 * Armor's check and Speed penalties (Player Core p. 271). Meeting its Strength value removes
 * the check penalty and cuts the Speed penalty by 5 feet; a shield's Speed penalty always
 * applies. The check penalty hits Strength and Dexterity skills, except checks with the
 * attack trait.
 */
export function armorPenalties(
  mods: Record<Pf2eAttr, number>,
  armor?: Pf2eArmorDef,
  shield?: Pf2eShieldDef,
) {
  const strong = armor?.strength !== undefined && mods.STR >= armor.strength
  const check = armor && !strong ? armor.checkPenalty : 0
  const armorSpeed = armor ? Math.min(0, armor.speedPenalty + (strong ? 5 : 0)) : 0
  const shieldSpeed = shield?.speedPenalty ?? 0
  const notes = [
    check
      ? `${armor!.name}: ${check} to Strength and Dexterity skill checks (not attack-trait checks)`
      : '',
    armorSpeed ? `${armor!.name}: ${armorSpeed} ft Speed` : '',
    shieldSpeed ? `${shield!.name}: ${shieldSpeed} ft Speed` : '',
  ].filter(Boolean)
  return { check, speed: armorSpeed + shieldSpeed, notes }
}

/**
 * Speeds as the sheet writes them: the land Speed (a heritage's own when it gives one, as an
 * awakened animal's does) less armor and shields, never under 5 feet, then the other speeds the
 * heritage grants ("20 ft, climb 20 ft").
 */
export function speedLine(ancestry: Pf2eAncestryDef, heritage?: Pf2eHeritageDef, penalty = 0) {
  const land = heritage?.speeds?.land ?? ancestry.speed
  const other = Object.entries(heritage?.speeds ?? {})
    .filter(([k, v]) => k !== 'land' && v)
    .map(([k, v]) => `${k} ${v} ft`)
  return [land ? `${Math.max(5, land + penalty)} ft` : '', ...other].filter(Boolean).join(', ')
}

/** The level 1 sheet the choices make (Player Core Steps 3–10). */
export function buildPf2eSheet(c: Pf2eCreation, data: Pf2eBuildData): Pf2eSheet {
  const { ancestry, heritage, background, cls, deity, subclassPicks: picked } = resolve(c, data)
  if (!ancestry || !heritage || !background || !cls)
    throw new Error('A PF2e build needs an ancestry, heritage, background and class')
  const sheet = defaultSheet('pf2e')
  const mods = attributeMods(c, data)
  const trained = trainedSkills(c, data)
  const level = 1

  const armor: Pf2eArmorDef | undefined = byId(data.armor, c.armor)
  const armorCategory = armor?.category ?? 'Unarmored'
  const acRank = armorRank(cls, armorCategory, picked)
  const dex = armor?.dexCap === undefined ? mods.DEX : Math.min(mods.DEX, armor.dexCap)
  const ac = 10 + dex + proficiency(acRank) + (armor?.ac ?? 0)

  const expertSaves = subclassTraining(picked).expertSaves
  const save = (label: string, classRank: Pf2eRank, attr: Pf2eAttr) => {
    const rank = expertSaves.has(label.toLowerCase()) ? higher('E', classRank) : classRank
    return { label, rank, value: proficiency(rank) + mods[attr] }
  }
  const perception = proficiency(cls.perception) + mods.WIS
  const lores = trained.filter((s) => s.endsWith(' Lore'))

  const weapons = c.weapons.map((id) => byId(data.weapons, id)).filter(present)
  const shield = byId(data.shields, c.shield)
  const penalty = armorPenalties(mods, armor, shield)
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
    speed: speedLine(ancestry, heritage, penalty.speed),
    skills: [
      ...PF2E_SKILLS.filter(([n]) => n !== 'Lore').map(([name, attr]) => {
        const rank: Pf2eRank = trained.includes(name) ? 'T' : 'U'
        const check = attr === 'STR' || attr === 'DEX' ? penalty.check : 0
        return { name, attr, rank, value: proficiency(rank, level) + mods[attr] + check }
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
      ...weapons
        .filter((w) => !isAmmunition(w))
        .map((w) =>
          strike(
            w.name,
            w.traits,
            w.damage,
            w.damageTypes,
            w.type === 'Ranged',
            weaponRank(w, cls, deity, picked),
            mods,
          ),
        ),
    ],
    shield: shield
      ? {
          name: shield.name,
          ac: shield.ac,
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
          featEntry('Class feature', { ...f, source: cls.source, rarity: 'common', traits: [] }),
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
    notes: [
      `Languages: ${ancestry.languages.join(', ')}${extraLanguages ? ` (+${extraLanguages} of your choice)` : ''}`,
      ...penalty.notes,
      ...[ancestry, heritage, ...picked].filter((r) => r.gap).map((r) => `${r.name}: ${r.gap}`),
    ].join('\n'),
    classSlug: cls.slug,
    creation: c,
  }
}
