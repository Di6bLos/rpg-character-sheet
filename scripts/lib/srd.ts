// Reading the SRD 5.2.1 PDF (`.local/dnd5e/SRD_CC_v5.2.1.pdf`, gitignored) for the 5e
// scripts. pdf.js gives every text run with its font, size and position; those are cached in
// `.local/dnd5e/srd-items.json` and turned into a reading-order stream of blocks (headings,
// paragraphs with inline markdown, list items and table rows) that the generator walks.
// The SRD is CC-BY-4.0, so its text may be committed with the attribution
// (`data/dnd5e/NOTICE.md`).

import { existsSync, readFileSync, writeFileSync } from 'node:fs'

/** One pdf.js text run: page, x, y, height, font, text, end of line, width. */
export type SrdItem = [number, number, number, number, string, string, number, number]

export async function srdItems(pdf: string, cache: string): Promise<SrdItem[]> {
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'))
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await getDocument({ url: pdf, verbosity: 0 }).promise
  const out: SrdItem[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    await page.getOperatorList()
    const tc = await page.getTextContent()
    const names: Record<string, string> = {}
    for (const it of tc.items) {
      if (!('str' in it)) continue
      names[it.fontName] ??= String(
        (page.commonObjs.get(it.fontName) as { name?: string } | undefined)?.name ?? '',
      ).replace(/^[A-Z]+\+/, '')
      const r = (n: number) => Math.round(n * 10) / 10
      out.push([
        p,
        r(it.transform[4]),
        r(it.transform[5]),
        r(it.height),
        names[it.fontName]!,
        it.str,
        it.hasEOL ? 1 : 0,
        r(it.width),
      ])
    }
    page.cleanup()
  }
  writeFileSync(cache, JSON.stringify(out))
  return out
}

export type SrdBlock =
  | { kind: 'heading'; page: number; size: number; text: string }
  | { kind: 'para'; page: number; text: string; font: string; size: number; x: number }
  | { kind: 'row'; page: number; cells: string[]; font: string; x: number[]; y: number }

interface Seg {
  page: number
  x: number
  y: number
  end: number
  size: number
  font: string
  /** Inline markdown. */
  text: string
  plain: string
  cells: { x: number; text: string }[]
  /** Set in small caps somewhere: its words come out as "BrEakinG". */
  sc?: boolean
}

/** The gutter between the two columns of a page, in PDF points. */
export const MID = 297
const HEADING = (font: string, size: number) =>
  /GillSans-SemiBold(-SC700)?$|GillSans-Bold$/.test(font) && size >= 10.5 && size !== 11
/** Small-caps runs come out as "SplASh": back to "Splash". */
const MINOR = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
])
const smallCaps = (s: string) =>
  s.replace(/[A-Za-z]+/g, (w, at: number) => {
    if (!/[a-z]/.test(w) || !/[A-Z]/.test(w)) return w
    const lower = w.toLowerCase()
    return at > 0 && MINOR.has(lower) ? lower : lower[0]!.toUpperCase() + lower.slice(1)
  })

/** Inline markdown for one run: italics and bold where the book sets them. */
function styled(font: string, s: string) {
  if (!s.trim()) return s
  const lead = s.match(/^\s*/)![0]
  const tail = s.match(/\s*$/)![0]
  const core = s.trim()
  if (/^(Cambria|Optima|GillSans)-?BoldItalic/.test(font)) return `${lead}***${core}***${tail}`
  if (/^Cambria-Bold$|^Optima-Bold$|^GillSans-SemiBold$/.test(font))
    return `${lead}**${core}**${tail}`
  if (/^Cambria-Italic$|^Optima-Italic$/.test(font)) return `${lead}_${core}_${tail}`
  return s
}

/**
 * How `srdBlocks` reads the two columns. The 5e data generator reads the SRD without these; the
 * rules topics need them for the tables and formulas set beside text.
 */
export interface SrdOptions {
  /**
   * Runs in the other column join a line only on its exact baseline (a formula's runs sit a
   * point apart, and would otherwise catch the line beside them), and a right-column line
   * beside a page's wide rows is read with them instead of being dropped.
   */
  columns?: boolean
}

/** One page's runs as segments: runs on one baseline in one column, split where there's a gap. */
function segments(items: SrdItem[], opts: SrdOptions): Seg[] {
  const rows = new Map<number, SrdItem[]>()
  const side = (x: number) => x < MID - 6
  const near = (it: SrdItem) => (y: number) =>
    Math.abs(y - it[2]) <
    (!opts.columns || rows.get(y)!.some((o) => side(o[1]) === side(it[1])) ? 1.6 : 0.6)
  for (const it of items) {
    if (!it[5].trim() && it[7] === 0) continue
    const key = [...rows.keys()].find(near(it)) ?? it[2]
    rows.set(key, [...(rows.get(key) ?? []), it])
  }
  const segs: Seg[] = []
  for (const [y, row] of rows) {
    row.sort((a, b) => a[1] - b[1])
    let cur: Seg | undefined
    for (const it of row) {
      const [page, x, , h, font, str, , w] = it
      const gap = cur ? x - cur.end : 0
      const newCol = cur && cur.x < MID && x >= MID - 8 && x <= 345 && gap > 4
      if (!cur || gap > 7 || newCol) {
        if (cur && !newCol && gap > 7 && Math.abs(cur.size - h) < 0.5 && !HEADING(font, h)) {
          cur.cells.push({ x, text: str })
          cur.end = x + w
          cur.text += ` ${styled(font, str)}`
          cur.plain += ` ${str}`
          continue
        }
        cur = { page, x, y, end: x + w, size: h, font, text: '', plain: '', cells: [] }
        segs.push(cur)
        cur.cells.push({ x, text: '' })
      }
      if (/-SC\d+$/.test(font) && str.trim()) cur.sc = true
      cur.text += styled(font, str)
      cur.plain += str
      cur.cells[cur.cells.length - 1]!.text += str
      cur.end = Math.max(cur.end, x + w)
      if (h > cur.size && str.trim()) cur.size = h
      if (!cur.plain.trim() || /^\s+$/.test(cur.plain.slice(0, -str.length))) cur.font = font
    }
  }
  for (const s of segs) {
    s.text = s.text
      .replace(/\*\*\*\s*\*\*\*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    s.plain = s.plain.replace(/\s+/g, ' ').trim()
    if (s.sc) {
      s.text = smallCaps(s.text.replace(/\*\*([A-Za-z]+)\*\*(?=[A-Za-z])/g, '$1'))
      s.plain = smallCaps(s.plain)
    }
    s.cells = s.cells.map((c) => ({ x: c.x, text: c.text.replace(/\s+/g, ' ').trim() }))
    s.cells = s.cells.filter((c) => c.text)
  }
  return segs.filter((s) => s.plain && !(s.y < 35 && s.size >= 10.9 && s.size <= 11.1))
}

/** A page's segments in reading order: full-width rows above, the two columns, rows below. */
function ordered(segs: Seg[], opts: SrdOptions): Seg[] {
  const wide = segs.filter((s) => s.x < MID - 20 && s.end > MID + 20 && s.cells.length > 1)
  const rest = segs.filter((s) => !wide.includes(s))
  const byY = (a: Seg, b: Seg) => b.y - a.y || a.x - b.x
  if (!wide.length)
    return [
      ...rest.filter((s) => s.x < MID - 6).sort(byY),
      ...rest.filter((s) => s.x >= MID - 6).sort(byY),
    ]
  const top = Math.max(...wide.map((s) => s.y)) + 14
  const bottom = Math.min(...wide.map((s) => s.y))
  const band = (keep: (s: Seg) => boolean) => [
    ...rest.filter((s) => keep(s) && s.x < MID - 6).sort(byY),
    ...rest.filter((s) => keep(s) && s.x >= MID - 6).sort(byY),
  ]
  const inWide = rest.filter(
    (s) =>
      (s.x < MID - 20 || opts.columns) &&
      s.y >= bottom - 2 &&
      (s.y <= top || (s.y <= top + 24 && HEADING(s.font, s.size))),
  )
  return [
    ...band((s) => s.y > top && !inWide.includes(s)),
    ...[...wide, ...inWide].sort(byY),
    ...band((s) => s.y < bottom - 2 && !inWide.includes(s)),
  ]
}

const TABLE_FONT = (s: Seg) => s.font.startsWith('GillSans') && s.size < 10.5
const BULLET = /^[•●▪]\s*/

/** Joins a wrapped line onto the text before it, undoing the book's end-of-line hyphens. */
export function joinLine(a: string, b: string) {
  if (/[a-z]-$/.test(a) && /^[a-z]/.test(b)) return a.slice(0, -1) + b
  const mark = a.match(/[a-z]-(_|\*\*\*?)$/)?.[1]
  if (mark && b.startsWith(mark) && /^[a-z]/.test(b.slice(mark.length)))
    return a.slice(0, -1 - mark.length) + b.slice(mark.length)
  return `${a} ${b}`
}

/** The whole SRD as a stream of blocks in reading order. */
export function srdBlocks(
  items: SrdItem[],
  first = 1,
  last = 9999,
  opts: SrdOptions = {},
): SrdBlock[] {
  const pages = new Map<number, SrdItem[]>()
  for (const it of items)
    if (it[0] >= first && it[0] <= last) pages.set(it[0], [...(pages.get(it[0]) ?? []), it])
  const out: SrdBlock[] = []
  let para: Extract<SrdBlock, { kind: 'para' }> | undefined
  let prev: Seg | undefined
  for (const [page, its] of [...pages].sort((a, b) => a[0] - b[0])) {
    prev = undefined
    for (const s of ordered(segments(its, opts), opts)) {
      if (/^\d+$/.test(s.plain) && s.y < 35) continue
      if (HEADING(s.font, s.size) && s.cells.length === 1) {
        const last = out.at(-1)
        if (last?.kind === 'heading' && last.size === s.size && prev && prev.y - s.y < s.size * 1.4)
          last.text = `${last.text} ${s.plain}`
        // Stat blocks inside spells and items (Animated Object) nest under their entry.
        else
          out.push({
            kind: 'heading',
            page,
            size: s.size === 15 ? 11.5 : s.size,
            text: smallCaps(s.plain),
          })
        para = undefined
        prev = s
        continue
      }
      const last = out.at(-1)
      // A wrapped cell: a line under a row that starts right of the row's first cell.
      const wraps =
        last?.kind === 'row' &&
        last.page === page &&
        s.cells.length <= last.cells.length &&
        last.y - s.y < 13 &&
        s.cells[0]!.x > last.x[0]! + 8
      if (s.cells.length > 1 || (TABLE_FONT(s) && wraps)) {
        if (wraps && last?.kind === 'row') {
          for (const c of s.cells) {
            let i = last.x.findIndex((x, k) => c.x >= x - 6 && (last.x[k + 1] ?? 9999) > c.x + 2)
            if (i < 0) i = last.cells.length - 1
            last.cells[i] = joinLine(last.cells[i]!, c.text)
          }
          last.y = s.y
        } else if (
          last?.kind === 'row' &&
          last.page === page &&
          last.cells.length > 1 &&
          /SemiBold/.test(last.font) &&
          /SemiBold/.test(s.font) &&
          last.y - s.y < 13
        ) {
          for (const c of s.cells) {
            const i = last.x.findIndex((x) => Math.abs(x - c.x) < 16)
            if (i >= 0) last.cells[i] = `${last.cells[i]} ${c.text}`
            else {
              const at = last.x.findIndex((x) => x > c.x)
              const k = at < 0 ? last.x.length : at
              last.x.splice(k, 0, c.x)
              last.cells.splice(k, 0, c.text)
            }
          }
          last.y = s.y
        } else
          out.push({
            kind: 'row',
            page,
            cells: s.cells.map((c) => c.text),
            font: s.font,
            x: s.cells.map((c) => c.x),
            y: s.y,
          })
        para = undefined
        prev = s
        continue
      }
      const left = s.x < MID - 6 ? 63 : 313
      const gap = prev ? prev.y - s.y : 0
      const sameColumn = prev && prev.page === page && prev.x < MID - 6 === s.x < MID - 6
      const hangs =
        para &&
        (BULLET.test(para.text) || /^\*\*[^*]/.test(para.text)) &&
        s.x > para.x + 2 &&
        s.x < para.x + 14
      const bulletLine = hangs
      const indent = !bulletLine && (sameColumn && gap > 0 ? s.x - prev!.x > 4 : s.x - left > 4)
      const label = TABLE_FONT(s) && /SemiBold/.test(s.font) && /^[A-Z][^:]{0,40}:/.test(s.plain)
      const styleChange =
        para &&
        (para.font.split('-')[0] !== s.font.split('-')[0] || Math.abs(para.size - s.size) > 0.6)
      const startsRunIn = /^\*{2,3}[^*]+[.:!?]\*{2,3}/.test(s.text)
      const moved = para && (para.page !== page || gap < -s.size)
      const carries = moved && !/[.:!?)”]$/.test(para!.text)
      if (
        !para ||
        (moved && !carries) ||
        indent ||
        BULLET.test(s.plain) ||
        styleChange ||
        startsRunIn ||
        label ||
        gap > s.size * 1.7
      ) {
        para = { kind: 'para', page, text: s.text, font: s.font, size: s.size, x: s.x }
        out.push(para)
      } else para.text = joinLine(para.text, s.text)
      prev = s
    }
  }
  return rejoin(out).map((b) =>
    b.kind === 'para'
      ? { ...b, text: b.text.replace(/\*\*\*\s+\*\*\*/g, ' ').replace(/_\s+_/g, ' ') }
      : b,
  )
}

const family = (font: string) => font.split('-')[0]

/**
 * Mends sentences a table or sidebar cuts in two: a body paragraph that stops mid-sentence and
 * a later one of the same font that starts in lowercase become one, and what came between
 * (the table, the sidebar) moves after it.
 */
function rejoin(blocks: SrdBlock[]): SrdBlock[] {
  const out = [...blocks]
  for (let i = 0; i < out.length; i++) {
    const p = out[i]!
    if (p.kind !== 'para' || /[.:!?)”*_]$/.test(p.text) || BULLET.test(p.text)) continue
    for (let j = i + 1; j < Math.min(out.length, i + 40); j++) {
      const q = out[j]!
      if (q.kind === 'heading' && q.size >= 12) break
      if (q.kind !== 'para' || family(q.font) !== family(p.font) || Math.abs(q.size - p.size) > 0.6)
        continue
      if (/^[a-z]/.test(q.text)) {
        out[i] = { ...p, text: joinLine(p.text, q.text) }
        out.splice(j, 1)
        i--
      }
      break
    }
  }
  return out
}

/**
 * Markdown for a run of blocks (the rules pages and the SRD entries' text). With `headerFont`,
 * a table whose first row isn't set in bold (a grid of terms, like the glossary's list of
 * conditions) gets no header row.
 */
export function blocksMarkdown(
  blocks: SrdBlock[],
  headingBase = 2,
  opts: { headerFont?: boolean } = {},
): string {
  const sizes = [...new Set(blocks.flatMap((b) => (b.kind === 'heading' ? [b.size] : [])))].sort(
    (a, b) => b - a,
  )
  const lines: string[] = []
  let table: string[][] = []
  let headed = true
  const flush = () => {
    if (!table.length) return
    const width = Math.max(...table.map((r) => r.length))
    const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')]
    const [head, ...body] = table.map(pad)
    lines.push(`| ${head!.join(' | ')} |`)
    if (headed) lines.push(`| ${head!.map(() => '---').join(' | ')} |`)
    for (const r of body) lines.push(`| ${r.join(' | ')} |`)
    lines.push('')
    table = []
  }
  for (const b of blocks) {
    if (b.kind === 'row') {
      if (!table.length) headed = !opts.headerFont || /Bold/.test(b.font)
      table.push(b.cells.map((c) => c.replace(/\|/g, '\\|')))
      continue
    }
    flush()
    const bullet = b.kind === 'para' && BULLET.test(b.text)
    if (!bullet && lines.at(-1)?.startsWith('- ')) lines.push('')
    if (b.kind === 'heading') {
      const level = Math.min(6, headingBase + sizes.indexOf(b.size))
      lines.push(`${'#'.repeat(level)} ${b.text}`, '')
    } else if (bullet) lines.push(`- ${b.text.replace(BULLET, '')}`)
    else lines.push(b.text, '')
  }
  flush()
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
