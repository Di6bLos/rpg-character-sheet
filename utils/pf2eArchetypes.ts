// Pathfinder 2e archetypes (Player Core pp. 215–216) for heroes made in the builder: the
// archetype feats a slot can take, the dedication rule, feats that grant a feat, what a
// dedication trains, multiclass spellcasting by level, and the free archetype variant (GM Core
// p. 84). `utils/pf2eLevelUp.ts` puts them into the level plan; the proficiencies a dedication
// grants are read there with the class features' sentences.
import type { Pf2eFeatDef, Pf2eSpellDef } from '~/data/pf2e/types'
import type {
  Pf2eArchetypeCasting,
  Pf2eAttr,
  Pf2eFeat,
  Pf2eLevelInput,
  Pf2eRank,
  Pf2eSheet,
} from '~/types/sheets'
import { PF2E_SKILL_NAMES, plain, uniqueNames } from '~/utils/pf2eBuild'
import type { Pf2eChoicePlan, Pf2eLevelPlan, Pf2eSpellPick } from '~/utils/pf2eLevelUp'
import { setSlotMax, slotsFor } from '~/utils/pf2eSpells'

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'")
const NUMBER: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4 }
const ATTR: Record<string, Pf2eAttr> = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
}
const present = <T>(x: T | undefined): x is T => x !== undefined
const sentences = (text: string) =>
  plain(text.split(/\n#+ [^\n]* leads to\.\.\./)[0] ?? text).split(/(?<=\.)\s+/)

type FeatData = { feats: Pf2eFeatDef[] }
const featById = (data: FeatData, id: string | undefined) =>
  id ? data.feats.find((f) => f.id === id) : undefined

// --- Archetypes and their feats ---------------------------------------------------

/** A dedication feat: the Dedication trait, or a mythic dedication by its name. */
export const isDedication = (f: Pick<Pf2eFeatDef, 'name' | 'traits'>) =>
  f.traits.includes('Dedication') || f.name.endsWith(' Dedication')

/** The archetype a dedication starts. */
export const dedicationArchetype = (f: Pick<Pf2eFeatDef, 'name' | 'archetypes'>) =>
  f.archetypes[0] ?? f.name.replace(/ Dedication$/, '')

/** A feat's level when taken for an archetype: an Additional Feat's can differ (p. 215). */
export const archetypeLevel = (
  f: Pick<Pf2eFeatDef, 'level' | 'archetypeLevels'>,
  archetype: string,
) => f.archetypeLevels?.[archetype] ?? f.level

export interface HeroArchetype {
  name: string
  dedication: Pf2eFeat
  /** The other feats taken for it; a feat another feat granted doesn't count (p. 215). */
  feats: Pf2eFeat[]
}

/** The hero's archetypes in the order their dedications were taken. */
export function heroArchetypes(feats: Pf2eFeat[]): HeroArchetype[] {
  const out: HeroArchetype[] = feats
    .filter((f) => f.dedication && f.archetype)
    .map((f) => ({ name: f.archetype!, dedication: f, feats: [] }))
  for (const f of feats)
    if (!f.dedication && !f.via && f.archetype)
      out.find((a) => a.name === f.archetype)?.feats.push(f)
  return out
}

/** Feats an archetype's dedication needs before another dedication (Player Core p. 215). */
export const DEDICATION_FEATS = 2

/**
 * The dedication rule (Player Core p. 215): after a dedication, no other dedication until two
 * more feats of that archetype. `pending` are feats picked in the level's other slots. Null
 * when a new dedication is allowed.
 */
export function dedicationLock(
  sheet: Pick<Pf2eSheet, 'feats'>,
  data: FeatData,
  pending: string[] = [],
): { archetype: string; have: number } | null {
  const picked = pending.map((id) => featById(data, id)).filter(present)
  const now = picked.find(isDedication)
  if (now) return { archetype: dedicationArchetype(now), have: 0 }
  const last = heroArchetypes(sheet.feats).at(-1)
  if (!last) return null
  const have = last.feats.length + picked.filter((f) => f.archetypes.includes(last.name)).length
  return have >= DEDICATION_FEATS ? null : { archetype: last.name, have }
}

/** The clause a locked dedication shows as unmet. */
export const lockClause = (lock: { archetype: string; have: number }) => {
  const n = DEDICATION_FEATS - lock.have
  return `${n} more ${lock.archetype} archetype feat${n === 1 ? '' : 's'} before another dedication`
}

/**
 * Archetype feats a class or free archetype slot can take at a level (Player Core p. 215):
 * the feats of the archetypes the hero has a dedication for, at the level the archetype lists
 * them, then any dedication of 2nd level or higher up to the level, except the multiclass one
 * of the hero's own class. Mythic archetypes need the mythic rules and aren't offered. Class
 * feats of the hero's own class stay in the class list.
 */
export function archetypeFeatOptions(
  sheet: Pick<Pf2eSheet, 'feats' | 'class'>,
  level: number,
  data: FeatData,
): Pf2eFeatDef[] {
  if (level < 2) return []
  const held = new Set(heroArchetypes(sheet.feats).map((a) => a.name))
  const have = new Set(sheet.feats.map((f) => norm(f.name)))
  const dedications: Pf2eFeatDef[] = []
  const feats: Pf2eFeatDef[] = []
  for (const f of data.feats) {
    if (f.traits.includes('Mythic')) continue
    if (have.has(norm(f.name)) && !/more than once/i.test(f.text)) continue
    if (isDedication(f)) {
      const a = dedicationArchetype(f)
      const own = f.traits.includes('Multiclass') && a === sheet.class
      if (f.level >= 2 && f.level <= level && !held.has(a) && !own) dedications.push(f)
      continue
    }
    const a = f.archetypes.find((x) => held.has(x))
    if (!a || f.classes.includes(sheet.class)) continue
    const at = archetypeLevel(f, a)
    if (at <= level) feats.push(at === f.level ? f : { ...f, level: at })
  }
  return uniqueNames([...feats, ...dedications])
}

/** The archetype a feat is taken for, given the archetypes the hero has. */
export function featArchetype(f: Pf2eFeatDef, held: Set<string>, className: string) {
  if (isDedication(f)) return dedicationArchetype(f)
  if (!f.traits.includes('Archetype') && f.classes.includes(className)) return undefined
  return f.archetypes.find((a) => held.has(a))
}

/** Tags a feat entry with the archetype it's taken for (the sheet groups it there). */
export function tagArchetype(
  entry: Pf2eFeat,
  f: Pf2eFeatDef,
  held: Set<string>,
  className: string,
): Pf2eFeat {
  const archetype = featArchetype(f, held, className)
  if (!archetype) return entry
  return { ...entry, archetype, ...(isDedication(f) ? { dedication: true } : {}) }
}

/**
 * A feat that grants another feat (Player Core p. 215, Feats that Grant Feats): "You gain a
 * 1st- or 2nd-level fighter feat" (Basic Maneuver), or "a fighter feat" whose level is up to
 * half the character's (Advanced Maneuver, Advanced Arcana).
 */
export function grantedFeat(f: Pf2eFeatDef, level: number, classNames: string[]) {
  const m =
    /\bYou gain (?:a|one) (?:(\d+)(?:st|nd|rd|th)- or (\d+)(?:st|nd|rd|th)-level |(\d+)(?:st|nd|rd|th)-level )?([\w-]+) feat\b/i.exec(
      plain(f.text),
    )
  const className = m ? classNames.find((c) => norm(c) === norm(m[4]!)) : undefined
  if (!m || !className) return null
  const maxLevel = Number(m[2] ?? m[3] ?? 0) || Math.floor(level / 2)
  return { className, maxLevel, from: f.name }
}

/** The free archetype variant's slot (GM Core p. 84): every even level from 2nd. */
export const freeArchetypeSlot = (level: number, on: boolean | undefined) =>
  !!on && level >= 2 && level % 2 === 0

// --- What a dedication trains -------------------------------------------------------

/** "You become trained in Arcana", "your choice of Acrobatics or Athletics", "the bloodline's two skills". */
export interface FeatSkills {
  fixed: string[]
  /** "Your choice of Acrobatics or Athletics": one of these. */
  oneOf: string[]
  /** Skills the text names only by what they depend on (a deity's, a bloodline's two). */
  unnamed: number
  /** The sentences, for the choice's help. */
  text: string[]
}

/** The part of a sentence that trains skills, before its "if you were already trained" clause. */
const skillPart = (s: string) => {
  const m = /\byou (?:also )?become trained in ([^;]+)/i.exec(s)
  if (!m || /\b(?:weapons?|armor|unarmed|class DC|spell)\b/i.test(m[1]!)) return null
  return m[1]!
}

/** Whether a sentence trains skills (and so isn't read as a proficiency grant). */
export const trainsSkills = (s: string) => !!skillPart(s)

const skillsIn = (s: string) =>
  PF2E_SKILL_NAMES.filter((k) => new RegExp(`\\b${k}\\b`).test(s)).filter(
    (k, i, all) => all.indexOf(k) === i,
  )

/**
 * The skills a feat's text trains (Player Core pp. 216–223's dedications): the named ones, a
 * choice between some ("your choice of Acrobatics or Athletics", "Stealth or Thievery"), and
 * ones named only by what they belong to ("your deity's associated skill", "the bloodline's two
 * skills", "plus one skill of your choice"). The "if you were already trained" fallbacks are
 * left to `featSkillChoices`; a Lore of the player's choice and an eidolon's skills are notes.
 */
export function featSkills(f: Pick<Pf2eFeatDef, 'text'>): FeatSkills {
  const out: FeatSkills = { fixed: [], oneOf: [], unnamed: 0, text: [] }
  for (const s of sentences(f.text)) {
    if (/^(?:If|For each)\b/i.test(s)) continue
    const part = skillPart(s)
    if (!part) continue
    out.text.push(s)
    const choice = /\byour choice of (.+)/i.exec(part)
    if (choice) {
      out.oneOf.push(...skillsIn(choice[1]!))
      continue
    }
    for (const seg of part.split(
      /\s+(?:plus|and)\s+(?=(?:one|another|a)\b[^,]*?\bskill of your choice)/i,
    )) {
      if (/\bLore skill\b/i.test(seg)) continue
      const named = skillsIn(seg)
      const counted = /\b(two|three) skills\b/i.exec(seg)
      const unnamed = counted ? NUMBER[counted[1]!.toLowerCase()]! : /\bskill\b/i.test(seg) ? 1 : 0
      if (/\bor\b/i.test(seg)) {
        if (named.length > 1 && !unnamed) out.oneOf.push(...named)
        else if (named.length || unnamed) out.unnamed += 1
        continue
      }
      out.fixed.push(...named)
      out.unnamed += unnamed
    }
  }
  return out
}

/** The level-up choices a feat's skills need: one of two, then skills of the player's choice. */
export function featSkillChoices(f: Pf2eFeatDef, trained: Set<string>) {
  const sk = featSkills(f)
  const out: { key: string; label: string; options: string[]; count: number; help: string }[] = []
  const untrained = PF2E_SKILL_NAMES.filter((s) => !trained.has(s))
  const help = sk.text.join(' ')
  if (sk.oneOf.length) {
    const open = sk.oneOf.filter((s) => !trained.has(s))
    out.push({
      key: `skill:${f.name}`,
      label: `${f.name}: ${open.length ? sk.oneOf.join(' or ') : 'a skill'}`,
      options: open.length ? open : untrained,
      count: 1,
      help,
    })
  }
  const free = sk.unnamed + sk.fixed.filter((s) => trained.has(s)).length
  if (free > 0)
    out.push({
      key: `skills:${f.name}`,
      label: `${f.name}: skill${free === 1 ? '' : 's'} of your choice`,
      options: untrained.filter((s) => !sk.fixed.includes(s)),
      count: free,
      help,
    })
  return out
}

/** Skills an archetype feat on the sheet trains, with the choices recorded for it. */
export function featSkillRanks(
  f: Pick<Pf2eFeatDef, 'name' | 'text'>,
  choices: Record<string, string[]>,
): string[] {
  return [
    ...featSkills(f).fixed,
    ...(choices[`skill:${f.name}`] ?? []),
    ...(choices[`skills:${f.name}`] ?? []),
  ]
}

/** "Choose a muse", "Select a school": what a dedication leaves to the player and GM. */
export const dedicationNotes = (f: Pf2eFeatDef) =>
  sentences(f.text)
    .filter((s) => /^(?:Choose|Select) (?:a|an|one|your)\b/.test(s))
    .map((s) => `${f.name}: ${s}`)

// --- Multiclass spellcasting --------------------------------------------------------

export const TRADITIONS = ['Arcane', 'Divine', 'Occult', 'Primal']

export interface DedicationCasting {
  archetype: string
  /** Absent when it's the tradition of a bloodline, patron or eidolon: the player picks it. */
  tradition?: string
  attr: Pf2eAttr
  kind: 'prepared' | 'spontaneous'
  cantrips: number
}

/**
 * The spellcasting a dedication grants (Player Core pp. 216–223: "You cast spells like a
 * wizard, gaining a spellbook with four common arcane cantrips… Your key spellcasting
 * attribute for wizard archetype spells is Intelligence, and they are arcane wizard spells").
 * A psychic's is the attribute the hero qualified with, the higher of the two.
 */
export function dedicationCasting(
  f: Pf2eFeatDef,
  attrs: Record<Pf2eAttr, number>,
): DedicationCasting | null {
  const t = plain(f.text)
  const key =
    /key spellcasting attribute for [\w ]+? spells is (?:the attribute you used to qualify|(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma))/i.exec(
      t,
    )
  if (!key) return null
  const qualified = [...(f.prerequisites ?? '').matchAll(/\b(Intelligence|Wisdom|Charisma)\b/g)]
    .map((m) => ATTR[m[1]!.toLowerCase()]!)
    .sort((a, b) => attrs[b] - attrs[a])[0]
  const attr = key[1] ? ATTR[key[1].toLowerCase()]! : (qualified ?? 'CHA')
  const tradition = /\bthey are (arcane|divine|occult|primal)\b/i.exec(t)?.[1]
  const count =
    /\bwith (one|two|three|four) (?:[\w-]+ ){0,2}cantrips?\b/i.exec(t) ??
    /\bprepare (one|two|three|four) (?:common )?cantrips? each day\b/i.exec(t)
  return {
    archetype: dedicationArchetype(f),
    ...(tradition ? { tradition: tradition[0]!.toUpperCase() + tradition.slice(1) } : {}),
    attr,
    kind: /\bspell repertoire\b/i.test(t) ? 'spontaneous' : 'prepared',
    cantrips: NUMBER[count?.[1]?.toLowerCase() ?? ''] ?? 0,
  }
}

export type CastingTier = 'basic' | 'expert' | 'master'

/** "Basic Wizard Spellcasting": a spellcasting archetype's basic, expert or master feat. */
export function castingTier(f: Pick<Pf2eFeatDef, 'name' | 'text'>): CastingTier | null {
  const m = /^(Basic|Expert|Master) .+ Spellcasting$/.exec(f.name)
  if (!m || !/spellcasting benefits/i.test(f.text)) return null
  return m[1]!.toLowerCase() as CastingTier
}

/**
 * The spell slots each tier grants (Player Core p. 215), as [rank, from level]: the basic feat
 * a 1st-rank slot, a 2nd-rank one at 6th level and a 3rd-rank one at 8th; the expert feat a
 * 4th-rank slot, then 5th at 14th and 6th at 16th; the master feat a 7th-rank slot and an
 * 8th-rank one at 20th. One slot per rank.
 */
const TIER_SLOTS: Record<CastingTier, [number, number][]> = {
  basic: [
    [1, 0],
    [2, 6],
    [3, 8],
  ],
  expert: [
    [4, 0],
    [5, 14],
    [6, 16],
  ],
  master: [
    [7, 0],
    [8, 20],
  ],
}

/** An archetype's slots per rank (1–10) at a level with the tiers taken. */
export function archetypeSlots(level: number, tiers: Iterable<CastingTier>): number[] {
  const out = Array.from({ length: 10 }, () => 0)
  for (const t of tiers)
    for (const [rank, from] of TIER_SLOTS[t]) if (level >= from) out[rank - 1] = 1
  return out
}

/** Spell attack and DC rank (p. 215): trained, expert with the expert feat, master with master. */
export const tierRank = (tiers: Set<CastingTier>): Pf2eRank =>
  tiers.has('master') ? 'M' : tiers.has('expert') ? 'E' : 'T'

/** The tiers the hero has taken for an archetype, from feat entries on the sheet. */
export function heroTiers(feats: Pf2eFeat[], archetype: string, data: FeatData) {
  return new Set(
    feats
      .filter((f) => f.archetype === archetype)
      .map((f) => {
        const def = featById(data, f.id)
        return def ? castingTier(def) : null
      })
      .filter((t): t is CastingTier => !!t),
  )
}

/**
 * Spells a basic spellcasting feat adds with each new rank of slot ("add two common spells of
 * that rank to your spellbook", a magus's "of that rank or lower", "add a spell … to your
 * repertoire"); list casters (cleric, druid) prepare from their whole list, so a spell is
 * optional.
 */
export function newRankSpells(f: Pf2eFeatDef | undefined) {
  const m = /\bnew (?:spell )?(?:rank|level)\b[^.]*?\badd (an?|one|two|three)\b([^.]*)/i.exec(
    plain(f?.text ?? ''),
  )
  if (!m) return { count: 1, optional: true, exact: false }
  return {
    count: NUMBER[m[1]!.toLowerCase()]!,
    optional: false,
    exact: /\bof that (?:spell )?rank\b/i.test(m[2]!) && !/\bor lower\b/i.test(m[2]!),
  }
}

/** A new spellcasting entry for an archetype, without spells; slots start at none. */
export const newCasting = (c: DedicationCasting, tradition: string): Pf2eArchetypeCasting => ({
  archetype: c.archetype,
  tradition,
  kind: c.kind,
  attr: c.attr,
  rank: 'T',
  cantrips: [],
  spells: [],
  slots: slotsFor([], c.kind),
})

const RANK_ORDER: Pf2eRank[] = ['U', 'T', 'E', 'M', 'L']
const rankAbove = (a: Pf2eRank, b: Pf2eRank) => RANK_ORDER.indexOf(a) > RANK_ORDER.indexOf(b)

/**
 * What a level does to the hero's archetype spellcasting (Player Core p. 215): a new
 * dedication's cantrips (and its tradition, when a bloodline or patron sets it), the slots the
 * basic, expert and master feats give by level, the spells each new rank adds, and the spell
 * attack and DC rank. `added` are the feat entries the level adds.
 */
export function archetypeCastingPlan(
  sheet: Pf2eSheet,
  level: number,
  data: FeatData,
  choices: Record<string, string[]>,
  added: Pf2eFeat[],
  attrs: Record<Pf2eAttr, number>,
) {
  const out = {
    choices: [] as Pf2eChoicePlan[],
    slots: [] as Pf2eLevelPlan['slots'],
    spells: [] as Pf2eSpellPick[],
    ranks: [] as { label: string; from: Pf2eRank; to: Pf2eRank }[],
  }
  const casters = (sheet.archetypeCasting ?? []).map((e) => ({
    archetype: e.archetype,
    kind: e.kind,
    tradition: e.tradition as string | undefined,
    rank: e.rank,
  }))
  for (const e of added) {
    const def = e.dedication ? featById(data, e.id) : undefined
    const c = def ? dedicationCasting(def, attrs) : null
    if (!c || casters.some((x) => x.archetype === c.archetype)) continue
    const tradition = c.tradition ?? choices[`tradition:${c.archetype}`]?.[0]
    if (!c.tradition)
      out.choices.push({
        key: `tradition:${c.archetype}`,
        label: `${c.archetype} archetype tradition`,
        options: TRADITIONS.map((t) => ({ id: t, name: t })),
        count: 1,
      })
    if (c.cantrips)
      out.spells.push({
        key: `arch:${c.archetype}:cantrip`,
        label: `${c.archetype} archetype cantrips`,
        count: c.cantrips,
        rank: 1,
        cantrip: true,
        archetype: c.archetype,
        ...(tradition ? { tradition } : {}),
      })
    casters.push({ archetype: c.archetype, kind: c.kind, tradition, rank: 'T' })
  }
  const all = [...sheet.feats, ...added]
  for (const c of casters) {
    const before = heroTiers(sheet.feats, c.archetype, data)
    const after = heroTiers(all, c.archetype, data)
    const was = archetypeSlots(level - 1, before)
    const learn = newRankSpells(
      all
        .filter((f) => f.archetype === c.archetype)
        .map((f) => featById(data, f.id))
        .find((d) => d && castingTier(d) === 'basic'),
    )
    archetypeSlots(level, after).forEach((n, i) => {
      const from = was[i] ?? 0
      if (n === from) return
      const rank = i + 1
      out.slots.push({ rank, from, to: n, archetype: c.archetype })
      if (from || !n) return
      out.spells.push({
        key: `arch:${c.archetype}:rank${rank}`,
        label: `${c.archetype} archetype: rank ${rank} spell${learn.count === 1 ? '' : 's'}`,
        count: learn.count,
        rank,
        ...(c.kind === 'spontaneous' ? { learnAt: rank } : {}),
        ...(learn.optional ? { optional: true } : {}),
        ...(learn.exact ? { exact: true } : {}),
        archetype: c.archetype,
        ...(c.tradition ? { tradition: c.tradition } : {}),
      })
    })
    const to = tierRank(after)
    if (rankAbove(to, c.rank))
      out.ranks.push({ label: `${c.archetype} archetype spell attack and DC`, from: c.rank, to })
  }
  return out
}

/**
 * Writes a level's archetype spellcasting onto the sheet: a new dedication's entry, the slots
 * and rank its feats give, and the spells picked for it. Runs after the level's feats are on
 * the sheet and its boosts are applied.
 */
export function applyArchetypeCasting(
  sheet: Pf2eSheet,
  plan: Pick<Pf2eLevelPlan, 'slots' | 'spells'>,
  picks: Pf2eLevelInput,
  data: FeatData & { spells: Pf2eSpellDef[] },
  added: Pf2eFeat[],
) {
  for (const e of added) {
    const def = e.dedication ? featById(data, e.id) : undefined
    const c = def ? dedicationCasting(def, sheet.attrs) : null
    const tradition = c
      ? (c.tradition ?? picks.choices[`tradition:${c.archetype}`]?.[0])
      : undefined
    if (!c || !tradition || sheet.archetypeCasting?.some((x) => x.archetype === c.archetype))
      continue
    sheet.archetypeCasting = [...(sheet.archetypeCasting ?? []), newCasting(c, tradition)]
  }
  for (const entry of sheet.archetypeCasting ?? []) {
    const rank = tierRank(heroTiers(sheet.feats, entry.archetype, data))
    if (rankAbove(rank, entry.rank)) entry.rank = rank
    for (const s of plan.slots)
      if (s.archetype === entry.archetype)
        setSlotMax(entry, s.rank, (entry.slots[s.rank - 1]?.max ?? 0) + s.to - s.from)
    for (const p of plan.spells) {
      if (p.archetype !== entry.archetype) continue
      for (const id of (picks.spells[p.key] ?? []).slice(0, p.count)) {
        const def = data.spells.find((s) => s.id === id)
        const list = p.cantrip ? entry.cantrips : entry.spells
        if (def && !list.some((x) => x.id === def.id))
          list.push({ id: def.id, name: def.name, rank: p.learnAt ?? def.rank })
      }
    }
  }
}
