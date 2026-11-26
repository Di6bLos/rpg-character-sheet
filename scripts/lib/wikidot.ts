// Reading dnd2024.wikidot.com for the 5e scripts: a polite page cache in
// `.local/dnd5e/wikidot/` (gitignored, about one request a second, never refetched once
// saved) and the page HTML turned into plain text blocks. The wiki's wording is never
// committed: the generator takes only facts from it (levels, ranges, uses, dice) and pairs
// them with summaries written for Lantern (see `data/dnd5e/NOTICE.md`).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const WIKIDOT = 'https://dnd2024.wikidot.com'

/** The cache file for a wiki page name (`spell:fireball` → `spell_fireball.html`). */
export const cacheFile = (dir: string, page: string) => join(dir, `${page.replace(/:/g, '_')}.html`)

let last = 0

/** A page's HTML from the cache, fetched (and saved) first when it isn't there yet. */
export async function wikiPage(dir: string, page: string): Promise<string | undefined> {
  const file = cacheFile(dir, page)
  if (existsSync(file)) return readFileSync(file, 'utf8')
  const wait = last + 1100 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  last = Date.now()
  const res = await fetch(`${WIKIDOT}/${page}`, {
    headers: { 'User-Agent': 'Lantern rules cache (one request a second)' },
  })
  if (!res.ok) return undefined
  const html = await res.text()
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, html)
  return html
}

/** A cached page, or undefined when it was never fetched. */
export function cachedPage(dir: string, page: string): string | undefined {
  const file = cacheFile(dir, page)
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined
}

/** The wiki article itself: the `page-content` block, without the ads after it. */
export function pageContent(html: string): string {
  const start = html.indexOf('<div id="page-content">')
  if (start < 0) return ''
  const end = html.indexOf('<div class="page-tags"', start)
  const body = html.slice(start, end < 0 ? undefined : end)
  const ad = body.search(/<!-- (mobile bottom|wikidot_bottom)/)
  return ad < 0 ? body : body.slice(0, ad)
}

/** Wiki page names an article links to, in order, once each. */
export function wikiLinks(html: string): string[] {
  const seen = new Set<string>()
  for (const m of pageContent(html).matchAll(/href="\/([a-z0-9-]+:[a-z0-9-]+)"/g)) seen.add(m[1]!)
  return [...seen]
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  mdash: '—',
  ndash: '–',
  times: '×',
  minus: '−',
  hellip: '…',
}

export function decode(s: string) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/g, (m, n: string) => ENTITIES[n] ?? m)
}

/** HTML to plain text: one line per paragraph, list item, heading or table row. */
export function plainText(html: string): string {
  return decode(
    html
      .replace(/\s+/g, ' ')
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<\/(td|th)>/g, ' | ')
      .replace(/<\/(p|li|tr|h[1-6]|div|table|ul|ol)>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .replace(/(\w)'(\w)|(s)' /g, (_, a, b, c) => (c ? `${c}’ ` : `${a}’${b}`))
}

/** A "Source:" line (the wiki sometimes spells it "Souce:"). */
export const SOURCE_LINE = /^Sou?r?ce:\s*(.+)$/m

/** The book a wiki article says it comes from ("Source: Player's Handbook"). */
export function wikiSource(html: string): string | undefined {
  return plainText(pageContent(html)).match(SOURCE_LINE)?.[1]?.trim()
}

/** An article cut at its headings: each heading's title and level with the HTML under it. */
export function wikiSections(html: string): { level: number; title: string; html: string }[] {
  const body = pageContent(html)
  const out: { level: number; title: string; html: string }[] = [{ level: 0, title: '', html: '' }]
  let at = 0
  for (const m of body.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g)) {
    out.at(-1)!.html += body.slice(at, m.index)
    out.push({ level: Number(m[1]), title: plainText(m[2]!), html: '' })
    at = m.index! + m[0].length
  }
  out.at(-1)!.html += body.slice(at)
  return out
}

/** Every table in a piece of HTML, as rows of plain-text cells. */
export function wikiTables(html: string): string[][][] {
  return [...html.matchAll(/<table[\s\S]*?<\/table>/g)].map((t) =>
    [...t[0].matchAll(/<tr[\s\S]*?<\/tr>/g)].map((r) =>
      [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) =>
        plainText(c[1]!).replace(/\n/g, ' '),
      ),
    ),
  )
}

/** The article's title, from the page's <title> ("Fireball - D&D 5e (2024)"). */
export function wikiTitle(html: string): string {
  return decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '')
    .replace(/\s+-\s+D&D 5e \(2024\)\s*$/, '')
    .trim()
    .replace(/(?<=\S )(Of|The|And|From|To|A|An|In|On|With|For)\b(?= )/g, (w) => w.toLowerCase())
}
