// The 5e play engine reads features, feats, options, traits and spells by name or slug, and a
// few rules phrases from their text. When the data renames one, or a phrase stops matching,
// this fails loudly instead of the rule going quiet. Also: every hero's features become
// usable entries with their uses (utils/dnd5eFeatures.ts).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DND5E_EFFECTS, SPELL_EFFECTS } from '../utils/dnd5eEffects'
import { DND5E_GUARDS } from '../utils/dnd5eDefense'
import { DND5E_MODIFIERS } from '../utils/dnd5eModifiers'
import { DND5E_REROLLS } from '../utils/dnd5eRerolls'
import { DND5E_RIDER_GROUPS, DND5E_RIDERS } from '../utils/dnd5eRiders'
import { DND5E_FEATURE_RULES, entryWhy, heroEntries, useEntry } from '../utils/dnd5eFeatures'
import { norm5e, usesLeft } from '../utils/dnd5ePlay'
import { SPELL_RULES } from '../utils/dnd5eSpells'
import { build, data, levelTo } from './helpers/dnd5e'

const SOURCES = [
  '../utils/dnd5ePlay.ts',
  '../utils/dnd5eAttacks.ts',
  '../utils/dnd5eSpells.ts',
  '../utils/dnd5eFeatures.ts',
  '../utils/dnd5eRiders.ts',
  '../utils/dnd5eModifiers.ts',
  '../utils/dnd5eDefense.ts',
  '../utils/dnd5eRerolls.ts',
]

const options = data.options.flatMap((g) => g.entries)
const featureNames = new Set(
  [...data.classes.flatMap((c) => c.features), ...data.subclasses.flatMap((s) => s.features)]
    .flatMap((f) => [f.name, ...(f.options ?? []).flatMap((o) => [o.name, `${f.name}: ${o.name}`])])
    .map(norm5e),
)
for (const sp of data.species)
  for (const t of [...sp.traits, ...(sp.lineages?.options ?? [])])
    for (const n of [t.name, ...(t.options ?? []).map((o) => o.name)]) featureNames.add(norm5e(n))
for (const f of data.feats)
  for (const b of f.benefits) {
    featureNames.add(norm5e(b.name))
    featureNames.add(norm5e(`${f.name}: ${b.name}`))
  }
const featSlugs = new Set(data.feats.map((f) => f.slug))
const optionNames = new Set(options.map((o) => norm5e(o.name)))
const optionSlugs = new Set(options.map((o) => o.slug))
const spellSlugs = new Set(data.spells.map((s) => s.slug))

const code = SOURCES.map((f) =>
  readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8'),
).join('\n')
const calls = (fn: string) =>
  [...code.matchAll(new RegExp(`(?:hero|dnd5eHero\\([^)]*\\))\\.${fn}\\('([^']+)'\\)`, 'g'))].map(
    (m) => m[1]!,
  )

const texts = [
  ...data.spells,
  ...data.feats,
  ...options,
  ...data.classes.flatMap((c) => c.features),
  ...data.subclasses.flatMap((s) => s.features),
].map((r) => `${r.text ?? ''} ${r.summary ?? ''}`)

const LITERAL = /\/((?:\\.|\[[^\]\n]*\]|[^/\n\\[])+)\/([gimsuy]*)\.test\(/g
const PHRASE = /(?:[A-Za-z’']+ ){2,}[A-Za-z’']+/
const phrases = [...code.matchAll(LITERAL)]
  .map((m) => ({ source: m[1]!, flags: (m[2] ?? '').replace('g', '') }))
  .filter(
    (r) =>
      PHRASE.test(r.source.replace(/\\b|\\s\+?|\(\?:|\)|\|/g, ' ')) && !/^\^|\$$/.test(r.source),
  )

describe('5e rules names', () => {
  it.each(calls('has'))('feature, trait or option “%s” is in the data', (name) => {
    expect(featureNames.has(norm5e(name)) || optionNames.has(norm5e(name))).toBe(true)
  })

  it.each(calls('feat'))('feat “%s” is in the data', (slug) => {
    expect(featSlugs.has(slug)).toBe(true)
  })

  it.each(calls('option'))('option “%s” is in the data', (slug) => {
    expect(optionSlugs.has(slug)).toBe(true)
  })

  it.each(Object.keys(DND5E_FEATURE_RULES))(
    'rule “%s” names a feature, trait, benefit or option',
    (name) => {
      expect(featureNames.has(norm5e(name)) || optionNames.has(norm5e(name))).toBe(true)
    },
  )

  it.each([...Object.keys(SPELL_RULES), ...Object.keys(SPELL_EFFECTS)])(
    'spell “%s” is in the data',
    (slug) => {
      expect(spellSlugs.has(slug)).toBe(true)
    },
  )

  it('names an effect for every spell effect and rule', () => {
    for (const key of Object.values(SPELL_EFFECTS)) expect(DND5E_EFFECTS[key]).toBeDefined()
    for (const r of Object.values(DND5E_FEATURE_RULES))
      if (r.effect) expect(DND5E_EFFECTS[r.effect]).toBeDefined()
  })

  it.each(
    [
      ...DND5E_RIDERS.flatMap((r) => [r.feature, r.also ?? '']),
      ...DND5E_MODIFIERS.map((m) => m.feature),
      ...DND5E_GUARDS.map((g) => g.feature),
      ...DND5E_REROLLS.map((r) => r.feature),
      ...Object.values(DND5E_EFFECTS).map((d) => d.feature ?? ''),
    ].filter((n, i, all) => n && all.indexOf(n) === i),
  )('rider, modifier or effect feature “%s” is in the data', (name) => {
    expect(featureNames.has(norm5e(name)) || optionNames.has(norm5e(name))).toBe(true)
  })

  it('names an effect or a known state for every rider and modifier condition', () => {
    const states = [
      'sneak',
      'round1',
      'bloodied',
      'heroic',
      'bardic-inspiration',
      'bardic-inspiration:valor',
    ]
    const needs = [
      ...DND5E_RIDERS.flatMap((r) => r.needs ?? []),
      ...Object.values(DND5E_RIDER_GROUPS).flatMap((g) => g.needs ?? []),
    ]
    for (const n of needs) expect(states.includes(n) || !!DND5E_EFFECTS[n], n).toBe(true)
    const whiles = ['unarmored', 'no-shield', 'no-heavy', 'bloodied', 'round1', 'first-turn']
    for (const w of DND5E_MODIFIERS.flatMap((m) => m.while ?? []))
      for (const k of w.split('|')) expect(whiles.includes(k) || !!DND5E_EFFECTS[k], k).toBe(true)
    for (const r of DND5E_RIDERS)
      if (r.effect) expect(DND5E_EFFECTS[r.effect], r.effect).toBeDefined()
  })

  it('finds the rules phrases in the source', () => {
    expect(phrases.length).toBeGreaterThan(1)
  })

  it.each(phrases.map((p) => [p.source, p] as const))('/%s/ matches some rules text', (_, p) => {
    const re = new RegExp(p.source, p.flags)
    expect(texts.some((t) => re.test(t))).toBe(true)
  })
})

describe('feature entries', () => {
  it('gives a Fighter Second Wind and Action Surge with their uses', () => {
    const { sheet } = build('fighter')
    levelTo(sheet, 1, 5)
    const e = heroEntries(sheet, 5, data as never, { 'Second Wind': '3' })
    const sw = e.find((x) => x.name === 'Second Wind')!
    expect(sw).toMatchObject({ cost: 'bonus', resource: 'Second Wind', dice: '1d10' })
    sheet.hp = 10
    expect(useEntry(sheet, 5, sw)).toMatch(/Healed \d+/)
    expect(usesLeft(sheet, 'Second Wind')).toBe(2)
    expect(e.find((x) => x.name === 'Action Surge')?.rule?.actions).toBe(1)
  })

  it('splits a Monk’s Focus into its Flurry of Blows, spending Focus Points', () => {
    const { sheet } = build('monk')
    levelTo(sheet, 1, 2)
    const e = heroEntries(sheet, 2, data as never)
    const flurry = e.find((x) => x.name === 'Monk’s Focus: Flurry of Blows')!
    expect(flurry).toMatchObject({ cost: 'bonus', resource: 'Monk’s Focus' })
    expect(useEntry(sheet, 2, flurry)).toMatch(/2 Unarmed Strikes/)
  })

  it('makes Divine Spark a Channel Divinity use with its save', () => {
    const { sheet } = build('cleric')
    levelTo(sheet, 1, 2)
    const spark = heroEntries(sheet, 2, data as never).find(
      (x) => x.name === 'Channel Divinity: Divine Spark',
    )!
    expect(spark).toMatchObject({
      resource: 'Channel Divinity',
      dice: '1d8',
      save: { ability: 'CON' },
    })
  })

  it('turns Rage on and spends it', () => {
    const { sheet } = build('barbarian')
    const rage = heroEntries(sheet, 1, data as never).find((x) => x.name === 'Rage')!
    expect(useEntry(sheet, 1, rage)).toMatch(/Rage is on/)
    expect(sheet.effects?.[0]?.key).toBe('rage')
  })

  it('reads a maneuver’s cost as a Superiority Die', () => {
    const { sheet } = build('fighter')
    levelTo(sheet, 1, 3, 'battle-master')
    const m = heroEntries(sheet, 3, data as never).find((x) => x.kind === 'option')!
    expect(m.resource).toMatch(/Superiority/)
    sheet.used = { [m.resource!]: 99 }
    expect(entryWhy(sheet, m)).toBe('None left')
  })

  it('gives a Dragonborn Breath Weapon as an attack with its save', () => {
    const { sheet } = build('fighter', 'dragonborn')
    levelTo(sheet, 1, 5)
    const bw = heroEntries(sheet, 5, data as never).find((x) => x.name === 'Breath Weapon')!
    expect(bw).toMatchObject({ dice: '2d10', attack: true, save: { ability: 'DEX' } })
  })
})
