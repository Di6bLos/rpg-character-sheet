// Library → Rules (data/rules): every indexed topic exists, renders and cites its pages, the
// PF2e text stays free of Golarion names, and key numbers match the books and the app's data.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Pf2eData } from '../data/pf2e'
import { CONDITIONS, REACTIONS } from '../data/nimble/core'
import { RULES_FILES, RULES_SYSTEMS, loadRulesFile, rulesSystem } from '../data/rules'
import { settingName } from '../scripts/lib/aon'
import { loreHtml } from '../utils/loreText'
import { RULES_CITE, expandRules, rulesNeeds, rulesPlain, rulesSections } from '../utils/rulesText'

const dir = join(import.meta.dirname, '..', 'data', 'pf2e', 'generated')
const load = <K extends keyof Pf2eData>(set: K): Pf2eData[K] =>
  JSON.parse(readFileSync(join(dir, `${set}.json`), 'utf8'))
const pf2eActions = load('actions')
const pf2eConditions = load('conditions')
const deityNames = load('deities').map((d) => d.name)

/** Each topic's filled-in markdown, by `<system>/<slug>`. */
const topics = new Map<string, string>()
const text = (system: string, slug: string) => {
  const md = topics.get(`${system}/${slug}`)
  if (md === undefined) throw new Error(`No topic ${system}/${slug}`)
  return md
}
const plain = (system: string, slug: string) => rulesPlain(text(system, slug))

beforeAll(async () => {
  for (const s of RULES_SYSTEMS)
    for (const t of s.topics)
      topics.set(
        `${s.id}/${t.slug}`,
        expandRules(await loadRulesFile(t.file), { pf2eActions, pf2eConditions }),
      )
})

describe('rules index', () => {
  it('lists every topic file and only those', () => {
    const indexed = RULES_SYSTEMS.flatMap((s) => s.topics.map((t) => t.file))
    expect([...indexed].sort()).toEqual([...RULES_FILES].sort())
    for (const s of RULES_SYSTEMS) {
      const slugs = s.topics.map((t) => t.slug)
      expect(new Set(slugs).size, s.id).toBe(slugs.length)
      for (const t of s.topics)
        expect(t.file, t.slug).toMatch(new RegExp(`^${s.id}/\\d\\d-${t.slug}\\.md$`))
    }
  })

  it('has Nimble and PF2e ready, and 5e waiting for its files', () => {
    expect(rulesSystem('nimble')?.topics.length).toBeGreaterThan(0)
    expect(rulesSystem('pf2e')?.topics.length).toBeGreaterThan(0)
    expect(rulesSystem('dnd5e')?.topics).toEqual([])
    expect(rulesSystem('nimble')?.attribution).toContain(
      'published under the Nimble 3rd Party Creator License and is not affiliated with Nimble Co. Nimble © 2025 Nimble Co.',
    )
    expect(rulesSystem('pf2e')?.attribution).toContain('ORC License')
  })

  it('renders every topic, with every placeholder filled', () => {
    for (const [key, md] of topics) {
      expect(md, key).not.toMatch(/\{\{/)
      const html = loreHtml(md, { headingBase: 3 })
      expect(html, key).toContain('<h3>')
      expect(html, key).not.toMatch(/<h[12]>/)
    }
  })

  it('cites a page under every section', () => {
    for (const [key, md] of topics)
      for (const s of rulesSections(md).filter((x) => x.title))
        expect(s.markdown, `${key}: ${s.title}`).toMatch(RULES_CITE)
  })

  it('asks for the PF2e data its placeholders need, and fails loudly without it', async () => {
    const raw = await loadRulesFile('pf2e/05-conditions.md')
    expect(rulesNeeds(raw)).toEqual(['pf2eConditions'])
    expect(() => expandRules(raw)).toThrow(/not loaded/)
  })
})

describe('PF2e rules', () => {
  it('names nothing from Golarion', () => {
    for (const t of rulesSystem('pf2e')?.topics ?? []) {
      const words = plain('pf2e', t.slug)
      expect(settingName(words, deityNames), t.slug).toBeUndefined()
    }
  })

  it('states the degrees of success and natural 20 / 1 rule', () => {
    const core = plain('pf2e', 'core-rules')
    expect(core).toContain('meets or exceeds the DC by 10 or more')
    expect(core).toContain('if you fail a check by 10 or more')
    expect(core).toMatch(/20 on the die makes the result one degree better/)
  })

  it('has the multiple attack penalty, agile included', () => {
    const combat = text('pf2e', 'combat')
    expect(combat).toMatch(/\| Second\s+\| –5\s+\| –4\s+\|/)
    expect(combat).toMatch(/\| Third and later\s+\| –10\s+\| –8\s+\|/)
  })

  it('kills at dying 4 and sets recovery checks at DC 10 + dying', () => {
    const dying = plain('pf2e', 'dying-and-death')
    expect(dying).toContain('At dying 4 you die')
    expect(dying).toContain('flat check against DC 10 + your current dying value')
  })

  it('matches the DCs by level table (GM Core p. 52)', () => {
    const book = [
      14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40, 42, 44,
      46, 48, 50,
    ]
    const md = text('pf2e', 'core-rules')
    const found = new Map<number, number>()
    for (const row of md.split('\n').filter((l) => /^\| \d+\s+\| \d+/.test(l))) {
      const cells = row
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean)
        .map(Number)
      for (let i = 0; i + 1 < cells.length; i += 2) found.set(cells[i] ?? -1, cells[i + 1] ?? -1)
    }
    book.forEach((dc, level) => expect(found.get(level), `level ${level}`).toBe(dc))
    expect(md).toMatch(
      /\| DC\s+\| 15\s+\| 18\s+\| 20\s+\| 23\s+\| 26\s+\| 28\s+\| 31\s+\| 34\s+\| 36\s+\| 39\s+\|/,
    )
  })

  it('takes its conditions and actions from the data', () => {
    const conditions = text('pf2e', 'conditions')
    for (const c of pf2eConditions) expect(conditions, c.name).toContain(`| ${c.name}`)
    const actions = text('pf2e', 'actions')
    for (const name of ['Strike', 'Stride', 'Raise a Shield', 'Grapple', 'Administer First Aid'])
      expect(actions, name).toMatch(new RegExp(`^### ${name} · `, 'm'))
  })
})

describe('Nimble rules', () => {
  it('states the core numbers as the Core Rules do', () => {
    const core = plain('nimble', 'core-rules')
    expect(core).toContain('can never go above +12')
    expect(core).toContain('The DC of effects a hero causes is 10 + KEY')
    expect(core).toContain('tops out at +5')
    const combat = plain('nimble', 'combat')
    expect(combat).toContain('If the Primary Die (the leftmost die) shows a 1, you miss')
    expect(combat).toMatch(/9 or less 1 10–19 2 20\+ \(or a natural 20\) all 3/)
    const dying = plain('nimble', 'dying-and-death')
    expect(dying).toContain('At 6 Wounds you die')
    expect(dying).toContain('taking damage gives you 2 Wounds , or 3 from a crit')
    const basics = plain('nimble', 'character-basics')
    expect(basics).toContain('4 more skill points')
    expect(basics).toMatch(/Speed 6/)
    expect(basics).toMatch(/Inventory slots 10 \+ STR/)
    const rest = plain('nimble', 'healing-and-rest')
    expect(rest).toContain('heal 1 Wound')
    expect(plain('nimble', 'actions')).toContain('DC 12')
  })

  it('reuses the conditions and reactions the app plays by', () => {
    const conditions = text('nimble', 'conditions')
    for (const c of CONDITIONS) expect(conditions, c.name).toContain(`| ${c.name}`)
    const actions = text('nimble', 'actions')
    for (const r of REACTIONS) expect(actions, r.name).toContain(`| ${r.name}`)
  })
})
