// Pure rules logic that turns Nimble class data (data/nimble) into a sheet:
// the level 1 build, what each level-up grants, and applying a level-up.
import { classBySlug, poolOptionByName, subclassBySlug } from '~/data/nimble/classes'
import { BASE_SPEED, BASE_WOUNDS, MAX_SKILL_BONUS, weaponByName } from '~/data/nimble/core'
import { SPELLS, SCHOOL_LABELS, spellByName, utilitySpells } from '~/data/nimble/spells'
import type {
  AbilityDef,
  AncestryDef,
  BackgroundDef,
  ChoiceDef,
  ClassDef,
  LevelDef,
  SpellDef,
  SpellSchool,
  StatIncrease,
  SubclassDef,
} from '~/data/nimble/types'
import type {
  NimbleAbility,
  NimbleAttack,
  NimbleLevelInput,
  NimbleSheet,
  NimbleStat,
} from '~/types/sheets'
import { sign } from '~/utils/dice'
import { recordLevel, restoreLevel } from '~/utils/levelHistory'
import { defaultSheet } from '~/utils/sheetDefaults'

export const HIT_DIE_STEPS = [6, 8, 10, 12, 20]

export type Picks = Record<string, string[]>

export interface ChoiceOption {
  value: string
  label: string
  desc: string
  /** Spell school or pool name, for grouping in the picker. */
  group?: string
}

export interface ResolvedChoice {
  /** Key the picks are recorded under, e.g. "L4:savage-arsenal". */
  key: string
  def: ChoiceDef
  label: string
  /** Exact number of picks needed (0 for a write-in). */
  count: number
  /** Pick one option per group (Windbag: one Utility Spell from each school). */
  perGroup: boolean
  options: ChoiceOption[]
  /** Write-in choice (Epic Boon). */
  text: boolean
  placeholder?: string
}

export interface LevelPlan {
  level: number
  abilities: { ability: AbilityDef; src: string }[]
  notes: string[]
  choices: ResolvedChoice[]
  statIncrease: StatIncrease | null
  /** The class table asks for a subclass at this level and none is set yet. */
  subclassChoice: boolean
  spellTier: number | null
}

// --- small helpers -----------------------------------------------------------

function knownSchools(sheet: NimbleSheet): SpellSchool[] {
  return sheet.spells.schools as SpellSchool[]
}

export function stepHitDie(die: number, steps: number): number {
  const idx = HIT_DIE_STEPS.indexOf(die)
  if (idx < 0 || !steps) return die
  return HIT_DIE_STEPS[Math.min(HIT_DIE_STEPS.length - 1, idx + steps)] ?? die
}

/** True once the class table has granted a per-level flag (Swift Feet, Iron Defense (2)…). */
export function classFlagAt(
  cls: ClassDef,
  level: number,
  flag: 'initiativePerLevel' | 'meleeDamagePerLevel' | 'armorDoubled',
): boolean {
  for (let l = 1; l <= level; l++) if (cls.levels[l]?.[flag]) return true
  return false
}

/** Armor from the class formula at a level; Iron Defense (2) doubles it from level 13. */
export function classArmor(cls: ClassDef, stats: Record<NimbleStat, number>, level = 1): number {
  const { base, dexMax, shield, addStr } = cls.armorCalc
  const dex = dexMax === undefined ? stats.DEX : Math.min(stats.DEX, dexMax)
  const armor = base + dex + (shield ?? 0) + (addStr ? stats.STR : 0)
  return classFlagAt(cls, level, 'armorDoubled') ? armor * 2 : armor
}

/** Initiative the class table adds at a level (Swift Feet: +LVL). */
export function classInitiative(cls: ClassDef, level: number): number {
  return classFlagAt(cls, level, 'initiativePerLevel') ? level : 0
}

/** Damage the class table adds to melee attacks at a level (Reverberating Strikes: +LVL). */
export function classMeleeDamage(cls: ClassDef, level: number): number {
  return classFlagAt(cls, level, 'meleeDamagePerLevel') ? level : 0
}

export function manaMax(cls: ClassDef, sheet: NimbleSheet, level: number): number {
  if (!cls.mana || sheet.spells.tier < 1) return 0
  return Math.max(0, sheet.stats[cls.mana.stat] * cls.mana.mult + level)
}

/** Properties a class ability adds to one weapon; only heroes with that ability get them. */
const WEAPON_PERKS: Record<string, { ability: string; props: string }> = {
  'Unarmed Strike': { ability: 'Swift Fists', props: 'Swift Fists: no Rushed Attack disadvantage' },
}

function weaponAttack(
  name: string,
  stats: Record<NimbleStat, number>,
  abilities: NimbleAbility[],
  meleeBonus = 0,
): NimbleAttack | null {
  const w = weaponByName(name)
  if (!w) return null
  const mod = stats[w.stat] + (w.melee ? meleeBonus : 0)
  const perk = WEAPON_PERKS[w.name]
  const perkProps = perk && abilities.some((a) => a.name === perk.ability) ? perk.props : ''
  return {
    name: w.name,
    props: [w.type, w.props, perkProps].filter(Boolean).join(', '),
    dmg: mod ? `${w.dice}${sign(mod)}` : w.dice,
    melee: w.melee,
  }
}

const UPGRADE = /^(.*) \((\d+)\)$/

/**
 * Adds an ability, or upgrades the earlier one when the name ends in "(n)":
 * "Sneak Attack (2)" renames "Sneak Attack" and appends the new rule.
 */
export function addAbility(
  sheet: NimbleSheet,
  ability: AbilityDef,
  src: string,
  level: number,
): void {
  const m = UPGRADE.exec(ability.name)
  if (m) {
    const base = m[1] ?? ''
    const existing = sheet.abilities.find(
      (a) => a.name === base || (a.name.startsWith(`${base} (`) && UPGRADE.test(a.name)),
    )
    if (existing) {
      existing.name = ability.name
      existing.desc = `${existing.desc}\nLevel ${level}: ${ability.desc}`
      return
    }
  }
  sheet.abilities.push({ name: ability.name, src, desc: ability.desc, level })
}

function pushUnique(list: string[], ...values: string[]) {
  for (const v of values) if (!list.includes(v)) list.push(v)
}

function poolsFor(cls: ClassDef, ids: string[]) {
  return cls.pools.filter((p) => ids.includes(p.id))
}

/** Spells the hero can cast right now, grouped by tier for the sheet. */
export function knownSpells(sheet: NimbleSheet): SpellDef[] {
  const out: SpellDef[] = []
  const seen = new Set<string>()
  const add = (s: SpellDef | undefined) => {
    if (!s || seen.has(s.name) || sheet.spells.lost.includes(s.name)) return
    seen.add(s.name)
    out.push(s)
  }
  for (const school of knownSchools(sheet))
    for (const s of SPELLS)
      if (
        s.school === school &&
        !s.utility &&
        !s.learnedOnly &&
        s.tier <= sheet.spells.tier &&
        (!s.classOnly || s.classOnly === sheet.classSlug)
      )
        add(s)
  // Casters with a tier progression only cast learned spells they've unlocked
  // (Oathbreaker's Dread Visage waits for tier 2). Others (Spellblade) pick
  // spells at a tier they can already cast.
  const gated = knownSchools(sheet).length > 0
  for (const name of sheet.spells.learned) {
    const s = spellByName(name)
    if (s && (!gated || s.tier <= sheet.spells.tier)) add(s)
  }
  return out.sort((a, b) => a.tier - b.tier || a.school.localeCompare(b.school))
}

export function knownUtilitySpells(sheet: NimbleSheet): SpellDef[] {
  return sheet.spells.utility.map((n) => spellByName(n)).filter((s): s is SpellDef => !!s)
}

// --- choices -------------------------------------------------------------------

/** Applies a subclass's pool swap (Spellblade) and extra utility schools. */
function effectiveSource(def: ChoiceDef, sub: SubclassDef | undefined): ChoiceDef['source'] {
  const src = def.source
  if (src.kind === 'pool' && sub?.poolSwap) {
    const swap = sub.poolSwap
    if (src.pools.some((p) => swap.replace.includes(p))) {
      const pools = [
        ...new Set(src.pools.flatMap((p) => (swap.replace.includes(p) ? swap.withPools : [p]))),
      ]
      return { kind: 'pool', pools, spellMaxTier: swap.spellMaxTier ?? src.spellMaxTier }
    }
  }
  if (src.kind === 'utility' && sub?.utilityExtra && src.schools !== 'known')
    return { kind: 'utility', schools: [...new Set([...src.schools, ...sub.utilityExtra])] }
  return src
}

function spellOption(s: SpellDef): ChoiceOption {
  const tier = s.tier === 0 ? 'Cantrip' : `Tier ${s.tier}`
  return {
    value: s.name,
    label: s.name,
    desc: `${tier} · ${s.cast}. ${s.desc}`,
    group: SCHOOL_LABELS[s.school],
  }
}

/**
 * Works out the options for one choice given the sheet as it stands, plus any
 * picks already made in the same level-up (so a pool option isn't offered twice).
 */
export function resolveChoice(
  sheet: NimbleSheet,
  cls: ClassDef,
  sub: SubclassDef | undefined,
  def: ChoiceDef,
  level: number,
  pending: Picks = {},
): ResolvedChoice {
  const key = `L${level}:${def.id}`
  const src = effectiveSource(def, sub)
  const pendingValues = Object.entries(pending)
    .filter(([k]) => k !== key)
    .flatMap(([, v]) => v)
  const have = new Set([...sheet.abilities.map((a) => a.name), ...pendingValues])
  const base = { key, def, label: def.label, perGroup: false, text: false }

  if (src.kind === 'text')
    return { ...base, count: 0, options: [], text: true, placeholder: src.placeholder }

  if (src.kind === 'pool') {
    const options: ChoiceOption[] = []
    for (const pool of poolsFor(cls, src.pools))
      for (const o of pool.options) {
        if (!o.repeatable && have.has(o.name)) continue
        if (o.requires && !have.has(o.requires)) continue
        options.push({ value: o.name, label: o.name, desc: o.desc, group: pool.name })
      }
    if (src.spellMaxTier !== undefined) {
      const castable = new Set(knownSpells(sheet).map((s) => s.name))
      for (const s of SPELLS)
        if (
          !s.utility &&
          !s.classOnly &&
          s.tier <= src.spellMaxTier &&
          !castable.has(s.name) &&
          !pendingValues.includes(s.name)
        )
          options.push(spellOption(s))
    }
    return { ...base, count: def.count === 'perSchool' ? 1 : def.count, options }
  }

  if (src.kind === 'utility') {
    const schools = src.schools === 'known' ? knownSchools(sheet) : src.schools
    const options = schools.flatMap((school) =>
      utilitySpells(school)
        .filter((s) => !sheet.spells.utility.includes(s.name) && !pendingValues.includes(s.name))
        .map(spellOption),
    )
    const perSchool = def.count === 'perSchool'
    const groups = new Set(options.map((o) => o.group))
    return {
      ...base,
      perGroup: perSchool,
      count: perSchool ? groups.size : (def.count as number),
      options,
    }
  }

  if (src.kind === 'utilitySchool') {
    const options = knownSchools(sheet)
      .filter((school) => utilitySpells(school).some((s) => !sheet.spells.utility.includes(s.name)))
      .filter((school) => !pendingValues.includes(school))
      .map((school) => ({
        value: school,
        label: `${SCHOOL_LABELS[school]} utility spells`,
        desc: utilitySpells(school)
          .map((s) => s.name)
          .join(', '),
      }))
    return { ...base, count: def.count === 'perSchool' ? 1 : def.count, options }
  }

  if (src.kind === 'school') {
    const options = src.schools
      .filter((school) => !knownSchools(sheet).includes(school))
      .map((school) => ({
        value: school,
        label: `${SCHOOL_LABELS[school]} school`,
        desc: SPELLS.filter(
          (s) => s.school === school && !s.utility && !s.classOnly && s.tier === 0,
        )
          .map((s) => s.name)
          .join(', ')
          .replace(/^/, 'Cantrips: '),
      }))
    return { ...base, count: def.count === 'perSchool' ? 1 : def.count, options }
  }

  // Single spells (Spellblade's Deep Knowledge, Invoker extras).
  const castable = new Set(knownSpells(sheet).map((s) => s.name))
  const options = SPELLS.filter(
    (s) =>
      !s.utility &&
      !s.classOnly &&
      s.tier <= src.maxTier &&
      s.tier >= (src.minTier ?? 0) &&
      (!src.schools || src.schools.includes(s.school)) &&
      !castable.has(s.name) &&
      !pendingValues.includes(s.name),
  ).map(spellOption)
  return { ...base, count: def.count === 'perSchool' ? 1 : def.count, options }
}

/** Returns a reason the picks are not valid yet, or null when they are. */
export function validatePicks(choice: ResolvedChoice, picks: string[] | undefined): string | null {
  const list = (picks ?? []).filter((p) => p.trim() !== '')
  if (choice.text) return list.length ? null : 'Write in your choice'
  // If the data runs out of options (everything already taken), ask only for what's left.
  const need = Math.min(choice.count, choice.options.length)
  if (need === 0) return null
  if (new Set(list).size !== list.length) return 'Each pick must be different'
  const valid = new Set(choice.options.map((o) => o.value))
  if (list.some((p) => !valid.has(p))) return 'Pick from the list'
  if (list.length !== need) return `Choose ${need}`
  if (choice.perGroup) {
    const groups = list.map((p) => choice.options.find((o) => o.value === p)?.group)
    if (new Set(groups).size !== groups.length) return 'Choose one from each school'
  }
  return null
}

// --- level plan ------------------------------------------------------------------

/** What reaching `level` grants. Pass `subclassSlug` to preview a subclass being picked now. */
export function nimbleLevelPlan(
  sheet: NimbleSheet,
  level: number,
  opts: { subclassSlug?: string; pending?: Picks } = {},
): LevelPlan | null {
  const cls = classBySlug(sheet.classSlug)
  if (!cls) return null
  const classLevel: LevelDef | undefined = cls.levels[level]
  const subSlug = opts.subclassSlug || sheet.subclassSlug
  const sub = subSlug ? subclassBySlug(cls, subSlug) : undefined
  const subLevel = sub?.levels[level]
  const pickingSub = !!opts.subclassSlug && opts.subclassSlug !== sheet.subclassSlug

  const abilities: LevelPlan['abilities'] = []
  for (const a of classLevel?.abilities ?? []) abilities.push({ ability: a, src: cls.name })
  if (sub && pickingSub)
    for (const a of sub.intro ?? []) abilities.push({ ability: a, src: sub.name })
  for (const a of subLevel?.abilities ?? []) abilities.push({ ability: a, src: sub?.name ?? '' })

  const defs: ChoiceDef[] = [
    ...(classLevel?.choices ?? []),
    ...(sub && pickingSub ? (sub.introChoices ?? []) : []),
    ...(subLevel?.choices ?? []),
  ]
  // Resolve in order so later choices don't offer what earlier ones picked.
  const choices = defs.map((def) => resolveChoice(sheet, cls, sub, def, level, opts.pending))

  const tier = Math.max(classLevel?.spellTier ?? -1, subLevel?.spellTier ?? -1)
  return {
    level,
    abilities,
    notes: [...(classLevel?.notes ?? []), ...(subLevel?.notes ?? [])],
    choices,
    statIncrease: classLevel?.statIncrease ?? null,
    subclassChoice: !!classLevel?.subclassChoice && !sheet.subclassSlug,
    spellTier: tier >= 0 ? tier : null,
  }
}

// --- applying picks ----------------------------------------------------------------

function applyChoice(
  sheet: NimbleSheet,
  cls: ClassDef,
  choice: ResolvedChoice,
  picks: string[],
  level: number,
) {
  const values = picks.filter((p) => p.trim() !== '')
  sheet.choices[choice.key] = values
  const src = choice.def.source
  if (src.kind === 'text') {
    for (const text of values)
      sheet.abilities.push({ name: src.name, src: cls.name, desc: text, level })
    return
  }
  for (const value of values) {
    const option = choice.options.find((o) => o.value === value)
    const spell = spellByName(value)
    if (src.kind === 'utility') pushUnique(sheet.spells.utility, value)
    else if (src.kind === 'utilitySchool')
      pushUnique(sheet.spells.utility, ...utilitySpells(value as SpellSchool).map((s) => s.name))
    else if (src.kind === 'school') pushUnique(sheet.spells.schools, value)
    else if (src.kind === 'spell' || (spell && option?.group && option.group in SCHOOL_NAMES))
      pushUnique(sheet.spells.learned, value)
    else if (option) {
      sheet.abilities.push({
        name: option.label,
        src: option.group ?? cls.name,
        desc: option.desc,
        level,
      })
      applyPoolEffects(sheet, cls, option.value, 1)
    }
  }
}

/**
 * Applies (sign 1) or takes back (sign -1) what a picked pool option changes on
 * the sheet: max Wounds, speed, Hit Dice and a stat. Derived values follow in
 * syncDerived.
 */
function applyPoolEffects(sheet: NimbleSheet, cls: ClassDef, name: string, sign: 1 | -1) {
  const option = poolOptionByName(cls, name)
  if (!option) return
  if (option.woundsMax) sheet.woundsMax += sign * option.woundsMax
  if (option.speed)
    sheet.speed = String((Number.parseInt(sheet.speed, 10) || BASE_SPEED) + sign * option.speed)
  if (option.hitDice) sheet.hitDice = Math.max(1, sheet.hitDice + sign * option.hitDice)
  if (option.statBump?.length) {
    const stat = option.statBump.reduce((best, s) =>
      sheet.stats[s] > sheet.stats[best] ? s : best,
    )
    sheet.stats[stat] += sign
  }
}

const SCHOOL_NAMES: Record<string, true> = Object.fromEntries(
  Object.values(SCHOOL_LABELS).map((l) => [l, true]),
)

/** Applies the mechanical parts of a level or subclass table entry. */
function applyLevelDef(sheet: NimbleSheet, def: LevelDef | undefined, src: string, level: number) {
  if (!def) return
  for (const a of def.abilities) addAbility(sheet, a, src, level)
  if (def.schools) pushUnique(sheet.spells.schools, ...def.schools)
  if (def.spellTier !== undefined) sheet.spells.tier = Math.max(sheet.spells.tier, def.spellTier)
  if (def.spells?.learn) pushUnique(sheet.spells.learned, ...def.spells.learn)
  if (def.spells?.lose) pushUnique(sheet.spells.lost, ...def.spells.lose)
  if (def.grantUtility) {
    const schools = def.grantUtility === 'known' ? knownSchools(sheet) : def.grantUtility
    for (const school of schools)
      pushUnique(sheet.spells.utility, ...utilitySpells(school).map((s) => s.name))
  }
  if (def.resourceDie) sheet.resource.die = def.resourceDie
  if (def.hitDie) sheet.hitDie = Math.max(sheet.hitDie, def.hitDie)
  if (def.hpBonus) {
    sheet.hpMax += def.hpBonus
    sheet.hp += def.hpBonus
  }
  if (def.speed) sheet.speed = String((Number.parseInt(sheet.speed, 10) || BASE_SPEED) + def.speed)
  if (def.woundsMax) sheet.woundsMax += def.woundsMax
  if (def.replacesAbilities)
    sheet.abilities = sheet.abilities.filter(
      (a) => !def.replacesAbilities?.includes(abilityBaseName(a.name)),
    )
}

/** Key under `sheet.choices` that remembers the pool picks a subclass took the place of. */
const droppedKey = (sub: SubclassDef) => `dropped:${sub.slug}`

/** Starts a subclass: intro rules, spell swaps and abilities it replaces. */
function enterSubclass(sheet: NimbleSheet, sub: SubclassDef, level: number) {
  sheet.subclassSlug = sub.slug
  sheet.subclass = sub.name
  if (sub.replacesAbilities)
    sheet.abilities = sheet.abilities.filter(
      (a) => !sub.replacesAbilities?.includes(abilityBaseName(a.name)),
    )
  if (sub.dropPoolPicks) {
    const cls = classBySlug(sheet.classSlug)
    const pool = cls?.pools.find((p) => p.id === sub.dropPoolPicks?.pool)
    const dropped = sheet.abilities
      .filter((a) => pool?.options.some((o) => o.name === a.name))
      .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
      .slice(0, sub.dropPoolPicks.count)
    sheet.abilities = sheet.abilities.filter((a) => !dropped.includes(a))
    sheet.choices[droppedKey(sub)] = dropped.map((a) => `${a.level ?? 0}:${a.name}`)
  }
  for (const a of sub.intro ?? []) addAbility(sheet, a, sub.name, level)
  if (sub.introSpells?.learn) pushUnique(sheet.spells.learned, ...sub.introSpells.learn)
  if (sub.introSpells?.lose) pushUnique(sheet.spells.lost, ...sub.introSpells.lose)
}

/** Keeps armor, Initiative, attacks and mana in step after stats change. */
function syncDerived(
  sheet: NimbleSheet,
  cls: ClassDef,
  before: Record<NimbleStat, number>,
  level: number,
  prev: number,
) {
  // Iron Defense (2) doubles the whole Armor, ancestry and background bonuses too.
  const doubling =
    classFlagAt(cls, level, 'armorDoubled') && !classFlagAt(cls, prev, 'armorDoubled')
  if (doubling) sheet.ac *= 2
  sheet.ac += classArmor(cls, sheet.stats, level) - classArmor(cls, before, doubling ? level : prev)
  sheet.initMod +=
    sheet.stats.DEX - before.DEX + classInitiative(cls, level) - classInitiative(cls, prev)
  const melee = classMeleeDamage(cls, level)
  sheet.attacks = sheet.attacks.map(
    (a) => weaponAttack(a.name, sheet.stats, sheet.abilities, melee) ?? a,
  )
  const max = manaMax(cls, sheet, level)
  sheet.mana.current = Math.max(0, Math.min(max, sheet.mana.current + (max - sheet.mana.max)))
  sheet.mana.max = max
}

export type LevelUpInput = NimbleLevelInput

/**
 * Applies reaching `level` to the sheet in place, recording the sheet beforehand
 * so the level can be undone. The caller saves the new level.
 */
export function applyNimbleLevel(sheet: NimbleSheet, level: number, input: LevelUpInput): void {
  const cls = classBySlug(sheet.classSlug)
  if (!cls) throw new Error(`Unknown Nimble class “${sheet.classSlug}”`)
  const plan = nimbleLevelPlan(sheet, level, {
    subclassSlug: input.subclassSlug,
    pending: input.picks,
  })
  if (!plan) return
  recordLevel(sheet, level, input)
  const before = { ...sheet.stats }

  sheet.hpMax += input.hpGain
  sheet.hp += input.hpGain
  sheet.hitDice += 1
  for (const [k, v] of Object.entries(input.statBumps)) sheet.stats[k as NimbleStat] += v ?? 0
  if (input.skillPoint) {
    const skill = sheet.skills.find((s) => s.name === input.skillPoint)
    if (skill && sheet.stats[skill.stat] + skill.points < MAX_SKILL_BONUS) skill.points += 1
  }

  const newSub =
    input.subclassSlug && input.subclassSlug !== sheet.subclassSlug
      ? subclassBySlug(cls, input.subclassSlug)
      : undefined
  applyLevelDef(sheet, cls.levels[level], cls.name, level)
  if (newSub) enterSubclass(sheet, newSub, level)
  const sub = sheet.subclassSlug ? subclassBySlug(cls, sheet.subclassSlug) : undefined
  applyLevelDef(sheet, sub?.levels[level], sub?.name ?? '', level)

  // Class abilities the subclass replaces stay off when the class table grants them later.
  if (sub?.replacesAbilities)
    sheet.abilities = sheet.abilities.filter(
      (a) => !sub.replacesAbilities?.includes(abilityBaseName(a.name)),
    )

  for (const choice of plan.choices)
    applyChoice(sheet, cls, choice, input.picks[choice.key] ?? [], level)
  syncDerived(sheet, cls, before, level, level - 1)
}

/** Level at which the class table asks for a subclass (3 for every class). */
export function subclassEntryLevel(cls: ClassDef): number {
  for (let l = 1; l <= 20; l++) if (cls.levels[l]?.subclassChoice) return l
  return 3
}

/**
 * Keys ("L7:id") a subclass records its picks under. Ids alone are not enough:
 * Fang & Claw reuses the class's "chimeric-boon" id at its own level.
 */
function subclassChoiceKeys(sub: SubclassDef, entry: number): Set<string> {
  const keys = new Set((sub.introChoices ?? []).map((c) => `L${entry}:${c.id}`))
  for (const [l, def] of Object.entries(sub.levels))
    for (const c of def?.choices ?? []) keys.add(`L${l}:${c.id}`)
  return keys
}

const choiceId = (key: string) => key.replace(/^L\d+:/, '')

/** What the class table itself grants up to `level`, so removing a subclass keeps it. */
function classGrants(cls: ClassDef, sheet: NimbleSheet, level: number) {
  const schools = new Set<string>()
  const learned = new Set<string>()
  const lost = new Set<string>()
  const utility = new Set<string>()
  for (let l = 1; l <= level; l++) {
    const def = cls.levels[l]
    if (!def) continue
    def.schools?.forEach((s) => schools.add(s))
    def.spells?.learn?.forEach((s) => learned.add(s))
    def.spells?.lose?.forEach((s) => lost.add(s))
    if (def.grantUtility && def.grantUtility !== 'known')
      def.grantUtility.forEach((school) =>
        utilitySpells(school).forEach((s) => utility.add(s.name)),
      )
  }
  // Schools and spells picked through class choices also stay.
  for (const [key, values] of Object.entries(sheet.choices)) {
    const id = choiceId(key)
    const def = Object.values(cls.levels)
      .flatMap((d) => d?.choices ?? [])
      .find((c) => c.id === id)
    if (!def) continue
    if (def.source.kind === 'school') values.forEach((v) => schools.add(v))
    else values.forEach((v) => (spellByName(v)?.utility ? utility.add(v) : learned.add(v)))
  }
  return { schools, learned, lost, utility }
}

/**
 * Takes the current subclass off the sheet in place: its abilities, the picks it
 * asked for, and the spells, schools and stat changes its table granted.
 * Used when there is no level history to rebuild from, and to preview the
 * choices a new subclass will offer.
 */
function removeSubclass(sheet: NimbleSheet, cls: ClassDef, level: number): void {
  const sub = sheet.subclassSlug ? subclassBySlug(cls, sheet.subclassSlug) : undefined
  if (!sub) {
    if (sheet.subclass) sheet.abilities = sheet.abilities.filter((a) => a.src !== sheet.subclass)
    sheet.subclassSlug = ''
    sheet.subclass = ''
    return
  }
  const keep = classGrants(cls, sheet, level)

  const keys = subclassChoiceKeys(sub, subclassEntryLevel(cls))
  const picked = new Set<string>()
  for (const [key, values] of Object.entries(sheet.choices))
    if (keys.has(key)) {
      values.forEach((v) => picked.add(v))
      delete sheet.choices[key]
    }

  const own = new Set([
    ...(sub.intro ?? []).map((a) => a.name),
    ...Object.values(sub.levels).flatMap((d) => d?.abilities.map((a) => a.name) ?? []),
  ])
  sheet.abilities = sheet.abilities.filter(
    (a) => a.src !== sub.name && !(a.level && (own.has(a.name) || picked.has(a.name))),
  )

  const schools = new Set<string>()
  const learned = new Set<string>(sub.introSpells?.learn ?? [])
  const lost = new Set<string>(sub.introSpells?.lose ?? [])
  const utility = new Set<string>()
  for (const v of picked) if (spellByName(v)) (spellByName(v)?.utility ? utility : learned).add(v)
  for (const v of picked) applyPoolEffects(sheet, cls, v, -1)
  for (let l = 1; l <= level; l++) {
    const def = sub.levels[l]
    if (!def) continue
    def.schools?.forEach((s) => schools.add(s))
    def.spells?.learn?.forEach((s) => learned.add(s))
    def.spells?.lose?.forEach((s) => lost.add(s))
    if (def.grantUtility && def.grantUtility !== 'known')
      def.grantUtility.forEach((school) =>
        utilitySpells(school).forEach((s) => utility.add(s.name)),
      )
    if (def.hpBonus) {
      sheet.hpMax -= def.hpBonus
      sheet.hp = Math.min(sheet.hp, sheet.hpMax)
    }
    if (def.speed)
      sheet.speed = String((Number.parseInt(sheet.speed, 10) || BASE_SPEED) - def.speed)
    if (def.woundsMax) sheet.woundsMax -= def.woundsMax
  }
  const sp = sheet.spells
  sp.schools = sp.schools.filter((s) => !schools.has(s) || keep.schools.has(s))
  sp.learned = sp.learned.filter((s) => !learned.has(s) || keep.learned.has(s))
  sp.lost = sp.lost.filter((s) => !lost.has(s) || keep.lost.has(s))
  sp.utility = sp.utility.filter((s) => !utility.has(s) || keep.utility.has(s))

  // The class table's resource die, without the subclass's upgrades.
  if (cls.resource) {
    let die = cls.resource.die
    for (let l = 1; l <= level; l++) die = cls.levels[l]?.resourceDie ?? die
    sheet.resource.die = die
  }
  // Pool picks the subclass took the place of come back.
  for (const entry of sheet.choices[droppedKey(sub)] ?? []) {
    const [lvl, ...rest] = entry.split(':')
    const name = rest.join(':')
    const option = poolOptionByName(cls, name)
    const pool = cls.pools.find((p) => p.options.includes(option!))
    if (option && !sheet.abilities.some((a) => a.name === name))
      sheet.abilities.push({
        name,
        src: pool?.name ?? cls.name,
        desc: option.desc,
        level: Number(lvl) || 0,
      })
  }
  delete sheet.choices[droppedKey(sub)]
  // Class abilities the subclass (or one of its levels) had replaced come back.
  const replaced = [
    ...(sub.replacesAbilities ?? []),
    ...Object.entries(sub.levels)
      .filter(([l]) => Number(l) <= level)
      .flatMap(([, d]) => d?.replacesAbilities ?? []),
  ]
  for (const name of replaced)
    for (let l = 1; l <= level; l++) {
      const a = cls.levels[l]?.abilities.find((x) => abilityBaseName(x.name) === name)
      if (a && (a.name !== name || !sheet.abilities.some((x) => x.name === name)))
        addAbility(sheet, a, cls.name, l)
    }

  sheet.subclassSlug = ''
  sheet.subclass = ''
}

/** True when every level from the subclass level up to `level` can be replayed. */
function canReplay(sheet: NimbleSheet, from: number, level: number): boolean {
  const history = sheet.levelHistory ?? []
  for (let l = from; l <= level; l++)
    if (!history.some((e) => e.level === l && e.nimble)) return false
  return true
}

/**
 * Level a subclass change rebuilds the hero from, or null when the sheet is
 * changed in place (no full level history). A rebuild restores the sheet from
 * before that level, so hand edits made since then are lost.
 */
export function subclassReplayLevel(sheet: NimbleSheet, level: number): number | null {
  const cls = classBySlug(sheet.classSlug)
  if (!cls) return null
  const entry = subclassEntryLevel(cls)
  return level >= entry && canReplay(sheet, entry, level) ? entry : null
}

/**
 * Swaps in a story subclass (or any other) at the current level. The old
 * subclass's abilities, picks, spells and bonuses all go; the new one's intro and
 * every feature up to `level` come in. `picks` covers the intro choices (keyed at
 * the subclass level) and the choices of past subclass levels.
 *
 * Heroes levelled with history are rebuilt from the subclass level with the
 * same HP, stat and class picks; older sheets have the subclass removed in place.
 */
export function changeSubclass(
  sheet: NimbleSheet,
  level: number,
  subclassSlug: string,
  picks: Picks,
): void {
  const cls = classBySlug(sheet.classSlug)
  const sub = cls ? subclassBySlug(cls, subclassSlug) : undefined
  if (!cls || !sub) return
  const entry = subclassEntryLevel(cls)

  if (subclassReplayLevel(sheet, level) !== null) {
    const old = sheet.subclassSlug ? subclassBySlug(cls, sheet.subclassSlug) : undefined
    const oldKeys = old ? subclassChoiceKeys(old, entry) : new Set<string>()
    const inputs = (sheet.levelHistory ?? [])
      .filter((e) => e.level >= entry && e.level <= level)
      .sort((a, b) => a.level - b.level)
      .map((e) => ({ level: e.level, input: e.nimble! }))
    const hp = sheet.hp
    const mana = sheet.mana.current
    restoreLevel(sheet, entry - 1)
    for (const { level: l, input } of inputs) {
      const kept = Object.entries(input.picks).filter(([k]) => !oldKeys.has(k))
      const fresh = Object.entries(picks).filter(([k]) => k.startsWith(`L${l}:`))
      applyNimbleLevel(sheet, l, {
        ...input,
        subclassSlug: l === entry ? sub.slug : undefined,
        picks: Object.fromEntries([...kept, ...fresh]),
      })
    }
    sheet.hp = Math.min(hp, sheet.hpMax)
    sheet.mana.current = Math.min(mana, sheet.mana.max)
    return
  }

  const before = { ...sheet.stats }
  removeSubclass(sheet, cls, level)
  enterSubclass(sheet, sub, entry)
  for (const def of sub.introChoices ?? []) {
    const choice = resolveChoice(sheet, cls, sub, def, entry, picks)
    applyChoice(sheet, cls, choice, picks[choice.key] ?? [], entry)
  }
  for (let l = 1; l <= level; l++) {
    const def = sub.levels[l]
    if (!def) continue
    applyLevelDef(sheet, def, sub.name, l)
    for (const c of def.choices ?? []) {
      const choice = resolveChoice(sheet, cls, sub, c, l, picks)
      applyChoice(sheet, cls, choice, picks[choice.key] ?? [], l)
    }
  }
  syncDerived(sheet, cls, before, level, level)
}

/** Choices a subclass change will ask for (intro plus past subclass levels). */
export function subclassChangeChoices(
  sheet: NimbleSheet,
  level: number,
  subclassSlug: string,
  pending: Picks = {},
): {
  abilities: LevelPlan['abilities']
  choices: ResolvedChoice[]
  spells: { learn: string[]; lose: string[] }
} {
  const cls = classBySlug(sheet.classSlug)
  const sub = cls ? subclassBySlug(cls, subclassSlug) : undefined
  if (!cls || !sub) return { abilities: [], choices: [], spells: { learn: [], lose: [] } }
  const spells = {
    learn: [...(sub.introSpells?.learn ?? [])],
    lose: [...(sub.introSpells?.lose ?? [])],
  }
  // Offer options as if the old subclass were already gone.
  const base = JSON.parse(JSON.stringify(sheet)) as NimbleSheet
  removeSubclass(base, cls, level)
  const entry = subclassEntryLevel(cls)
  const abilities: LevelPlan['abilities'] = (sub.intro ?? []).map((a) => ({
    ability: a,
    src: sub.name,
  }))
  const choices = (sub.introChoices ?? []).map((d) =>
    resolveChoice(base, cls, sub, d, entry, pending),
  )
  for (let l = 1; l <= level; l++) {
    const def = sub.levels[l]
    if (!def) continue
    for (const a of def.abilities) abilities.push({ ability: a, src: sub.name })
    for (const c of def.choices ?? []) choices.push(resolveChoice(base, cls, sub, c, l, pending))
    spells.learn.push(...(def.spells?.learn ?? []))
    spells.lose.push(...(def.spells?.lose ?? []))
  }
  // A rebuild replays past class picks; those whose options the subclass swaps
  // (Spellblade's Combat Tactics) no longer fit and must be picked again.
  if (subclassReplayLevel(sheet, level) !== null) {
    const old = sheet.subclassSlug ? subclassBySlug(cls, sheet.subclassSlug) : undefined
    for (let l = entry; l <= level; l++)
      for (const def of cls.levels[l]?.choices ?? []) {
        const key = `L${l}:${def.id}`
        if (choices.some((c) => c.key === key)) continue
        const was = JSON.stringify(effectiveSource(def, old))
        if (was !== JSON.stringify(effectiveSource(def, sub)))
          choices.push(resolveChoice(base, cls, sub, def, l, pending))
      }
  }
  return { abilities, choices, spells }
}

/** The value KEY stands for in rules text: the higher of the class's two Key Stats. */
/** Base name of an ability: "Sneak Attack (3)" is "Sneak Attack". */
export function abilityBaseName(name: string): string {
  return UPGRADE.exec(name)?.[1] ?? name
}

export interface SheetResource {
  name: string
  diceName: string
  kind: NimbleSheet['resource']['kind']
  die: number
  /** Ability that grants it and its current text; empty for hand-made resources. */
  ability: string
  desc: string
  stat?: NimbleStat
  /** Uses added on top of the stat (Windborne: +1 Burst of Speed). */
  bonus: number
  /** Picked options that spend one (Thrill of the Hunt abilities). */
  moves: NimbleAbility[]
}

/**
 * The class resource the sheet should show, or null. Sheets built from class data
 * read it from the class once the hero has the ability that grants it (so heroes
 * made before a class had a resource definition get it too); hand-made sheets use
 * what was typed into the editor.
 */
export function sheetResource(sheet: NimbleSheet, level: number): SheetResource | null {
  const cls = classBySlug(sheet.classSlug)
  const def = cls?.resource
  if (cls && def) {
    const ability = sheet.abilities.find((a) => abilityBaseName(a.name) === def.ability)
    if (!ability) return null
    let die = def.die
    const sub = cls.subclasses.find((s) => s.slug === sheet.subclassSlug)
    for (let l = 1; l <= level; l++)
      die = sub?.levels[l]?.resourceDie ?? cls.levels[l]?.resourceDie ?? die
    const pool = cls.pools.find((p) => p.id === def.movesPool)
    const moves = pool
      ? sheet.abilities.filter((a) => pool.options.some((o) => o.name === a.name))
      : []
    return {
      name: def.name,
      diceName: def.diceName,
      kind: def.kind,
      die,
      ability: ability.name,
      desc: ability.desc,
      stat: def.stat,
      bonus: def.bonus && level >= def.bonus.level ? def.bonus.amount : 0,
      moves,
    }
  }
  const res = sheet.resource
  if (!res.name.trim()) return null
  return {
    name: res.name,
    diceName: res.diceName,
    kind: res.kind,
    die: res.die,
    ability: '',
    desc: '',
    bonus: 0,
    moves: [],
  }
}

export function keyStatValue(sheet: NimbleSheet): { value: number; stats: NimbleStat[] } | null {
  const cls = classBySlug(sheet.classSlug)
  if (!cls) return null
  const [a, b] = cls.keyStats
  return { value: Math.max(sheet.stats[a], sheet.stats[b]), stats: [a, b] }
}

// --- level 1 build ---------------------------------------------------------------

export interface NimbleBuildInput {
  cls: ClassDef
  ancestry: AncestryDef
  background: BackgroundDef
  stats: Record<NimbleStat, number>
  /** Extra skill points placed at creation, by skill name. */
  skillPoints: Record<string, number>
  /** Level 1 class choices and the background's choice, keyed like ResolvedChoice.key. */
  picks: Picks
}

/** Choices to make at creation: the class's level 1 table and the background's pick. */
export function creationChoices(
  cls: ClassDef,
  background: BackgroundDef | undefined,
  pending: Picks = {},
): ResolvedChoice[] {
  const sheet = defaultSheet('nimble')
  sheet.classSlug = cls.slug
  applyLevelDef(sheet, cls.levels[1], cls.name, 1)
  const defs = [
    ...(cls.levels[1]?.choices ?? []),
    ...(background?.choice ? [background.choice] : []),
  ]
  return defs.map((d) => resolveChoice(sheet, cls, undefined, d, 1, pending))
}

export function buildNimbleSheet(input: NimbleBuildInput): NimbleSheet {
  const { cls, ancestry, background, stats } = input
  const sheet = defaultSheet('nimble')
  sheet.classSlug = cls.slug
  sheet.class = cls.name
  sheet.ancestrySlug = ancestry.slug
  sheet.lineage = ancestry.name
  sheet.backgroundSlug = background.slug
  sheet.background = background.name
  sheet.stats = { ...stats }
  sheet.saveAdv = cls.saveAdv
  sheet.saveDis = ancestry.clearSaveDis ? '' : cls.saveDis

  sheet.hitDie = stepHitDie(cls.hitDie, ancestry.hitDieStep ?? 0)
  sheet.hitDice = 1 + (ancestry.hitDice ?? 0) + (background.hitDice ?? 0)
  sheet.hp = sheet.hpMax = cls.startingHp
  sheet.speed = String(BASE_SPEED + (ancestry.speed ?? 0))
  sheet.woundsMax = BASE_WOUNDS + (ancestry.woundsMax ?? 0) + (background.woundsMax ?? 0)
  sheet.ac = classArmor(cls, stats, 1) + (ancestry.armor ?? 0) + (background.armor ?? 0)
  sheet.initMod =
    stats.DEX + classInitiative(cls, 1) + (ancestry.initiative ?? 0) + (background.initiative ?? 0)

  sheet.skills = sheet.skills.map((s) => ({
    ...s,
    points:
      (input.skillPoints[s.name] ?? 0) +
      (ancestry.skills?.all ?? 0) +
      (ancestry.skills?.named?.[s.name] ?? 0) +
      (background.skills?.[s.name] ?? 0),
  }))
  const perception = sheet.skills.find((s) => s.name === 'Perception')
  sheet.passivePerception = 10 + stats.WIL + (perception?.points ?? 0)

  sheet.inventory = cls.startingGear.map((g) => ({ ...g }))
  if (cls.resource)
    sheet.resource = {
      name: cls.resource.name,
      diceName: cls.resource.diceName,
      kind: cls.resource.kind,
      active: false,
      dice: 0,
      die: cls.resource.die,
      count: 0,
    }
  sheet.languages = ['Common', ancestry.language].filter(Boolean).join(', ')

  applyLevelDef(sheet, cls.levels[1], cls.name, 1)
  const extras: NimbleAbility[] = [
    { name: ancestry.trait.name, src: ancestry.name, desc: ancestry.trait.desc, level: 1 },
    { name: background.name, src: 'Background', desc: background.desc, level: 1 },
    { name: cls.swapRule.name, src: cls.name, desc: cls.swapRule.desc, level: 1 },
  ]
  sheet.abilities.push(...extras)

  for (const choice of creationChoices(cls, background, input.picks))
    applyChoice(sheet, cls, choice, input.picks[choice.key] ?? [], 1)
  // After the abilities, so weapon perks (Swift Fists) can be seen.
  sheet.attacks = cls.startingWeapons
    .map((w) => weaponAttack(w, stats, sheet.abilities, classMeleeDamage(cls, 1)))
    .filter((a): a is NimbleAttack => !!a)
  sheet.mana.max = sheet.mana.current = manaMax(cls, sheet, 1)
  return sheet
}

/** Recommended stat placement: the array's two highest values in the class's key stats. */
export function recommendedStats(
  cls: ClassDef,
  values: readonly number[],
): Record<NimbleStat, number> {
  const sorted = [...values].sort((a, b) => b - a)
  const order: NimbleStat[] = [
    ...cls.keyStats,
    ...(['STR', 'DEX', 'INT', 'WIL'] as NimbleStat[]).filter(
      (s) => !cls.keyStats.includes(s) && s !== cls.saveDis,
    ),
    cls.saveDis,
  ].filter((s, i, arr) => arr.indexOf(s) === i)
  const out = { STR: 0, DEX: 0, INT: 0, WIL: 0 } as Record<NimbleStat, number>
  order.forEach((stat, i) => (out[stat] = sorted[i] ?? 0))
  return out
}
