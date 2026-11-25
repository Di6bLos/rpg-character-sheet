// Builds the local Pathfinder 2e rules bible (`.local/rules/pf2e/`, gitignored) from the
// Archives of Nethys data in `.local/pf2e/aon/*.json.gz` (pulled from the search backend
// 2e.aonprd.com uses). Organised by topic: the rules chapters of each book in book order,
// then one file per class (features, subclasses, feats, focus spells), per ancestry
// (heritages, feats), per archetype (feats), then feats, spells, equipment, creatures and
// GM material. Every entry keeps its source and page and says whether it is Remaster (ORC,
// Rage of Elements on) or Legacy (OGL) and what replaced it.
//
//   npm run pf2e:bible -- [dataDir] [outDir]
//   npm run pf2e:bible -- --orc [dataDir] [outDir]   (what may be shared, e.g. the library
//     PDFs; default out pf2e-orc/: Remaster entries from the open rulebooks only (`OPEN_BOOKS`
//     in scripts/lib/aon.ts), none named for a deity or Golarion proper noun, no lore files,
//     setting or legacy sources or deity stat lines. Exits non-zero if any would still be written.)

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type AonDoc as Doc,
  classOfType as typeOf,
  cleanMarkdown,
  heritageAncestry,
  legacyBooks,
  loadAon,
  located,
  openBook,
  orcProblems,
  page,
  remaster,
  shareable,
  slug,
  withoutDeities,
  withoutLegacy,
} from './lib/aon'

const ROOT = join(import.meta.dirname, '..')
const ORC_ONLY = process.argv.includes('--orc')
const [dataArg, outArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const DATA = dataArg ?? join(ROOT, '.local', 'pf2e', 'aon')
const OUT = outArg ?? join(ROOT, '.local', 'rules', ORC_ONLY ? 'pf2e-orc' : 'pf2e')
/** Mostly Golarion setting (Paizo Reserved Material), left out of the shareable set. */
const LORE = new Set([
  'deity',
  'deity-category',
  'hellknight-order',
  'cult-activity',
  'article',
  'source',
])
/** Rules files open with the core books, in this order; the rest follow by release. */
const CORE = [
  'Player Core',
  'Player Core 2',
  'GM Core',
  'Monster Core',
  'Monster Core 2',
  'NPC Core',
]

const everything = loadAon(DATA)
/** Every deity name AoN has, to spot entries named for one (Achaekek's Clutch). */
const DEITIES = everything.filter((d) => d.category === 'deity').map((d) => d.name)
const docs = everything.filter(
  (d) => !ORC_ONLY || (remaster(d) && !LORE.has(d.category) && shareable(d, DEITIES)),
)
/**
 * Books the ORC set leaves out wherever they're cited: legacy (OGL) books, and every book that
 * isn't an open rulebook (`OPEN_BOOKS`), whose sections AoN sometimes inlines into rulebook pages.
 */
const CLOSED_BOOKS = legacyBooks(everything)
for (const d of everything)
  for (const b of [d.primary_source, ...(d.category === 'source' ? [d.name] : [])])
    if (b && !openBook(b)) CLOSED_BOOKS.add(b.trim())
const byId = new Map(docs.map((d) => [d.id, d]))
const placed = new Set<string>()
/** Entries already printed inside another (`<document>`), so book order doesn't repeat them. */
const embedded = new Set<string>()
const embed = (id: string) => {
  embedded.add(id)
  placed.add(id)
}

const has = (d: Doc, trait: string) => (d.trait ?? []).includes(trait)
const byName = (a: Doc, b: Doc) =>
  a.name.localeCompare(b.name) || Number(remaster(b)) - Number(remaster(a))
const byLevel = (a: Doc, b: Doc) => (a.level ?? 0) - (b.level ?? 0) || byName(a, b)

function edition(d: Doc) {
  const tag = remaster(d) ? 'Remaster (ORC)' : 'Legacy (OGL)'
  const later = d.remaster_name?.length ? ` · remastered as ${d.remaster_name.join(', ')}` : ''
  const earlier = d.legacy_name?.length ? ` · replaces legacy ${d.legacy_name.join(', ')}` : ''
  return `_${tag}${later}${earlier}_`
}

/** One entry with its edition line under the title. */
function entry(d: Doc, h: number) {
  placed.add(d.id)
  const cleaned = cleanMarkdown(d.markdown ?? '', h, byId, embed, new Set([d.id]))
  const body = ORC_ONLY ? withoutDeities(withoutLegacy(cleaned, CLOSED_BOOKS)) : cleaned
  const [first = '', ...rest] = body.split('\n')
  const head = first.startsWith('#') ? first : `${'#'.repeat(h)} ${d.name}`
  const tail = first.startsWith('#') ? rest : [first, ...rest]
  return `${head}\n\n${edition(d)}\n${tail.join('\n')}\n`
}

const written: { file: string; title: string; entries: number }[] = []

/** What the ORC set would leak (legacy sources, deity lines), by file; the build fails on any. */
const leaks: string[] = []

function write(file: string, title: string, parts: string[], entries: number, intro = '') {
  const path = join(OUT, file)
  mkdirSync(join(path, '..'), { recursive: true })
  const md = `# ${title}\n\n${intro ? `${intro}\n\n` : ''}${parts.join('\n')}`
  if (ORC_ONLY) for (const l of orcProblems(md, CLOSED_BOOKS)) leaks.push(`${file}: ${l}`)
  writeFileSync(path, md)
  written.push({ file, title, entries })
}

/** `## Heading` then the entries, skipped when empty. */
function section(title: string, list: Doc[], h = 3) {
  return list.length ? [`## ${title}\n`, ...list.map((d) => entry(d, h))] : []
}

function byLevelSections(list: Doc[], label = 'Level') {
  const out: string[] = []
  let last: number | undefined
  for (const d of [...list].sort(byLevel)) {
    if (d.level !== last) out.push(`### ${label} ${d.level ?? 0}\n`)
    last = d.level
    out.push(entry(d, 4))
  }
  return out
}

const of = (...cats: string[]) => docs.filter((d) => cats.includes(d.category))

rmSync(OUT, { recursive: true, force: true })

// --- Rules chapters, one file per book, in book order ---------------------
{
  const rules = of('rules', 'sidebar')
  const books = new Map<string, Doc[]>()
  for (const d of rules) {
    const b = d.primary_source ?? 'Unknown'
    books.set(b, [...(books.get(b) ?? []), d])
  }
  const rank = (book: string) => (CORE.includes(book) ? CORE.indexOf(book) : CORE.length)
  const order = [...books.entries()].sort(
    ([x, a], [y, b]) =>
      rank(x) - rank(y) ||
      Number(remaster(b[0]!)) - Number(remaster(a[0]!)) ||
      (a[0]!.release_date ?? '').localeCompare(b[0]!.release_date ?? ''),
  )
  order.forEach(([book, list], i) => {
    const main = list.filter((d) => d.category === 'rules')
    const urls = new Map(main.map((d) => [d.url, d]))
    const seq: Doc[] = []
    const seen = new Set<string>()
    const heads = main
      .filter((d) => !d.previous_link || !urls.has(d.previous_link.url))
      .sort((a, b) => page(a) - page(b))
    for (const start of [...heads, ...[...main].sort((a, b) => page(a) - page(b))]) {
      let d: Doc | undefined = start
      while (d && !seen.has(d.id)) {
        seen.add(d.id)
        seq.push(d)
        d = d.next_link ? urls.get(d.next_link.url) : undefined
      }
    }
    for (const side of list
      .filter((d) => d.category === 'sidebar')
      .sort((a, b) => page(a) - page(b))) {
      let at = seq.length
      for (let j = seq.length - 1; j >= 0; j--)
        if (page(seq[j]!) <= page(side)) {
          at = j + 1
          break
        }
      seq.splice(at, 0, side)
    }
    const parts: string[] = []
    const crumbs: string[] = []
    for (const d of seq) {
      if (embedded.has(d.id)) continue
      const path = d.breadcrumbs ?? []
      path.forEach((c, k) => {
        if (crumbs[k] === c) return
        crumbs.length = k
        crumbs[k] = c
        parts.push(`${'#'.repeat(Math.min(6, k + 2))} ${c}\n`)
      })
      crumbs.length = path.length
      const h = Math.min(6, path.length + 2)
      crumbs[path.length] = d.name
      parts.push(entry(d, h))
    }
    const tag = remaster(list[0]!) ? 'Remaster (ORC)' : 'Legacy (OGL)'
    write(
      `rules/${String(i + 1).padStart(2, '0')}-${slug(book)}.md`,
      `${book}: rules`,
      parts,
      list.length,
      `_${tag}. Chapters in book order, sidebars placed by page._`,
    )
  })
}

// --- Core references ----------------------------------------------------------
write(
  'conditions.md',
  'Conditions',
  [...of('condition')].sort(byName).map((d) => entry(d, 2)),
  of('condition').length,
)
write(
  'traits.md',
  'Traits',
  [...of('trait')].sort(byName).map((d) => entry(d, 2)),
  of('trait').length,
)
write(
  'skills.md',
  'Skills and skill actions',
  [
    ...section('Skills', of('skill').sort(byName)),
    ...section('General skill actions', of('skill-general-action').sort(byName)),
  ],
  of('skill', 'skill-general-action').length,
)
write(
  'languages-planes-traditions.md',
  'Languages, planes, traditions and elements',
  [
    ...section('Languages', of('language').sort(byName)),
    ...section('Planes', of('plane').sort(byName)),
    ...section('Magical traditions', of('tradition').sort(byName)),
    ...section('Elements', of('element').sort(byName)),
  ],
  of('language', 'plane', 'tradition', 'element').length,
)
{
  const actions = of('action').sort(byName)
  const parts: string[] = []
  let letter = ''
  for (const d of actions) {
    const l = d.name[0]?.toUpperCase() ?? '?'
    if (l !== letter) parts.push(`## ${(letter = l)}\n`)
    parts.push(entry(d, 3))
  }
  write(
    'actions.md',
    'Actions and activities',
    parts,
    actions.length,
    '_Every action, activity and reaction, A–Z._',
  )
}

// --- Classes ------------------------------------------------------------------
const classNames = [...new Set(of('class').map((d) => d.name))].sort()
const classOfType = (t?: string) => typeOf(t, classNames)
const subclassCats = new Set(
  docs.filter((d) => classOfType(d.type) && d.category !== 'class').map((d) => d.category),
)
for (const c of classNames) {
  const own = (d: Doc) => classOfType(d.type) === c
  const subs = docs.filter((d) => subclassCats.has(d.category) && own(d))
  const subTypes = [...new Set(subs.map((d) => d.type!))].sort()
  const features = of('class-feature').filter((d) => [d.class].flat().includes(c))
  const feats = of('feat').filter((d) => has(d, c))
  const focus = of('spell').filter((d) => d.spell_type === 'Focus' && has(d, c))
  const kits = of('class-kit', 'class-sample').filter(
    (d) =>
      d.name.includes(c) ||
      (d.markdown ?? '').includes(`**Class** ${c}`) ||
      [d.class].flat().includes(c),
  )
  const domains = c === 'Cleric' ? of('domain').sort(byName) : []
  const parts = [
    ...section(
      'Class',
      of('class')
        .filter((d) => d.name === c)
        .sort(byName),
    ),
    ...(features.length ? ['## Class features\n', ...byLevelSections(features)] : []),
    ...subTypes.flatMap((t) => section(`${t}s`, subs.filter((d) => d.type === t).sort(byName))),
    ...section('Domains', domains),
    ...(feats.length ? ['## Feats\n', ...byLevelSections(feats)] : []),
    ...(focus.length ? ['## Focus spells\n', ...byLevelSections(focus, 'Rank')] : []),
    ...section('Class kits and sample builds', kits.sort(byName)),
  ]
  write(
    `classes/${slug(c)}.md`,
    c,
    parts,
    features.length + subs.length + feats.length + focus.length + kits.length + domains.length + 1,
  )
}
{
  const rest = docs.filter((d) => subclassCats.has(d.category) && !placed.has(d.id))
  const leftover = [...rest, ...of('class-kit', 'class-sample').filter((d) => !placed.has(d.id))]
  if (leftover.length)
    write(
      'classes/_other-class-options.md',
      'Other class options',
      section('Options', leftover.sort(byName)),
      leftover.length,
    )
}

// --- Ancestries -----------------------------------------------------------------
{
  const ancestries = of('ancestry').filter((d) => d.type === 'Ancestry')
  const names = [...new Set(ancestries.map((d) => d.name))]
  const versatileNames = new Set(
    of('ancestry')
      .filter((d) => d.type !== 'Ancestry')
      .map((d) => d.name),
  )
  const heritages = of('heritage')
  const unmatched: Doc[] = []
  const grouped = new Map<string, Doc[]>()
  const versatileStubs: Doc[] = []
  for (const h of heritages) {
    if (versatileNames.has(h.name)) {
      versatileStubs.push(h)
      continue
    }
    const a = heritageAncestry(located(h), ancestries.map(located))
    if (!a) unmatched.push(h)
    else grouped.set(a, [...(grouped.get(a) ?? []), h])
  }
  for (const a of [...names].sort()) {
    const feats = of('feat').filter((d) => has(d, a))
    const own = grouped.get(a) ?? []
    write(
      `ancestries/${slug(a)}.md`,
      a,
      [
        ...section('Ancestry', ancestries.filter((d) => d.name === a).sort(byName)),
        ...section('Heritages', own.sort(byName)),
        ...(feats.length ? ['## Ancestry feats\n', ...byLevelSections(feats)] : []),
      ],
      1 + own.length + feats.length,
    )
  }
  const versatile = of('ancestry').filter((d) => d.type !== 'Ancestry')
  const vparts: string[] = []
  for (const v of [...versatile].sort(byName)) {
    vparts.push(entry(v, 2))
    for (const stub of versatileStubs.filter((d) => d.name === v.name)) vparts.push(entry(stub, 3))
    const feats = of('feat').filter((d) => has(d, v.name))
    if (feats.length)
      vparts.push(`### ${v.name} feats\n`, ...feats.sort(byLevel).map((d) => entry(d, 4)))
  }
  write(
    'ancestries/_versatile-heritages.md',
    'Versatile and half-human heritages',
    vparts,
    versatile.length,
  )
  if (unmatched.length)
    write(
      'ancestries/_unmatched-heritages.md',
      'Heritages not matched to an ancestry',
      unmatched.sort(byName).map((d) => entry(d, 2)),
      unmatched.length,
      '_AoN gives heritages no ancestry field; these names name none of the ancestries._',
    )
  write(
    'backgrounds.md',
    'Backgrounds',
    of('background')
      .sort(byName)
      .map((d) => entry(d, 2)),
    of('background').length,
  )
}

// --- Archetypes -----------------------------------------------------------------
{
  const archetypes = of('archetype')
  for (const n of [...new Set(archetypes.map((d) => d.name))].sort()) {
    const feats = of('feat').filter((d) => d.archetype?.includes(n))
    write(
      `archetypes/${slug(n)}.md`,
      `${n} archetype`,
      [
        ...section('Archetype', archetypes.filter((d) => d.name === n).sort(byName)),
        ...(feats.length ? ['## Feats\n', ...byLevelSections(feats)] : []),
      ],
      1 + feats.length,
    )
  }
}

// --- Feats that no class, ancestry or archetype took --------------------------
{
  const feats = of('feat')
  const skill = feats.filter((d) => has(d, 'Skill'))
  const general = feats.filter((d) => has(d, 'General') && !has(d, 'Skill'))
  write('feats/skill.md', 'Skill feats', byLevelSections(skill), skill.length)
  write('feats/general.md', 'General feats', byLevelSections(general), general.length)
  const other = feats.filter((d) => !placed.has(d.id))
  const bySource = new Map<string, Doc[]>()
  for (const d of other)
    bySource.set(d.primary_source ?? '?', [...(bySource.get(d.primary_source ?? '?') ?? []), d])
  write(
    'feats/other.md',
    'Other feats',
    [...bySource.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([s, l]) => section(s, l.sort(byLevel))),
    other.length,
    '_Feats with no class, ancestry, archetype, general or skill trait (mythic, deviant, monster…), by book._',
  )
}

// --- Spells ---------------------------------------------------------------------
{
  const spells = of('spell')
  write(
    'spells/cantrips.md',
    'Cantrips',
    spells
      .filter((d) => d.spell_type === 'Cantrip')
      .sort(byName)
      .map((d) => entry(d, 2)),
    spells.filter((d) => d.spell_type === 'Cantrip').length,
  )
  for (let r = 1; r <= 10; r++) {
    const list = spells.filter((d) => d.spell_type === 'Spell' && d.level === r).sort(byName)
    write(
      `spells/rank-${String(r).padStart(2, '0')}.md`,
      `Rank ${r} spells`,
      list.map((d) => entry(d, 2)),
      list.length,
    )
  }
  const focus = spells.filter((d) => !placed.has(d.id) && d.spell_type === 'Focus')
  write(
    'spells/focus-other.md',
    'Focus spells of no class',
    byLevelSections(focus, 'Rank'),
    focus.length,
  )
  const rest = spells.filter((d) => !placed.has(d.id))
  if (rest.length)
    write(
      'spells/other.md',
      'Other spells',
      rest.sort(byName).map((d) => entry(d, 2)),
      rest.length,
    )
  write(
    'spells/rituals.md',
    'Rituals',
    of('ritual')
      .sort(byName)
      .map((d) => entry(d, 2)),
    of('ritual').length,
  )
}

// --- Equipment ------------------------------------------------------------------
{
  const items = of('equipment')
  for (const cat of [...new Set(items.map((d) => d.item_category ?? 'Other'))].sort()) {
    const list = items.filter((d) => (d.item_category ?? 'Other') === cat)
    write(`equipment/${slug(cat)}.md`, cat, byLevelSections(list, 'Item level'), list.length)
  }
  const stats: [string, string, string[]][] = [
    ['weapon-stats.md', 'Weapons (base stats)', ['weapon']],
    ['armor-stats.md', 'Armor (base stats)', ['armor']],
    ['shield-stats.md', 'Shields (base stats)', ['shield']],
    [
      'specializations.md',
      'Weapon critical and armor specializations',
      ['weapon-group', 'armor-group'],
    ],
    ['item-bonuses.md', 'Item bonuses', ['item-bonus']],
    ['vehicles-siege.md', 'Vehicles and siege weapons', ['vehicle', 'siege-weapon']],
  ]
  for (const [file, title, cats] of stats)
    write(
      `equipment/_${file}`,
      title,
      of(...cats)
        .sort(byName)
        .map((d) => entry(d, 2)),
      of(...cats).length,
    )
}

// --- Creatures ------------------------------------------------------------------
{
  const creatures = of('creature')
  for (const lvl of [...new Set(creatures.map((d) => d.level ?? 0))].sort((a, b) => a - b)) {
    const list = creatures.filter((d) => (d.level ?? 0) === lvl).sort(byName)
    write(
      `creatures/level-${lvl < 0 ? 'minus-' : ''}${String(Math.abs(lvl)).padStart(2, '0')}.md`,
      `Level ${lvl} creatures`,
      list.map((d) => entry(d, 2)),
      list.length,
    )
  }
  write(
    'creatures/_families.md',
    'Creature families',
    of('creature-family')
      .sort(byName)
      .map((d) => entry(d, 2)),
    of('creature-family').length,
  )
  write(
    'creatures/_abilities.md',
    'Creature abilities',
    of('creature-ability')
      .sort(byName)
      .map((d) => entry(d, 2)),
    of('creature-ability').length,
  )
  write(
    'creatures/_adjustments.md',
    'Creature adjustments and theme templates',
    [
      ...section('Adjustments', of('creature-adjustment').sort(byName)),
      ...section('Theme templates', of('creature-theme-template').sort(byName)),
    ],
    of('creature-adjustment', 'creature-theme-template').length,
  )
  write(
    'creatures/_companions.md',
    'Animal companions, familiars and followers',
    [
      ...section(
        'Animal companions',
        of('animal-companion', 'animal-companion-unique').sort(byName),
      ),
      ...section(
        'Companion specializations and advanced options',
        of('animal-companion-specialization', 'animal-companion-advanced').sort(byName),
      ),
      ...section('Familiar abilities', of('familiar-ability').sort(byName)),
      ...section('Specific familiars', of('familiar-specific').sort(byName)),
      ...section('Followers', of('follower').sort(byName)),
    ],
    of(
      'animal-companion',
      'animal-companion-unique',
      'animal-companion-specialization',
      'animal-companion-advanced',
      'familiar-ability',
      'familiar-specific',
      'follower',
    ).length,
  )
}

// --- GM material ----------------------------------------------------------------
{
  const gm: [string, string, string[]][] = [
    ['hazards.md', 'Hazards', ['hazard', 'weather-hazard']],
    ['afflictions.md', 'Diseases and curses', ['disease', 'curse']],
    ['deities.md', 'Deities', ['deity-category', 'deity']],
    ['relics.md', 'Relics', ['relic', 'set-relic']],
    ['kingdom.md', 'Kingdom building', ['kingdom-structure', 'kingdom-event']],
    ['warfare.md', 'Warfare', ['warfare-army', 'warfare-tactic']],
    ['mythic.md', 'Mythic callings', ['mythic-calling']],
    [
      'organizations.md',
      'Hellknight orders and cult activities',
      ['hellknight-order', 'cult-activity'],
    ],
    ['campsite-meals.md', 'Campsite meals', ['campsite-meal']],
    ['articles.md', 'Articles', ['article']],
    ['sources.md', 'Sources', ['source']],
  ]
  for (const [file, title, cats] of gm) {
    const list = of(...cats).sort(byName)
    if (!list.length) continue
    write(
      `gm/${file}`,
      title,
      list.map((d) => entry(d, 2)),
      list.length,
    )
  }
}

// --- Anything left over, so nothing is silently dropped ------------------------
{
  const skip = new Set(['category-page'])
  const left = docs.filter((d) => !placed.has(d.id) && !skip.has(d.category))
  const cats = [...new Set(left.map((d) => d.category))].sort()
  for (const c of cats) {
    const list = left.filter((d) => d.category === c).sort(byName)
    write(
      `misc/${slug(c)}.md`,
      c,
      list.map((d) => entry(d, 2)),
      list.length,
    )
  }
}

// --- Index ----------------------------------------------------------------------
{
  const folders = new Map<string, typeof written>()
  for (const w of written) {
    const f = w.file.includes('/') ? w.file.split('/')[0]! : '.'
    folders.set(f, [...(folders.get(f) ?? []), w])
  }
  const lines = [
    '# Pathfinder 2e rules bible',
    '',
    `Generated ${new Date().toISOString().slice(0, 10)} by \`scripts/pf2e-bible.ts\` from Archives of Nethys data (${docs.length} entries, ${placed.size} placed). Local only, never committed.`,
    '',
    'Each entry gives its source and page and is tagged **Remaster (ORC)** (Rage of Elements, Aug 2023, and later) or **Legacy (OGL)**, with what replaced it. Actions: ◆ one, ◆◆ two, ◆◆◆ three, ↺ reaction, ◇ free. Golarion names (deities, nations, NPCs) are Paizo Reserved Material even in ORC books.',
    '',
  ]
  for (const [folder, list] of folders) {
    lines.push(`## ${folder === '.' ? 'Core references' : folder}`, '')
    for (const w of list) lines.push(`- [${w.title}](${w.file}) (${w.entries})`)
    lines.push('')
  }
  writeFileSync(join(OUT, 'README.md'), lines.join('\n'))
  console.log(`${written.length} files, ${placed.size}/${docs.length} entries placed → ${OUT}`)
}

if (leaks.length) {
  console.error(
    `ORC set leaks ${leaks.length} line(s) it must not share:\n${leaks.slice(0, 20).join('\n')}`,
  )
  process.exit(1)
}
