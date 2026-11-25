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
  s = s.replace(/\*\*_Nethys Note:[^*]*?spoilers[^*]*?_\*\*/gi, '')
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
 * `legacy`, and takes the legacy books out of every source line that also cites a remastered
 * one ("Player Core pg. 150, Core Rulebook pg. 165" → "Player Core pg. 150").
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
        if (books.length && books.every((b) => legacy.has(b))) skip = lvl
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
export function orcProblems(md: string, legacy: Set<string>) {
  return md
    .split('\n')
    .filter((l) => sourceBooks(l).some((b) => legacy.has(b)) || DEITY_STAT.test(l))
}

const HERITAGE_ALIASES: [RegExp, string][] = [
  [/^Half-(Elf|Orc)$/, 'Human'],
  [/\bRat\b/, 'Ratfolk'],
]

/**
 * The ancestry a heritage belongs to, from its name (AoN stores no link): an alias, then
 * the ancestry the name ends with, then one it names. `ancestries` are ancestry names.
 */
export function heritageAncestry(heritage: string, ancestries: string[]) {
  const names = [...ancestries].sort((a, b) => b.length - a.length)
  const alias = HERITAGE_ALIASES.find(([re, a]) => re.test(heritage) && names.includes(a))
  if (alias) return alias[1]
  const words = heritage.split(/[\s-]+/)
  return (
    names.find((n) => heritage.endsWith(n)) ??
    names.find((n) => words.includes(n)) ??
    names.find((n) => heritage.includes(n))
  )
}

/** Subclass types whose name doesn't start with their class's. */
const TYPE_CLASS: Record<string, string> = {
  'Druidic Order': 'Druid',
  'Animistic Practice': 'Animist',
}

/** The class a subclass option's type belongs to ("Bard Muse" → Bard), if any. */
export const classOfType = (type: string | undefined, classes: string[]) =>
  TYPE_CLASS[type ?? ''] ?? classes.find((c) => (type ?? '').startsWith(`${c} `))
