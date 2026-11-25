// Writes the committed Pathfinder 2e rules data (`data/pf2e/generated/*.json`, typed in
// `data/pf2e/types.ts`) from the Archives of Nethys data in `.local/pf2e/aon/`. Remaster (ORC)
// entries from the open rulebooks only (`OPEN_BOOKS` in `scripts/lib/aon.ts`): legacy (OGL)
// entries, Golarion setting books (Lost Omens, Adventure Paths…), entries named for a deity or
// Golarion proper noun, the sections of those books AoN inlines and the deity lists on weapons
// and spells are left out. Deities themselves are Paizo Reserved Material, kept under Paizo's
// Community Use Policy (the user's one exception). Also writes `data/pf2e/NOTICE.md` with the ORC and
// Community Use notices and the books used.
//
//   npm run pf2e:data -- [dataDir]

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  Pf2eActionCost,
  Pf2eActionDef,
  Pf2eAncestryDef,
  Pf2eArmorDef,
  Pf2eBackgroundDef,
  Pf2eClassDef,
  Pf2eConditionDef,
  Pf2eDeityDef,
  Pf2eFeatDef,
  Pf2eHeritageDef,
  Pf2eRarity,
  Pf2eRecord,
  Pf2eShieldDef,
  Pf2eSpeeds,
  Pf2eSpellDef,
  Pf2eSpellLinks,
  Pf2eSubclassOption,
  Pf2eWeaponDef,
} from '../data/pf2e/types'
import type { Pf2eAttr, Pf2eRank } from '../types/sheets'
import {
  type AonDoc,
  classOfType,
  cleanMarkdown,
  heritageAncestry,
  closedBooks,
  legacyBooks,
  loadAon,
  located,
  page,
  remaster,
  shareable,
  slug,
  stripLinks,
  withoutLegacy,
} from './lib/aon'

const ROOT = join(import.meta.dirname, '..')
const DATA = process.argv[2] ?? join(ROOT, '.local', 'pf2e', 'aon')
const OUT = join(ROOT, 'data', 'pf2e', 'generated')

/** A field as a list of plain strings (AoN leaves links and tags in a few, like background skills). */
const list = (v: unknown) =>
  (Array.isArray(v) ? (v as unknown[]).map(String) : v ? [String(v)] : [])
    .map((s) => stripLinks(s.replace(/<[^>]+>/g, '')).trim())
    .filter(Boolean)

const all = loadAon(DATA)
const LEGACY = legacyBooks(all)
/** Legacy and Golarion setting books: their sections are cut from every entry but a deity's. */
const CLOSED = closedBooks(all)
/** Every deity name AoN has, to leave out entries named for one (Achaekek's Clutch). */
const DEITY_NAMES = all.filter((d) => d.category === 'deity').map((d) => d.name)
const docs = all.filter(remaster)
const byId = new Map(docs.map((d) => [d.id, d]))
/**
 * What AoN shows in its search: not item activations or superseded printings it hides
 * (`exclude_from_search`), and not entries a newer remastered version replaced (`remaster_id`:
 * Rage of Elements' Arms of Nature by Divine Mysteries'). `byId` keeps them for inlined sections.
 */
const current = docs.filter(
  (d) =>
    !d.exclude_from_search &&
    !list(d.remaster_id).length &&
    (d.category === 'deity' || shareable(d, DEITY_NAMES)),
)
const of = (...cats: string[]) =>
  current
    .filter((d) => cats.includes(d.category))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))

/**
 * One record per reprint. AoN keeps some entries twice without linking them (Driver in Guns &
 * Gears and Player Core 2, the Eldest in Divine Mysteries and Feybound); the latest printing
 * is kept. `key` says when two entries are the same one: by default the same name.
 */
function latest(docs: AonDoc[], key = (d: AonDoc) => d.name.toLowerCase()) {
  const kept = new Map<string, AonDoc>()
  for (const d of docs) {
    const had = kept.get(key(d))
    if (!had || (d.release_date ?? '') > (had.release_date ?? '')) kept.set(key(d), d)
  }
  return docs.filter((d) => kept.get(key(d)) === d)
}

const ATTR: Record<string, Pf2eAttr> = {
  Strength: 'STR',
  Dexterity: 'DEX',
  Constitution: 'CON',
  Intelligence: 'INT',
  Wisdom: 'WIS',
  Charisma: 'CHA',
}
const RANK: Record<string, Pf2eRank> = {
  Untrained: 'U',
  Trained: 'T',
  Expert: 'E',
  Master: 'M',
  Legendary: 'L',
}
const COST: Record<string, 1 | 2 | 3 | 'reaction' | 'free'> = {
  'Single Action': 1,
  'Two Actions': 2,
  'Three Actions': 3,
  Reaction: 'reaction',
  'Free Action': 'free',
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number.parseFloat(String(v ?? '')) || 0)
/**
 * AoN's action field: one cost, a range or choice of costs in the type's words ("Single Action
 * to Three Actions" → "1 to 3", "Two Actions to 2 rounds" → "2 to 2 rounds"), or a time
 * ("1 minute").
 */
const cost = (v: unknown): Pf2eActionCost | undefined => {
  if (typeof v !== 'string' || !v.trim()) return undefined
  const one = COST[v.trim()]
  if (one !== undefined) return one
  return v
    .trim()
    .split(/ (or|to) /)
    .map((w, i) => (i % 2 ? w : (COST[w] ?? w.toLowerCase())))
    .join(' ')
}
const rank = (v: unknown) => RANK[String(v)] ?? 'U'

/** Splits an entry's markdown into its stat lines (`**Key** value`) and its rules text. */
function parts(d: AonDoc) {
  const md = withoutLegacy(
    cleanMarkdown(d.markdown ?? '', 1, byId),
    d.category === 'deity' ? LEGACY : CLOSED,
  )
  const lines = md.split('\n')
  if (lines[0]?.startsWith('# ')) lines.shift()
  const rule = lines.indexOf('---')
  const statLike = (l: string) => l.trim() === '' || /^\*\*[^*]+\*\*/.test(l)
  let head: string[]
  let body: string[]
  if (rule >= 0 && lines.slice(0, rule).every((l) => !l.startsWith('#'))) {
    head = lines.slice(0, rule)
    body = lines.slice(rule + 1)
  } else {
    let n = 0
    while (
      n < lines.length &&
      (statLike(lines[n]!) || (n > 0 && /^\*\*[^*]+\*\*\s*$/.test(lines[n - 1]!)))
    )
      n++
    head = lines.slice(0, n)
    body = lines.slice(n)
  }
  const stats: Record<string, string> = {}
  for (const m of head.join('\n').matchAll(/\*\*([^*]+)\*\*\s*([\s\S]*?)(?=\*\*[^*]+\*\*|$)/g))
    stats[m[1]!.trim()] = m[2]!.replace(/\s+/g, ' ').replace(/;\s*$/, '').trim()
  return { stats, text: withoutItemLists(body.join('\n')).trim() }
}

/**
 * AoN appends "Specific Magic Weapons / Armor / Shields" link lists to base items. They are
 * navigation, not book text, and name items (some legacy, some twice) that aren't in the data.
 */
const withoutItemLists = (md: string) =>
  md.replace(/^#+ Specific Magic (?:Weapons|Armor|Shields)\n[\s\S]*?(?=^#|(?![\s\S]))/gm, '')

function record(d: AonDoc): Pf2eRecord & { stats: Record<string, string> } {
  const { stats, text } = parts(d)
  const replaces = list(d.legacy_name)
  return {
    id: d.id,
    name: d.name,
    source: {
      book: (d.primary_source ?? '').trim(),
      ...opt('page', page(d) < 9999 ? page(d) : undefined),
    },
    rarity: (d.rarity ?? 'common') as Pf2eRarity,
    traits: list(d.trait),
    text,
    ...(replaces.length ? { replaces } : {}),
    stats,
  }
}

/** A record without the parsed stat lines, which only the builders below read. */
const base = (d: AonDoc) => {
  const { stats: _stats, ...rest } = record(d)
  return rest
}

const opt = <K extends string, V>(key: K, v: V | undefined | '') =>
  (v === undefined || v === '' ? {} : { [key]: v }) as Partial<Record<K, V>>

/** What AoN's entry leaves out that the book prints, kept as a note rather than guessed. */
const GAPS: Record<string, string> = {
  'Druidic Order':
    "AoN's order pages hold only the description: the order's trained skill, order feat and order spell are not in this data.",
  'ancestry:Awakened Animal':
    'AoN leaves Hit Points and Speed blank: the heritage (Climbing, Flying, Running or Swimming Animal) gives the Speed; the Hit Points are not in this data.',
  'ancestry:Merfolk':
    'AoN gives only the 5-foot land Speed; the merfolk swim Speed (which Sailfish Merfolk raises to 30 feet) is not in this data.',
}

const SKILLS = [
  'Acrobatics',
  'Arcana',
  'Athletics',
  'Crafting',
  'Deception',
  'Diplomacy',
  'Intimidation',
  'Medicine',
  'Nature',
  'Occultism',
  'Performance',
  'Religion',
  'Society',
  'Stealth',
  'Survival',
  'Thievery',
]

/**
 * Skills a subclass option's text says it trains ("You're trained in Intimidation", "trained in
 * Athletics, and Stealth"). The longer separators come first so ", and " isn't read as ", ".
 */
function trainedSkills(text: string) {
  const out = new Set<string>()
  for (const m of text.matchAll(
    /trained in ((?:[A-Z][\w']*(?: Lore)?(?:, and |, or |, | and | or )?)+)/g,
  ))
    for (const s of m[1]!.split(/,? and |,? or |, /))
      if (SKILLS.includes(s.trim())) out.add(s.trim())
  return [...out]
}

/** Splits a list at commas outside parentheses: "impulses (Elemental Blast, Base Kinesis)" stays one. */
function splitList(s: string) {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++
    else if (s[i] === ')') depth = Math.max(0, depth - 1)
    else if (s[i] === ',' && !depth) {
      out.push(s.slice(start, i))
      start = i + 1
    }
  }
  out.push(s.slice(start))
  return out.map((x) => x.trim()).filter(Boolean)
}

/** One apostrophe for names, so the class table and the feature list agree ("hunter’s edge"). */
const straight = (s: string) => s.replace(/[’‘]/g, "'")

/** Rows of the first markdown table whose header cells start with `head`. */
function tableRows(md: string, head: string[]) {
  const lines = md.split('\n')
  const cells = (l: string) =>
    l
      .slice(1, -1)
      .split('|')
      .map((c) => c.replace(/\*/g, '').trim())
  const at = lines.findIndex(
    (l) => l.startsWith('|') && head.every((h, i) => cells(l)[i]?.startsWith(h)),
  )
  if (at < 0) return []
  const rows: string[][] = []
  for (let i = at + 2; i < lines.length && lines[i]!.startsWith('|'); i++)
    rows.push(cells(lines[i]!))
  return rows
}

// --- Classes ------------------------------------------------------------------
const classDocs = of('class')
const classNames = [...new Set(classDocs.map((d) => d.name))]
const classes: Pf2eClassDef[] = classDocs.map((d) => {
  const full = cleanMarkdown(d.markdown ?? '', 1, byId)
  const advancement = tableRows(full, ['Your Level', 'Class Features']).map(([lvl, f]) => ({
    level: Number(lvl),
    features: splitList(straight(f ?? '')),
  }))
  const slots = tableRows(full, ['Your Level', 'Cantrips'])
    .filter(([lvl]) => /^\d+$/.test(lvl ?? ''))
    .map(([lvl, can, ...r]) => ({
      level: Number(lvl),
      cantrips: num(can),
      slots: Array.from({ length: 10 }, (_, i) => num(r[i])),
    }))
    // The psychic's table prints level 1 last.
    .sort((a, b) => a.level - b.level)
  const features = latest(of('class-feature').filter((f) => list(f.class).includes(d.name)))
    .map((f) => ({ id: f.id, name: straight(f.name), level: f.level ?? 1, text: record(f).text }))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
  const subclasses: Pf2eSubclassOption[] = latest(
    current.filter((s) => s.category !== 'class' && classOfType(s.type, classNames) === d.name),
    (s) => `${s.type}:${s.name.toLowerCase()}`,
  )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => {
      const { stats, ...b } = record(s)
      const kind = s.type ?? ''
      return {
        ...b,
        ...opt('gap', GAPS[kind]),
        kind,
        ...opt('level', typeof s.level === 'number' ? s.level : undefined),
        skills: list(s.skill).length ? list(s.skill) : trainedSkills(b.text),
        ...opt('lessonType', stats['Lesson Type']),
        ...opt('tacticType', stats['Tactic Type']),
        ...opt('usage', stats.Usage),
        ...opt('frequency', stats.Frequency),
        ...opt('requirements', stats.Requirements),
        ...opt('tradition', stats.Tradition),
        ...opt('homePlane', stats['Home Plane']),
      }
    })
  return {
    ...base(d),
    slug: slug(d.name),
    keyAttributes: list(d.attribute)
      .map((a) => ATTR[a])
      .filter((a): a is Pf2eAttr => !!a),
    hp: num(d.hp),
    perception: rank(d.perception_proficiency),
    saves: {
      fortitude: rank(d.fortitude_proficiency),
      reflex: rank(d.reflex_proficiency),
      will: rank(d.will_proficiency),
    },
    skills: list(d.skill_proficiency),
    attacks: list(d.attack_proficiency),
    defenses: list(d.defense_proficiency),
    traditions: list(d.tradition),
    advancement,
    ...(slots.length ? { spellSlots: slots } : {}),
    features,
    subclasses,
  }
})

// --- Ancestries, heritages, backgrounds ---------------------------------------
const ancestryDocs = latest(of('ancestry').filter((d) => d.type === 'Ancestry'))
const ancestryNames = ancestryDocs.map((d) => d.name)
const versatileDocs = latest(of('ancestry').filter((d) => d.type !== 'Ancestry'))
const versatileNames = new Set(versatileDocs.map((d) => d.name))
const FREE_BOOSTS = /^(one|two|three) free (?:ability|attribute) boosts?$/i
const COUNT: Record<string, number> = { one: 1, two: 2, three: 3 }
/** Boosts as attribute names or "Free": Human and Orc's "Two free ability boosts" is two "Free". */
const boosts = (v: unknown) =>
  list(v).flatMap((b) => {
    const n = COUNT[FREE_BOOSTS.exec(b)?.[1]?.toLowerCase() ?? '']
    return n ? Array<string>(n).fill('Free') : [b]
  })
/** Speeds the rules text grants ("a land Speed of 20 feet, a climb Speed of 20 feet"). */
function speedsIn(text: string) {
  const out: Pf2eSpeeds = {}
  for (const m of text.matchAll(/\b(land|climb|swim|fly|burrow) Speed of (\d+) feet/g))
    out[m[1] as keyof Pf2eSpeeds] ??= Number(m[2])
  return Object.keys(out).length ? out : undefined
}
const ancestries: Pf2eAncestryDef[] = ancestryDocs.map((d) => ({
  ...base(d),
  ...opt('gap', GAPS[`ancestry:${d.name}`]),
  slug: slug(d.name),
  hp: num(d.hp),
  size: list(d.size),
  speed: num((d.speed as { land?: number } | undefined)?.land),
  boosts: boosts(d.attribute),
  flaws: list(d.attribute_flaw),
  languages: list(d.language),
  ...opt('vision', typeof d.vision === 'string' ? d.vision : undefined),
}))
const ancestryPlaces = ancestryDocs.map(located)
const heritages: Pf2eHeritageDef[] = [
  ...latest(of('heritage').filter((d) => !versatileNames.has(d.name))).map((d) => {
    const a = heritageAncestry(located(d), ancestryPlaces)
    const b = base(d)
    return {
      ...b,
      ...opt('ancestry', a && slug(a)),
      versatile: false,
      ...opt('speeds', speedsIn(b.text)),
    }
  }),
  ...versatileDocs.map((d) => ({ ...base(d), versatile: true })),
]
const backgrounds: Pf2eBackgroundDef[] = latest(of('background')).map((d) => ({
  ...base(d),
  boosts: list(d.attribute),
  skills: list(d.skill),
  feats: list(d.feat),
}))

// --- Feats and spells ----------------------------------------------------------
const featLists = new Set([...ancestryNames, ...versatileNames])
/** Feats can share a name across classes and archetypes; only one at the same level with the same traits is a reprint. */
const featKey = (d: AonDoc) =>
  `${d.name.toLowerCase()}:${d.level}:${list(d.trait).sort().join(',')}`
const feats: Pf2eFeatDef[] = latest(of('feat'), featKey).map((d) => {
  const r = record(d)
  const traits = list(d.trait)
  const { stats, ...rest } = r
  return {
    ...rest,
    level: d.level ?? 1,
    ...opt('actions', cost(d.actions)),
    ...opt('prerequisites', stats.Prerequisites),
    ...opt('trigger', stats.Trigger),
    ...opt('requirements', stats.Requirements),
    ...opt('frequency', stats.Frequency),
    ...opt('cost', stats.Cost),
    ...opt('access', stats.Access),
    ...opt('usage', stats.Usage),
    ...opt('duration', stats.Duration),
    classes: traits.filter((t) => classNames.includes(t)),
    ancestries: traits.filter((t) => featLists.has(t)),
    archetypes: list(d.archetype),
    general: traits.includes('General'),
    skill: traits.includes('Skill'),
  }
})

const KIND: Record<string, Pf2eSpellDef['kind']> = {
  Spell: 'spell',
  Cantrip: 'cantrip',
  Focus: 'focus',
}
/** A spell's heightening: `step` from "(+N)", fixed `ranks` from "(4th)"; both for Zenith Star. */
function heightening(entries: string[], rank: number) {
  const step = entries.map((e) => /^\+(\d+)$/.exec(e)?.[1]).find(Boolean)
  const ranks = entries
    .map((e) => Number(/^(\d+)(?:st|nd|rd|th)$/.exec(e)?.[1]))
    .filter((r) => r > rank)
  return step || ranks.length ? { ...opt('step', step && Number(step)), ranks } : undefined
}
/** Spell link lines and the class whose focus spells they list. */
const LINKS: [keys: string[], field: keyof Pf2eSpellLinks, cls: string][] = [
  [['Domain', 'Domains'], 'domains', 'Cleric'],
  [['Bloodline', 'Bloodlines'], 'bloodlines', 'Sorcerer'],
  [['Mystery', 'Mysteries'], 'mysteries', 'Oracle'],
  [['Lesson', 'Lessons'], 'lessons', 'Witch'],
  [['Patron Theme', 'Patron Themes'], 'patronThemes', 'Witch'],
]
const spells: Pf2eSpellDef[] = latest(of('spell')).map((d) => {
  const { stats, ...rest } = record(d)
  const rank = d.level ?? 0
  const kind = KIND[d.spell_type ?? ''] ?? 'spell'
  const links: Pf2eSpellLinks = {}
  const linked: string[] = []
  for (const [keys, field, cls] of LINKS) {
    const names = keys.flatMap((k) => (stats[k] ? splitList(stats[k]) : []))
    if (!names.length) continue
    links[field] = names
    if (field !== 'patronThemes') linked.push(cls)
  }
  const amp = [...rest.text.matchAll(/\*\*Amp Heightened \(([^)]+)\)\*\*/g)].map((m) => m[1]!)
  const classes = list(d.trait).filter((t) => classNames.includes(t))
  return {
    ...rest,
    rank,
    kind,
    traditions: list(d.tradition),
    ...opt('actions', cost(d.actions)),
    ...opt('range', stats.Range),
    ...opt('area', stats.Area),
    ...opt('targets', stats.Targets ?? stats.Target),
    ...opt('duration', stats.Duration),
    ...opt('defense', stats.Defense ?? stats['Saving Throw']),
    ...opt('trigger', stats.Trigger),
    ...opt('requirements', stats.Requirements),
    ...opt('cost', stats.Cost),
    ...opt('heightened', heightening(list(d.heighten), rank)),
    ...opt('ampHeightened', heightening(amp, rank)),
    ...links,
    // A domain, bloodline, mystery or lesson spell is that class's focus spell even when AoN
    // gives it no class trait (Practice Makes Perfect, Serrate, Arms of Nature).
    classes: kind === 'focus' ? [...new Set([...classes, ...linked])] : [],
  }
})

// --- Equipment ----------------------------------------------------------------
const feet = (v: unknown) => Number(/-?\d+/.exec(String(v ?? ''))?.[0] ?? 0)
/** Reload in actions as printed, or the printed time when it isn't actions (a ballista's "1 minute"). */
const reload = (printed: string | undefined): number | string | undefined =>
  printed === undefined ? undefined : /^\d+$/.test(printed) ? Number(printed) : printed
const weapons: Pf2eWeaponDef[] = latest(of('weapon')).map((d) => ({
  ...base(d),
  level: d.level ?? 0,
  price: num(d.price),
  bulk: num(d.bulk),
  hands: String(d.hands ?? ''),
  damage: String(d.damage ?? '').split(' ')[0] ?? '',
  damageTypes: list(d.damage_type),
  category: String(d.weapon_category ?? ''),
  group: String(d.weapon_group ?? ''),
  type: d.weapon_type === 'Ranged' ? 'Ranged' : 'Melee',
  ...opt('range', typeof d.range === 'number' ? d.range : undefined),
  ...opt('reload', reload(record(d).stats.Reload)),
}))
const armor: Pf2eArmorDef[] = latest(of('armor')).map((d) => ({
  ...base(d),
  level: d.level ?? 0,
  price: num(d.price),
  bulk: num(d.bulk),
  category: String(d.armor_category ?? ''),
  ...opt('group', typeof d.armor_group === 'string' ? d.armor_group : undefined),
  ac: num(d.ac),
  ...opt('dexCap', typeof d.dex_cap === 'number' ? d.dex_cap : undefined),
  checkPenalty: num(d.check_penalty),
  speedPenalty: feet(d.speed_penalty),
  ...opt('strength', typeof d.strength === 'number' ? d.strength : undefined),
}))
const shields: Pf2eShieldDef[] = latest(of('shield')).map((d) => ({
  ...base(d),
  level: d.level ?? 0,
  price: num(d.price),
  bulk: num(d.bulk),
  ac: num(d.ac),
  hardness: num(d.hardness),
  hp: num(d.hp),
  speedPenalty: feet(d.speed_penalty),
}))

// --- Rules references -------------------------------------------------------
const conditions: Pf2eConditionDef[] = latest(of('condition')).map((d) => {
  const b = base(d)
  return { ...b, valued: /\bvalue\b/i.test(b.text) }
})
/** Actions with their own source line; item activations come with their items. */
const actions: Pf2eActionDef[] = latest(of('action'))
  .filter((d) => page(d) < 9999)
  .map((d) => {
    const { stats, ...rest } = record(d)
    return {
      ...rest,
      ...opt('actions', cost(d.actions)),
      ...opt('trigger', stats.Trigger),
      ...opt('requirements', stats.Requirements),
      ...opt('frequency', stats.Frequency),
      ...opt('cost', stats.Cost),
    }
  })
const traits = latest(of('trait')).map(base)

/** Lissala has two aspects with their own entries; a deity is its name and epithet. */
const deityKey = (d: AonDoc) => `${d.name.toLowerCase()}:${String(d.epithet ?? '').toLowerCase()}`
const deities: Pf2eDeityDef[] = latest(of('deity'), deityKey).map((d) => ({
  ...base(d),
  ...opt('epithet', typeof d.epithet === 'string' ? d.epithet : undefined),
  category: String(d.deity_category ?? ''),
  edicts: String(d.edict ?? ''),
  anathema: String(d.anathema ?? ''),
  areasOfConcern: list(d.area_of_concern),
  attributes: list(d.attribute)
    .map((a) => ATTR[a])
    .filter((a): a is Pf2eAttr => !!a),
  divineFont: list(d.divine_font),
  ...opt('sanctification', typeof d.sanctification === 'string' ? d.sanctification : undefined),
  skill: list(d.skill),
  favoredWeapons: list(d.favored_weapon),
  domains: list(d.domain_primary),
  alternateDomains: list(d.domain_alternate),
  clericSpells: list(d.cleric_spell),
}))

// --- Write --------------------------------------------------------------------
const sets: Record<string, { id: string; source: { book: string } }[]> = {
  classes,
  ancestries,
  heritages,
  backgrounds,
  feats,
  spells,
  weapons,
  armor,
  shields,
  conditions,
  actions,
  traits,
  deities,
}
mkdirSync(OUT, { recursive: true })
const books = new Set<string>()
for (const [name, rows] of Object.entries(sets)) {
  // Deities aren't ORC Licensed Material; their books are named in the Community Use line.
  if (name !== 'deities') for (const r of rows) books.add(r.source.book)
  writeFileSync(
    join(OUT, `${name}.json`),
    `[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`,
  )
  console.log(`${name}: ${rows.length}`)
}
writeFileSync(
  join(ROOT, 'data', 'pf2e', 'NOTICE.md'),
  `# Pathfinder 2e data notice

The files in \`generated/\` contain Licensed Material from Paizo Inc. under the ORC License, located at the Library of Congress at TX 9-307-067 and available online at various locations including paizo.com/orclicense and azoralaw.com/orclicense. All warranties are disclaimed as set forth therein.

**Attribution:** this data is based on the following Licensed Material, each © Paizo Inc.: ${[...books].filter(Boolean).sort().join('; ')}.

**Reserved Material:** Paizo's trademarks and setting material (such as Golarion's deities, nations, organizations and characters) are Reserved Material and are not licensed under the ORC License. Entries from Golarion setting books (the Lost Omens line, Adventure Paths, adventures, Society scenarios) and entries named for Golarion's deities, places or organizations are left out; such names appear only where an open rulebook's rules text mentions them.

**Community Use:** \`deities.json\` uses trademarks and/or copyrights owned by Paizo Inc., used under Paizo's Community Use Policy (paizo.com/licenses/communityuse); the deities come from ${[...new Set(deities.map((d) => d.source.book))].sort().join('; ')}. We are expressly prohibited from charging you to use or access this content. Lantern is not published, endorsed, or specifically approved by Paizo. For more information about Paizo Inc. and Paizo products, visit paizo.com.

Lantern is not published, endorsed or specifically approved by Paizo Inc. Text gathered from Archives of Nethys (2e.aonprd.com) and generated by \`scripts/pf2e-data.ts\`. Legacy (OGL) material and book art are not included.
`,
)
