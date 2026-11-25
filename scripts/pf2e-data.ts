// Writes the committed Pathfinder 2e rules data (`data/pf2e/generated/*.json`, typed in
// `data/pf2e/types.ts`) from the Archives of Nethys data in `.local/pf2e/aon/`. Remaster (ORC)
// entries from the open rulebooks only (`OPEN_BOOKS` in `scripts/lib/aon.ts`): legacy (OGL)
// entries, Golarion setting books (Lost Omens, Adventure Paths…), entries named for a deity or
// Golarion proper noun, the feats of setting archetypes (and those archetypes' names and
// dedications on other feats), the sections of those books AoN inlines or names in a lead,
// Pathfinder Society notes and the deity lists on weapons and spells are left out; the run
// fails if a closed book's name would still be written. Deities themselves are Paizo Reserved Material, kept under Paizo's Community
// Use Policy (the user's one exception). Also writes `data/pf2e/NOTICE.md` with the ORC and
// Community Use notices and the books used.
//
//   npm run pf2e:data -- [dataDir]

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  Pf2eActionCost,
  Pf2eActionDef,
  Pf2eAncestryDef,
  Pf2eArchetypeDef,
  Pf2eArmorDef,
  Pf2eBackgroundDef,
  Pf2eClassDef,
  Pf2eConditionDef,
  Pf2eDeityDef,
  Pf2eFeatDef,
  Pf2eHeritageDef,
  Pf2eItemDef,
  Pf2eItemKind,
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
  backgroundSkillText,
  classOfType,
  cleanMarkdown,
  closedArchetypeFeat,
  closedArchetypes,
  closedPrerequisite,
  heritageAncestry,
  closedBooks,
  closedTitlesIn,
  leadNamesClosed,
  legacyBooks,
  loadAon,
  located,
  openSource,
  page,
  remaster,
  settingName,
  shareable,
  skillNamesIn,
  slug,
  stripLinks,
  withoutClosedDedications,
  withoutClosedMentions,
  withoutLegacy,
} from './lib/aon'
import {
  bombNumbers,
  itemActivations,
  itemBonuses,
  itemDuration,
  itemGrades,
  itemHealing,
  runeNumbers,
  spellRankIn,
  staffSpells,
  withLowerSpells,
  withoutActivations,
} from './lib/aonItems'

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
/** Setting and legacy-only archetypes: their own feats go, other feats drop their names. */
const CLOSED_ARCHETYPES = closedArchetypes(all, DEITY_NAMES)
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
    (d.category === 'deity' || shareable(d, DEITY_NAMES)) &&
    !closedArchetypeFeat(d, CLOSED_ARCHETYPES) &&
    !closedPrerequisite(d, CLOSED_ARCHETYPES) &&
    (d.category === 'deity' ||
      !leadNamesClosed(cleanMarkdown(d.markdown ?? '', 1, new Map()), CLOSED)),
)
/** Prerequisites without the dedications of closed archetypes (Safe House's Bellflower Tiller). */
const prerequisites = (p: string | undefined) =>
  p === undefined ? undefined : withoutClosedDedications(p, CLOSED_ARCHETYPES)
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
  const closed = d.category === 'deity' ? LEGACY : CLOSED
  const md = withoutClosedMentions(
    withoutLegacy(cleanMarkdown(d.markdown ?? '', 1, byId), closed),
    closed,
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
    // The open rulebook that prints it, even when AoN files it under a setting reprint.
    source: {
      book: openSource(d) ?? (d.primary_source ?? '').trim(),
      ...opt('page', page(d, openSource(d)) < 9999 ? page(d, openSource(d)) : undefined),
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
        traditions: list(s.tradition),
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
/**
 * A background's skills from its "You're trained in…" text as well as AoN's skill field, which
 * misses some (The Hunted's Stealth and Survival) and lists a choice as if both were trained
 * (a hermit's Nature or Occultism). A field entry whose skills all come from the text goes;
 * prose naming no skill ("Lore related to the terrain you worked in") stays for the player.
 */
function backgroundSkills(d: AonDoc, text: string) {
  const read = backgroundSkillText(text)
  const chosen = new Set(read.choices.flatMap((c) => c.options))
  const known = new Set([...read.fixed, ...chosen])
  const field = list(d.skill).filter((e) => {
    const named = skillNamesIn(e)
    const plainName = named.length === 1 && e === named[0] && !chosen.has(e)
    return !named.length || plainName || !named.every((n) => known.has(n))
  })
  // Lores to name that AoN's field doesn't spell out (Reborn Soul's two).
  const prose = field.filter((e) => !skillNamesIn(e).length).length
  return {
    skills: [...new Set([...field, ...read.fixed]), ...read.lores.slice(prose)],
    ...opt('skillChoices', read.choices.length ? read.choices : undefined),
    ...opt('deitySkill', read.deitySkill || undefined),
  }
}
const backgrounds: Pf2eBackgroundDef[] = latest(of('background')).map((d) => {
  const b = base(d)
  return {
    ...b,
    boosts: list(d.attribute),
    ...backgroundSkills(d, b.text),
    feats: list(d.feat),
  }
})

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
    ...opt('prerequisites', prerequisites(stats.Prerequisites)),
    ...opt('trigger', stats.Trigger),
    ...opt('requirements', stats.Requirements),
    ...opt('frequency', stats.Frequency),
    ...opt('cost', stats.Cost),
    ...opt('access', stats.Access),
    ...opt('usage', stats.Usage),
    ...opt('duration', stats.Duration),
    classes: traits.filter((t) => classNames.includes(t)),
    ancestries: traits.filter((t) => featLists.has(t)),
    archetypes: list(d.archetype).filter((a) => !CLOSED_ARCHETYPES.has(a)),
    ...opt('archetypeLevels', archetypeLevels(stats.Archetype ?? stats.Archetypes, d.level ?? 1)),
    general: traits.includes('General'),
    skill: traits.includes('Skill'),
  }
})

/**
 * The level an archetype lists a feat at when it differs from the feat's own (Player Core
 * p. 215, Additional Feats): "Beastmaster (Level 6)" on Advanced Warden, a 4th-level feat.
 */
function archetypeLevels(line: string | undefined, level: number) {
  const out: Record<string, number> = {}
  for (const m of (line ?? '').matchAll(/([^,]+?)\s*\(Level (\d+)\)/g)) {
    const name = m[1]!.replace(/\*+$/, '').trim()
    if (!CLOSED_ARCHETYPES.has(name) && Number(m[2]) !== level) out[name] = Number(m[2])
  }
  return Object.keys(out).length ? out : undefined
}

// --- Archetypes -----------------------------------------------------------------
/**
 * An archetype's introduction and its "Multiclass X Characters" advice. The other sections
 * (AoN's Additional Feats boilerplate, follower lists) go, and so does every paragraph naming a
 * deity or Golarion proper noun: that lore is Reserved Material. Artifact and mythic archetypes
 * open with the history of a named item or ascension, so they keep no introduction at all.
 */
function archetypeText(text: string, categories: string[]) {
  if (categories.some((c) => c === 'Artifact' || c === 'Mythic')) return ''
  const sections = text.split(/^(?=#+ )/m)
  return sections
    .filter((sec, i) => i === 0 || /^#+ Multiclass .* Characters/.test(sec))
    .join('')
    .split(/\n{2,}/)
    .filter((para) => !/^Click here\b/.test(para.trim()) && !settingName(para, DEITY_NAMES))
    .join('\n\n')
    .trim()
}

/**
 * Archetypes (Player Core pp. 215–216): the archetype's own entry, without the feats AoN
 * embeds (they are in `feats`; an Additional Feat's level is its `archetypeLevels`). A mythic
 * archetype's dedication lacks the Dedication trait and is found by its name.
 */
const archetypes: Pf2eArchetypeDef[] = latest(of('archetype'))
  .filter((d) => !CLOSED_ARCHETYPES.has(d.name))
  .map((d) => {
    const { stats, ...rest } = record({
      ...d,
      markdown: (d.markdown ?? '').replace(/<document[\s\S]*?\/>/g, ''),
    })
    const dedication =
      feats.find((f) => f.traits.includes('Dedication') && f.archetypes.includes(d.name)) ??
      feats.find((f) => f.name.toLowerCase() === `${d.name} dedication`.toLowerCase())
    return {
      ...rest,
      text: archetypeText(rest.text, list(d.archetype_category)),
      level: d.level ?? dedication?.level ?? 2,
      categories: list(d.archetype_category),
      ...opt(
        'prerequisites',
        prerequisites(typeof d.prerequisite === 'string' ? d.prerequisite : stats.Prerequisites),
      ),
      ...opt('dedication', dedication?.id),
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
    // Focus spells and class cantrips (compositions, hexes, psi cantrips) carry their class's
    // trait; a domain, bloodline, mystery or lesson spell is that class's focus spell even when
    // AoN gives it no class trait (Practice Makes Perfect, Serrate, Arms of Nature).
    classes: kind === 'spell' ? [] : [...new Set([...classes, ...linked])],
  }
})

// --- Equipment ----------------------------------------------------------------
const feet = (v: unknown) => Number(/-?\d+/.exec(String(v ?? ''))?.[0] ?? 0)
/** Reload in actions as printed, or the printed time when it isn't actions (a ballista's "1 minute"). */
const reload = (printed: string | undefined): number | string | undefined =>
  printed === undefined ? undefined : /^\d+$/.test(printed) ? Number(printed) : printed
/**
 * Deadly and fatal carry a die size (Player Core p. 282) that AoN's trait list drops; the page's
 * trait labels keep it ("Deadly d8").
 */
function sizedTraits(d: AonDoc): string[] {
  const labels = [
    ...String(d.markdown ?? '').matchAll(/<trait label="(Deadly|Fatal)\s+1?d(\d+)"/gi),
  ].map((l) => `${l[1]} d${l[2]}`)
  return list(d.trait).map((t) => labels.find((l) => l.startsWith(`${t} `)) ?? t)
}
const weapons: Pf2eWeaponDef[] = latest(of('weapon')).map((d) => ({
  ...base(d),
  traits: sizedTraits(d),
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

// --- Other equipment (GM Core chapter 11, Player Core pp. 287–295) -------------
/** AoN's item categories → the sets they go in and what each item is. */
const ITEM_SETS: Record<string, (d: AonDoc) => Pf2eItemKind | undefined> = {
  gear: (d) => (d.item_category === 'Adventuring Gear' ? 'gear' : undefined),
  consumables: (d) =>
    (
      ({
        Potions: 'potion',
        'Alchemical Elixirs': 'elixir',
        Scrolls: 'scroll',
        Talismans: 'talisman',
        'Magical Ammunition': 'ammunition',
        'Alchemical Ammunition': 'ammunition',
        Oils: 'oil',
        'Alchemical Bombs': 'bomb',
      }) as Record<string, Pf2eItemKind>
    )[String(d.item_subcategory ?? '')],
  magicItems: (d) =>
    d.item_category === 'Held Items'
      ? 'held'
      : d.item_category === 'Worn Items' && d.item_subcategory === 'Other Worn Items'
        ? 'worn'
        : undefined,
  runes: (d) =>
    d.item_category === 'Runes' &&
    /^(?:Fundamental|Weapon Property|Armor Property)/.test(String(d.item_subcategory ?? ''))
      ? 'rune'
      : undefined,
  staves: (d) => (d.item_category === 'Staves' && !d.item_subcategory ? 'staff' : undefined),
  wands: (d) => (d.item_category === 'Wands' ? 'wand' : undefined),
}

const spellKey = (n: string) => straight(n).toLowerCase()
const spellNames = new Map(spells.map((s) => [spellKey(s.name), s.name]))
/**
 * A staff's spells by their names in the data (the book prints them in lowercase); a limit in
 * brackets stays ("Elemental Form (air only)"). A name the data doesn't have (a legacy spell
 * a reprinted staff still lists) stays as printed.
 */
const namedSpells = (list: { rank: number; names: string[] }[]) =>
  list.map(({ rank, names }) => ({
    rank,
    names: names.map((n) => {
      const [, spell = n, limit = ''] = /^(.*?)(\s*\([^)]*\))?$/.exec(n.trim()) ?? []
      const named = spellNames.get(spellKey(spell))
      return named ? `${named}${limit}` : n
    }),
  }))

/**
 * One record per item the hero can own: each grade of an item printed with several (its text
 * is the item's own followed by the grade's), else the item itself; an entry without a Price
 * (a family's summary page) is left out. Staff types keep their lower types' spells.
 */
function itemSet(kindOf: (d: AonDoc) => Pf2eItemKind | undefined): Pf2eItemDef[] {
  const docs = current.filter((d) => d.category === 'equipment' && kindOf(d))
  const owned = latest(
    docs.filter((d) =>
      d.item_parent_id ? true : !list(d.item_child_id).length && d.price !== undefined,
    ),
  )
  const staffLists = new Map<string, { rank: number; names: string[] }[]>()
  // In level order, so each staff type keeps the spells of the ones below it.
  return [...owned]
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
    .map((d) => {
      const parent = d.item_parent_id ? byId.get(String(d.item_parent_id)) : undefined
      const kind = kindOf(d)!
      const { stats, text: whole } = record(parent ?? d)
      const { text: own, grades } = itemGrades(whole)
      const grade = parent ? (grades.find((g) => g.name === d.name)?.text ?? '') : ''
      const text = [own, grade].filter(Boolean).join('\n\n')
      const usage = String(d.usage ?? parent?.usage ?? stats.Usage ?? '') || undefined
      const sub = String(d.item_subcategory ?? '')
      const numbers: Partial<Pf2eItemDef> = {}
      const healing = itemHealing(grade) ?? itemHealing(own)
      if (healing) numbers.healing = healing
      if (kind === 'bomb') {
        const bomb = bombNumbers(grade) ?? bombNumbers(own)
        if (bomb) numbers.bomb = bomb
      } else if (kind !== 'rune') {
        // A permanent item's activations aren't constant bonuses (Bracers of Missile
        // Deflection's +2 is against the triggering attack only).
        const consumable = d.trait?.includes('Consumable')
        const bonuses = consumable
          ? itemBonuses(own, grade)
          : itemBonuses(withoutActivations(own), withoutActivations(grade))
        if (bonuses.length) numbers.bonuses = bonuses
      }
      if (['potion', 'elixir', 'oil', 'talisman', 'ammunition'].includes(kind)) {
        const duration = itemDuration(own, grade)
        if (duration) numbers.duration = duration
      }
      if (kind === 'rune') numbers.rune = runeNumbers(d.name, sub, usage ?? '', text)
      if (kind === 'scroll' || kind === 'wand') {
        const rank = spellRankIn(d.name)
        if (rank) numbers.spellRank = rank
      }
      if (kind === 'staff') {
        const key = String(parent?.id ?? d.id)
        const all = withLowerSpells(staffLists.get(key) ?? [], staffSpells(grade || own))
        staffLists.set(key, all)
        numbers.spells = namedSpells(all)
      }
      return {
        ...base(d),
        text,
        kind,
        ...opt('parent', parent?.id),
        level: d.level ?? 0,
        price: num(d.price),
        bulk: num(d.bulk ?? parent?.bulk),
        ...opt('usage', usage),
        activations: itemActivations(stats, text),
        ...numbers,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}
const itemSets = Object.fromEntries(
  Object.entries(ITEM_SETS).map(([name, kindOf]) => [name, itemSet(kindOf)]),
)

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
  archetypes,
  spells,
  weapons,
  armor,
  shields,
  ...itemSets,
  conditions,
  actions,
  traits,
  deities,
}
/**
 * What the committed data must never hold (fails the run): a left-out book named in a record,
 * a deity's own source aside, or a Pathfinder Society note. The closed titles go to the test
 * fixture `tests/fixtures/pf2e/closed-books.json` so the data test can check without AoN.
 */
const leaks: string[] = []
for (const [name, rows] of Object.entries(sets))
  for (const r of rows) {
    const { source: _source, ...rest } = r
    const json = JSON.stringify(name === 'deities' ? rest : r)
    const named = closedTitlesIn(json, name === 'deities' ? LEGACY : CLOSED)
    if (named.length) leaks.push(`${name} ${r.id}: ${named.join(', ')}`)
    if (/PFS Note/.test(json)) leaks.push(`${name} ${r.id}: PFS Note`)
  }
if (leaks.length) {
  console.error(`The data would name ${leaks.length} left-out source(s):\n${leaks.join('\n')}`)
  process.exit(1)
}
const FIXTURES = join(ROOT, 'tests', 'fixtures', 'pf2e')
mkdirSync(FIXTURES, { recursive: true })
writeFileSync(
  join(FIXTURES, 'closed-books.json'),
  `${JSON.stringify({ closed: [...CLOSED].sort(), legacy: [...LEGACY].sort() }, null, 2)}\n`,
)

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
