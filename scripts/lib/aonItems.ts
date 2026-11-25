// Reading Pathfinder 2e items out of Archives of Nethys entries for `scripts/pf2e-data.ts`:
// an entry's grades ("Healing Potion (Minor)"), its activations (GM Core p. 220) and the
// numbers the sheet uses (healing, bonuses, bomb damage, runes, staff spells, a scroll's or
// wand's rank), read from the text as printed. Pure functions on cleaned markdown.

import type {
  Pf2eActionCost,
  Pf2eActivation,
  Pf2eItemBonus,
  Pf2eItemDamage,
  Pf2eItemNumbers,
  Pf2eRuneNumbers,
  Pf2eSelector,
} from '../../data/pf2e/types'

/** One grade of an item printed with several: its heading name and its own text. */
export interface ItemGrade {
  name: string
  text: string
}

/** Stat lines that belong to crafting or the grade's header, not to play. */
const GRADE_STAT = /^\*\*(?:Source|Price|Bulk|Hands|Usage|Craft Requirements)\*\*/

/**
 * Splits an item's rules text into its own text and its grades ("## Healing Potion (Minor) ·
 * Item 1" sections): each grade's text without its Source, Price and Bulk lines.
 */
export function itemGrades(text: string): { text: string; grades: ItemGrade[] } {
  const [own = '', ...rest] = text.split(/^## /m)
  const grades = rest.map((section) => {
    const [head = '', ...lines] = section.split('\n')
    const body = lines
      .filter((l) => l.trim() !== '---' && !GRADE_STAT.test(l.trim()))
      .join('\n')
      .trim()
    return { name: head.replace(/ · .*$/, '').trim(), text: body }
  })
  return { text: withoutCraft(own).trim(), grades }
}

const withoutCraft = (md: string) =>
  md
    .split('\n')
    .filter((l) => !l.trim().startsWith('**Craft Requirements**'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')

const GLYPH_COST: [string, Pf2eActionCost][] = [
  ['◆◆◆', 3],
  ['◆◆', 2],
  ['◆', 1],
  ['↺', 'reaction'],
  ['◇', 'free'],
]
const FIELDS = ['Frequency', 'Trigger', 'Requirements', 'Requirement', 'Effect', 'Cost']

/**
 * An activation line as AoN prints it: "◆ (manipulate)", "Cast a Spell", "◆ Strike",
 * "1 minute (manipulate)", "↺ (manipulate) **Frequency** once per day; **Trigger** …".
 */
export function readActivation(line: string, name?: string): Pf2eActivation {
  const split = line.split(new RegExp(`\\*\\*(${FIELDS.join('|')})\\*\\*`))
  const lead = (split[0] ?? '').trim()
  const fields: Record<string, string> = {}
  for (let i = 1; i < split.length; i += 2)
    fields[split[i]!] = (split[i + 1] ?? '').trim().replace(/;\s*$/, '').trim()
  const traits = [...lead.matchAll(/\(([^)]+)\)/g)].flatMap((m) =>
    m[1]!.split(',').map((t) => t.trim()),
  )
  const words = lead
    .replace(/\([^)]*\)/g, '')
    .replace(/[◆↺◇;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const glyph = GLYPH_COST.find(([g]) => lead.includes(g))?.[1]
  const time = /^\d+ (?:minutes?|hours?|rounds?|days?)$/i.test(words) ? words : undefined
  const actions = glyph ?? time
  const as = words && !time ? words.replace(/^Cast A Spell$/i, 'Cast a Spell') : undefined
  const requirements = fields.Requirements ?? fields.Requirement
  return {
    ...(name ? { name } : {}),
    ...(actions !== undefined ? { actions } : {}),
    ...(as ? { as } : {}),
    traits,
    ...(fields.Frequency ? { frequency: fields.Frequency } : {}),
    ...(fields.Trigger ? { trigger: fields.Trigger } : {}),
    ...(requirements ? { requirements } : {}),
    ...(fields.Cost ? { cost: fields.Cost } : {}),
    ...(fields.Effect ? { effect: fields.Effect } : {}),
  }
}

/**
 * An item's activations (GM Core p. 220): a consumable's in its stat lines (the effect is
 * the item's text), a permanent item's as "**Activate—Name**" paragraphs in its text.
 */
export function itemActivations(stats: Record<string, string>, text: string): Pf2eActivation[] {
  const out: Pf2eActivation[] = []
  if (stats.Activate !== undefined) {
    const extra = FIELDS.filter((f) => stats[f])
      .map((f) => ` **${f}** ${stats[f]}`)
      .join('')
    out.push(readActivation(`${stats.Activate}${extra}`))
  }
  for (const m of text.matchAll(/^\*\*Activate(?:\s*[—–-]\s*([^*]+?))?\*\*(.*)$/gm))
    out.push(readActivation(m[2] ?? '', m[1]?.trim()))
  return out
}

const SKILLS = [
  'Acrobatics',
  'Arcana',
  'Athletics',
  'Crafting',
  'Deception',
  'Diplomacy',
  'Intimidation',
  'Medicine',
  'Nature',
  'Occultism',
  'Performance',
  'Religion',
  'Society',
  'Stealth',
  'Survival',
  'Thievery',
]

/** The statistic a bonus's "to …" names, and what follows it (a qualifier makes it conditional). */
function bonusTarget(
  to: string,
): { selector: Pf2eSelector; skills?: string[]; rest: string } | undefined {
  const t = to.replace(/^(?:your|the wearer's|all) /i, '')
  const fixed: [RegExp, Pf2eSelector][] = [
    [/^(?:AC|Armor Class)\b/, 'ac'],
    [/^(?:weapon and unarmed )?attack rolls\b/i, 'attack'],
    [/^damage rolls\b/i, 'damage'],
    [/^Perception(?: checks)?\b/, 'perception'],
    [/^initiative(?: rolls)?\b/i, 'initiative'],
    [/^(?:saving throws|saves)\b/i, 'saves'],
    [/^Fortitude(?: saves| saving throws)?\b/, 'fortitude'],
    [/^Reflex(?: saves| saving throws)?\b/, 'reflex'],
    [/^Will(?: saves| saving throws)?\b/, 'will'],
    [/^(?:land )?Speed\b/, 'speed'],
  ]
  for (const [re, selector] of fixed) {
    const m = re.exec(t)
    if (m) return { selector, rest: t.slice(m[0].length) }
  }
  // Lore is named with the rest ("Arcana, Crafting, Lore, Occultism, and Society checks") but
  // isn't one skill the sheet can match, so it's left out of the list.
  const names = [...SKILLS, 'Lore'].join('|')
  const skill = new RegExp(`^((?:${names})(?:(?:,? and |, )(?:${names}))*)(?: checks)?\\b`).exec(t)
  const skills = skill?.[1]!
    .split(/,? and |, /)
    .map((s) => s.trim())
    .filter((s) => s !== 'Lore')
  if (skill && skills?.length) return { selector: 'skills', skills, rest: t.slice(skill[0].length) }
  return undefined
}

/** Words after the statistic that limit the bonus ("…to High Jump", "…against poisons"). */
const QUALIFIED =
  /^\s*(?:,\s*)?(?:to|against|when|while|if|made|with|for checks|on|from|you make)\b/i
/** Sentences that open with a condition hold only sometimes. */
const CONDITIONAL_START = /^(?:When|If|While|Whenever|On a|After|Each time|As long as)\b/

const sentences = (text: string) =>
  text
    .replace(/\*\*[^*]+\*\*/g, ' ')
    .replace(/_/g, '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)

/**
 * Bonuses an item's text gives ("a +2 item bonus to Athletics checks", "a +5-foot item bonus
 * to your Speed"); a grade's "The bonus is +2" fills the number the base text leaves out
 * (mutagens). Bonuses to its own attack roll (a bomb's) aren't the hero's.
 */
export function itemBonuses(text: string, grade = ''): Pf2eItemBonus[] {
  const gradeValue = Number(/\bthe bonus is \+(\d+)\b/i.exec(grade)?.[1] ?? 0)
  const out: Pf2eItemBonus[] = []
  for (const sentence of [...sentences(grade), ...sentences(text)])
    for (const m of sentence.matchAll(
      /\b(?:an? |the )?(?:\+(\d+)(?:-?\s*foot)? )?(item|status|circumstance) bonus to ([^.;]+?)(?=,? and (?:an? )?\+\d|[.;]|$)/g,
    )) {
      const value = Number(m[1] ?? 0) || gradeValue
      const target = bonusTarget(m[3]!)
      if (!value || !target) continue
      const conditional = QUALIFIED.test(target.rest) || CONDITIONAL_START.test(sentence)
      const bonus: Pf2eItemBonus = {
        value,
        type: m[2] as Pf2eItemBonus['type'],
        selector: target.selector,
        ...(target.skills ? { skills: target.skills } : {}),
        ...(conditional ? { when: sentence } : {}),
      }
      const same = out.find(
        (b) =>
          b.selector === bonus.selector &&
          b.type === bonus.type &&
          `${b.skills}` === `${bonus.skills}`,
      )
      if (!same) out.push(bonus)
    }
  return out
}

/** Hit Points an item restores ("The potion restores 2d8+5 Hit Points"). */
export function itemHealing(text: string) {
  const m =
    /\b(?:restores?|regains?|heals?|recover)\s+(?:you\s+)?(\d+d\d+(?:\s*\+\s*\d+)?|\d+)\s+(?:Hit Points|HP)\b/i.exec(
      text,
    )
  return m ? m[1]!.replace(/\s+/g, '') : undefined
}

const DURATION =
  /\b(?:for(?: the next)?|duration is|lasts?(?: for)?) ((?:\d+|one|ten) (?:rounds?|minutes?|hours?|days?)|hour|minute)\b/i
/**
 * How long a consumable's effect lasts, the grade's own first ("the duration is 10 minutes",
 * "for the next hour").
 */
export function itemDuration(text: string, grade = '') {
  const m = DURATION.exec(grade) ?? DURATION.exec(text)
  return m?.[1]
    ?.replace(/^one /i, '1 ')
    .replace(/^ten /i, '10 ')
    .replace(/^(hour|minute)$/i, '1 $1')
}

/** An item's text without its activation paragraphs: what it does while worn or held. */
export const withoutActivations = (text: string) =>
  text
    .split('\n')
    .filter((l) => !l.trim().startsWith('**Activate'))
    .join('\n')

const dmg = (m: RegExpExecArray | null): Pf2eItemDamage | undefined =>
  m ? { dice: m[1]!, type: m[2]!.toLowerCase() } : undefined

/**
 * A bomb's damage (GM Core p. 244): "The bomb deals 1d8 fire damage, 1 persistent fire damage,
 * and 1 fire splash damage", with its item bonus to attack rolls.
 */
export function bombNumbers(text: string): Pf2eItemNumbers['bomb'] {
  const damage = dmg(/\b(\d+d\d+(?:\+\d+)?) (?!persistent)(\w+) damage\b/.exec(text))
  if (!damage) return undefined
  const persistent = dmg(/\b(\d+d\d+|\d+) persistent (\w+) damage\b/.exec(text))
  const splash = /\b(\d+) (?:\w+ )?splash damage\b/.exec(text)
  const attack = /\+(\d+) item bonus to attack rolls\b/.exec(text)
  return {
    damage,
    ...(persistent ? { persistent } : {}),
    ...(splash ? { splash: Number(splash[1]) } : {}),
    ...(attack ? { attack: Number(attack[1]) } : {}),
  }
}

const GRADE_STEP: Record<string, number> = { greater: 2, major: 3 }

/**
 * A rune's numbers (GM Core pp. 224–237): a potency rune's +N (from its name), a striking
 * rune's extra dice (striking 1, greater 2, major 3), a resilient rune's bonus to saves, a
 * property rune's damage on a hit and what it does on a critical hit.
 */
export function runeNumbers(
  name: string,
  subcategory: string,
  usage: string,
  text: string,
): Pf2eRuneNumbers {
  const onto = /armor/i.test(subcategory) ? 'armor' : 'weapon'
  const grade = /\((Greater|Major)\)/.exec(name)?.[1]?.toLowerCase()
  if (subcategory.startsWith('Fundamental')) {
    const plus = Number(/\(\+(\d)\)/.exec(name)?.[1] ?? 0)
    if (/Potency/.test(name)) return { slot: 'potency', onto, value: plus, usage }
    const slot = name.startsWith('Striking') ? 'striking' : 'resilient'
    return { slot, onto, value: GRADE_STEP[grade ?? ''] ?? 1, usage }
  }
  const damage = dmg(/\badditional (\d+d\d+) (\w+) damage\b/.exec(text))
  const crit = sentences(text).find((s) => /\bcritical hit\b/i.test(s))
  return {
    slot: 'property',
    onto,
    ...(damage ? { damage } : {}),
    ...(crit ? { crit } : {}),
    usage,
  }
}

const RANK_WORD = /^(Cantrip|(\d+)(?:st|nd|rd|th))$/
/**
 * A staff's spell list (GM Core p. 278): "- **1st** breathe fire, _floating flame_" lines,
 * cantrips at rank 0.
 */
export function staffSpells(text: string) {
  const out: { rank: number; names: string[] }[] = []
  for (const m of text.matchAll(/^- \*\*([^*]+)\*\*\s*(.+)$/gm)) {
    const r = RANK_WORD.exec(m[1]!.trim())
    if (!r) continue
    const rank = r[2] ? Number(r[2]) : 0
    const names = m[2]!
      .replace(/_/g, '')
      .split(/,\s*/)
      .map((n) => n.trim())
      .filter(Boolean)
    out.push({ rank, names })
  }
  return out
}

/** Merges lower types' spell lists into a higher type's (GM Core p. 278: it keeps them). */
export function withLowerSpells(
  lower: { rank: number; names: string[] }[],
  own: { rank: number; names: string[] }[],
) {
  const byRank = new Map<number, string[]>()
  for (const { rank, names } of [...lower, ...own]) {
    const had = byRank.get(rank) ?? []
    const known = new Set(had.map((n) => n.toLowerCase()))
    byRank.set(rank, [...had, ...names.filter((n) => !known.has(n.toLowerCase()))])
  }
  return [...byRank.entries()].sort((a, b) => a[0] - b[0]).map(([rank, names]) => ({ rank, names }))
}

/** The spell rank in a scroll's or wand's grade name ("2nd-rank Scroll", "(3rd-rank Spell)"). */
export const spellRankIn = (name: string) => {
  const m = /\b(\d+)(?:st|nd|rd|th)-rank\b/i.exec(name)
  return m ? Number(m[1]) : undefined
}
