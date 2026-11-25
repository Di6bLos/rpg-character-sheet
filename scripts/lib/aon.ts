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

export const ACTIONS: Record<string, string> = {
  'Single Action': '◆',
  'Two Actions': '◆◆',
  'Three Actions': '◆◆◆',
  Reaction: '↺',
  'Free Action': '◇',
  'One to Three Actions': '◆ to ◆◆◆',
  'One or Two Actions': '◆ or ◆◆',
  'Two or Three Actions': '◆◆ or ◆◆◆',
  'Two to Three Actions': '◆◆ to ◆◆◆',
}

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
const actionGlyph = (s: string) => ACTIONS[s] ?? `[${s}]`

function table(html: string) {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((r) =>
    [...(r[1] ?? '').matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) =>
      stripLinks((c[1] ?? '').replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .replace(/\|/g, '\\|')
        .trim(),
    ),
  )
  if (!rows.length) return ''
  const width = Math.max(...rows.map((r) => r.length))
  const line = (r: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`
  return `\n${line(rows[0] ?? [])}\n| ${Array(width).fill('---').join(' | ')} |\n${rows.slice(1).map(line).join('\n')}\n`
}

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
  s = s.replace(/<actions string="([^"]*)"\s*\/>/g, (_, a: string) => actionGlyph(a))
  s = s.replace(/<table[\s\S]*?<\/table>/g, table)
  s = s
    .replace(/<li[^>]*>/g, '\n- ')
    .replace(/<\/li>|<\/?[uo]l[^>]*>/g, '')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<hr\s*\/?>/g, '\n---\n')
    .replace(/<image[^>]*\/?>(?:<\/image>)?/g, '')
    .replace(/<\/?[a-z][a-z-]*(?:\s[^>]*)?\/?>/g, '')
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

/** Drops each subsection whose own source line names one of `legacy`'s books. */
export function withoutLegacy(md: string, legacy: Set<string>) {
  const lines = md.split('\n')
  const out: string[] = []
  let skip = 0
  lines.forEach((line, i) => {
    const head = /^(#+) /.exec(line)
    if (head) {
      const lvl = head[1]!.length
      if (skip && lvl <= skip) skip = 0
      if (!skip) {
        const next = lines.slice(i + 1).findIndex((l) => l.startsWith('#'))
        const block = lines.slice(i + 1, next < 0 ? undefined : i + 1 + next)
        const book = block.map((l) => /^\*\*Source\*\* (.+?) pg\./.exec(l)?.[1]).find(Boolean)
        if (book && legacy.has(book)) skip = lvl
      }
    }
    if (!skip) out.push(line)
  })
  return out.join('\n')
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
