// Writes the committed 5e (2024 rules) player options (`data/dnd5e/generated/*.json`, typed in
// `data/dnd5e/types.ts`) and the SRD allowlist (`data/dnd5e/srd-allowlist.json`).
//
// - SRD 5.2.1 entries (`.local/dnd5e/SRD_CC_v5.2.1.pdf`, CC-BY-4.0) keep the SRD's text and page.
// - Options not in the SRD, from the Player's Handbook (2024) and the later official books in
//   `data/dnd5e/sources.ts`, take only facts from the dnd2024.wikidot.com cache (`npm run
//   dnd5e:fetch`): names, levels, stat lines, table numbers, prerequisites. Their prose is a
//   summary written for Lantern, kept with the hand-encoded mechanics in `data/dnd5e/authored/`
//   (each later book's in `authored/books/<book>/`; the user's decisions of 2026-11-25 and
//   2026-11-26, see the rpg-rules skill's licensing.md). The wiki's wording is never written.
// - Every SRD entry gets a one-line `summary` drawn from its own text.
//
// Also writes local authoring packets (`.local/dnd5e/authoring/*.md`, gitignored) listing each
// entry's facts and source text for whoever writes the summaries and mechanics.
//
//   npm run dnd5e:data -- [dryRunDir]

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type {
  Dnd5eArmorDef,
  Dnd5eBackgroundDef,
  Dnd5eClassDef,
  Dnd5eConditionDef,
  Dnd5eFeatDef,
  Dnd5eFeature,
  Dnd5eGearDef,
  Dnd5eLevel,
  Dnd5eMagicItemDef,
  Dnd5eMastery,
  Dnd5eMasteryDef,
  Dnd5eOption,
  Dnd5eOptionEntry,
  Dnd5eOptionGroup,
  Dnd5eSize,
  Dnd5eSourceBook,
  Dnd5eSpeciesDef,
  Dnd5eSpellDef,
  Dnd5eSpellcasting,
  Dnd5eSubclassDef,
  Dnd5eWeaponDef,
  Dnd5eWeaponProperty,
} from '../data/dnd5e/types'
import {
  type SrdEntry,
  type SrdSection,
  find,
  rows,
  sectionText,
  sectionTree,
  srdClass,
  srdIndex,
} from './lib/dnd5eSrd'
import {
  ABILITY,
  abilitiesIn,
  abilityIncrease,
  equipmentOptions,
  prerequisite,
  skillChoice,
  slug,
  spellFacts,
  spellHeader,
  srdSummary,
} from './lib/dnd5eRules'
import {
  CLASSES,
  bookFor,
  bookOf,
  sourceFields,
  wikiClass,
  wikiEntries,
  wikiFeat,
  wikiFeatures,
  wikiOptionLists,
  wikiSpell,
} from './lib/dnd5eWiki'
import { srdBlocks, srdItems } from './lib/srd'
import {
  SOURCE_LINE,
  cachedPage,
  pageContent,
  plainText,
  wikiSections,
  wikiTables,
  wikiTitle,
} from './lib/wikidot'

const ROOT = join(import.meta.dirname, '..')
const LOCAL = join(ROOT, '.local', 'dnd5e')
const WIKI = join(LOCAL, 'wikidot')
/** Where to write: the repo, or (for a dry run) another folder given as the first argument. */
const DEST = process.argv[2] ? resolve(process.argv[2]) : ROOT
const OUT = join(DEST, 'data', 'dnd5e', 'generated')
const AUTHORED = join(ROOT, 'data', 'dnd5e', 'authored')
const PACKETS = process.argv[2] ? join(DEST, 'authoring') : join(LOCAL, 'authoring')
const SRD = 'SRD 5.2.1' as const

const page = (name: string) => {
  const html = cachedPage(WIKI, name)
  if (!html) throw new Error(`wiki page not cached: ${name} (run npm run dnd5e:fetch)`)
  return html
}
const optionalPage = (name: string) => cachedPage(WIKI, name)

const items = await srdItems(join(LOCAL, 'SRD_CC_v5.2.1.pdf'), join(LOCAL, 'srd-items.json'))
const root = sectionTree(srdBlocks(items, 5, 253))
const srd = srdIndex(root)

/** SRD names differ from the book's for a few spells ("Acid Arrow" for Melf's): a match key. */
const ALIASES: Record<string, string> = { hand: 'arcane-hand', sword: 'arcane-sword' }
const key = (name: string) => {
  const k = slug(name.replace(/^[A-Z][a-z]+['’]s (?=[A-Z])/, '').replace(/\s*\(.*\)$/, ''))
  return ALIASES[k] ?? k
}
const srdBy = <T extends { name: string }>(list: T[]) => new Map(list.map((e) => [key(e.name), e]))
const srdSpells = srdBy(srd.spells)

// --- Authored summaries and mechanics ------------------------------------------------------

type Authored = Record<string, Record<string, unknown>>
/** Each later book's summaries sit in their own folder (`authored/books/<book>/`), same layout. */
const BOOK_DIRS = existsSync(join(AUTHORED, 'books'))
  ? readdirSync(join(AUTHORED, 'books')).map((d) => join(AUTHORED, 'books', d))
  : []
/** An authored file, merged with the same file of every book folder (their maps one level deep). */
function authored(file: string): Authored {
  const out: Authored = {}
  for (const f of [join(AUTHORED, file), ...BOOK_DIRS.map((d) => join(d, file))]) {
    if (!existsSync(f)) continue
    for (const [k, v] of Object.entries(JSON.parse(readFileSync(f, 'utf8')) as Authored)) {
      const prev = out[k]
      out[k] =
        prev && typeof prev === 'object' && !Array.isArray(prev) && !Array.isArray(v)
          ? { ...prev, ...v }
          : v
    }
  }
  return out
}
/** An authored block by its key, matching ' and ’ alike. */
function pick<T>(a: Record<string, T> | undefined, name: string): T | undefined {
  if (!a) return undefined
  if (name in a) return a[name]
  const norm = (k: string) => k.replace(/’/g, "'").toLowerCase()
  const hit = Object.keys(a).find((k) => norm(k) === norm(name))
  return hit === undefined ? undefined : a[hit]
}

/** Copies authored fields onto an entry; a non-SRD entry never takes `text`. */
function withAuthored<T extends object>(entry: T, a: Record<string, unknown> | undefined): T {
  if (!a) return entry
  const out = { ...entry } as Record<string, unknown>
  for (const [k, v] of Object.entries(a)) {
    if (k === 'text' || k === 'features' || k === 'benefits' || k === 'traits' || k === 'lineages')
      continue
    // `null` takes out a fact the parser got wrong (a save that is only Advantage on saves).
    if (v === null) delete out[k]
    else out[k] = v
  }
  return out as T
}

/** Packets for the summary writers: one block per entry, with the source text (local only). */
const packets = new Map<string, string[]>()
/** A book's folder name (`arcana-unleashed`), for its packets and authored files. */
const bookDir = (b: Dnd5eSourceBook) => slug(b.replace(/^D&D Beyond Drops: /, 'drops '))
function packet(
  file: string,
  title: string,
  facts: unknown,
  source: string | undefined,
  book?: Dnd5eSourceBook,
) {
  if (book && book !== 'PHB 2024') file = `${bookDir(book)}/${file}`
  const list = packets.get(file) ?? []
  list.push(
    `## ${title}\n\nFacts: \`${JSON.stringify(facts)}\`\n\n${source ?? '(SRD entry: text kept)'}\n`,
  )
  packets.set(file, list)
}

// --- Classes and subclasses ---------------------------------------------------------------

const classNames: Record<string, string> = Object.fromEntries(
  CLASSES.map((c) => [c[0]!.toUpperCase() + c.slice(1), c]),
)
const srdClasses = new Map(srd.classes.map((c) => [slug(c.title), srdClass(c)]))

const ORDINAL = /^(\d)(st|nd|rd|th)$/
function spellcastingOf(
  cls: string,
  header: string[],
  levels: Record<string, string>[],
  feature: string,
): Dnd5eSpellcasting | undefined {
  const num = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : 0)
  const slotCols = header.filter((h) => /^\d$/.test(h) || ORDINAL.test(h))
  const ability = abilitiesIn(
    feature.match(/(\w+) is (?:your|the) spellcasting ability/i)?.[1] ?? '',
  )[0]
  if (!ability) return undefined
  const focus = feature
    .match(
      /use (?:an? |any )?([A-Z][\w’' ]+?)(?:,| or)[^.]*? as a Spellcasting Focus|use (?:an? |any )?([A-Z][\w’' ]+?) as a Spellcasting Focus/,
    )
    ?.slice(1)
    .find(Boolean)
  const prep = header.find((h) => /Prepared/.test(h))
  const cantrips = levels.map((r) => num(r['Cantrips']))
  const prepared = levels.map((r) => num(prep ? r[prep] : undefined))
  const base = { ability, list: cls, cantrips, prepared, ...(focus ? { focus } : {}) }
  // Any caster can cast a prepared Ritual spell as a Ritual (SRD p. 189); `ritual` marks
  // casting them unprepared, from a spellbook (the Wizard's Ritual Adept).
  const ritual = /Ritual Adept/.test(feature)
  if (header.includes('Slot Level'))
    return {
      ...base,
      kind: 'pact',
      ritual,
      pact: levels.map((r) => ({ slots: num(r['Spell Slots']), slotLevel: num(r['Slot Level']) })),
    }
  if (!slotCols.length) return undefined
  const slots = levels.map((r) => {
    const s = slotCols.map((h) => num(r[h]))
    return [...s, ...Array(9 - s.length).fill(0)]
  })
  const kind = slotCols.length === 9 ? 'full' : slotCols.length === 5 ? 'half' : 'third'
  return { ...base, kind, ritual, slots }
}

const FEATURE_KEYS = new Set(['Level', 'Proficiency Bonus', 'Class Features'])

function levelTable(header: string[], levels: Record<string, string>[]): Dnd5eLevel[] {
  return levels.map((r) => ({
    level: Number(r['Level']),
    proficiencyBonus: Number((r['Proficiency Bonus'] ?? '').replace('+', '')),
    features: (r['Class Features'] ?? '')
      .split(/,\s*(?![^()]*\))/)
      .map((f) => f.trim())
      .filter((f) => f && f !== '-' && f !== '—'),
    columns: Object.fromEntries(
      header
        .filter((h) => !FEATURE_KEYS.has(h))
        .map((h) => [h, (r[h] ?? '').replace(/^D(\d+)$/, 'd$1')]),
    ),
  }))
}

const featureLevel = (f: { level: number }) => f.level

/** A spell's name as the SRD prints it ("Melf's Acid Arrow" → "Acid Arrow"). */
const spellName = (n: string) => srdSpells.get(key(n))?.name ?? n

function splitList(s: string) {
  return s
    .replace(/\band\b/g, ',')
    .split(/,\s*/)
    .map((x) => x.trim())
    .filter(Boolean)
}

/**
 * A slug not yet taken in `list`. Two books' different options with one name (Eberron's and
 * Lorwyn's Changeling) keep both: the later one takes its book's folder name as a suffix.
 */
function uniqueSlug(list: { slug: string }[], base: string, book: Dnd5eSourceBook) {
  return list.some((x) => x.slug === base) ? `${base}-${bookDir(book)}` : base
}

const classes: Dnd5eClassDef[] = []
const subclasses: Dnd5eSubclassDef[] = []
const optionGroups: Dnd5eOptionGroup[] = []

/** Builds a feature list from the wiki's sections, with the SRD's text where it has it. */
function features(
  wiki: ReturnType<typeof wikiFeatures>,
  srdFeatures: (SrdEntry & { level: number })[] | undefined,
  a: Record<string, Record<string, unknown>> | undefined,
  packetFile: string,
  owner: string,
  book?: Dnd5eSourceBook,
): Dnd5eFeature[] {
  // The SRD's own features when it prints the class or subclass; the wiki's otherwise.
  const list = srdFeatures?.length
    ? srdFeatures.map((f) => ({ name: f.name, level: f.level, srd: f, text: '' }))
    : wiki.map((w) => ({
        name: FEATURE_NAMES[w.name] ?? w.name,
        level: w.level,
        srd: undefined,
        text: w.text,
      }))
  return list.map((f) => {
    const s = f.srd
    const base: Dnd5eFeature = s
      ? { name: s.name, level: f.level, srd: true, page: s.page, text: s.text }
      : { name: f.name, level: f.level, srd: false }
    const auth = pick(a, `${f.level}:${f.name}`) ?? pick(a, f.name)
    packet(
      packetFile,
      `${owner} — Level ${f.level}: ${f.name}`,
      { srd: !!s, key: f.name },
      s ? `SRD text (already committed):\n\n${s.text}` : f.text,
      book,
    )
    return withAuthored(base, auth)
  })
}

/** The table's feature names, renamed to the class's own where the wiki words them differently. */
function alignTable(levels: Dnd5eLevel[], feats: Dnd5eFeature[]) {
  const base = (n: string) => key(n.replace(/\s*\((?:One|Two|Three|Four) Uses?\)$/, ''))
  for (const l of levels) {
    const here = feats.filter((f) => f.level === l.level)
    const unnamed = here.filter((f) => !l.features.some((n) => base(n) === key(f.name)))
    l.features = l.features.map((n) => {
      if (
        /^Subclass Feature$/i.test(n) ||
        feats.some((f) => f.level <= l.level && base(n) === key(f.name))
      )
        return /^Subclass Feature$/i.test(n) ? 'Subclass feature' : n
      return unnamed.length === 1 ? unnamed[0]!.name : n
    })
  }
}

/** "Simple and Martial weapons that have the Light property" → one line per group. */
function weaponLines(s: string) {
  const t = s.replace(/\s+/g, ' ').trim()
  const out: string[] = []
  if (/\bSimple\b/i.test(t)) out.push('Simple weapons')
  const martial = t.match(/\bMartial(?: weapons)?(.*)$/i)
  if (martial) out.push(`Martial weapons${martial[1]!.replace(/^ weapons/i, '')}`.trim())
  return out
}

/** "Thieves' Tools, Tinker's Tools, and one type of Artisan's Tools of your choice". */
function toolLines(s: string) {
  const t = s.trim()
  if (!t) return { tools: [] as string[] }
  const choice = t.match(
    /(?:^|,\s*(?:and\s+)?)(?:Choose (\w+)(?: types? of)?:?\s*|(one) type of\s+)(.+?)(?: of your choice)?$/i,
  )
  const fixed = choice ? t.slice(0, choice.index).split(/,\s*/).filter(Boolean) : [t]
  const count = choice ? Number(choice[1]) || 1 : 0
  // "Artisan’s Tools or Musical Instrument", "Musical Instruments" → the gear's names.
  const from = choice?.[3]!
    .split(/\s+or\s+/)
    .map((x) => x.trim().replace(/Instruments$/, 'Instrument'))
  return {
    tools: fixed.map((x) => x.replace(/^and\s+/, '').trim()),
    ...(choice ? { toolChoice: { kind: 'tool' as const, count, from } } : {}),
  }
}

/** "Hit Point Die, proficiency with X, … and training with Y" → "Hit Point Die; X; …; Y". */
function traitList(s: string) {
  return s
    .replace(/proficiency in one skill of your choice from the (\w+)’s skill list/g, 'one $1 skill')
    .replace(/\b(proficiency|training) (with|in) /g, '')
    .split(/,\s*(?:and\s+)?/)
    .map((x) => x.trim())
    .filter(Boolean)
    .join('; ')
}

/** Feature names the wiki words differently from the book. */
const FEATURE_NAMES: Record<string, string> = {
  'Arcane ward': 'Arcane Ward',
  'Battle Smith spells': 'Battle Smith Spells',
}

for (const cls of CLASSES) {
  const html = page(`${cls}:main`)
  const w = wikiClass(html)
  const s = srdClasses.get(cls)
  const book = s ? SRD : w.book!
  const name = cls[0]!.toUpperCase() + cls.slice(1)
  const a = authored(join('classes', `${cls}.json`))
  const t = w.traits
  const levels = levelTable(w.header, w.levels)
  if (levels.length !== 20) throw new Error(`${cls}: ${levels.length} levels`)
  const spellFeature = w.features.find((f) => /^(Spellcasting|Pact Magic)$/.test(f.name))
  const primary = t['Primary Ability'] ?? ''
  const feats = features(
    w.features,
    s?.features,
    a['features'] as Record<string, Record<string, unknown>> | undefined,
    `class-${cls}`,
    name,
  )
  const skills = skillChoice(t['Skill Proficiencies'] ?? '')
  const tools = t['Tool Proficiencies'] ?? ''
  const multi =
    w.multiclass.match(/Core \w+ Traits table: ([^.]+?)\./)?.[1] ??
    (/Gain the Hit Point Die/.test(w.multiclass) ? 'Hit Point Die' : '')
  const groups: string[] = []
  const def: Dnd5eClassDef = {
    slug: cls,
    name,
    srd: !!s,
    source: book,
    ...(s ? { page: s.page } : { wiki: `${cls}:main` }),
    hitDie: Number((t['Hit Point Die'] ?? '').match(/D(\d+)/i)?.[1]) as 6 | 8 | 10 | 12,
    primaryAbility: { abilities: abilitiesIn(primary), all: / and /.test(primary) },
    saves: abilitiesIn(t['Saving Throw Proficiencies'] ?? ''),
    skills,
    weapons: weaponLines(t['Weapon Proficiencies'] ?? ''),
    armor: splitList((t['Armor Training'] ?? '').replace(/ armor/gi, ''))
      .filter((x) => x !== 'None')
      .map((x) => (x === 'Shields' ? x : `${x} armor`)),
    ...toolLines(tools),
    equipment: equipmentOptions(t['Starting Equipment'] ?? ''),
    multiclass: {
      prerequisite: { abilities: abilitiesIn(primary), any: !/ and /.test(primary) },
      // The SRD's own list; for a non-SRD class, just the traits, in a list of names.
      gains: s ? multi : traitList(multi),
    },
    levels,
    columns: w.header.filter((h) => !FEATURE_KEYS.has(h)),
    subclassLevel: levels.find((l) => l.features.some((f) => f.endsWith('Subclass')))!.level,
    asiLevels: levels
      .filter((l) => l.features.some((f) => f === 'Ability Score Improvement'))
      .map((l) => l.level),
    epicBoonLevel: levels.find((l) => l.features.includes('Epic Boon'))!.level,
    ...(spellFeature
      ? (() => {
          const ritualAdept = w.features.some((f) => f.name === 'Ritual Adept')
            ? ' Ritual Adept'
            : ''
          const sc = spellcastingOf(cls, w.header, w.levels, spellFeature.text + ritualAdept)
          return sc ? { spellcasting: sc } : {}
        })()
      : {}),
    features: feats,
    optionGroups: groups,
    ...(a['summary'] ? { summary: a['summary'] as unknown as string } : {}),
  }
  alignTable(levels, feats)
  if (!s)
    packet(
      `class-${cls}`,
      `${name} (class)`,
      { slug: cls },
      plainText(pageContent(html)).slice(0, 3000),
    )
  classes.push(def)

  // Subclasses: the PHB's (and the SRD's one) or, for the Artificer, its book's.
  const subAuth = (a['subclasses'] ?? {}) as Record<string, Record<string, unknown>>
  for (const link of w.subclassLinks) {
    const sh = optionalPage(link)
    if (!sh) {
      console.warn(`subclass page missing: ${link}`)
      continue
    }
    const b = bookOf(sh)
    if (!b) continue
    const subName = plainText(
      pageContent(page(`${cls}:main`)).match(new RegExp(`href="/${link}">([^<]+)<`))?.[1] ?? link,
    )
    const ssub =
      b === 'PHB 2024' && s?.subclass && key(s.subclass.name) === key(subName)
        ? s.subclass
        : undefined
    const sslug = uniqueSlug(subclasses, slug(subName), b)
    const sa = pick(subAuth, sslug)
    const wf = wikiFeatures(sh)
    const subFeatures = features(
      wf,
      ssub?.features,
      sa?.['features'] as Record<string, Record<string, unknown>> | undefined,
      `class-${cls}`,
      `${name}: ${subName}`,
      b,
    )
    // Always-prepared spell tables ("Cleric Level | Spells", "Paladin | Spells"), grouped by the
    // heading over each (a Circle of the Land's Arid Land, Polar Land…) or by their column
    // ("Spells (Havoc)" beside "Spells (All)", a Demon Hunter's).
    const levelHead = new RegExp(`Level|^(${Object.keys(classNames).join('|')})$`)
    const subSpells = wf.flatMap((f) =>
      wikiSections(`<div id="page-content">${f.html}<div class="page-tags">`).flatMap((sec) =>
        wikiTables(sec.html)
          .filter((tb) => levelHead.test(tb[0]?.[0] ?? '') && /\bSpells?\b/.test(tb[0]?.[1] ?? ''))
          .flatMap((tb) =>
            tb.slice(1).flatMap((r) =>
              tb[0]!.slice(1).flatMap((head, ci) => {
                const names = (r[ci + 1] ?? '')
                  .split(/,\s*/)
                  .map((x) => x.trim())
                  .filter((x) => /[a-z]/i.test(x))
                if (!names.length) return []
                const col = head.match(/Spells? \((.+)\)$/)?.[1]
                const group = sec.title.endsWith('Land')
                  ? { group: sec.title }
                  : col && col !== 'All'
                    ? { group: col }
                    : {}
                return [
                  {
                    level: Number(r[0]?.match(/\d+/)?.[0]),
                    spells: names.map((x) => slug(spellName(x))),
                    ...group,
                  },
                ]
              }),
            ),
          ),
      ),
    )
    const subGroups: string[] = []
    for (const list of wikiOptionLists(sh)) {
      const entries = list.entries.filter((e) => !e.book || bookFor(e.book))
      if (!list.title.endsWith('Options') || /Variant/i.test(list.title) || entries.length < 3)
        continue
      const gslug = slug(list.title.replace(/ Options$/, '')).replace(/^maneuver$/, 'maneuvers')
      subGroups.push(gslug)
      optionGroups.push(
        optionGroup(gslug, list.title.replace(/ Options$/, ''), cls, sslug, entries, b),
      )
    }
    const scFeature = wf.find((f) => f.name === 'Spellcasting')
    const sc =
      scFeature &&
      (() => {
        const tb = wikiTables(scFeature.html).find((x) => /Level/.test(x[0]?.[0] ?? ''))
        if (!tb) return undefined
        const [head, ...body] = tb
        const lv = body.map((r) => Object.fromEntries(head!.map((h, i) => [h, r[i] ?? ''])))
        const full = Array.from({ length: 20 }, (_, i) => {
          const row = [...lv].reverse().find((r) => Number(r[head![0]!]) <= i + 1)
          return row ?? Object.fromEntries(head!.map((h) => [h, '0']))
        })
        const list = slug(scFeature.text.match(/the (\w+) spell list/i)?.[1] ?? 'wizard')
        const out = spellcastingOf(list, head!, full, scFeature.text)
        // "You know two cantrips… When you reach Fighter level 10, you learn another".
        const WORDS: Record<string, number> = { two: 2, three: 3, four: 4 }
        const known =
          WORDS[scFeature.text.match(/You know (\w+) cantrips/i)?.[1]?.toLowerCase() ?? ''] ?? 0
        const more = Number(
          scFeature.text.match(/When you reach \w+ level (\d+), you learn another/)?.[1] ?? 0,
        )
        const cantrips = Array.from({ length: 20 }, (_, i) =>
          i + 1 < featureLevel(scFeature) ? 0 : known + (more && i + 1 >= more ? 1 : 0),
        )
        return out && { ...out, kind: 'third' as const, cantrips }
      })()
    subclasses.push(
      withAuthored(
        {
          slug: sslug,
          name: subName,
          class: cls,
          srd: !!ssub,
          ...(ssub ? { source: SRD } : sourceFields(sh)),
          ...(ssub ? { page: ssub.page, text: ssub.lead } : { wiki: link }),
          features: subFeatures,
          ...(subSpells.length ? { spells: subSpells } : {}),
          ...(sc ? { spellcasting: sc } : {}),
          optionGroups: subGroups,
        } satisfies Dnd5eSubclassDef,
        sa,
      ),
    )
    if (!ssub)
      packet(
        `class-${cls}`,
        `${name}: ${subName} (subclass)`,
        { slug: sslug },
        plainText(pageContent(sh)).split('\n').slice(0, 3).join('\n'),
        b,
      )
  }
  // Class option lists: invocations, metamagic, artificer plans.
  if (cls === 'warlock') {
    const inv = optionalPage('warlock:eldritch-invocation')
    if (inv) {
      groups.push('eldritch-invocations')
      optionGroups.push(
        optionGroup(
          'eldritch-invocations',
          'Eldritch Invocations',
          cls,
          undefined,
          invocationEntries(inv),
          'PHB 2024',
        ),
      )
    }
  }
  if (cls === 'sorcerer') {
    const mm = optionalPage('sorcerer:metamagic')
    if (mm) {
      groups.push('metamagic')
      optionGroups.push(
        optionGroup('metamagic', 'Metamagic', cls, undefined, invocationEntries(mm), 'PHB 2024'),
      )
    }
  }
  if (cls === 'artificer') {
    groups.push('plans')
    optionGroups.push(artificerPlans(w.sections))
  }
}

/** Entries of an option page cut at its headings or bold leads, with their own sources. */
function invocationEntries(html: string) {
  const secs = wikiSections(html).filter((x) => x.title && x.level >= 2)
  const fromHeadings = secs
    .filter((x) => !/Options$|^Eldritch Invocation|^Metamagic/.test(x.title))
    .map((x) => {
      const text = plainText(x.html)
      return { name: x.title, html: x.html, text, book: text.match(SOURCE_LINE)?.[1] }
    })
  return fromHeadings.length ? fromHeadings : wikiEntries(pageContent(html))
}

function optionGroup(
  gslug: string,
  name: string,
  cls: string,
  sub: string | undefined,
  entries: { name: string; text: string; book?: string }[],
  book: Dnd5eSourceBook,
): Dnd5eOptionGroup {
  const srdList =
    gslug === 'eldritch-invocations' ? srd.invocations : gslug === 'metamagic' ? srd.metamagic : []
  const sm = srdBy(srdList)
  const a = authored(join('options', `${gslug}.json`))
  const out: Dnd5eOptionEntry[] = []
  for (const e of entries) {
    if (e.book && !bookFor(e.book)) continue
    const eBook = bookFor(e.book) ?? book
    const s = eBook === 'PHB 2024' ? sm.get(key(e.name)) : undefined
    const pre = e.text.match(/^Prerequisite:\s*(.+)$/m)?.[1]
    const cost = e.text.match(/\b(\d+) Sorcery Points?\b/)?.[0]
    const eslug = slug(e.name)
    const base: Dnd5eOptionEntry = {
      slug: eslug,
      name: s?.name ?? e.name,
      srd: !!s,
      source: s ? SRD : eBook,
      ...(s ? { page: s.page, text: s.text } : { wiki: sub ? `${cls}:${sub}` : `${cls}:${gslug}` }),
      ...(pre ? { prerequisite: prerequisite(pre.replace(/\.$/, ''), classNames) } : {}),
      repeatable: /\bRepeatable\b/.test(e.text),
      ...(cost ? { cost } : {}),
    }
    if (!s) packet(`options-${gslug}`, `${name}: ${e.name}`, { slug: eslug }, e.text, eBook)
    out.push(withAuthored(base, a[eslug]))
  }
  return { slug: gslug, name, class: cls, ...(sub ? { subclass: sub } : {}), entries: out }
}

function artificerPlans(sections: ReturnType<typeof wikiSections>): Dnd5eOptionGroup {
  const out: Dnd5eOptionEntry[] = []
  for (const s of sections) {
    const lv = s.title.match(/Magic Item Plans \(Artificer Level (\d+)\+\)/)?.[1]
    if (!lv) continue
    for (const r of (wikiTables(s.html)[0] ?? []).slice(1)) {
      // "Common magic item that isn’t a Potion… (you can learn this option multiple times…)".
      const any = /learn this option multiple times/i.test(r[0]!)
      const name = any
        ? r[0]!
            .split(/ that | \(/)[0]!
            .trim()
            .replace(/\b\w/g, (c) => c.toUpperCase())
        : r[0]!.trim()
      const not = /Potion/.test(r[0]!) ? 'no Potions, Scrolls or cursed items' : 'not cursed'
      out.push({
        slug: slug(name),
        name,
        srd: false,
        source: 'Eberron: Forge of the Artificer',
        wiki: 'artificer:main',
        prerequisite: { text: `Artificer level ${lv}+`, level: Number(lv), classes: ['artificer'] },
        repeatable: any,
        summary: any
          ? `Plan for one ${name.toLowerCase()} of your choice (${not}); take it again for another item. Artificer level ${lv}+.`
          : `Plan for ${name}, made with Replicate Magic Item from Artificer level ${lv}${/yes/i.test(r[1] ?? '') ? '; needs Attunement' : ''}.`,
      })
    }
  }
  return { slug: 'plans', name: 'Magic Item Plans', class: 'artificer', entries: out }
}

// --- Spells -------------------------------------------------------------------------------

const spellAuth = authored('spells.json')
const spells: Dnd5eSpellDef[] = []
const wikiSpellLinks = [...pageContent(page('spell:all')).matchAll(/href="\/(spell:[a-z0-9-]+)"/g)]
  .map((m) => m[1]!)
  .filter((l) => !/:(all|au|drops|efota|frhof|wow|.*-school)$/.test(l))
for (const link of new Set(wikiSpellLinks)) {
  const html = optionalPage(link)
  if (!html) {
    console.warn(`spell page missing: ${link}`)
    continue
  }
  const w = wikiSpell(html)
  if (!w.book || !w.header) continue
  const name = wikiTitle(html)
  // Only the Player's Handbook's spells are the SRD's; a later book's namesake is its own.
  const s = w.book === 'PHB 2024' ? srdSpells.get(key(name)) : undefined
  const sl = s ? slug(s.name) : uniqueSlug(spells, slug(name), w.book)
  if (s) {
    const blocks = s.section.blocks
    const headerLine = blocks.find((b) => b.kind === 'para' && spellHeader(b.text))
    if (!headerLine)
      throw new Error(
        `SRD spell without a header line: ${s.name}: ${JSON.stringify(blocks.slice(0, 3))}`,
      )
    const head = spellHeader((headerLine as { text: string }).text)!
    const stat = (k: string) =>
      (
        blocks.find((b) => b.kind === 'para' && b.text.startsWith(`**${k}:**`)) as
          | { text: string }
          | undefined
      )?.text
        .replace(`**${k}:**`, '')
        .trim() ?? ''
    const bodyBlocks = blocks.filter(
      (b) =>
        b !== headerLine &&
        !(b.kind === 'para' && /^\*\*(Casting Time|Range|Components|Duration):\*\*/.test(b.text)),
    )
    const hiIdx = bodyBlocks.findIndex(
      (b) =>
        b.kind === 'para' &&
        /^\*\*\*(Using a Higher-Level Spell Slot|Cantrip Upgrade)\.\*\*\*/.test(b.text),
    )
    const hiText =
      hiIdx >= 0
        ? (bodyBlocks[hiIdx] as { text: string }).text.replace(/^\*\*\*[^*]+\*\*\*\s*/, '')
        : undefined
    const sect: SrdSection = { ...s.section, blocks: bodyBlocks.filter((_, i) => i !== hiIdx) }
    const text = sectionText(sect)
    const facts = spellFacts(
      {
        castingTime: stat('Casting Time'),
        range: stat('Range'),
        components: stat('Components'),
        duration: stat('Duration'),
      },
      text,
      hiText,
    )
    spells.push(
      withAuthored(
        {
          slug: sl,
          name: s.name,
          srd: true,
          source: SRD,
          page: s.page,
          text,
          level: head.level,
          school: head.school,
          classes: classList(head.classes, spellHeader(w.header)!.classes),
          ...facts,
          ...(hiText ? { higherLevel: hiText } : {}),
        },
        spellAuth[sl],
      ),
    )
  } else {
    const head = spellHeader(w.header)!
    const facts = spellFacts(w.stats, w.body, w.higher)
    const auth = spellAuth[sl]
    const extra = extraLists(head.classes)
    spells.push(
      withAuthored(
        {
          slug: sl,
          name,
          srd: false,
          ...sourceFields(html),
          wiki: link,
          level: head.level,
          school: head.school,
          classes: classList(head.classes, []),
          ...(extra.length ? { extraLists: extra } : {}),
          ...facts,
        },
        auth,
      ),
    )
    packet(
      'spells',
      name,
      { slug: sl, level: head.level, ...facts },
      [w.body, w.higher].filter(Boolean).join('\n'),
      w.book,
    )
  }
}
/** Lists in a spell's header that aren't a class's: "Paladin [Death Knight]" → "Paladin (Death Knight)". */
function extraLists(names: string[]) {
  return names
    .filter((c) => !classNames[c])
    .map((c) => c.replace(/\s*\[([^\]]+)\]/, ' ($1)').trim())
    .filter(Boolean)
}
/** Class slugs on a spell's list: the SRD's classes, plus the wiki's for books Lantern carries. */
function classList(primary: string[], extra: string[]) {
  return [
    ...new Set([...primary, ...extra].map((c) => classNames[c]).filter(Boolean) as string[]),
  ].sort()
}
spells.sort((a, b) => a.name.localeCompare(b.name))

// --- Feats ---------------------------------------------------------------------------------

const featAuth = authored('feats.json')
const srdFeats = srdBy(srd.feats)
const feats: Dnd5eFeatDef[] = []
/**
 * A feat's category: its page's header line ("Dark Gift Feat (Prerequisite: …)") or, for the
 * Player's Handbook pages that have none, the index section that lists it ("Origin Feats").
 */
const FEAT_CATS: Record<string, Dnd5eFeatDef['category']> = {
  Origin: 'origin',
  General: 'general',
  'Fighting Style': 'fighting-style',
  'Epic Boon': 'epic-boon',
  Dragonmark: 'dragonmark',
  'Planar Pact': 'planar-pact',
  'Dark Gift': 'dark-gift',
}
// Every tab of every section: the core feats and each later book's.
const featLinks = new Map<string, { label: string; section?: Dnd5eFeatDef['category'] }>()
for (const sec of wikiSections(page('feat:all'))) {
  const section = FEAT_CATS[sec.title.replace(/ Feats$/, '')]
  for (const m of sec.html.matchAll(/href="\/(feat:[a-z0-9-]+)">([^<]+)</g))
    if (!featLinks.has(m[1]!)) featLinks.set(m[1]!, { label: m[2]!, section })
}
for (const [link, { label, section }] of featLinks) {
  const html = optionalPage(link)
  if (!html) {
    console.warn(`feat page missing: ${link}`)
    continue
  }
  const w = wikiFeat(html)
  if (!w.book) continue
  const category = FEAT_CATS[w.header?.match(/^(.+?) Feat\b/)?.[1] ?? ''] ?? section
  if (!category) {
    console.warn(`feat without a category line: ${link}`)
    continue
  }
  const name = plainText(label)
  const s = w.book === 'PHB 2024' ? srdFeats.get(key(name)) : undefined
  const fslug = s ? slug(s.name) : uniqueSlug(feats, slug(name), w.book)
  const preText = (
    w.text.match(/^Prerequisite:\s*(.+)$/m)?.[1] ?? w.header?.match(/\(Prerequisite: (.+)\)$/)?.[1]
  )
    ?.replace(/\)$/, (p, i, str: string) => (str.includes('(') ? p : ''))
    .trim()
  const entries = w.entries.filter((e) => !/^(Prerequisite|Source)$/.test(e.name))
  const asiEntry = entries.find((e) => e.name === 'Ability Score Increase')
  const asi = abilityIncrease(asiEntry?.text ?? (fslug === 'ability-score-improvement' ? '' : ''))
  const a = featAuth[fslug] as Record<string, unknown> | undefined
  const srdBenefits = s
    ? [...s.text.matchAll(/\*\*\*([^*]+?)\.\*\*\*\s*([^\n]+)/g)].map((b) => ({
        name: b[1]!,
        text: b[2]!,
      }))
    : []
  const authBenefits = (a?.['benefits'] ?? {}) as Record<string, Record<string, unknown>>
  const benefits: Dnd5eOption[] = (
    s
      ? srdBenefits.map((b) => ({ name: b.name, text: b.text }))
      : entries.map((e) => ({ name: e.name }))
  ).map((b) => withAuthored(b, pick(authBenefits, b.name)))
  const def: Dnd5eFeatDef = {
    slug: fslug,
    name: s?.name ?? name,
    srd: !!s,
    ...(s ? { source: SRD } : sourceFields(html)),
    ...(s ? { page: s.page, text: s.text.replace(/^_[^_]+_\s*/, '') } : { wiki: link }),
    category,
    ...(preText ? { prerequisite: prerequisite(preText.replace(/\.$/, ''), classNames) } : {}),
    repeatable: /\bRepeatable\b/.test(w.text),
    ...(asi ? { asi } : {}),
    ...(fslug === 'ability-score-improvement'
      ? { asi: { abilities: Object.values(ABILITY), amount: 2, max: 20, choose: 1 } }
      : {}),
    benefits,
  }
  feats.push(withAuthored(def, a))
  if (!s) packet('feats', name, { slug: fslug, category, prerequisite: preText }, w.text, w.book)
}

// --- Species and backgrounds ---------------------------------------------------------------

/**
 * The SRD sets the Fiendish Legacies table across a column break (SRD p. 86): its first two
 * columns land in Human's text and the Level 3 / Level 5 columns after Otherworldly Presence.
 * Put the whole table back under Tiefling's Fiendish Legacy trait.
 */
function mendFiendishLegacies() {
  const human = srd.species.find((e) => e.name === 'Human')!
  const tiefling = srd.species.find((e) => e.name === 'Tiefling')!
  const left = human.text.match(/\n\n\*\*Fiendish Legacies\*\*\n\n((?:\|.*\|\n?)+)/)
  const right = tiefling.text.match(/\n\n(\| Level 3 \| Level 5 \|\n(?:\|.*\|\n?)+)/)
  if (!left || !right) throw new Error('Fiendish Legacies table: layout changed, check SRD p. 86')
  const rowsOf = (t: string) =>
    t
      .trim()
      .split('\n')
      .filter((l) => !l.startsWith('| ---'))
      .map((l) => l.slice(2, -2).split(' | '))
  const l = rowsOf(left[1]!)
  const r = rowsOf(right[1]!)
  const merged = l.map((row, i) => `| ${[...row, ...(r[i] ?? [])].join(' | ')} |`)
  merged.splice(
    1,
    0,
    `| ${merged[0]!
      .split(' | ')
      .map(() => '---')
      .join(' | ')} |`,
  )
  human.text = human.text.replace(left[0], '')
  tiefling.text = tiefling.text
    .replace(right[0], '')
    .replace(
      /(You gain the level 1 benefit of the chosen legacy\.)/,
      `$1\n\n**Fiendish Legacies**\n\n${merged.join('\n')}`,
    )
}
mendFiendishLegacies()

const speciesAuth = authored('species.json')
const srdSpecies = srdBy(srd.species)
const species: Dnd5eSpeciesDef[] = []
// Every tab of the index: the core species and each later book's.
for (const m of pageContent(page('species:all')).matchAll(
  /href="\/(species:[a-z0-9-]+)">([^<]+)</g,
)) {
  const html = optionalPage(m[1]!)
  const book = html && bookOf(html)
  if (!html || !book) continue
  if (species.some((x) => x.wiki === m[1] || (x.srd && x.slug === slug(plainText(m[2]!))))) continue
  const name = plainText(m[2]!)
  // "Elf (Warcraft)" is World of Warcraft's own species, not the SRD's Elf.
  const s = book === 'PHB 2024' ? srdSpecies.get(key(name)) : undefined
  const spSlug = s ? slug(name) : uniqueSlug(species, slug(name), book)
  const text = plainText(pageContent(html))
  const field = (k: string) => text.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? ''
  const sizeText = field('Size')
  const sizes = (['Tiny', 'Small', 'Medium', 'Large'] as Dnd5eSize[]).filter((z) =>
    sizeText.includes(z),
  )
  const a = speciesAuth[spSlug] as Record<string, unknown> | undefined
  const traitAuth = (Array.isArray(a?.['traits']) ? {} : (a?.['traits'] ?? {})) as Record<
    string,
    Record<string, unknown>
  >
  const traitNames = wikiEntries(pageContent(html))
    .map((e) => e.name)
    .filter((n) => !/^(Creature Type|Size|Speed|Source):?$/.test(n))
  const srdTraits = s
    ? [...s.text.matchAll(/\*\*\*([^*]+?)\.\*\*\*\s*([\s\S]*?)(?=\n\n\*\*\*|$)/g)].map((b) => ({
        name: b[1]!,
        text: b[2]!.trim(),
      }))
    : []
  // A non-SRD species' authored `traits` list sets its traits outright (it can nest the wiki's
  // sub-entries, like Aasimar's Celestial Revelation forms, as options).
  const authoredTraits = Array.isArray(a?.['traits'])
    ? (a['traits'] as { name: string }[])
    : undefined
  const traits =
    authoredTraits && !s
      ? authoredTraits.map((tr) => withAuthored({ name: tr.name }, tr as Record<string, unknown>))
      : (s ? srdTraits : traitNames.map((n) => ({ name: n, text: '' }))).map((tr) => {
          const lvl = tr.text.match(/character level (\d+)/)?.[1]
          return withAuthored(
            {
              name: tr.name,
              ...(tr.text ? { text: tr.text } : {}),
              ...(lvl ? { level: Number(lvl) } : {}),
            },
            pick(traitAuth, tr.name),
          )
        })
  species.push(
    withAuthored(
      {
        slug: spSlug,
        name,
        srd: !!s,
        ...(s ? { source: SRD } : sourceFields(html)),
        ...(s ? { page: s.page, text: s.text } : { wiki: m[1]! }),
        creatureType: field('Creature Type') || 'Humanoid',
        sizes,
        sizeText,
        speed: Number(field('Speed').match(/\d+/)?.[0] ?? 30),
        traits,
        ...(a?.['lineages'] ? { lineages: a['lineages'] as Dnd5eSpeciesDef['lineages'] } : {}),
      } satisfies Dnd5eSpeciesDef,
      a,
    ),
  )
  if (!s) packet('species', name, { slug: spSlug, sizeText }, text, book)
}

const bgAuth = authored('backgrounds.json')
const srdBackgrounds = srdBy(srd.backgrounds)
const backgrounds: Dnd5eBackgroundDef[] = []
// Every tab of the index: the core backgrounds and each later book's.
for (const m of pageContent(page('background:all')).matchAll(
  /href="\/(background:[a-z0-9-]+)">([^<]+)</g,
)) {
  const html = optionalPage(m[1]!)
  const book = html && bookOf(html)
  if (!html || !book) continue
  const name = plainText(m[2]!)
  if (backgrounds.some((b) => b.wiki === m[1] || (b.srd && b.name === name))) continue
  const s = book === 'PHB 2024' ? srdBackgrounds.get(key(name)) : undefined
  const bgSlug = s ? slug(name) : uniqueSlug(backgrounds, slug(name), book)
  const text = plainText(pageContent(html))
  const field = (k: string) => text.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? ''
  const featLine = field('Feat')
  // "Survivor or a Dark Gift feat of your choice", "A Dark Gift feat of your choice (…; Mist
  // Walker is recommended)", "Choose one Planar Pact feat": `feat` is the named or recommended
  // one (else the category's first), `featChoice` the category the player may pick from instead.
  const anyOf =
    featLine.match(/\bor an? ([A-Z][\w ]+?) feat of your choice/) ??
    featLine.match(/^(?:an? |Choose one )?([A-Z][\w ]+?) feat\b/i)
  const anyCat = anyOf && FEAT_CATS[anyOf[1]!.trim()]
  const recommended = featLine.match(/;\s*([^;()]+?) is recommended/)?.[1]
  const named = featLine
    .replace(/\s*\(see.*$/, '')
    .replace(/\s+or an? .*$/i, '')
    .trim()
  const featName = anyCat
    ? (recommended ??
      (anyOf!.index! > 0
        ? named
        : (feats
            .filter((f) => f.category === anyCat)
            .sort((x, y) => x.name.localeCompare(y.name))[0]?.name ?? '')))
    : named
  const opt = featName.match(/\(([^)]+)\)$/)?.[1]
  const tool = field('Tool Proficiency')
  const a = bgAuth[bgSlug] as Record<string, unknown> | undefined
  backgrounds.push(
    withAuthored(
      {
        slug: bgSlug,
        name,
        srd: !!s,
        ...(s ? { source: SRD } : sourceFields(html)),
        ...(s ? { page: s.page, text: s.text } : { wiki: m[1]! }),
        abilities: abilitiesIn(field('Ability Scores') || field('Ability Score')),
        feat: {
          slug: slug(featName.replace(/\s*\([^)]*\)$/, '')),
          ...(opt ? { option: opt } : {}),
        },
        ...(anyCat ? { featChoice: { kind: 'feat' as const, count: 1, category: [anyCat] } } : {}),
        skills: field('Skill Proficiencies')
          .split(/ and |,\s*/)
          .map((x) => x.trim())
          .filter(Boolean),
        ...(tool.startsWith('Choose')
          ? {
              toolChoice: {
                kind: 'tool' as const,
                count: 1,
                from: [tool.replace(/^Choose one kind of\s*/, '').replace(/\s*\(see.*$/, '')],
              },
            }
          : { tool }),
        equipment: equipmentOptions(field('Equipment')),
      } satisfies Dnd5eBackgroundDef,
      a,
    ),
  )
  if (!s) packet('backgrounds', name, { slug: bgSlug }, text, book)
}

// --- Equipment, conditions, masteries, magic items (SRD) ------------------------------------

const cost = (s: string) => {
  const m = s.replace(/,/g, '').match(/([\d.]+)\s*(CP|SP|EP|GP|PP)/)
  if (!m) return 0
  return Math.round(Number(m[1]) * { CP: 1, SP: 10, EP: 50, GP: 100, PP: 1000 }[m[2] as 'GP'])
}
const weight = (s: string) => {
  const m = s.match(/([\d/ ]+)\s*lb/)
  if (!m) return 0
  return m[1]!
    .trim()
    .split(' ')
    .reduce(
      (t, p) =>
        t + (p.includes('/') ? Number(p.split('/')[0]) / Number(p.split('/')[1]) : Number(p)),
      0,
    )
}
const weapons: Dnd5eWeaponDef[] = []
const weaponTable = find(root, 'Weapons')!
const weaponRows = (function collect(s: SrdSection): { cells: string[]; page: number }[] {
  return [
    ...s.blocks.flatMap((b) => (b.kind === 'row' ? [{ cells: b.cells, page: b.page }] : [])),
    ...s.children.flatMap(collect),
  ]
})(weaponTable)
/** Each weapon's group by the wiki's table titles ("Simple Melee Weapons"); the SRD sets them as captions. */
const weaponGroups = new Map<string, [Dnd5eWeaponDef['category'], Dnd5eWeaponDef['type']]>()
for (const tb of wikiTables(pageContent(page('equipment:weapon')))) {
  const g = tb[0]?.[0]?.match(/^(Simple|Martial) (Melee|Ranged) Weapons/)
  if (g)
    for (const r of tb.slice(2))
      weaponGroups.set(key(r[0]!.replace(/\*$/, '')), [g[1], g[2]] as never)
}
const PROPS: Dnd5eWeaponProperty[] = [
  'Ammunition',
  'Finesse',
  'Heavy',
  'Light',
  'Loading',
  'Range',
  'Reach',
  'Thrown',
  'Two-Handed',
  'Versatile',
]
for (const { cells, page: p } of weaponRows) {
  if (cells.length < 6 || cells[0] === 'Name') continue
  const [name, dmg, props, mastery, wt, price] = cells as [
    string,
    string,
    string,
    string,
    string,
    string,
  ]
  const group = weaponGroups.get(key(name))
  if (!group) throw new Error(`weapon not in the wiki's tables: ${name}`)
  const [category, type] = group
  const dm = dmg.match(/^(\S+)\s+(\w+)$/)
  if (!dm) continue
  const propertyText = props === '—' ? [] : props.split(/,\s*(?![^()]*\))/).map((x) => x.trim())
  const range = props.match(/Range (\d+)\/(\d+)/)
  weapons.push({
    slug: slug(name),
    name,
    srd: true,
    source: SRD,
    page: p,
    category,
    type,
    damage: dm[1]!,
    damageType: dm[2]!,
    properties: PROPS.filter((pr) => propertyText.some((t) => t.startsWith(pr))),
    propertyText,
    ...(props.match(/Versatile \(([^)]+)\)/)
      ? { versatile: props.match(/Versatile \(([^)]+)\)/)![1] }
      : {}),
    ...(range ? { range: { normal: Number(range[1]), long: Number(range[2]) } } : {}),
    ...(props.match(/Range [\d/]+; (\w+)\)/)
      ? { ammunition: props.match(/Range [\d/]+; (\w+)\)/)![1] }
      : {}),
    mastery: mastery as Dnd5eMastery,
    weight: weight(wt),
    cost: cost(price),
  })
}

const srdArmorSec = find(root, 'Armor')!
const srdArmorPage = srdArmorSec.page
/** Armor names the SRD's Armor table prints (the first cell of each row). */
const srdArmorNames = new Set(
  (function collect(s: SrdSection): string[] {
    return [...rows(s).map((r) => r[0]!), ...s.children.flatMap(collect)]
  })(srdArmorSec),
)
const armor: Dnd5eArmorDef[] = []
for (const sec of wikiSections(page('equipment:armor'))) {
  const cat = sec.title.match(/^(Light|Medium|Heavy) Armor|^Shield/)?.[0]
  if (!cat) continue
  const don = sec.title.match(/\((.+)\)/)?.[1] ?? ''
  for (const r of (wikiTables(sec.html)[0] ?? []).slice(1)) {
    const [name, ac, str, stealth, wt, price] = r as [
      string,
      string,
      string,
      string,
      string,
      string,
    ]
    if (!srdArmorNames.has(name)) throw new Error(`armor not in the SRD table: ${name}`)
    armor.push({
      slug: slug(name),
      name,
      srd: true,
      source: SRD,
      page: srdArmorPage,
      category: (cat.startsWith('Shield')
        ? 'Shield'
        : cat.split(' ')[0]) as Dnd5eArmorDef['category'],
      ac: Number(ac.match(/\d+/)![0]),
      dex: /max 2/.test(ac) ? 'max2' : /Dex/.test(ac) ? 'full' : 'none',
      ...(str.match(/\d+/) ? { strength: Number(str.match(/\d+/)![0]) } : {}),
      stealthDisadvantage: /Disadvantage/.test(stealth),
      weight: weight(wt),
      cost: cost(price),
      don: don.split(/ and | to Doff/)[0]!.replace(/ to Don.*$/, ''),
      doff:
        don
          .match(/(\d+ Minutes?) to Doff|and (\d+ Minutes?) to Doff/)
          ?.slice(1)
          .find(Boolean) ?? don.replace(/ to Don.*$/, ''),
    })
  }
}

const gear: Dnd5eGearDef[] = []
const toolsSec = find(root, 'Tools')!
for (const t of [
  ...(find(toolsSec, 'Artisan’s Tools')?.children ?? []),
  ...(find(toolsSec, 'Other Tools')?.children ?? []),
]) {
  const m = t.title.match(/^(.+?) \((.+)\)$/)
  if (!m) continue
  const text = sectionText(t)
  const ab = text.match(/\*\*Ability:\*\*\s*(\w+)/)?.[1]
  gear.push({
    slug: slug(m[1]!),
    name: m[1]!,
    srd: true,
    source: SRD,
    page: t.page,
    text,
    kind: 'tool',
    cost: cost(m[2]!),
    ...(ab && ABILITY[ab] ? { ability: ABILITY[ab] } : {}),
    ...(text.match(/\*\*Craft:\*\*\s*([^\n]+)/)
      ? {
          craft: text
            .match(/\*\*Craft:\*\*\s*([^\n]+)/)![1]!
            .split(/,\s*/)
            .map((x) => x.replace(/[*_]/g, '').trim()),
        }
      : {}),
  })
}
const gearSec = find(root, 'Adventuring Gear')!
const gearWeights = new Map(
  rows(find(gearSec, 'Adventuring Gear')).map((r) => [key(r[0] ?? ''), weight(r[1] ?? '')]),
)
for (const g of gearSec.children) {
  const m = g.title.match(/^(.+?) \((.+)\)$/)
  if (!m) continue
  const name = m[1]!
  gear.push({
    slug: slug(name),
    name,
    srd: true,
    source: SRD,
    page: g.page,
    text: sectionText(g),
    kind: name.endsWith('Pack')
      ? 'pack'
      : /Focus|Holy Symbol|Druidic/.test(name)
        ? 'focus'
        : name === 'Ammunition'
          ? 'ammunition'
          : 'gear',
    cost: cost(m[2]!),
    ...(gearWeights.get(key(name)) ? { weight: gearWeights.get(key(name))! } : {}),
  })
}

const conditions: Dnd5eConditionDef[] = srd.glossary
  .filter((g) => g.tag === 'Condition')
  .map((g) => ({
    slug: slug(g.name),
    name: g.name,
    srd: true,
    source: SRD,
    page: g.page,
    text: g.text,
    effects: [...g.text.matchAll(/\*\*\*([^*]+?)\.\*\*\*\s*([^\n]+)/g)].map(
      (m) => `${m[1]}: ${m[2]}`,
    ),
  }))

const masteries: Dnd5eMasteryDef[] = srd.masteries.map((m) => ({
  slug: slug(m.name),
  name: m.name as Dnd5eMastery,
  srd: true,
  source: SRD,
  page: m.page,
  text: m.text,
}))

const magicItems: Dnd5eMagicItemDef[] = srd.magicItems.map((m) => {
  const line = m.text.match(/^_([^_]+)_/)?.[1] ?? ''
  const att = line.match(/\(Requires Attunement(?: (by [^)]+))?\)/)
  const [cat, ...rest] = line
    .replace(/\s*\(Requires Attunement[^)]*\)/, '')
    .split(/,\s*(?![^()]*\))/)
  return {
    slug: slug(m.name),
    name: m.name,
    srd: true,
    source: SRD,
    page: m.page,
    text: m.text.replace(/^_[^_]+_\s*/, ''),
    category: (cat ?? '').trim(),
    rarity: rest.join(', ').trim(),
    attunement: !!att,
    ...(att?.[1] ? { attunementBy: att[1] } : {}),
  }
})

// Magic items from the books Lantern carries (the Dungeon Master's Guide's and the adventures'
// stay out; an item the SRD prints, as a magic item or as gear like a Potion of Healing, keeps
// its SRD entry). Facts from the type line ("Wondrous Item, Rare
// (Requires Attunement by a Wizard)"); the summary is authored.
const itemAuth = authored('magicItems.json')
const srdItemKeys = new Set([...magicItems, ...gear].map((m) => key(m.name)))
const itemLinks = new Set<string>()
for (const idx of ['magic-item:all', 'magic-item:sources'])
  for (const m of pageContent(optionalPage(idx) ?? '').matchAll(
    /href="\/(magic-item:[a-z0-9-]+)"/g,
  ))
    itemLinks.add(m[1]!)
for (const idx of itemLinks) {
  const h = optionalPage(idx)
  if (h && !bookOf(h))
    for (const m of pageContent(h).matchAll(/href="\/(magic-item:[a-z0-9-]+)"/g))
      itemLinks.add(m[1]!)
}
for (const link of [...itemLinks].sort()) {
  const html = optionalPage(link)
  const book = html && bookOf(html)
  if (!html || !book) continue
  const name = wikiTitle(html)
  if (srdItemKeys.has(key(name))) continue
  const lines = plainText(pageContent(html)).split('\n')
  const typeLine = lines[lines.findIndex((l) => SOURCE_LINE.test(l)) + 1] ?? ''
  const att = typeLine.match(/\(Requires Attunement(?: (by [^)]+))?\)/)
  const [cat, ...rest] = typeLine
    .replace(/\s*\(Requires Attunement[^)]*\)/, '')
    .split(/,\s*(?![^()]*\))/)
  const islug = uniqueSlug(magicItems, slug(name), book)
  magicItems.push(
    withAuthored(
      {
        slug: islug,
        name,
        srd: false,
        ...sourceFields(html),
        wiki: link,
        category: (cat ?? '').trim(),
        rarity: rest.join(', ').trim(),
        attunement: !!att,
        ...(att?.[1] ? { attunementBy: att[1] } : {}),
      } satisfies Dnd5eMagicItemDef,
      itemAuth[islug],
    ),
  )
  packet('magic-items', name, { slug: islug, typeLine }, lines.slice(1).join('\n'), book)
}
magicItems.sort((a, b) => a.name.localeCompare(b.name))

// --- One-liners for SRD entries -------------------------------------------------------------

// A card or list shows `summary`; an SRD entry's is drawn from its own text (or, for a class,
// species or background, its facts), so it is never a lead-in like "You gain the following
// benefits". An authored summary wins.
const fill = <T extends { srd: boolean; summary?: string; text?: string }>(
  list: T[],
  line: (r: T) => string,
) => {
  for (const r of list) if (r.srd && !r.summary?.trim()) r.summary = line(r) || undefined
}
const ABL_NAME = Object.fromEntries(Object.entries(ABILITY).map(([k, v]) => [v, k]))
const orList = (xs: string[]) =>
  xs.length < 3 ? xs.join(' or ') : `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}`
const andList = (xs: string[]) =>
  xs.length < 3 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`
fill(feats, (f) => srdSummary(f.text ?? '', f.benefits))
fill(spells, (r) => srdSummary(r.text ?? ''))
fill(subclasses, (r) => srdSummary(r.text ?? ''))
fill(magicItems, (r) => srdSummary(r.text ?? ''))
fill(masteries, (r) => srdSummary(r.text ?? ''))
fill(conditions, (r) => srdSummary(r.text ?? ''))
fill(gear, (r) => {
  const use = r.text?.match(/\*\*Utilize:\*\*\s*([^\n]+)/)?.[1]
  return use ? `Utilize: ${use.replace(/\.?$/, '.')}` : srdSummary(r.text ?? '')
})
for (const g of optionGroups) fill(g.entries, (r) => srdSummary(r.text ?? ''))
fill(classes, (c) => {
  const prim = c.primaryAbility.abilities.map((a) => ABL_NAME[a]!)
  const arms = c.armor.length ? `${andList(c.armor)} training` : 'no armor training'
  return `Hit Die d${c.hitDie}, primary ability ${c.primaryAbility.all ? andList(prim) : orList(prim)}, ${c.saves.join(' and ')} saves, ${arms}${c.spellcasting ? `, ${c.spellcasting.ability} spellcasting` : ''}.`
})
fill(species, (r) => {
  const traits = r.traits.map((t) => t.name)
  return `${orList(r.sizes)} ${r.creatureType}, Speed ${r.speed} ft; ${andList(traits)}.`
})
fill(backgrounds, (b) => {
  const feat = feats.find((f) => f.slug === b.feat.slug)?.name ?? b.feat.slug
  const tool = b.tool ?? 'a tool of choice'
  return `${andList(b.skills)}, ${tool}, and the ${feat}${b.feat.option ? ` (${b.feat.option})` : ''} feat; raises ${orList(b.abilities.map((a) => ABL_NAME[a]!))}.`
})

// --- Write ---------------------------------------------------------------------------------

const allowlist = {
  classes: srd.classes.map((c) => c.title),
  subclasses: [...srdClasses.values()].flatMap((c) => (c.subclass ? [c.subclass.name] : [])),
  species: srd.species.map((e) => e.name),
  backgrounds: srd.backgrounds.map((e) => e.name),
  feats: srd.feats.map((e) => e.name),
  spells: srd.spells.map((e) => e.name),
  invocations: srd.invocations.map((e) => e.name),
  metamagic: srd.metamagic.map((e) => e.name),
  magicItems: srd.magicItems.map((e) => e.name),
  conditions: conditions.map((e) => e.name),
  masteries: srd.masteries.map((e) => e.name),
  weapons: weapons.map((e) => e.name),
  armor: [...srdArmorNames].filter((n) => armor.some((a) => a.name === n)),
  gear: gear.map((e) => e.name),
  /** Class features and subclass features the SRD prints, as "Class: Level N: Name". */
  features: [...srdClasses.values()].flatMap((c) => [
    ...c.features.map((f) => `${c.name}: ${f.level}: ${f.name}`),
    ...(c.subclass?.features.map((f) => `${c.subclass!.name}: ${f.level}: ${f.name}`) ?? []),
  ]),
}

mkdirSync(OUT, { recursive: true })
const write = (name: string, data: unknown) =>
  writeFileSync(join(OUT, `${name}.json`), `${JSON.stringify(data, null, 1)}\n`)
write('classes', classes)
write('subclasses', subclasses)
write('spells', spells)
write(
  'feats',
  feats.sort((a, b) => a.name.localeCompare(b.name)),
)
write('species', species)
write('backgrounds', backgrounds)
write('options', optionGroups)
write('weapons', weapons)
write('armor', armor)
write('gear', gear)
write('conditions', conditions)
write('masteries', masteries)
write('magicItems', magicItems)
mkdirSync(join(DEST, 'data', 'dnd5e'), { recursive: true })
writeFileSync(
  join(DEST, 'data', 'dnd5e', 'srd-allowlist.json'),
  `${JSON.stringify(allowlist, null, 1)}\n`,
)

rmSync(PACKETS, { recursive: true, force: true })
mkdirSync(PACKETS, { recursive: true })
for (const [file, list] of packets) {
  mkdirSync(dirname(join(PACKETS, `${file}.md`)), { recursive: true })
  writeFileSync(join(PACKETS, `${file}.md`), list.join('\n'))
}

const count = (l: { srd: boolean }[]) =>
  `${l.filter((x) => x.srd).length} SRD + ${l.filter((x) => !x.srd).length} other`
console.log(
  [
    `classes ${count(classes)}`,
    `subclasses ${count(subclasses)}`,
    `spells ${count(spells)}`,
    `feats ${count(feats)}`,
    `species ${count(species)}`,
    `backgrounds ${count(backgrounds)}`,
    ...optionGroups.map((g) => `${g.slug} ${count(g.entries)}`),
    `magic items ${count(magicItems)}`,
    `weapons ${weapons.length}, armor ${armor.length}, gear ${gear.length}, conditions ${conditions.length}, masteries ${masteries.length}`,
  ].join('\n'),
)
