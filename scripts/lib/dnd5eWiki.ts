// dnd2024.wikidot.com pages cut into the parts the 5e generator reads: a class's Core Traits
// and level table, its feature and subclass sections, a spell's stat lines, a feat's category
// line, an option list's entries. Their text is only read in memory (for facts and for the
// overlap test); nothing written here is committed.

import {
  SOURCE_LINE,
  pageContent,
  plainText,
  wikiSections,
  wikiSource,
  wikiTables,
} from './wikidot'

/** Every class Lantern carries for 5e, by wiki page prefix. */
export const CLASSES = [
  'artificer',
  'barbarian',
  'bard',
  'cleric',
  'druid',
  'fighter',
  'monk',
  'paladin',
  'ranger',
  'rogue',
  'sorcerer',
  'warlock',
  'wizard',
]

/** The books Lantern takes non-SRD options from, by the wiki's "Source:" line. */
export const BOOKS: Record<string, 'PHB 2024' | 'Eberron: Forge of the Artificer'> = {
  "Player's Handbook": 'PHB 2024',
  'Eberron - Forge of the Artificer': 'Eberron: Forge of the Artificer',
}

/** The book for a wiki "Source:" value, if Lantern takes options from it. */
export const bookFor = (source: string | undefined) =>
  BOOKS[(source ?? '').replace(/’/g, "'").trim()]

export const bookOf = (html: string) => bookFor(wikiSource(html))

export interface WikiFeature {
  name: string
  level: number
  html: string
  text: string
}

/** "Level 3: Combat Superiority" sections, each with the sections nested under it. */
export function wikiFeatures(html: string): WikiFeature[] {
  const out: WikiFeature[] = []
  let cur: WikiFeature | undefined
  let depth = 0
  for (const s of wikiSections(html)) {
    const m = s.title.match(/^Level (\d+): (.+)$/i)
    // The wiki's own variant and homebrew sections are not the book's.
    if (/Variant/i.test(s.title)) {
      cur = undefined
      continue
    }
    const name = (m ? m[2]! : s.title).trim().replace(/\.$/, '')
    // "Life Domain Spells" set as its own heading is a feature, unless it's the table heading
    // under "Level 3: Life Domain Spells".
    const spells =
      !m &&
      name.endsWith('Spells') &&
      (!cur || s.level <= depth) &&
      cur?.name.toLowerCase() !== name.toLowerCase()
    if (m || spells) {
      const first = Number(wikiTables(s.html)[0]?.[1]?.[0]?.match(/\d+/)?.[0] ?? 3)
      cur = {
        name,
        level: m ? Number(m[1]) : first,
        html: s.html,
        text: plainText(s.html),
      }
      depth = s.level
      out.push(cur)
    } else if (cur && s.level && !s.title.endsWith('Options')) {
      // A subsection, or a block the wiki sets as its own heading (Beast of the Land).
      cur.html += `<h${s.level}>${s.title}</h${s.level}>${s.html}`
      cur.text = plainText(cur.html)
    } else cur = undefined
  }
  return out
}

/** A class page's Core Traits rows, merged level table and feature sections. */
export function wikiClass(html: string) {
  const sections = wikiSections(html)
  const traits: Record<string, string> = {}
  for (const r of wikiTables(sections[0]!.html)[0] ?? []) if (r.length >= 2) traits[r[0]!] = r[1]!
  const table = new Map<number, Record<string, string>>()
  const header: string[] = []
  for (const s of sections.filter((s) => /Features( \(Part [A-Z]\))?$/.test(s.title))) {
    const [head, ...body] = wikiTables(s.html)[0] ?? []
    if (!head) continue
    head.forEach((h, i) => h === 'Features' && (head[i] = 'Class Features'))
    for (const h of head) if (!header.includes(h)) header.push(h)
    for (const r of body) {
      const level = Number(r[0])
      if (!level) continue
      const row = table.get(level) ?? {}
      // The wiki marks its own variant features inline ("Primal Knowledge (Variant Feature) Totems").
      head.forEach((h, i) => (row[h] = (r[i] ?? '').replace(/\s*\(Variant Feature\)[^,]*/g, '')))
      table.set(level, row)
    }
  }
  const subclassLinks = [
    ...new Set(
      sections
        .filter((s) => s.title.endsWith('Subclasses'))
        .flatMap((s) => [...s.html.matchAll(/href="\/([a-z]+:[a-z0-9-]+)"/g)].map((m) => m[1]!)),
    ),
  ]
  const multiclass = plainText(sections.find((s) => /As a Multiclass/.test(s.title))?.html ?? '')
  return {
    book: bookOf(html),
    traits,
    header,
    levels: [...table.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r),
    features: wikiFeatures(html),
    subclassLinks,
    multiclass,
    sections,
  }
}

export interface WikiEntry {
  name: string
  html: string
  text: string
  /** The entry's own "Source:" line when it differs from the page's (an option from another book). */
  book?: string
}

/**
 * Bold-led entries ("<p><strong>Ambush.</strong> …") in a piece of HTML, each running to the
 * next one. An entry may carry its own "Source:" line.
 */
export function wikiEntries(html: string): WikiEntry[] {
  const parts = html.split(/(?=<p><strong>)/)
  const out: WikiEntry[] = []
  for (const p of parts) {
    const m = p.match(/^<p><strong>([^<]+?)\.?\s*<\/strong>/)
    if (!m) {
      if (out.length) out.at(-1)!.html += p
      continue
    }
    out.push({ name: m[1]!.replace(/\.$/, '').trim(), html: p, text: '' })
  }
  for (const e of out) {
    e.text = plainText(e.html)
    const src = e.text.match(SOURCE_LINE)?.[1]
    if (src) e.book = src.trim()
  }
  return out
}

/** The sections of a page that aren't level features ("Maneuver Options"), with their entries. */
export function wikiOptionLists(html: string) {
  return wikiSections(html)
    .filter((s) => s.title && !/^Level \d+:/.test(s.title) && /<p><strong>/.test(s.html))
    .map((s) => ({ title: s.title, entries: wikiEntries(s.html) }))
}

/** A spell page: header line, stat lines, body and higher-level text. */
export function wikiSpell(html: string) {
  const body = pageContent(html)
  const text = plainText(body)
  const lines = text.split('\n')
  const header = lines.find((l) => /^(Level \d \w+|\w+ Cantrip) \(/.test(l))
  const stat = (k: string) => text.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? ''
  const start = lines.findIndex((l) => l.startsWith('Duration:')) + 1
  const rest = lines.slice(start)
  const hi = rest.findIndex((l) => /^(Using a Higher-Level Spell Slot|Cantrip Upgrade)\./.test(l))
  return {
    book: bookOf(html),
    header,
    stats: {
      castingTime: stat('Casting Time'),
      range: stat('Range'),
      components: stat('Components'),
      duration: stat('Duration'),
    },
    body: (hi < 0 ? rest : rest.slice(0, hi)).join('\n'),
    higher: hi < 0 ? undefined : rest.slice(hi).join('\n'),
    text,
  }
}

/** A feat page: its category line, benefits and full text. */
export function wikiFeat(html: string) {
  const text = plainText(pageContent(html))
  const header = text
    .split('\n')
    .find((l) => /^(Origin|General|Fighting Style|Epic Boon) Feat/.test(l))
  return { book: bookOf(html), header, entries: wikiEntries(pageContent(html)), text }
}

/** Every page name a table in this HTML links to, with the row's cells. */
export function wikiLinkedRows(html: string) {
  return [...pageContent(html).matchAll(/<tr>([\s\S]*?)<\/tr>/g)].flatMap((r) => {
    const link = r[1]!.match(/href="\/([a-z0-9-]+:[a-z0-9-]+)"/)?.[1]
    if (!link) return []
    const cells = [...r[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => plainText(c[1]!))
    return [{ link, cells }]
  })
}
