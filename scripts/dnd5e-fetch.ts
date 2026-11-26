// Caches the dnd2024.wikidot.com pages the 5e generator reads into `.local/dnd5e/wikidot/`
// (gitignored): the class, subclass, spell, feat, species, background, equipment and magic
// item pages (every tab of every index, so each later book's options come too), about one
// request a second, skipping pages already saved. Only the generator's facts and
// the overlap test use them; their text is never committed.
//
//   npm run dnd5e:fetch -- [cacheDir]

import { join } from 'node:path'
import { CLASSES } from './lib/dnd5eWiki'
import { SOURCE_LINE, pageContent, plainText, wikiLinks, wikiPage } from './lib/wikidot'

const ROOT = join(import.meta.dirname, '..')
const DIR = process.argv[2] ?? join(ROOT, '.local', 'dnd5e', 'wikidot')

const INDEXES = [
  'spell:all',
  'feat:all',
  'species:all',
  'background:all',
  'class:multiclassing',
  'warlock:eldritch-invocation',
  'sorcerer:metamagic',
  'equipment:all',
  'equipment:weapon',
  'equipment:armor',
  'equipment:adventuring-gear',
  'equipment:tool',
  'magic-item:all',
  'magic-item:sources',
  ...CLASSES.map((c) => `${c}:main`),
]

/** Links worth following from an index page: the entries it lists. */
const FOLLOW = new RegExp(`^(spell|feat|species|background|magic-item|${CLASSES.join('|')}):`)
const SKIP = /:(.*-school)$/

const seen = new Set<string>()
const queue = [...INDEXES]
let n = 0
while (queue.length) {
  const page = queue.shift()!
  if (seen.has(page)) continue
  seen.add(page)
  const html = await wikiPage(DIR, page)
  if (!html) {
    console.warn(`missing: ${page}`)
    continue
  }
  if (++n % 50 === 0) console.log(`${n} pages…`)
  // Index pages, and the per-book lists they link to (`magic-item:au`, `spell:wow`).
  const list = !SOURCE_LINE.test(plainText(pageContent(html)))
  const depth = INDEXES.includes(page) || page.endsWith(':main') || list ? 1 : 0
  if (!depth) continue
  for (const link of wikiLinks(html))
    if (FOLLOW.test(link) && !SKIP.test(link) && !seen.has(link)) queue.push(link)
}
console.log(`${seen.size} pages in ${DIR}`)
