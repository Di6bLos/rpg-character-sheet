import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { NIMBLE_CLASSES } from '../data/nimble/classes'
import { SPELLS } from '../data/nimble/spells'

const SOURCES = [
  '../utils/nimblePlay.ts',
  '../utils/nimbleBuild.ts',
  '../utils/nimbleArmor.ts',
  '../composables/useNimbleActions.ts',
  '../composables/useNimbleSpells.ts',
  '../utils/nimbleSpellDamage.ts',
  '../utils/nimbleSummons.ts',
  '../utils/nimbleConditions.ts',
  '../utils/nimbleSpellRules.ts',
]

const texts = [
  ...NIMBLE_CLASSES.flatMap((cls) => [
    ...Object.values(cls.levels).flatMap((l) => l?.abilities ?? []),
    ...cls.subclasses.flatMap((sub) => [
      ...(sub.intro ?? []),
      ...Object.values(sub.levels).flatMap((l) => l?.abilities ?? []),
    ]),
    ...cls.pools.flatMap((p) => p.options),
  ]).map((a) => a.desc),
  ...SPELLS.map((s) => s.desc),
]

const MESSAGES = new Set(['already used|enter what you rolled'])

const LITERAL = /\/((?:\\.|\[[^\]\n]*\]|[^/\n\\[])+)\/([gimsuy]*)/g
const PHRASE = /(?:[A-Za-z’']+ ){3,}[A-Za-z’']+/

function rulesRegexes(): { file: string; source: string; regex: RegExp }[] {
  return SOURCES.flatMap((file) => {
    const code = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
    return [...code.matchAll(LITERAL)].flatMap((m) => {
      const source = m[1]!
      if (MESSAGES.has(source)) return []
      if (!PHRASE.test(source.replace(/\\b|\\s\+?|\\\(|\\\)/g, ' '))) return []
      try {
        return [{ file, source, regex: new RegExp(source, (m[2] ?? '').replace('g', '')) }]
      } catch {
        return []
      }
    })
  })
}

describe('rules text', () => {
  const found = rulesRegexes()

  it('finds the rules regexes in the source', () => {
    expect(found.length).toBeGreaterThan(30)
  })

  it.each(found.map((f) => [`${f.file}: /${f.source}/`, f.regex] as const))(
    '%s matches some ability or spell text',
    (_label, regex) => {
      expect(texts.some((t) => regex.test(t))).toBe(true)
    },
  )
})
