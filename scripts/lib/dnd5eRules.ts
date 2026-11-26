// Facts read out of 5e rules text for the generator: spell stat lines and the numbers in a
// spell's text (attack, save, damage, healing, scaling), feat category and prerequisite lines,
// ability score increases, and starting equipment options. They run on the SRD's text and on
// the wiki's text alike; only the facts they return are kept for non-SRD entries.

import type {
  Dnd5eAbility,
  Dnd5eActivation,
  Dnd5eFeatCategory,
  Dnd5ePrerequisite,
  Dnd5eSchool,
  Dnd5eSpellDef,
} from '../../data/dnd5e/types'

export const ABILITY: Record<string, Dnd5eAbility> = {
  Strength: 'STR',
  Dexterity: 'DEX',
  Constitution: 'CON',
  Intelligence: 'INT',
  Wisdom: 'WIS',
  Charisma: 'CHA',
}
const ABILITY_RE = Object.keys(ABILITY).join('|')

export const DAMAGE_TYPES = [
  'Acid',
  'Bludgeoning',
  'Cold',
  'Fire',
  'Force',
  'Lightning',
  'Necrotic',
  'Piercing',
  'Poison',
  'Psychic',
  'Radiant',
  'Slashing',
  'Thunder',
]

export const SKILLS = [
  'Acrobatics',
  'Animal Handling',
  'Arcana',
  'Athletics',
  'Deception',
  'History',
  'Insight',
  'Intimidation',
  'Investigation',
  'Medicine',
  'Nature',
  'Perception',
  'Performance',
  'Persuasion',
  'Religion',
  'Sleight of Hand',
  'Stealth',
  'Survival',
]

export const slug = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** Abilities named in a phrase ("Strength or Dexterity", "Intelligence, Wisdom, or Charisma"). */
export const abilitiesIn = (s: string): Dnd5eAbility[] =>
  [...s.matchAll(new RegExp(`\\b(${ABILITY_RE})\\b`, 'g'))].map((m) => ABILITY[m[1]!]!)

const plain = (s: string) => s.replace(/[*_]/g, '')

/** "Level 3 Evocation (Sorcerer, Wizard)" or "Evocation Cantrip (Sorcerer, Wizard)". */
export function spellHeader(line: string) {
  const s = plain(line).trim()
  const m = s.match(/^Level (\d) (\w+) \(([^)]*)\)/) ?? s.match(/^(\w+) Cantrip \(([^)]*)\)/)
  if (!m) return undefined
  const cantrip = m.length === 3
  return {
    level: cantrip ? 0 : Number(m[1]),
    school: (cantrip ? m[1] : m[2]) as Dnd5eSchool,
    classes: (cantrip ? m[2]! : m[3]!).split(/,\s*/).map((c) => c.trim()),
  }
}

/** The stat lines and numbers of a spell, from its stat lines and body text. */
export function spellFacts(
  stats: { castingTime: string; range: string; components: string; duration: string },
  body: string,
  higher: string | undefined,
): Omit<
  Dnd5eSpellDef,
  keyof import('../../data/dnd5e/types').Dnd5eRecord | 'level' | 'school' | 'classes'
> {
  const ct = stats.castingTime.trim()
  const ritual = /\bor Ritual\b/i.test(ct)
  const base = ct.replace(/\s*or Ritual\b/i, '').trim()
  const activation: Dnd5eActivation | 'time' = /^Bonus Action/i.test(base)
    ? 'bonus'
    : /^Reaction/i.test(base)
      ? 'reaction'
      : /^Action/i.test(base)
        ? 'action'
        : 'time'
  const trigger = base.match(/^Reaction, which you take (.+)$/i)?.[1]
  const comp = stats.components.trim()
  const mat = comp.match(/M \((.+)\)\s*$/)?.[1]
  const cost = mat?.match(/worth (\d[\d,]*)\+? GP/i)?.[1]
  const text = plain(body)
  const save = text.match(new RegExp(`\\b(${ABILITY_RE}) saving throw`))?.[1]
  const attack = text.match(/\b(melee|ranged) spell attack/i)?.[1]?.toLowerCase() as
    | 'melee'
    | 'ranged'
    | undefined
  const damage = [
    ...text.matchAll(
      new RegExp(`\\b(\\d+d\\d+(?: ?\\+ ?\\d+)?)\\s+(${DAMAGE_TYPES.join('|')}) damage`, 'g'),
    ),
  ].map((m) => ({ dice: m[1]!.replace(/ /g, ''), type: m[2]! }))
  const healing = text.match(
    /regains? (?:a number of )?Hit Points equal to (\d+d\d+)|regains? (\d+d\d+(?: ?\+ ?\d+)?) Hit Points/,
  )
  const h = higher ? plain(higher) : ''
  const per = h.match(/increases? by (\d+d\d+)/)?.[1]
  const cantripTier = /when you reach levels? 5/i.test(h)
  return {
    castingTime: ct,
    activation,
    ritual,
    ...(trigger ? { trigger } : {}),
    range: stats.range.trim(),
    components: {
      v: /\bV\b/.test(comp.replace(/\(.*\)/, '')),
      s: /\bS\b/.test(comp.replace(/\(.*\)/, '')),
      ...(mat ? { m: mat } : /\bM\b/.test(comp) ? { m: '' } : {}),
      ...(cost ? { cost: Number(cost.replace(/,/g, '')) } : {}),
      ...(mat && /consume/i.test(mat) ? { consumed: true } : {}),
    },
    duration: stats.duration.trim(),
    concentration: /^Concentration/i.test(stats.duration.trim()),
    ...(attack ? { attack } : {}),
    ...(save ? { save: ABILITY[save]! } : {}),
    ...(damage.length ? { damage } : {}),
    ...(healing ? { healing: (healing[1] ?? healing[2])!.replace(/ /g, '') } : {}),
    ...(h
      ? { scaling: { kind: cantripTier ? 'cantrip' : 'slot', ...(per ? { dice: per } : {}) } }
      : {}),
  }
}

const CATEGORY: Record<string, Dnd5eFeatCategory> = {
  'Origin Feat': 'origin',
  'General Feat': 'general',
  'Fighting Style Feat': 'fighting-style',
  'Epic Boon Feat': 'epic-boon',
}

/** A prerequisite line as fields ("Level 4+, Strength or Dexterity 13+"). */
export function prerequisite(text: string, classNames: Record<string, string>): Dnd5ePrerequisite {
  const out: Dnd5ePrerequisite = { text }
  // "Intelligence, Wisdom, or Charisma 13+" is one part, though it has commas.
  const parts: string[] = []
  for (const raw of text.split(/,\s*(?![^()]*\))/)) {
    const prev = parts.at(-1)
    if (
      prev !== undefined &&
      new RegExp(`^(?:or |and )?(${ABILITY_RE})\\b`).test(raw) &&
      new RegExp(`(${ABILITY_RE})$`).test(prev)
    )
      parts[parts.length - 1] = `${prev}, ${raw}`
    else parts.push(raw)
  }
  for (const part of parts) {
    const p = part.trim()
    const level = p.match(/^Level (\d+)\+/)
    if (level) {
      out.level = Number(level[1])
      continue
    }
    const abl = p.match(
      new RegExp(`^((?:${ABILITY_RE})(?:,? (?:or |and )?(?:${ABILITY_RE}))*) (\\d+)\\+$`),
    )
    if (abl) {
      out.abilities = {
        abilities: abilitiesIn(abl[1]!),
        min: Number(abl[2]),
        any: !/ and /.test(abl[1]!),
      }
      continue
    }
    if (/Spellcasting|Pact Magic/.test(p)) {
      out.spellcasting = true
      continue
    }
    const cls = Object.keys(classNames).filter((n) => new RegExp(`\\b${n}\\b`).test(p))
    if (cls.length && !/Feature/.test(p)) {
      out.classes = cls.map((n) => classNames[n]!)
      continue
    }
    out.feature = out.feature ? `${out.feature}, ${p}` : p
  }
  return out
}

/** "General Feat (Prerequisite: Level 4+)" → category and prerequisite. */
export function featHeader(line: string, classNames: Record<string, string>) {
  const s = plain(line).trim()
  const m = s.match(/^(Origin|General|Fighting Style|Epic Boon) Feat(?: \(Prerequisite: (.+)\))?/)
  if (!m) return undefined
  return {
    category: CATEGORY[`${m[1]} Feat`]!,
    ...(m[2] ? { prerequisite: prerequisite(m[2], classNames) } : {}),
  }
}

/** "Increase your Strength or Dexterity score by 1, to a maximum of 20." */
export function abilityIncrease(text: string) {
  const s = plain(text)
  const chosen = s.match(/Increase the chosen ability score by (\d), to a maximum of (\d+)/)
  if (chosen)
    return { abilities: Object.values(ABILITY), amount: Number(chosen[1]), max: Number(chosen[2]) }
  const one = s.match(/Increase (?:your )?(.+?)(?: score)? by (\d), to a maximum of (\d+)/)
  if (one && !/one ability score of your choice/.test(one[1]!))
    return { abilities: abilitiesIn(one[1]!), amount: Number(one[2]), max: Number(one[3]) }
  const any = s.match(/Increase one ability score of your choice by (\d), to a maximum of (\d+)/)
  if (any)
    return {
      abilities: Object.values(ABILITY),
      amount: Number(any[1]),
      max: Number(any[2]),
    }
  return undefined
}

/** "Choose A or B: (A) Greataxe, 4 Handaxes…, and 15 GP; or (B) 75 GP" → options. */
export function equipmentOptions(text: string) {
  const s = plain(text).replace(/^Choose [A-C](?:, [A-C])*,? or [A-C]:\s*/, '')
  return [...s.matchAll(/\(([A-C])\)\s*([^;]+?)(?:;\s*(?:or\s*)?|$)/g)].map((m) => {
    const items = m[2]!.replace(/[.\s]+$/, '').trim()
    const gp = Number(items.match(/(\d+) GP$/)?.[1] ?? 0)
    return { option: m[1]!, items, gp }
  })
}

/** "Choose 2: Animal Handling, Athletics, …, or Survival" → count and options. */
export function skillChoice(text: string) {
  const s = plain(text)
  const count = Number(s.match(/Choose (?:any )?(\d)/)?.[1] ?? 0)
  if (/any (?:\d+ )?skills?/i.test(s)) return { count, options: [...SKILLS] }
  const options = SKILLS.filter((k) => new RegExp(`\\b${k}\\b`).test(s))
  return { count, options }
}

/**
 * A lead-in that says nothing on its own ("You gain the following benefits.", "As a Dwarf, you
 * have these special traits."): never a summary.
 */
export const LEAD_IN =
  /^(?:You gain the following (?:benefits|features)|.*\b(?:the following|these) (?:special )?(?:benefits?|features?|effects?|traits?)\b)[.:]?$/i

/** The longest a generated one-liner runs before it is cut at a word. */
const SUMMARY_MAX = 220

/** Markdown to plain words: no emphasis, links or table rows. */
const unmark = (s: string) =>
  s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** The first sentence of a paragraph, cut at a word when it runs long. */
export function firstSentence(para: string): string {
  const p = unmark(para)
  const m = p.match(/^.+?[.!?](?=\s+[A-Z(]|$)/)
  const s = (m?.[0] ?? p).trim()
  if (s.length <= SUMMARY_MAX) return s
  return `${s.slice(0, SUMMARY_MAX).replace(/\s+\S*$/, '')}…`
}

/**
 * A one-liner drawn from SRD text (CC-BY-4.0): the first sentence of its first real paragraph,
 * past the italic tagline, the "**Field:**" lines, tables and lead-ins. `benefits` (a feat's)
 * picks the first named benefit other than its Ability Score Increase.
 */
export function srdSummary(text: string, benefits?: { name: string; text?: string }[]): string {
  const named = benefits?.filter((b) => b.text && !LEAD_IN.test(unmark(b.text)))
  const pickB = named?.find((b) => b.name !== 'Ability Score Increase') ?? named?.[0]
  if (pickB?.text) return firstSentence(pickB.text)
  const paras = text
    .replace(/^_[^_\n]+_\s*/, '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith('|') && !/^\*\*[^*]+:\*\*/.test(p) && !p.startsWith('#'))
  for (const p of paras) {
    const body = p.replace(/^\*\*\*[^*]+\*\*\*\s*/, '')
    const s = firstSentence(body)
    if (s && !LEAD_IN.test(s)) return s
  }
  return ''
}
