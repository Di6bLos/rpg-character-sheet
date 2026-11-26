// Library: how a 5e record reads. SRD entries show the SRD's own text with its page; entries
// from the other official books (`DND5E_SOURCES`) carry no book text, only a `summary` in
// Lantern's words and their mechanics as fields, so the Library shows those fields as short
// fact lines ("Bonus Action", "Uses: Proficiency Bonus per Long Rest") and a source tag
// ("PHB"). Nothing here writes rules text of its own: every line is a field.
import { DND5E_SOURCES, type Dnd5eSourceKind } from '~/data/dnd5e/sources'
import type {
  Dnd5eAbility,
  Dnd5eActivation,
  Dnd5eChoice,
  Dnd5eFeatCategory,
  Dnd5eGrant,
  Dnd5eMechanics,
  Dnd5eOption,
  Dnd5eRecord,
  Dnd5eSave,
  Dnd5eSourceBook,
  Dnd5eUses,
} from '~/data/dnd5e/types'

export const DND5E_ABILITY: Record<Dnd5eAbility, string> = {
  STR: 'Strength',
  DEX: 'Dexterity',
  CON: 'Constitution',
  INT: 'Intelligence',
  WIS: 'Wisdom',
  CHA: 'Charisma',
}

const KIND_ORDER: Dnd5eSourceKind[] = ['core', 'supplement', 'setting', 'drop']

/** Every book as the source filters list it: core, supplements, settings, then drops, each by release. */
export const DND5E_BOOKS: readonly Dnd5eSourceBook[] = DND5E_SOURCES.map((s, i) => ({ s, i }))
  .sort((a, b) => KIND_ORDER.indexOf(a.s.kind) - KIND_ORDER.indexOf(b.s.kind) || a.i - b.i)
  .map(({ s }) => s.name)

const keyOf = (short: string) =>
  short
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** The source tag's short name ("PHB", "Arcana Unleashed"); the SRD tag carries its page. */
export const DND5E_SOURCE_SHORT = Object.fromEntries(
  DND5E_SOURCES.map((s) => [s.name, s.short]),
) as Record<Dnd5eSourceBook, string>

/** URL and filter keys for each source, from its short name (`phb`, `drop-may-2026`). */
export const DND5E_SOURCE_KEY = Object.fromEntries(
  DND5E_SOURCES.map((s) => [s.name, keyOf(s.short)]),
) as Record<Dnd5eSourceBook, string>

/** The filter keys in `DND5E_BOOKS` order. */
export const DND5E_SOURCE_KEYS = DND5E_BOOKS.map((b) => DND5E_SOURCE_KEY[b])

/** A record's filter keys: every book that prints it, so a reprint is found under each. */
export const dnd5eSourceKeys = (r: Pick<Dnd5eRecord, 'source' | 'sources'>) =>
  (r.sources ?? [r.source]).map((b) => DND5E_SOURCE_KEY[b])

/** Sort value for a Source column: book order, then page. */
export const dnd5eSourceSort = (r: Pick<Dnd5eRecord, 'source' | 'page'>) =>
  `${String(DND5E_BOOKS.indexOf(r.source)).padStart(2, '0')} ${String(r.page ?? 0).padStart(4, '0')}`

/** "SRD p. 87", "PHB". */
export function dnd5eSource(r: Pick<Dnd5eRecord, 'source' | 'page'>): string {
  const short = DND5E_SOURCE_SHORT[r.source]
  return r.page ? `${short} p. ${r.page}` : short
}

export const DND5E_FEAT_CATEGORY: Record<Dnd5eFeatCategory, string> = {
  origin: 'Origin',
  general: 'General',
  'fighting-style': 'Fighting Style',
  'epic-boon': 'Epic Boon',
  dragonmark: 'Dragonmark',
  'planar-pact': 'Planar Pact',
  'dark-gift': 'Dark Gift',
}

/** The feat categories in the order the Library lists them: the PHB's four, then the later books'. */
export const DND5E_FEAT_CATEGORIES = Object.keys(DND5E_FEAT_CATEGORY) as Dnd5eFeatCategory[]

export const DND5E_ACTIVATION: Record<Dnd5eActivation, string> = {
  action: 'Action',
  bonus: 'Bonus Action',
  reaction: 'Reaction',
  free: 'No action',
  magic: 'Magic action',
  special: 'Special',
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** A slug as a name, for spells and feats the caller has no record of ("mage-armor"). */
export const slugName = (slug: string) =>
  slug
    .split('-')
    .map((w, i) => (i > 0 && ['of', 'the', 'and', 'without', 'from'].includes(w) ? w : cap(w)))
    .join(' ')

export function listWords(items: readonly string[], last = 'and'): string {
  if (items.length < 2) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} ${last} ${items.at(-1)}`
}

function count(c: Dnd5eUses['count']): string {
  if (typeof c === 'number') return String(c)
  if (c === 'PB') return 'Proficiency Bonus'
  if (c === 'level') return 'class level'
  if (c in DND5E_ABILITY) return `${DND5E_ABILITY[c as Dnd5eAbility]} modifier (min 1)`
  return `${c.replace(/^column:/, '')} column`
}

const RECHARGE: Record<Dnd5eUses['recharge'], string> = {
  turn: 'per turn',
  short: 'per Short or Long Rest',
  long: 'per Long Rest',
  dawn: 'per dawn',
}

/** "1 per Long Rest (1 back on a Short Rest; or spend a level 1+ spell slot)". */
export function usesLabel(u: Dnd5eUses): string {
  const notes = [
    u.short === undefined ? '' : `${u.short === 'all' ? 'all' : u.short} back on a Short Rest`,
    u.restore ? `or spend ${u.restore}` : '',
  ].filter(Boolean)
  return `${count(u.count)} ${RECHARGE[u.recharge]}${notes.length ? ` (${notes.join('; ')})` : ''}`
}

/** "Wisdom, DC 8 + PB + Strength" or "Charisma, your spell save DC". */
export function saveLabel(s: Dnd5eSave): string {
  const dc =
    s.dc === 'spell'
      ? 'your spell save DC'
      : typeof s.dc === 'number'
        ? `DC ${s.dc}`
        : `DC 8 + PB + ${s.dc
            .slice(5)
            .split('/')
            .map((a) => DND5E_ABILITY[a as Dnd5eAbility] ?? a)
            .join(' or ')}`
  return `${DND5E_ABILITY[s.ability]}, ${dc}`
}

const dice = (d: string) => (d.startsWith('column:') ? `${d.slice(7)} column` : d)
const range = (r: number | string) => (typeof r === 'number' ? `${r} ft` : r)

const GRANT_LABEL: Record<
  Exclude<Dnd5eGrant['kind'], 'speed' | 'sense' | 'spell' | 'hp'>,
  string
> = {
  skill: 'Skill proficiency',
  expertise: 'Expertise',
  save: 'Saving throw proficiency',
  armor: 'Armor training',
  weapon: 'Weapon proficiency',
  tool: 'Tool proficiency',
  language: 'Language',
  resistance: 'Resistance',
  immunity: 'Immunity',
  conditionImmunity: 'Condition immunity',
  ac: 'Armor Class',
  feat: 'Feat',
}

/** One grant's value: "Darkvision 60 ft", "Fly Speed equal to your Speed", "Mage Armor (at will)". */
function grantValue(g: Dnd5eGrant, name: (slug: string) => string): string {
  switch (g.kind) {
    case 'sense':
      return `${g.value} ${g.range} ft`
    case 'speed': {
      const which = g.value === 'walk' ? 'Speed' : `${cap(g.value)} Speed`
      if (g.bonus) return `${which} +${g.bonus} ft`
      return g.amount === 'walk' ? `${which} equal to your Speed` : `${which} ${g.amount} ft`
    }
    case 'spell': {
      const notes = [
        g.atWill ? 'at will' : '',
        g.at && g.at > 1 ? `from level ${g.at}` : '',
        g.free ? `free cast ${usesLabel(g.free)}` : '',
      ].filter(Boolean)
      return `${name(g.spell)}${notes.length ? ` (${notes.join(', ')})` : ''}`
    }
    case 'hp':
      return `+${g.perLevel} per level`
    case 'ac':
      return g.formula
    case 'feat':
      return name(g.feat)
    default:
      return g.value
  }
}

const GRANT_HEAD: Record<'speed' | 'sense' | 'spell' | 'hp', string> = {
  speed: 'Speed',
  sense: 'Senses',
  spell: 'Spells',
  hp: 'Hit Points',
}

/** Grants of one kind on one line each: "Tool proficiency: Alchemist’s Supplies, Herbalism Kit". */
export function grantLines(
  grants: readonly Dnd5eGrant[],
  name: (slug: string) => string = slugName,
): string[] {
  const byKind = new Map<string, string[]>()
  for (const g of grants) {
    const head = g.kind in GRANT_HEAD ? GRANT_HEAD[g.kind as keyof typeof GRANT_HEAD] : ''
    const label = head || GRANT_LABEL[g.kind as keyof typeof GRANT_LABEL]
    byKind.set(label, [...(byKind.get(label) ?? []), grantValue(g, name)])
  }
  return [...byKind].map(([label, values]) => `${label}: ${values.join(', ')}`)
}

const CHOICE_NOUN: Record<Dnd5eChoice['kind'], [string, string]> = {
  skill: ['skill', 'skills'],
  expertise: ['Expertise', 'Expertise'],
  tool: ['tool', 'tools'],
  language: ['language', 'languages'],
  cantrip: ['cantrip', 'cantrips'],
  spell: ['spell', 'spells'],
  feat: ['feat', 'feats'],
  ability: ['ability score', 'ability scores'],
  weaponMastery: ['weapon mastery', 'weapon masteries'],
  option: ['option', 'options'],
  damageType: ['damage type', 'damage types'],
}

/** "Choose 2 skills from Arcana, History or Insight", "Fighting Style: choose 1 feat (Fighting Style)". */
export function choiceLine(c: Dnd5eChoice): string {
  const [one, many] = CHOICE_NOUN[c.kind]
  const what = [
    `choose ${c.count} ${c.count === 1 ? one : many}`,
    c.category?.length
      ? `(${c.category.map((k) => DND5E_FEAT_CATEGORY[k]).join(', ')})`
      : c.list
        ? `from the ${cap(c.list)} list`
        : '',
    c.from?.length ? `from ${listWords(c.from, 'or')}` : '',
    c.maxLevel ? `up to level ${c.maxLevel}` : '',
    c.school?.length ? `(${c.school.join(', ')})` : '',
    c.ritual ? '(Ritual)' : '',
    c.note ? `(${c.note})` : '',
  ]
    .filter(Boolean)
    .join(' ')
  return c.label ? `${c.label}: ${what}` : cap(what)
}

/**
 * The mechanics of a feature, trait, benefit or option as fact lines, in reading order:
 * activation, uses, dice and damage, save, range, duration, then grants and choices. Named
 * sub-options are left out (callers list them with `optionItems`).
 */
export function mechanicsFacts(
  m: Dnd5eMechanics & { cost?: string },
  name: (slug: string) => string = slugName,
): string[] {
  const damage = m.dice
    ? `${dice(m.dice)}${m.damageType ? ` ${m.damageType}` : ''}`
    : (m.damageType ?? '')
  return [
    m.activation ? DND5E_ACTIVATION[m.activation] : '',
    m.cost ? `Cost: ${m.cost}` : '',
    m.uses ? `Uses: ${usesLabel(m.uses)}` : '',
    damage ? `${m.dice ? 'Dice' : 'Damage type'}: ${damage}` : '',
    m.save ? `Save: ${saveLabel(m.save)}` : '',
    m.range !== undefined ? `Range: ${range(m.range)}` : '',
    m.duration ? `Duration: ${cap(m.duration)}` : '',
    ...grantLines(m.grants ?? [], name),
    ...(m.choices ?? []).map(choiceLine),
  ].filter(Boolean)
}

/** A named piece of an entry (a benefit, trait, option or feature) as the Library shows it. */
export interface EntryItem {
  name: string
  meta?: string
  /** SRD text as markdown. */
  text?: string
  /** Non-SRD: the summary in Lantern's words. */
  summary?: string
  facts: string[]
  /** Sub-options (Divine Order's Protector and Thaumaturge). */
  options?: EntryItem[]
}

/**
 * One piece: SRD text speaks for itself, so its fields are left out; a summary comes with its
 * fact lines. `options` nest one level.
 */
export function entryItem(
  x: Dnd5eMechanics & { name: string; text?: string; summary?: string; cost?: string },
  name: (slug: string) => string = slugName,
  meta?: string,
): EntryItem {
  const text = x.text?.trim()
  return {
    name: x.name,
    ...(meta ? { meta } : {}),
    ...(text ? { text } : {}),
    ...(!text && x.summary ? { summary: x.summary } : {}),
    facts: text ? [] : mechanicsFacts(x, name),
    ...(!text && x.options?.length ? { options: optionItems(x.options, name) } : {}),
  }
}

export function optionItems(
  options: readonly Dnd5eOption[],
  name: (slug: string) => string = slugName,
): EntryItem[] {
  return options.map((o) => entryItem(o, name))
}
