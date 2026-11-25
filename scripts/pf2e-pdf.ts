// Prints the shareable Pathfinder 2e rules bible (`.local/rules/pf2e-orc/`, made by
// `node scripts/pf2e-bible.ts --orc`) as PDF volumes for the library: one per topic, each
// under the library's 50 MB limit, with a cover, contents, the ORC notice and PDF bookmarks.
// Needs Google Chrome (headless print). Output: `.local/pf2e/pdf/`.
//
//   node scripts/pf2e-pdf.ts [bibleDir] [outDir] [--only=09-equipment-1,…]

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const [bibleArg, outArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const ONLY = process.argv
  .find((a) => a.startsWith('--only='))
  ?.slice(7)
  .split(',')
const BIBLE = resolve(bibleArg ?? join(ROOT, '.local', 'rules', 'pf2e-orc'))
const OUT = resolve(outArg ?? join(ROOT, '.local', 'pf2e', 'pdf'))
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const MAX_BYTES = 50 * 1024 * 1024

const files = (dir: string, keep: (f: string) => boolean = () => true) =>
  existsSync(join(BIBLE, dir))
    ? readdirSync(join(BIBLE, dir))
        .filter((f) => f.endsWith('.md') && keep(f))
        .sort()
        .map((f) => join(dir, f))
    : []
const level = (f: string) => {
  const m = /level-(minus-)?(\d+)/.exec(f)
  return m ? (m[1] ? -1 : 1) * Number(m[2]) : NaN
}
const creatures = (lo: number, hi: number) =>
  files('creatures', (f) => level(f) >= lo && level(f) <= hi)

const titleOf = (p: string) => /^# (.*)$/m.exec(readFileSync(join(BIBLE, p), 'utf8'))?.[1] ?? p

/** `n` volumes of about equal markdown size, the files kept in order. */
function split(slug: string, title: string, parts: string[], n: number) {
  const size = (p: string) => statSync(join(BIBLE, p)).size
  const total = parts.reduce((a, p) => a + size(p), 0)
  const chunks: string[][] = [[]]
  let sum = 0
  for (const p of parts) {
    if (sum >= (total / n) * chunks.length && chunks.length < n) chunks.push([])
    chunks[chunks.length - 1]!.push(p)
    sum += size(p)
  }
  return chunks.map((c, i) => ({
    slug: `${slug}-${i + 1}`,
    title: `${title}: ${titleOf(c[0]!)} to ${titleOf(c[c.length - 1]!)}`,
    parts: c,
  }))
}

const VOLUMES: { slug: string; title: string; parts: string[] }[] = [
  {
    slug: '01-player-rules',
    title: 'Player Rules',
    parts: [
      'rules/01-player-core.md',
      'rules/02-player-core-2.md',
      'conditions.md',
      'skills.md',
      'languages-planes-traditions.md',
    ],
  },
  {
    slug: '02-gm-rules',
    title: 'Game Master Rules',
    parts: [
      'rules/03-gm-core.md',
      'rules/04-monster-core.md',
      'rules/05-monster-core-2.md',
      'rules/06-npc-core.md',
      ...files('gm'),
    ],
  },
  {
    slug: '03-other-rules',
    title: 'Rules from Other Books',
    parts: files('rules', (f) => Number(f.slice(0, 2)) > 6),
  },
  { slug: '04-classes', title: 'Classes', parts: [...files('classes'), ...files('misc')] },
  {
    slug: '05-ancestries-backgrounds',
    title: 'Ancestries and Backgrounds',
    parts: [...files('ancestries'), 'backgrounds.md'],
  },
  { slug: '06-archetypes', title: 'Archetypes', parts: files('archetypes') },
  { slug: '07-feats', title: 'General, Skill and Other Feats', parts: files('feats') },
  { slug: '08-spells', title: 'Spells and Rituals', parts: files('spells') },
  ...split('09-equipment', 'Equipment', files('equipment'), 3),
  { slug: '10-creatures-1', title: 'Creatures, Levels −1 to 5', parts: creatures(-1, 5) },
  { slug: '11-creatures-2', title: 'Creatures, Levels 6 to 12', parts: creatures(6, 12) },
  { slug: '12-creatures-3', title: 'Creatures, Levels 13 to 25', parts: creatures(13, 25) },
  {
    slug: '13-creature-rules',
    title: 'Creature Families, Abilities and Companions',
    parts: files('creatures', (f) => f.startsWith('_')),
  },
  { slug: '14-traits-actions', title: 'Traits and Actions', parts: ['traits.md', 'actions.md'] },
]

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inline = (s: string) =>
  esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])_([^_]+)_(?=[\s).,;:]|$)/g, '$1<i>$2</i>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:]|$)/g, '$1<i>$2</i>')

let anchor = 0

/** The bible's markdown is regular (headings, paragraphs, lists, tables, rules): no library needed. */
function html(md: string) {
  const out: string[] = []
  const lines = md.split('\n')
  for (let i = 0; i < lines.length; ) {
    const line = lines[i]!
    const h = /^(#{1,6}) ([^]*)$/.exec(line)
    if (h) {
      const n = h[1]!.length
      out.push(`<h${n} id="a${anchor++}">${inline(h[2]!)}</h${n}>`)
      i++
    } else if (line.startsWith('|')) {
      const rows: string[] = []
      while (i < lines.length && lines[i]!.startsWith('|')) rows.push(lines[i++]!)
      const cells = (r: string) =>
        r
          .slice(1, -1)
          .split(/(?<!\\)\|/)
          .map((c) => inline(c.trim().replace(/\\\|/g, '|')))
      const [head = '', , ...body] = rows
      out.push(
        `<table><thead><tr>${cells(head)
          .map((c) => `<th>${c}</th>`)
          .join('')}</tr></thead><tbody>${body
          .map(
            (r) =>
              `<tr>${cells(r)
                .map((c) => `<td>${c}</td>`)
                .join('')}</tr>`,
          )
          .join('')}</tbody></table>`,
      )
    } else if (line.startsWith('- ')) {
      const items: string[] = []
      while (i < lines.length && lines[i]!.startsWith('- ')) items.push(lines[i++]!.slice(2))
      out.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`)
    } else if (line === '---') {
      out.push('<hr>')
      i++
    } else if (line.trim() === '') {
      i++
    } else {
      const para: string[] = [lines[i++]!]
      while (
        i < lines.length &&
        lines[i]!.trim() !== '' &&
        !/^(#{1,6} |\||- |---$)/.test(lines[i]!)
      )
        para.push(lines[i++]!)
      out.push(`<p>${para.map(inline).join('<br>')}</p>`)
    }
  }
  return out.join('\n')
}

const CSS = `
@page { size: Letter; margin: 0.6in 0.65in; }
body { font: 10pt/1.38 Georgia, 'Times New Roman', serif; color: #111; }
h1, h2, h3, h4, h5, h6 { font-family: 'Helvetica Neue', Arial, sans-serif; break-after: avoid; margin: 1.1em 0 0.35em; line-height: 1.2; }
h1 { font-size: 20pt; break-before: page; border-bottom: 2px solid #7a1d1d; padding-bottom: 4px; color: #7a1d1d; }
h2 { font-size: 14pt; color: #7a1d1d; }
h3 { font-size: 12pt; }
h4 { font-size: 11pt; }
h5, h6 { font-size: 10pt; }
p { margin: 0.3em 0 0.5em; }
p > i:only-child { color: #555; }
table { border-collapse: collapse; margin: 0.5em 0; font-size: 8.5pt; break-inside: avoid; }
th, td { border: 1px solid #bbb; padding: 2px 5px; text-align: left; vertical-align: top; }
th { background: #eee; }
ul { margin: 0.3em 0 0.5em 1.2em; padding: 0; }
hr { border: 0; border-top: 1px solid #ccc; }
.cover { break-after: page; text-align: center; padding-top: 2in; }
.cover h1 { break-before: auto; border: 0; font-size: 30pt; }
.cover .sub { font: 14pt 'Helvetica Neue', Arial, sans-serif; color: #444; }
.notice { break-after: page; font-size: 8.5pt; }
.notice h2, .toc h2 { break-before: auto; }
.toc { break-after: page; }
.toc ol { columns: 2; font-size: 9pt; }
`

// The print HTML and Chrome's profile live in a temp folder, never in the project: the dev
// server would reload on every file Chrome writes, and a leftover profile socket broke its watcher.
mkdirSync(OUT, { recursive: true })
const WORK = mkdtempSync(join(tmpdir(), 'pf2e-pdf-'))
const PROFILE = join(WORK, 'chrome')
process.on('exit', () => rmSync(WORK, { recursive: true, force: true }))
const today = new Date().toISOString().slice(0, 10)
const report: string[] = []

for (const v of VOLUMES.filter((x) => !ONLY || ONLY.includes(x.slug))) {
  const parts = v.parts.filter((p) => existsSync(join(BIBLE, p)))
  if (!parts.length) continue
  const chapters = parts.map((p) => readFileSync(join(BIBLE, p), 'utf8'))
  const titles = chapters.map((c) => /^# (.*)$/m.exec(c)?.[1] ?? 'Untitled')
  const books = [
    ...new Set(
      chapters.flatMap((c) =>
        [...c.matchAll(/^\*\*Source\*\* (.+?) pg\./gm)].map((m) => m[1]!.trim()),
      ),
    ),
  ].sort()
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Pathfinder 2e Remaster: ${esc(v.title)}</title><style>${CSS}</style></head><body>
<div class="cover"><h1>${esc(v.title)}</h1><p class="sub">Pathfinder Second Edition Remaster rules reference</p><p class="sub">Compiled for Lantern · ${today}</p></div>
<div class="notice"><h2>Notice</h2>
<p>This compilation contains Licensed Material from Paizo Inc. under the ORC License, located at the Library of Congress at TX 9-307-067 and available online at various locations including paizo.com/orclicense and azoralaw.com/orclicense. All warranties are disclaimed as set forth therein.</p>
<p><b>Attribution:</b> This compilation is based on the following Licensed Material, each © Paizo Inc.: ${books.map(esc).join('; ')}.</p>
<p><b>Reserved Material:</b> Paizo's trademarks and setting material (for example the names of deities, nations, organizations and characters of Golarion) are Reserved Material and are not licensed under the ORC License. They appear here only where the rules text names them.</p>
<p>Lantern is not published, endorsed or specifically approved by Paizo Inc. Text gathered from Archives of Nethys (2e.aonprd.com). Legacy (OGL) material and book art are not included.</p>
<p>Actions: ◆ one action, ◆◆ two, ◆◆◆ three, ↺ reaction, ◇ free action.</p></div>
<div class="toc"><h2>Contents</h2><ol>${titles.map((t) => `<li>${esc(t)}</li>`).join('')}</ol></div>
${chapters.map(html).join('\n')}
</body></html>`
  const htmlFile = join(WORK, `${v.slug}.html`)
  writeFileSync(htmlFile, page)
  const pdf = join(OUT, `pf2e-${v.slug}.pdf`)
  execFileSync(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      `--user-data-dir=${PROFILE}`,
      '--no-pdf-header-footer',
      '--generate-pdf-document-outline',
      `--print-to-pdf=${pdf}`,
      `file://${htmlFile}`,
    ],
    { stdio: 'ignore', timeout: 30 * 60 * 1000 },
  )
  const size = statSync(pdf).size
  const line = `${v.slug}: ${parts.length} chapters, ${(size / 1048576).toFixed(1)} MB${size > MAX_BYTES ? '  OVER 50 MB' : ''}`
  report.push(line)
  console.log(line)
}
if (!ONLY) writeFileSync(join(OUT, 'README.txt'), `${report.join('\n')}\n`)
