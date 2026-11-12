import type { GameSystem, NpcKind, StatBlock, StatEntry } from '~/types'

/** The editable shape of an NPC in the manual builder; `toStatBlock` turns it into the stored JSON. */
export interface NpcForm {
  name: string
  kind: NpcKind
  level: string
  type: string
  size: string
  alignment: string
  /** Headline fields by label (AC, HP, Speed…), from `TOP_FIELDS[system]`. */
  top: Record<string, string>
  /** Ability row by label, from `STAT_KEYS[system]`. */
  stats: Record<string, string>
  /** Secondary lines: senses, languages, immunities… */
  lines: [string, string][]
  sections: { title: string; items: StatEntry[] }[]
  gmNotes: string
  /**
   * The stored initiative modifier and the input it came with (DEX for 5e,
   * Perception for PF2e, nothing for Nimble). Kept while that input is unchanged,
   * so an explicit override survives Edit and Duplicate.
   */
  storedInit?: { mod: number; from: string }
}

interface TopField {
  label: string
  hint: string
  /** What the initiative tracker reads from this field. */
  role?: 'hp' | 'ac' | 'init'
}

export const TOP_FIELDS: Record<GameSystem, TopField[]> = {
  dnd5e: [
    { label: 'Armor Class', hint: '13 (leather)', role: 'ac' },
    { label: 'Hit Points', hint: '22 (5d8)', role: 'hp' },
    { label: 'Speed', hint: '30 ft.' },
    { label: 'Challenge', hint: '1 (200 XP)' },
  ],
  pf2e: [
    { label: 'Perception', hint: '+6; darkvision', role: 'init' },
    { label: 'AC', hint: '15', role: 'ac' },
    { label: 'Saves', hint: 'Fort +8, Ref +4, Will +5' },
    { label: 'HP', hint: '20', role: 'hp' },
    { label: 'Speed', hint: '25 feet' },
  ],
  nimble: [
    { label: 'Armor', hint: 'None, Medium or Heavy' },
    { label: 'HP', hint: '18', role: 'hp' },
    { label: 'Speed', hint: '6' },
  ],
}

export const STAT_KEYS: Record<GameSystem, string[]> = {
  dnd5e: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'],
  pf2e: ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'],
  nimble: [],
}

export const SECTION_TITLES: Record<GameSystem, string[]> = {
  dnd5e: ['Traits', 'Actions', 'Reactions'],
  pf2e: ['Abilities', 'Actions', 'Reactions'],
  nimble: ['Traits', 'Actions', 'Bloodied'],
}

export const LEVEL_LABEL: Record<GameSystem, string> = {
  dnd5e: 'Challenge',
  pf2e: 'Level',
  nimble: 'Level',
}

export function blankNpcForm(system: GameSystem, kind: NpcKind = 'monster'): NpcForm {
  return {
    name: '',
    kind,
    level: '',
    type: '',
    size: system === 'pf2e' ? '' : 'Medium',
    alignment: '',
    top: Object.fromEntries(TOP_FIELDS[system].map((f) => [f.label, ''])),
    stats: Object.fromEntries(STAT_KEYS[system].map((k) => [k, system === 'dnd5e' ? '10' : '+0'])),
    lines: [],
    sections: SECTION_TITLES[system].map((title) => ({ title, items: [] })),
    gmNotes: '',
  }
}

/** First integer in a field: "22 (5d8)" → 22, "+6; darkvision" → 6, "−2" → -2. */
export function firstInt(text: string | undefined): number | undefined {
  const m = (text ?? '').replace(/−/g, '-').match(/[-+]?\d+/)
  return m ? Number(m[0]) : undefined
}

function abilityMod(score: number) {
  return Math.floor((score - 10) / 2)
}

/** The form input initiative is derived from, per system. */
function initSource(form: NpcForm, system: GameSystem): string {
  if (system === 'dnd5e') return (form.stats.DEX ?? '').trim()
  const f = TOP_FIELDS[system].find((x) => x.role === 'init')
  return f ? (form.top[f.label] ?? '').trim() : ''
}

/** Builds the stored stat block, including the numbers initiative reads (hp, ac, initMod). */
export function toStatBlock(form: NpcForm, system: GameSystem): StatBlock {
  const fields = TOP_FIELDS[system]
  const top = fields
    .map((f) => [f.label, (form.top[f.label] ?? '').trim()] as [string, string])
    .filter(([, v]) => v)
  const stats = STAT_KEYS[system].map((k) => [k, (form.stats[k] ?? '').trim()] as [string, string])
  const byRole = (role: TopField['role']) => {
    const f = fields.find((x) => x.role === role)
    return f ? firstInt(form.top[f.label]) : undefined
  }
  let initMod: number | undefined
  if (system === 'dnd5e') {
    const dex = firstInt(form.stats.DEX)
    initMod = dex === undefined ? undefined : abilityMod(dex)
  } else if (system === 'pf2e') {
    initMod = byRole('init')
  }
  if (form.storedInit && form.storedInit.from === initSource(form, system)) {
    initMod = form.storedInit.mod
  }
  const block: StatBlock = {
    type: form.type.trim() || undefined,
    size: form.size.trim() || undefined,
    alignment: form.alignment.trim() || undefined,
    top,
    stats: stats.some(([, v]) => v) ? stats : [],
    lines: form.lines
      .map(([k, v]) => [k.trim(), v.trim()] as [string, string])
      .filter(([k, v]) => k && v),
    sections: form.sections
      .map((s) => ({
        title: s.title,
        items: s.items.map((i) => ({ n: i.n.trim(), t: i.t.trim() })).filter((i) => i.n || i.t),
      }))
      .filter((s) => s.items.length),
    hp: byRole('hp'),
    ac: byRole('ac'),
    initMod,
  }
  return block
}

/** Back from a stored stat block to the form, for Edit and Duplicate. */
export function fromStatBlock(
  block: StatBlock,
  system: GameSystem,
  meta: { name: string; kind: NpcKind; level: string; gmNotes?: string },
): NpcForm {
  const form = blankNpcForm(system, meta.kind)
  form.name = meta.name
  form.level = meta.level
  form.type = block.type ?? ''
  form.size = block.size ?? form.size
  form.alignment = block.alignment ?? ''
  form.gmNotes = meta.gmNotes ?? ''
  for (const [k, v] of block.top ?? []) {
    if (k in form.top) form.top[k] = v
    else form.lines.push([k, v])
  }
  for (const [k, v] of block.stats ?? []) form.stats[k] = v
  // Blocks that only carry the tracker numbers (AI drafts, imports) keep them as fields.
  const roleField = (role: TopField['role']) => TOP_FIELDS[system].find((f) => f.role === role)
  for (const [role, value] of [
    ['hp', block.hp],
    ['ac', block.ac],
  ] as const) {
    const f = roleField(role)
    if (f && value !== undefined && !(form.top[f.label] ?? '').trim())
      form.top[f.label] = String(value)
  }
  if (block.initMod !== undefined)
    form.storedInit = { mod: block.initMod, from: initSource(form, system) }
  form.lines.push(...(block.lines ?? []).map(([k, v]) => [k, v] as [string, string]))
  for (const sec of block.sections ?? []) {
    const existing = form.sections.find((s) => s.title === sec.title)
    if (existing) existing.items = sec.items.map((i) => ({ ...i }))
    else form.sections.push({ title: sec.title, items: sec.items.map((i) => ({ ...i })) })
  }
  return form
}

/** "Undead · Medium · chaotic evil" under the name. */
export function statBlockSubtitle(block: StatBlock): string {
  return [block.size, block.type, block.alignment].filter(Boolean).join(' · ')
}
