// Writes the committed Pathfinder 2e rules data (`data/pf2e/generated/*.json`, typed in
// `data/pf2e/types.ts`) from the Archives of Nethys data in `.local/pf2e/aon/`. Remaster (ORC)
// entries only: legacy (OGL) entries and the legacy sections AoN inlines are left out, and so
// are deity lists (Paizo Reserved Material). Also writes `data/pf2e/NOTICE.md` with the ORC
// notice and the books used.
//
//   npm run pf2e:data -- [dataDir]

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  Pf2eActionCost,
  Pf2eActionDef,
  Pf2eAncestryDef,
  Pf2eArmorDef,
  Pf2eBackgroundDef,
  Pf2eClassDef,
  Pf2eConditionDef,
  Pf2eFeatDef,
  Pf2eHeritageDef,
  Pf2eRarity,
  Pf2eRecord,
  Pf2eShieldDef,
  Pf2eSpellDef,
  Pf2eSubclassOption,
  Pf2eWeaponDef,
} from '../data/pf2e/types'
import type { Pf2eAttr, Pf2eRank } from '../types/sheets'
import {
  type AonDoc,
  classOfType,
  cleanMarkdown,
  heritageAncestry,
  legacyBooks,
  loadAon,
  page,
  remaster,
  slug,
  withoutLegacy,
} from './lib/aon'

const ROOT = join(import.meta.dirname, '..')
const DATA = process.argv[2] ?? join(ROOT, '.local', 'pf2e', 'aon')
const OUT = join(ROOT, 'data', 'pf2e', 'generated')

const all = loadAon(DATA)
const LEGACY = legacyBooks(all)
const docs = all.filter(remaster)
const byId = new Map(docs.map((d) => [d.id, d]))
const of = (...cats: string[]) =>
  docs
    .filter((d) => cats.includes(d.category))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))

const ATTR: Record<string, Pf2eAttr> = {
  Strength: 'STR',
  Dexterity: 'DEX',
  Constitution: 'CON',
  Intelligence: 'INT',
  Wisdom: 'WIS',
  Charisma: 'CHA',
}
const RANK: Record<string, Pf2eRank> = {
  Untrained: 'U',
  Trained: 'T',
  Expert: 'E',
  Master: 'M',
  Legendary: 'L',
}
const COST: Record<string, Pf2eActionCost> = {
  'Single Action': 1,
  'Two Actions': 2,
  'Three Actions': 3,
  Reaction: 'reaction',
  'Free Action': 'free',
}

const list = (v: unknown) =>
  Array.isArray(v) ? (v as unknown[]).map(String) : v ? [String(v)] : []
const num = (v: unknown) => (typeof v === 'number' ? v : Number.parseFloat(String(v ?? '')) || 0)
const cost = (v: unknown) => (typeof v === 'string' && v ? (COST[v] ?? v.toLowerCase()) : undefined)
const rank = (v: unknown) => RANK[String(v)] ?? 'U'

/** Splits an entry's markdown into its stat lines (`**Key** value`) and its rules text. */
function parts(d: AonDoc) {
  const md = withoutLegacy(cleanMarkdown(d.markdown ?? '', 1, byId), LEGACY)
  const lines = md.split('\n')
  if (lines[0]?.startsWith('# ')) lines.shift()
  const rule = lines.indexOf('---')
  const statLike = (l: string) => l.trim() === '' || /^\*\*[^*]+\*\*/.test(l)
  let head: string[]
  let body: string[]
  if (rule >= 0 && lines.slice(0, rule).every((l) => !l.startsWith('#'))) {
    head = lines.slice(0, rule)
    body = lines.slice(rule + 1)
  } else {
    let n = 0
    while (
      n < lines.length &&
      (statLike(lines[n]!) || (n > 0 && /^\*\*[^*]+\*\*\s*$/.test(lines[n - 1]!)))
    )
      n++
    head = lines.slice(0, n)
    body = lines.slice(n)
  }
  const stats: Record<string, string> = {}
  for (const m of head.join('\n').matchAll(/\*\*([^*]+)\*\*\s*([\s\S]*?)(?=\*\*[^*]+\*\*|$)/g))
    stats[m[1]!.trim()] = m[2]!.replace(/\s+/g, ' ').replace(/;\s*$/, '').trim()
  return { stats, text: body.join('\n').trim() }
}

function record(d: AonDoc): Pf2eRecord & { stats: Record<string, string> } {
  const { stats, text } = parts(d)
  const replaces = list(d.legacy_name)
  return {
    id: d.id,
    name: d.name,
    source: {
      book: (d.primary_source ?? '').trim(),
      ...opt('page', page(d) < 9999 ? page(d) : undefined),
    },
    rarity: (d.rarity ?? 'common') as Pf2eRarity,
    traits: list(d.trait),
    text,
    ...(replaces.length ? { replaces } : {}),
    stats,
  }
}

/** A record without the parsed stat lines, which only the builders below read. */
const base = (d: AonDoc) => {
  const { stats: _stats, ...rest } = record(d)
  return rest
}

const opt = <K extends string, V>(key: K, v: V | undefined | '') =>
  (v === undefined || v === '' ? {} : { [key]: v }) as Partial<Record<K, V>>

/** Rows of the first markdown table whose header cells start with `head`. */
function tableRows(md: string, head: string[]) {
  const lines = md.split('\n')
  const cells = (l: string) =>
    l
      .slice(1, -1)
      .split('|')
      .map((c) => c.replace(/\*/g, '').trim())
  const at = lines.findIndex(
    (l) => l.startsWith('|') && head.every((h, i) => cells(l)[i]?.startsWith(h)),
  )
  if (at < 0) return []
  const rows: string[][] = []
  for (let i = at + 2; i < lines.length && lines[i]!.startsWith('|'); i++)
    rows.push(cells(lines[i]!))
  return rows
}

// --- Classes ------------------------------------------------------------------
const classDocs = of('class')
const classNames = [...new Set(classDocs.map((d) => d.name))]
const classes: Pf2eClassDef[] = classDocs.map((d) => {
  const full = cleanMarkdown(d.markdown ?? '', 1, byId)
  const advancement = tableRows(full, ['Your Level', 'Class Features']).map(([lvl, f]) => ({
    level: Number(lvl),
    features: (f ?? '').split(/,\s*/).filter(Boolean),
  }))
  const slots = tableRows(full, ['Your Level', 'Cantrips'])
    .filter(([lvl]) => /^\d+$/.test(lvl ?? ''))
    .map(([lvl, can, ...r]) => ({
      level: Number(lvl),
      cantrips: num(can),
      slots: Array.from({ length: 10 }, (_, i) => num(r[i])),
    }))
  const features = of('class-feature')
    .filter((f) => list(f.class).includes(d.name))
    .map((f) => ({ id: f.id, name: f.name, level: f.level ?? 1, text: record(f).text }))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
  const subclasses: Pf2eSubclassOption[] = docs
    .filter((s) => s.category !== 'class' && classOfType(s.type, classNames) === d.name)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => ({ ...base(s), kind: s.type ?? '' }))
  return {
    ...base(d),
    slug: slug(d.name),
    keyAttributes: list(d.attribute)
      .map((a) => ATTR[a])
      .filter((a): a is Pf2eAttr => !!a),
    hp: num(d.hp),
    perception: rank(d.perception_proficiency),
    saves: {
      fortitude: rank(d.fortitude_proficiency),
      reflex: rank(d.reflex_proficiency),
      will: rank(d.will_proficiency),
    },
    skills: list(d.skill_proficiency),
    attacks: list(d.attack_proficiency),
    defenses: list(d.defense_proficiency),
    traditions: list(d.tradition),
    advancement,
    ...(slots.length ? { spellSlots: slots } : {}),
    features,
    subclasses,
  }
})

// --- Ancestries, heritages, backgrounds ---------------------------------------
const ancestryDocs = of('ancestry').filter((d) => d.type === 'Ancestry')
const ancestryNames = ancestryDocs.map((d) => d.name)
const versatileDocs = of('ancestry').filter((d) => d.type !== 'Ancestry')
const versatileNames = new Set(versatileDocs.map((d) => d.name))
const ancestries: Pf2eAncestryDef[] = ancestryDocs.map((d) => ({
  ...base(d),
  slug: slug(d.name),
  hp: num(d.hp),
  size: list(d.size),
  speed: num((d.speed as { land?: number } | undefined)?.land),
  boosts: list(d.attribute),
  flaws: list(d.attribute_flaw),
  languages: list(d.language),
  ...opt('vision', typeof d.vision === 'string' ? d.vision : undefined),
}))
const heritages: Pf2eHeritageDef[] = [
  ...of('heritage')
    .filter((d) => !versatileNames.has(d.name))
    .map((d) => {
      const a = heritageAncestry(d.name, ancestryNames)
      return { ...base(d), ...opt('ancestry', a && slug(a)), versatile: false }
    }),
  ...versatileDocs.map((d) => ({ ...base(d), versatile: true })),
]
const backgrounds: Pf2eBackgroundDef[] = of('background').map((d) => ({
  ...base(d),
  boosts: list(d.attribute),
  skills: list(d.skill),
  feats: list(d.feat),
}))

// --- Feats and spells ----------------------------------------------------------
const featLists = new Set([...ancestryNames, ...versatileNames])
const feats: Pf2eFeatDef[] = of('feat').map((d) => {
  const r = record(d)
  const traits = list(d.trait)
  const { stats, ...rest } = r
  return {
    ...rest,
    level: d.level ?? 1,
    ...opt('actions', cost(d.actions)),
    ...opt('prerequisites', stats.Prerequisites),
    ...opt('trigger', stats.Trigger),
    ...opt('requirements', stats.Requirements),
    ...opt('frequency', stats.Frequency),
    classes: traits.filter((t) => classNames.includes(t)),
    ancestries: traits.filter((t) => featLists.has(t)),
    archetypes: list(d.archetype),
    general: traits.includes('General'),
    skill: traits.includes('Skill'),
  }
})

const KIND: Record<string, Pf2eSpellDef['kind']> = {
  Spell: 'spell',
  Cantrip: 'cantrip',
  Focus: 'focus',
}
const spells: Pf2eSpellDef[] = of('spell').map((d) => {
  const { stats, ...rest } = record(d)
  const step = /^\+(\d+)$/.exec(list(d.heighten)[0] ?? '')?.[1]
  const ranks = (Array.isArray(d.heighten_level) ? (d.heighten_level as number[]) : []).filter(
    (r) => r > (d.level ?? 0),
  )
  return {
    ...rest,
    rank: d.level ?? 0,
    kind: KIND[d.spell_type ?? ''] ?? 'spell',
    traditions: list(d.tradition),
    ...opt('actions', cost(d.actions)),
    ...opt('range', stats.Range),
    ...opt('area', stats.Area),
    ...opt('targets', stats.Targets ?? stats.Target),
    ...opt('duration', stats.Duration),
    ...opt('defense', stats.Defense ?? stats['Saving Throw']),
    ...opt('trigger', stats.Trigger),
    ...opt('requirements', stats.Requirements),
    ...(step || ranks.length
      ? { heightened: { ...opt('step', step && Number(step)), ranks } }
      : {}),
    classes: d.spell_type === 'Focus' ? list(d.trait).filter((t) => classNames.includes(t)) : [],
  }
})

// --- Equipment ----------------------------------------------------------------
const feet = (v: unknown) => Number(/-?\d+/.exec(String(v ?? ''))?.[0] ?? 0)
const weapons: Pf2eWeaponDef[] = of('weapon').map((d) => ({
  ...base(d),
  level: d.level ?? 0,
  price: num(d.price),
  bulk: num(d.bulk),
  hands: String(d.hands ?? ''),
  damage: String(d.damage ?? '').split(' ')[0] ?? '',
  damageTypes: list(d.damage_type),
  category: String(d.weapon_category ?? ''),
  group: String(d.weapon_group ?? ''),
  type: d.weapon_type === 'Ranged' ? 'Ranged' : 'Melee',
  ...opt('range', typeof d.range === 'number' ? d.range : undefined),
  ...opt('reload', typeof d.reload === 'number' ? d.reload : undefined),
}))
const armor: Pf2eArmorDef[] = of('armor').map((d) => ({
  ...base(d),
  level: d.level ?? 0,
  price: num(d.price),
  bulk: num(d.bulk),
  category: String(d.armor_category ?? ''),
  ...opt('group', typeof d.armor_group === 'string' ? d.armor_group : undefined),
  ac: num(d.ac),
  ...opt('dexCap', typeof d.dex_cap === 'number' ? d.dex_cap : undefined),
  checkPenalty: num(d.check_penalty),
  speedPenalty: feet(d.speed_penalty),
  ...opt('strength', typeof d.strength === 'number' ? d.strength : undefined),
}))
const shields: Pf2eShieldDef[] = of('shield').map((d) => ({
  ...base(d),
  level: d.level ?? 0,
  price: num(d.price),
  bulk: num(d.bulk),
  ac: num(d.ac),
  hardness: num(d.hardness),
  hp: num(d.hp),
  speedPenalty: feet(d.speed_penalty),
}))

// --- Rules references -------------------------------------------------------
const conditions: Pf2eConditionDef[] = of('condition').map((d) => {
  const b = base(d)
  return { ...b, valued: /\bvalue\b/i.test(b.text) }
})
/** Actions with their own source line; item activations come with their items. */
const actions: Pf2eActionDef[] = of('action')
  .filter((d) => page(d) < 9999)
  .map((d) => {
    const { stats, ...rest } = record(d)
    return {
      ...rest,
      ...opt('actions', cost(d.actions)),
      ...opt('trigger', stats.Trigger),
      ...opt('requirements', stats.Requirements),
    }
  })
const traits = of('trait').map(base)

// --- Write --------------------------------------------------------------------
const sets: Record<string, { id: string; source: { book: string } }[]> = {
  classes,
  ancestries,
  heritages,
  backgrounds,
  feats,
  spells,
  weapons,
  armor,
  shields,
  conditions,
  actions,
  traits,
}
mkdirSync(OUT, { recursive: true })
const books = new Set<string>()
for (const [name, rows] of Object.entries(sets)) {
  for (const r of rows) books.add(r.source.book)
  writeFileSync(
    join(OUT, `${name}.json`),
    `[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`,
  )
  console.log(`${name}: ${rows.length}`)
}
writeFileSync(
  join(ROOT, 'data', 'pf2e', 'NOTICE.md'),
  `# Pathfinder 2e data notice

The files in \`generated/\` contain Licensed Material from Paizo Inc. under the ORC License, located at the Library of Congress at TX 9-307-067 and available online at various locations including paizo.com/orclicense and azoralaw.com/orclicense. All warranties are disclaimed as set forth therein.

**Attribution:** this data is based on the following Licensed Material, each © Paizo Inc.: ${[...books].filter(Boolean).sort().join('; ')}.

**Reserved Material:** Paizo's trademarks and setting material (such as the names of Golarion's deities, nations, organizations and characters) are Reserved Material and are not licensed under the ORC License. Deity lists are left out; where rules text names setting material, it is Paizo's.

Lantern is not published, endorsed or specifically approved by Paizo Inc. Text gathered from Archives of Nethys (2e.aonprd.com) and generated by \`scripts/pf2e-data.ts\`. Legacy (OGL) material and book art are not included.
`,
)
