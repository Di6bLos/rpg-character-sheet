// Reading the Archives of Nethys data (`.local/pf2e/aon/*.json.gz`, pulled from the search
// backend 2e.aonprd.com uses) for the PF2e scripts: loading, the Remaster/Legacy split,
// AoN's markup turned into plain markdown, and the heritage → ancestry match AoN doesn't store.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

/** One AoN search document; only the fields the scripts read are typed. */
export interface AonDoc {
  id: string
  category: string
  name: string
  type?: string
  markdown?: string
  url?: string
  level?: number
  rarity?: string
  trait?: string[]
  archetype?: string[]
  class?: string | string[]
  spell_type?: string
  item_category?: string
  primary_source?: string
  release_date?: string
  remaster_name?: string[]
  legacy_name?: string[]
  breadcrumbs?: string[]
  next_link?: { url: string }
  previous_link?: { url: string }
  [field: string]: unknown
}

/** Rage of Elements (Aug 2023) is the first book published under ORC. */
export const ORC_FROM = '2023-08-01'

export function remaster(d: AonDoc) {
  return (d.release_date ?? '') >= ORC_FROM
}

export function loadAon(dir: string): AonDoc[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json.gz'))
    .flatMap((f) => JSON.parse(gunzipSync(readFileSync(join(dir, f))).toString('utf8')) as AonDoc[])
}

/**
 * Books published before ORC. AoN inlines some of their sections (Critical Specialization
 * Effects, income tables) into remastered pages, so ORC output drops those by source line.
 */
export function legacyBooks(docs: AonDoc[]) {
  const books = new Set(
    docs.filter((d) => !remaster(d) && d.primary_source).map((d) => d.primary_source!),
  )
  for (const d of docs) if (remaster(d) && d.primary_source) books.delete(d.primary_source)
  for (const d of docs)
    if (d.category === 'source' && !remaster(d)) {
      books.add(d.name)
      books.add(d.name.replace(/^The /, ''))
    }
  return books
}

/**
 * The setting-neutral rulebooks: the only books the shareable set (the ORC bible, the library
 * PDFs, the committed data) takes entries from. Everything else AoN carries is Golarion
 * setting, Paizo Reserved Material even when published under ORC: the Lost Omens line
 * (Divine Mysteries, Tian Xia Character Guide, Hellfire Dispatches…), Adventure Paths and
 * their player's guides, standalone adventures, Society scenarios, comics, April Fools and
 * blog posts. AoN also files "Secrets of the Unlit Star Game Master's Guide" under
 * Rulebooks; it is left out until someone checks it. Deities are the one exception the user
 * approved (Community Use Policy, see `.claude/skills/rpg-rules/references/licensing.md`).
 */
export const OPEN_BOOKS = new Set([
  'Player Core',
  'Player Core 2',
  'GM Core',
  'Monster Core',
  'Monster Core 2',
  'NPC Core',
  'Rage of Elements',
  'Howl of the Wild',
  'War of Immortals',
  'War of Immortals Alternate Mythic Rules',
  'Battlecry!',
  'Impossible Magic',
  'Feybound',
  'Dark Archive (Remastered)',
  'Guns & Gears (Remastered)',
  'Treasure Vault (Remastered)',
])

export const openBook = (book: string | undefined) => OPEN_BOOKS.has((book ?? '').trim())

/**
 * Golarion proper nouns that make a record setting material by its name, even in an open
 * rulebook (Aldori Parry, Hellknight Plate, Alkenstar Outlaw): nations, regions and cities,
 * peoples, organizations, and named characters (Jassim's Allegiance). Deities are checked
 * from the deity entries themselves.
 */
export const GOLARION_NAMES = [
  'Golarion',
  'Absalom',
  'Starstone',
  'Inner Sea',
  'Avistan',
  'Garund',
  'Tian Xia',
  'Casmaron',
  'Arcadia',
  'Varisia',
  'Varisian',
  'Cheliax',
  'Chelish',
  'Chelaxian',
  'Taldor',
  'Taldan',
  'Andoran',
  'Galt',
  'Isger',
  'Molthune',
  'Nirmathas',
  'Lastwall',
  'Ustalav',
  'Brevoy',
  'River Kingdoms',
  'Mendev',
  'Numeria',
  'Irrisen',
  'Mammoth Lords',
  'Belkzen',
  'Nidal',
  'Druma',
  'Kyonin',
  'Five Kings',
  'Mana Wastes',
  'Geb',
  'Nex',
  'Alkenstar',
  'Jistka',
  'Jistkan',
  'Osirion',
  'Osirian',
  'Thuvia',
  'Rahadoum',
  'Katapesh',
  'Qadira',
  'Kelesh',
  'Keleshite',
  'Vudra',
  'Vudrani',
  'Jalmeray',
  'Mwangi',
  'Sargava',
  'Shackles',
  'Thassilon',
  'Thassilonian',
  'Azlant',
  'Azlanti',
  'Sarkoris',
  'Worldwound',
  'Razmiran',
  'Korvosa',
  'Magnimar',
  'Riddleport',
  'Sandpoint',
  'Kaer Maga',
  'Oppara',
  'Egorian',
  'Kintargo',
  'Westcrown',
  'Brastlewark',
  'Highhelm',
  'Dongun',
  'Iblydos',
  'Minkai',
  'Goka',
  'Quain',
  'Shokuro',
  'Lingshen',
  'Xa Hoi',
  'Dtang Ma',
  'Hwanggot',
  'Po Li',
  'Bachuan',
  'Jinin',
  'Kwanlai',
  'Impossible Lands',
  'Mordant Spire',
  'Ravounel',
  'Kortos',
  'Darklands',
  'Nar-Voth',
  'Sekamina',
  'Stasian',
  'Ulfen',
  'Kellid',
  'Garundi',
  'Shoanti',
  'Erutaki',
  'Shory',
  'Runelord',
  'Sihedron',
  'Pathfinder',
  'Hellknight',
  'Aldori',
  'Swordlord',
  'Red Mantis',
  'Eagle Knight',
  'Golden Legion',
  'Gray Gardener',
  'Lion Blade',
  'Magaambya',
  'Firebrand',
  'Bellflower',
  'Aspis',
  'Whispering Way',
  'Night Herald',
  'Free Captain',
  'Knights of Ozem',
  'Ozem',
  'Palatine Eye',
  'Arclord',
  'Twilight Talon',
  'Grand Lodge',
  'Jassim',
]

/**
 * Records whose name matches a deity or Golarion name by accident: "Set" in Set-up Strike and
 * a writing set (Player Core p. 292), a spell named like a philosophy.
 */
export const NOT_SETTING = new Set([
  'Set-up Strike',
  'Weight of the World',
  'Writing Set',
  'Writing Set (Extra Ink and Paper)',
])

const nameRe = (names: string[]) =>
  new RegExp(
    `(?:^|[^\\w])(${[...new Set(names)]
      .sort((a, b) => b.length - a.length)
      .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|')})(?=$|[^\\w])`,
  )

/**
 * The deity or Golarion name a record is named for (Achaekek's Clutch → Achaekek), if any.
 * `deities` are deity names; an epithet in parentheses is ignored.
 */
const settingRes = new WeakMap<string[], RegExp>()
export function settingName(name: string, deities: string[]) {
  if (NOT_SETTING.has(name)) return undefined
  let re = settingRes.get(deities)
  if (!re) {
    re = nameRe([...GOLARION_NAMES, ...deities.map((d) => d.replace(/\s*\(.*\)$/, ''))])
    settingRes.set(deities, re)
  }
  return re.exec(name)?.[1]
}

/**
 * Whether an entry belongs in the shareable set: printed in an open rulebook and not named for
 * a deity or Golarion proper noun. Deities themselves are judged by the caller.
 */
export const shareable = (d: AonDoc, deities: string[]) =>
  openBook(d.primary_source) && !settingName(d.name, deities)

/**
 * Books a shareable output leaves out wherever they're cited: legacy (OGL) books, and every
 * book that isn't an open rulebook, whose sections AoN sometimes inlines into rulebook pages.
 */
export function closedBooks(docs: AonDoc[]) {
  const books = legacyBooks(docs)
  for (const d of docs)
    for (const b of [d.primary_source, ...(d.category === 'source' ? [d.name] : [])])
      if (b && !openBook(b)) books.add(b.trim())
  return books
}

/** AoN's action names → glyphs; ranges ("Single Action to Three Actions") are built from these. */
export const ACTIONS: Record<string, string> = {
  'Single Action': '◆',
  'Two Actions': '◆◆',
  'Three Actions': '◆◆◆',
  Reaction: '↺',
  'Free Action': '◇',
}

/**
 * Glyphs for an AoN action string: one cost, or a range or choice of costs ("Single Action
 * to Three Actions" → "◆ to ◆◆◆"); a part with no glyph ("2 rounds") stays as words.
 */
export const actionGlyph = (s: string) =>
  s
    .split(/ (or|to) /)
    .map((p, i) => (i % 2 ? p : (ACTIONS[p] ?? p.replace(/ Actions?$/, '').toLowerCase())))
    .join(' ')

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** First printed page in the entry's source line. */
export const page = (d: AonDoc) =>
  Number(/\*\*Source\*\*[\s\S]{0,300}?pg\. (\d+)/.exec(d.markdown ?? '')?.[1] ?? 9999)

export const stripLinks = (s: string) => s.replace(/\[([^\]]*)\]\((?:[^()]|\([^)]*\))*\)/g, '$1')

/**
 * An HTML table as a markdown one. A `rowspan` cell repeats in each row it covers and a
 * `colspan` cell takes its first column, the rest left blank; rows AoN leaves empty under a
 * rowspan (`<tr></tr>`) are dropped once filled, since they only repeat the row above.
 */
export function table(html: string) {
  const rows: string[][] = []
  const carry: { text: string; left: number }[] = []
  for (const r of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...(r[1] ?? '').matchAll(/<t[hd]([^>]*)>([\s\S]*?)<\/t[hd]>/g)]
    const row: string[] = []
    let col = 0
    const fill = () => {
      while (carry[col]?.left) {
        row[col] = carry[col]!.text
        carry[col]!.left--
        col++
      }
    }
    for (const [, attrs = '', inner = ''] of cells) {
      fill()
      const text = stripLinks(inner.replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .replace(/\|/g, '\\|')
        .trim()
      const down = Number(/rowspan="(\d+)"/.exec(attrs)?.[1] ?? 1)
      const across = Number(/colspan="(\d+)"/.exec(attrs)?.[1] ?? 1)
      for (let k = 0; k < across; k++) {
        row[col] = k ? '' : text
        if (down > 1) carry[col] = { text: row[col]!, left: down - 1 }
        col++
      }
    }
    fill()
    for (let i = col; i < carry.length; i++)
      if (carry[i]?.left) {
        row[i] = carry[i]!.text
        carry[i]!.left--
      }
    if (cells.length) rows.push(Array.from(row, (c) => c ?? ''))
  }
  if (!rows.length) return ''
  const width = Math.max(...rows.map((r) => r.length))
  const line = (r: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`
  return `\n${line(rows[0] ?? [])}\n| ${Array(width).fill('---').join(' | ')} |\n${rows.slice(1).map(line).join('\n')}\n`
}

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹'
/** A footnote mark: digits as superscripts ("+4²"), anything else after a caret ("^R"). */
const footnote = (mark: string) =>
  /^\d+$/.test(mark) ? [...mark].map((d) => SUPERSCRIPT[Number(d)]).join('') : `^${mark}`

/**
 * AoN's markup → plain markdown; `h` is the heading level of the entry's own title.
 * `<document>` references are inlined from `byId`, each reported to `onEmbed`.
 */
export function cleanMarkdown(
  md: string,
  h: number,
  byId: Map<string, AonDoc>,
  onEmbed: (id: string) => void = () => {},
  seen = new Set<string>(),
): string {
  let s = md.replace(
    /<document level="(\d+)" id="([^"]+)"\s*\/>/g,
    (_, lvl: string, id: string) => {
      const sub = byId.get(id)
      if (!sub?.markdown || seen.has(id) || seen.size > 6) return ''
      onEmbed(id)
      return `\n${cleanMarkdown(sub.markdown, h + Number(lvl) - 1, byId, onEmbed, new Set([...seen, id]))}\n`
    },
  )
  // A few pages use an HTML heading, one of them closed by `</title>` (Human's Ethnicities).
  s = s.replace(
    /<h([1-6])[^>]*>([\s\S]*?)<\/(?:h\1|title)>/g,
    (_, lvl: string, inner: string) =>
      `\n${'#'.repeat(Math.min(6, h + Number(lvl) - 1))} ${inner.replace(/<[^>]+>/g, '').trim()}\n`,
  )
  s = s.replace(/<title([^>]*)>([\s\S]*?)<\/title>/g, (_, attrs: string, inner: string) => {
    const lvl = Number(/level="(\d+)"/.exec(attrs)?.[1] ?? 1)
    const right = /right="([^"]*)"/.exec(attrs)?.[1]?.trim()
    const text = stripLinks(
      inner.replace(/<actions string="([^"]*)"\s*\/>/g, (_m, a: string) => actionGlyph(a)),
    )
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    const shown = right && /\d/.test(right) ? ` · ${right}` : ''
    return `\n${'#'.repeat(Math.min(6, h + lvl - 1))} ${text}${shown}\n`
  })
  s = s.replace(/<traits>([\s\S]*?)<\/traits>/g, (_, inner: string) => {
    const labels = [...inner.matchAll(/label="([^"]*)"/g)].map((m) => m[1])
    return labels.length ? `\n**Traits** ${labels.join(', ')}\n` : ''
  })
  s = s.replace(/( ?)<actions string="([^"]*)"\s*\/>/g, (_, sp: string, a: string) =>
    actionGlyph(a) ? `${sp}${actionGlyph(a)}` : '',
  )
  // AoN's own spoiler warnings ("Nethys Note: This page contains HUGE SPOILERS…") are not book text.
  s = s.replace(/(?:\*\*_|_\*\*)Nethys Note:[^*]*?spoilers[^*]*?(?:_\*\*|\*\*_)/gi, '')
  s = s.replace(/<sup>\s*([^<]*?)\s*<\/sup>/g, (_, mark: string) => footnote(mark))
  s = s.replace(/<table[\s\S]*?<\/table>/g, table)
  s = s
    .replace(/<li[^>]*>/g, '\n- ')
    .replace(/<\/li>|<\/?[uo]l[^>]*>/g, '')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<hr\s*\/?>/g, '\n---\n')
    .replace(/<image[^>]*\/?>(?:<\/image>)?/g, '')
    .replace(/<\/?[a-z][a-z0-9-]*(?:\s[^>]*)?\/?>/g, '')
  return stripLinks(s)
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const SOURCE_LINE = /^\*\*Source\*\* (.+)$/

/**
 * The books a `**Source**` line cites, in order: "Player Core pg. 150, Core Rulebook pg. 165"
 * → both. A book name may hold a comma ("Cheliax, Infernal Inheritance"), so entries are
 * split after each page number, not at every comma.
 */
export function sourceBooks(line: string) {
  const rest = SOURCE_LINE.exec(line.trim())?.[1]
  if (!rest) return []
  const cited = [...rest.matchAll(/(?:^|, )(.+?) pg\. \d+/g)].map((m) => m[1]!.trim())
  return cited.length ? cited : [rest.trim()]
}

/**
 * Drops each subsection whose own source line (before its next heading) cites only books in
 * `legacy` (the books to leave out) or is titled with one of them, and takes those books out
 * of every source line that also cites another ("Player Core pg. 150, Core Rulebook pg. 165"
 * → "Player Core pg. 150").
 */
export function withoutLegacy(md: string, legacy: Set<string>) {
  const lines = md.split('\n')
  const out: string[] = []
  const heading = (l: string) => /^(#{1,6}) /.exec(l)
  let skip = 0
  lines.forEach((line, i) => {
    const head = heading(line)
    if (head) {
      const lvl = head[1]!.length
      if (skip && lvl <= skip) skip = 0
      if (!skip) {
        const next = lines.slice(i + 1).findIndex((l) => heading(l))
        const block = lines.slice(i + 1, next < 0 ? undefined : i + 1 + next)
        const books = sourceBooks(block.find((l) => SOURCE_LINE.test(l)) ?? '')
        // A section titled with a left-out book (Avatar's forms per book) is that book's too.
        const titled = legacy.has(line.slice(lvl + 1).trim())
        if (titled || (books.length && books.every((b) => legacy.has(b)))) skip = lvl
      }
    }
    if (skip) return
    const rest = SOURCE_LINE.exec(line)?.[1]
    if (!rest) return out.push(line)
    const cited = [...rest.matchAll(/(?:^|, )((.+?) pg\. \d+)/g)]
    const kept = cited.filter((m) => !legacy.has(m[2]!.trim())).map((m) => m[1])
    out.push(cited.length && kept.length ? `**Source** ${kept.join(', ')}` : line)
  })
  return out.join('\n')
}

/** Stat lines that list deities: Reserved Material, left out of the shareable set. */
const DEITY_STAT = /^\*\*(?:Deity|Deities|Favored Weapons?)\*\*/

/**
 * Drops the deity stat lines (`**Deities**` on spells and domains, `**Favored Weapon**` on
 * weapons) with their values, which AoN prints on the same line or the lines below.
 */
export function withoutDeities(md: string) {
  const out: string[] = []
  let dropping = false
  for (const line of md.split('\n')) {
    if (DEITY_STAT.test(line)) dropping = true
    else if (dropping && (line.trim() === '' || /^(#|\*\*[^*]+\*\*)/.test(line))) dropping = false
    if (!dropping) out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

/** Lines that must not reach a shareable (ORC) output: a legacy book cited, a deity stat line. */
export function orcProblems(md: string, legacy: Set<string>, archetypes = new Set<string>()) {
  return md
    .split('\n')
    .filter(
      (l) =>
        sourceBooks(l).some((b) => legacy.has(b)) ||
        DEITY_STAT.test(l) ||
        lineArchetypes(l).some((a) => archetypes.has(a)),
    )
}

/**
 * Archetypes the shareable set leaves out, by name. Each is judged by its own record, the
 * newest remastered one when there is one: kept only when printed in an open rulebook and not
 * named for a deity or Golarion proper noun. So setting archetypes (Hellknight, Red Mantis
 * Assassin, Aldori Duelist) go, and so do archetypes only printed in legacy books (Shadowdancer,
 * Lich), which aren't in the ORC set either.
 */
export function closedArchetypes(docs: AonDoc[], deities: string[]) {
  const newest = new Map<string, AonDoc>()
  const order = (d: AonDoc) => `${Number(remaster(d))}:${d.release_date ?? ''}`
  for (const d of docs.filter((x) => x.category === 'archetype')) {
    const had = newest.get(d.name)
    if (!had || order(d) > order(had)) newest.set(d.name, d)
  }
  return new Set(
    [...newest.values()].filter((d) => !remaster(d) || !shareable(d, deities)).map((d) => d.name),
  )
}

/**
 * A feat of closed archetypes only: it has the archetype trait and every archetype it lists is
 * closed (Aldori Parry, a Red Mantis Assassin skill feat). A class feat that an archetype also
 * offers keeps its place and loses only the archetype's name.
 */
export const closedArchetypeFeat = (d: AonDoc, closed: Set<string>) =>
  (d.trait ?? []).includes('Archetype') &&
  !!d.archetype?.length &&
  d.archetype.every((a) => closed.has(a))

const ARCHETYPE_LINE = /^\*\*Archetypes?\*\* (.+)$/
const archetypeItem = (item: string) =>
  item
    .replace(/\s*\(Level \d+\)\s*$/, '')
    .replace(/\*+$/, '')
    .trim()
/** The archetypes an `**Archetype(s)**` stat line names ("Hellknight (Level 8)" → Hellknight). */
const lineArchetypes = (line: string) =>
  (ARCHETYPE_LINE.exec(line.trim())?.[1] ?? '').split(', ').map(archetypeItem).filter(Boolean)

/**
 * Takes closed archetypes out of the `**Archetype(s)**` stat lines ("Vigilante (Level 4),
 * Red Mantis Assassin (Level 4)" → "Vigilante (Level 4)"); a line left empty goes.
 */
export function withoutArchetypes(md: string, closed: Set<string>) {
  return md
    .split('\n')
    .flatMap((line) => {
      const m = ARCHETYPE_LINE.exec(line)
      if (!m) return [line]
      const kept = m[1]!.split(', ').filter((item) => !closed.has(archetypeItem(item)))
      if (!kept.length) return []
      return [`**Archetype${kept.length > 1 ? 's' : ''}** ${kept.join(', ')}`]
    })
    .join('\n')
}

/**
 * Heritages whose name doesn't say their ancestry: the legacy half-elf and half-orc (full,
 * non-ORC bible only), rat heritages, and Dijiang, a sprite heritage (Tian Xia Character
 * Guide p. 46, beside Gandharva, Kanchil and Leungli Sprite; Sprite's Spark names it).
 */
const HERITAGE_ALIASES: [RegExp, string][] = [
  [/^Half-(Elf|Orc)$/, 'Human'],
  [/\bRat\b/, 'Ratfolk'],
  [/^Dijiang$/, 'Sprite'],
]

/** An entry's name with the book and printed page it starts on. */
export interface Placed {
  name: string
  book: string
  page: number
}

export const located = (d: AonDoc): Placed => ({
  name: d.name,
  book: d.primary_source ?? '',
  page: page(d),
})

/** How far past its ancestry's first page a heritage may print and still be the ancestry's own. */
const HERITAGE_PAGES = 6

/**
 * The ancestry a heritage belongs to (AoN stores no link): an alias, then the ancestry the
 * name ends with, then one it names; failing those, the ancestry printed just before it in
 * the same book, within a few pages (Climbing Animal → Awakened Animal, Shadow of the Smith →
 * Wayang, House Drake → Dragonet).
 */
export function heritageAncestry(heritage: Placed, ancestries: Placed[]) {
  const names = [...new Set(ancestries.map((a) => a.name))].sort((a, b) => b.length - a.length)
  const name = heritage.name
  const alias = HERITAGE_ALIASES.find(([re, a]) => re.test(name) && names.includes(a))
  if (alias) return alias[1]
  const words = name.split(/[\s-]+/)
  const named =
    names.find((n) => name.endsWith(n)) ??
    names.find((n) => words.includes(n)) ??
    names.find((n) => name.includes(n))
  if (named) return named
  return ancestries
    .filter(
      (a) =>
        a.book === heritage.book &&
        heritage.page >= a.page &&
        heritage.page - a.page <= HERITAGE_PAGES,
    )
    .sort((a, b) => b.page - a.page)[0]?.name
}

/** Subclass types whose name doesn't start with their class's. */
const TYPE_CLASS: Record<string, string> = {
  'Druidic Order': 'Druid',
  'Animistic Practice': 'Animist',
}

/** The class a subclass option's type belongs to ("Bard Muse" → Bard), if any. */
export const classOfType = (type: string | undefined, classes: string[]) =>
  TYPE_CLASS[type ?? ''] ?? classes.find((c) => (type ?? '').startsWith(`${c} `))

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
const skillsIn = (s: string) => SKILLS.filter((k) => new RegExp(`\\b${k}\\b`).test(s))
/** Proper-named Lores ("the First World Lore skill"), not "a Lore skill of your choice". */
const loresIn = (s: string) =>
  [...s.matchAll(/\b((?:[A-Z][\w'-]*)(?: (?:of|[A-Z][\w'-]*))* Lore)\b/g)].map((m) => m[1]!)

/** Skills and named Lores a phrase mentions, leaving out examples in brackets. */
export const skillNamesIn = (s: string) => {
  const plain = s.replace(/\([^)]*\)/g, '').replace(/\bLore Lore\b/g, 'Lore')
  return [...skillsIn(plain), ...loresIn(plain)]
}

/** What a background's "You're trained in…" sentences say, for skills AoN's skill field leaves out. */
export interface BackgroundSkillText {
  /** Skills and named Lores it trains outright ("both the Stealth and Survival skills"). */
  fixed: string[]
  /** "Your choice of the Arcana, Nature, Occultism, or Religion skill"; no options = any skill. */
  choices: { options: string[]; count: number }[]
  /** "Your deity's associated skill" (Raised by Belief). */
  deitySkill: boolean
  /** Lores the player names, one entry each, in the book's words ("Lore related to…"). */
  lores: string[]
}

/**
 * Reads the skills a background's text trains (Player Core p. 24 backgrounds: "You're trained
 * in…"). A choice ("your choice of either the Nature or the Occultism skill", "one of the
 * following lore skills: …", "a skill of your choice") is kept apart from what is fixed, and
 * examples in brackets ("such as Shelyn Lore") are ignored.
 */
export function backgroundSkillText(text: string): BackgroundSkillText {
  const plain = text
    .replace(/[*_]/g, '')
    .replace(/[’]|''/g, "'")
    .replace(/\bLore Lore\b/g, 'Lore')
    .replace(/\s+/g, ' ')
  const out: BackgroundSkillText = { fixed: [], choices: [], deitySkill: false, lores: [] }
  const count = (w: string) => ({ one: 1, two: 2, three: 3, four: 4 })[w.toLowerCase()] ?? 1
  for (const m of plain.matchAll(
    /\b(?:you're|you are|you become)(?: also)? trained in ([^.]+)/gi,
  )) {
    let clause = m[1]!.replace(/\([^)]*\)/g, '')
    if (/your deity's (?:associated|divine) skill/i.test(clause)) out.deitySkill = true
    const pick = /your choice of (.+?)(?: skill\b|, as well as|, and |$)/i.exec(clause)
    if (pick) {
      out.choices.push({ options: skillsIn(pick[1]!), count: 1 })
      clause = clause.replace(pick[0], ' ')
    }
    // "one of the following lore skills: …", "four of the following: …", "the corresponding
    // Lore skill: …" (Elementally Infused, by its element).
    const list =
      /(?:\b(one|two|three|four) of the following[^:]*|the corresponding Lore skill): (.+)$/i.exec(
        clause,
      )
    if (list) {
      out.choices.push({
        options: [...skillsIn(list[2]!), ...loresIn(list[2]!)],
        count: count(list[1] ?? 'one'),
      })
      clause = clause.slice(0, list.index)
    }
    // "the Legal Lore or Warfare Lore skill"
    const lore = String.raw`[A-Z][\w'-]*(?: (?:of|[A-Z][\w'-]*))* Lore`
    const either = new RegExp(`${lore}(?: skill)?(?:,? or (?:the )?${lore}(?: skill)?)+`).exec(
      clause,
    )
    if (either) {
      out.choices.push({ options: loresIn(either[0]), count: 1 })
      clause = clause.replace(either[0], ' ')
    }
    if (/\ba skill of your choice\b/i.test(clause)) out.choices.push({ options: [], count: 1 })
    // "a Lore skill related to the settlement you came from", "two Lore skills, which you and
    // your GM choose…"
    const named = /\b(a|one|two|three) Lore skills?\b(.*)$/i.exec(clause)
    if (named) {
      const hint = `Lore${named[2]!.replace(/^,/, '')}`.replace(/\s+/g, ' ').trim()
      for (let i = 0; i < count(named[1]!.replace(/^a$/i, 'one')); i++) out.lores.push(hint)
      clause = clause.slice(0, named.index)
    }
    for (const s of [...skillsIn(clause), ...loresIn(clause)])
      if (!out.fixed.includes(s)) out.fixed.push(s)
  }
  return out
}
