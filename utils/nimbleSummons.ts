import { beastBySlug, beastsFor } from '~/data/nimble/beasts'
import { spellByName } from '~/data/nimble/spells'
import { SUMMONS, SUMMON_MODS, summonById, summonBySource } from '~/data/nimble/summons'
import type { SummonDef, SummonMod } from '~/data/nimble/types'
import type { NimbleAttack, NimbleSheet, NimbleSummon, NimbleSummonLook } from '~/types/sheets'
import { rollDie, type Rng } from '~/utils/dice'
import { letter } from '~/utils/initiative'
import {
  abilityBaseName,
  abilityModifiers,
  knownSpells,
  knownUtilitySpells,
  swapPoolOption,
} from '~/utils/nimbleBuild'
import { abilityCounters, actionsLeft, spendActions } from '~/utils/nimblePlay'

const DIE_STEPS = [4, 6, 8, 10, 12, 20]

export interface SummonStats {
  def: SummonDef
  cap: number
  perSummon: number
  reach: number
  die: number
  diceMult: number
  bonusTier: number
  maxDie: number
  damageStat?: SummonMod['damageStat']
  notes: string[]
  onCrit: string[]
  onDeath: string[]
  sacrifice: string[]
  onInitiative: number
  swarm: boolean
  critTempHp?: string
  onHighHeal: string[]
  onHighAttack: string[]
  damageType: string
  freeWhileDying: boolean
}

function hasAbility(sheet: NimbleSheet, name: string): boolean {
  return sheet.abilities.some((a) => abilityBaseName(a.name) === name)
}

function knowsSpell(sheet: NimbleSheet, name: string): boolean {
  return [...knownSpells(sheet), ...knownUtilitySpells(sheet)].some((s) => s.name === name)
}

function mods(sheet: NimbleSheet, def: SummonDef): SummonMod[] {
  return SUMMON_MODS.filter((m) => m.summon === def.id && hasAbility(sheet, m.ability))
}

export function summonStats(sheet: NimbleSheet, level: number, def: SummonDef): SummonStats {
  const active = mods(sheet, def)
  const first = Number(/^\d*d(\d+)/.exec(def.attack?.dice ?? '')?.[1] ?? 0)
  const highLevelReach = def.id === 'shadow-minion' ? Math.floor(level / 5) : 0
  // A favored pet is one of your shadow minions, so it takes one of their places.
  const pets = sheet.summons.filter((s) => summonById(s.def)?.minionOf === def.id).length
  const cap =
    def.cap === 'int-or-lvl'
      ? Math.max(0, Math.min(sheet.stats.INT, level) - pets)
      : (def.cap ?? Number.POSITIVE_INFINITY)
  return {
    def,
    cap,
    perSummon: Math.max(1, ...active.map((m) => m.perSummon ?? 1)),
    reach:
      (def.attack?.reach ?? 0) + highLevelReach + active.reduce((n, m) => n + (m.reach ?? 0), 0),
    die: active.find((m) => m.die)?.die ?? first,
    diceMult: Math.max(1, ...active.map((m) => m.diceMult ?? 1)),
    bonusTier: active.reduce((n, m) => n + (m.bonusTier ?? 0), 0),
    maxDie: Math.max(12, ...active.map((m) => m.maxDie ?? 0)),
    damageStat: active.find((m) => m.damageStat)?.damageStat,
    notes: active.flatMap((m) => (m.note ? [m.note] : [])),
    onCrit: active.flatMap((m) => (m.onCrit && m.onCrit !== 'summon' ? [m.onCrit] : [])),
    onDeath: active.flatMap((m) => (m.onDeath ? [m.onDeath] : [])),
    sacrifice: active.flatMap((m) => (m.sacrifice ? [m.sacrifice] : [])),
    onInitiative: active.reduce((n, m) => n + (m.onInitiative ?? 0), 0),
    swarm: active.some((m) => m.onCrit === 'summon'),
    critTempHp: active.find((m) => m.critTempHp)?.critTempHp,
    onHighHeal: active.flatMap((m) => (m.onHighHeal ? [m.onHighHeal] : [])),
    onHighAttack: active.flatMap((m) => (m.onHighAttack ? [m.onHighAttack] : [])),
    damageType: active.find((m) => m.damageType)?.damageType
      ? `radiant or ${active.find((m) => m.damageType)?.damageType}`
      : 'radiant',
    freeWhileDying: active.some((m) => m.freeWhileDying),
  }
}

export function availableSummons(sheet: NimbleSheet): SummonDef[] {
  return SUMMONS.filter((d) => hasAbility(sheet, d.source) || knowsSpell(sheet, d.source))
}

function nextName(sheet: NimbleSheet, def: SummonDef, offset: number): string {
  const base = summonBaseName(sheet, def.id)
  if (def.cap === 1) return base
  const taken = new Set(sheet.summons.filter((s) => s.def === def.id).map((s) => s.name))
  let skip = offset
  for (let i = 0; ; i++) {
    const name = `${base} ${letter(i)}`
    if (taken.has(name)) continue
    if (skip-- === 0) return name
  }
}

const OPTION_HEAD = /(?<=^|[.…)]\s)([A-Z][A-Za-z'’ ]*[A-Za-z!]):\s/g

/** A companion's options as written in its ability ("Protect Me!: …"), one per entry. */
export function summonOptions(
  sheet: NimbleSheet,
  defId: string,
): { name: string; text: string; passive: boolean }[] {
  const def = summonById(defId)
  const desc = def?.permanent
    ? sheet.abilities.find((a) => abilityBaseName(a.name) === def.source)?.desc
    : undefined
  if (!desc) return []
  const heads = [...desc.matchAll(OPTION_HEAD)]
  return heads.map((m, i) => {
    const text = desc.slice(m.index + m[0].length, heads[i + 1]?.index ?? desc.length).trim()
    return {
      name: m[1] ?? '',
      text,
      passive: !/\d+\s*\/\s*(?:encounter|round|turn|day)/i.test(text),
    }
  })
}

/** Words other abilities use for a kind of summon ("your minions", "your companion"). */
function summonAliases(def: SummonDef): string[] {
  const minion = COMMANDED.includes(def.id) || def.id === 'greater-shadow' || !!def.minionOf
  return [
    def.name,
    ...(minion ? ['minion', 'minions', 'shadow minion', 'shadow minions'] : []),
    ...(def.permanent && def.attack ? ['companion', 'Companion'] : []),
    ...(def.id === 'lifebinding-spirit' ? ['spirit', 'Spirit'] : []),
  ]
}

/**
 * Everything on this hero that upgrades a summon: the class options the rules data ties
 * to it (Swarming, Empowered Companion…) and other abilities' lines about it.
 */
export function summonModifiers(
  sheet: NimbleSheet,
  defId: string,
): { name: string; text: string; ability: string }[] {
  const def = summonById(defId)
  if (!def) return []
  const kinds = [def.id, ...(def.minionOf ? [def.minionOf] : [])]
  const linked = SUMMON_MODS.filter((m) => kinds.includes(m.summon) && hasAbility(sheet, m.ability))
    .map((m) => ({
      name: m.ability,
      ability: m.ability,
      text: sheet.abilities.find((a) => abilityBaseName(a.name) === m.ability)?.desc ?? '',
    }))
    .filter((m) => m.name !== def.source)
  const named = abilityModifiers(sheet, def.source, summonAliases(def)).filter(
    (m) => !SUMMONS.some((d) => d.source === m.name),
  )
  const seen = new Set(linked.map((m) => m.name))
  return [...linked, ...named.filter((m) => !seen.has(m.name))]
}

/** Switches to another summon option of the same pool, keeping its name and image. */
export function switchSummonOption(sheet: NimbleSheet, from: string, to: string): string {
  const fromDef = summonBySource(from)
  const toDef = summonBySource(to)
  if (!fromDef || !toDef || !swapPoolOption(sheet, from, to)) return ''
  const look = sheet.summonLooks[fromDef.id]
  if (look) {
    const looks = { ...sheet.summonLooks }
    delete looks[fromDef.id]
    sheet.summonLooks = looks
    const beast = beastsFor(toDef.id).some((b) => b.slug === look.beast) ? look.beast : ''
    setSummonLook(sheet, toDef.id, { ...look, beast })
  }
  const name = sheet.summons.find((s) => s.def === toDef.id)?.name ?? toDef.name
  return `${name} is now your ${toDef.name.toLowerCase()}.`
}

export function summonLookKey(summon: Pick<NimbleSummon, 'def' | 'name'>): string {
  return summon.def || `custom:${summon.name}`
}

export function summonBaseName(sheet: NimbleSheet, key: string): string {
  const look = sheet.summonLooks[key]
  return (
    look?.name ||
    beastBySlug(look?.beast)?.name ||
    summonById(key)?.name ||
    key.replace(/^custom:/, '')
  )
}

export function setSummonLook(sheet: NimbleSheet, key: string, look: NimbleSummonLook): string {
  const def = summonById(key)
  const old = summonBaseName(sheet, key)
  const name = look.name?.trim().slice(0, 60) || (def ? '' : old)
  const portrait = look.portrait ?? ''
  const beast = def ? (beastBySlug(look.beast)?.slug ?? '') : ''
  const nextKey = def ? key : `custom:${name}`
  const looks = { ...sheet.summonLooks }
  delete looks[key]
  const custom = name && name !== def?.name
  if (custom || portrait || beast)
    looks[nextKey] = {
      ...(custom ? { name } : {}),
      ...(portrait ? { portrait } : {}),
      ...(beast ? { beast } : {}),
    }
  sheet.summonLooks = looks
  const base = summonBaseName(sheet, nextKey)
  sheet.summons = sheet.summons.map((s) => {
    if (summonLookKey(s) !== key) return s
    const updated: NimbleSummon = {
      ...s,
      name: s.name.startsWith(old) ? `${base}${s.name.slice(old.length)}` : base,
    }
    if (portrait) updated.portrait = portrait
    else delete updated.portrait
    if (beast) updated.beast = beast
    else delete updated.beast
    return updated
  })
  return base
}

function stepDie(die: number, steps: number, maxDie: number): number {
  const at = DIE_STEPS.indexOf(die)
  const capped = DIE_STEPS.indexOf(maxDie)
  if (at < 0) return die
  return DIE_STEPS[Math.min(at + steps, capped < 0 ? DIE_STEPS.length - 1 : capped)] ?? die
}

export interface SummonOptions {
  tier?: number
  ignoreCap?: boolean
  count?: number
}

export function addSummon(
  sheet: NimbleSheet,
  level: number,
  defId: string,
  opts: SummonOptions = {},
): string {
  const def = summonById(defId)
  if (!def) return ''
  const stats = summonStats(sheet, level, def)
  const spell = spellByName(def.source)
  const tier = Math.max(spell?.tier ?? 0, opts.tier ?? spell?.tier ?? 0)
  if (def.cap === 1) sheet.summons = sheet.summons.filter((s) => s.def !== def.id)
  const have = sheet.summons.filter((s) => s.def === def.id).length
  const wanted = opts.count ?? stats.perSummon
  const room = opts.ignoreCap ? wanted : Math.max(0, stats.cap - have)
  const count = Math.min(wanted, room)
  if (count < 1) return `${def.name}: already at the max of ${stats.cap}.`
  const extra: Partial<NimbleSummon> = {}
  if (def.id === 'lifebinding-spirit') {
    const mana = Math.max(1, tier) + stats.bonusTier
    extra.tier = mana
    extra.charges = mana
  } else if (def.id === 'greater-shadow') extra.tier = Math.max(4, tier)
  const { portrait, beast } = sheet.summonLooks[def.id] ?? {}
  const added = Array.from({ length: count }, (_, i) => ({
    id: crypto.randomUUID(),
    def: def.id,
    name: nextName(sheet, def, i),
    hp: def.hp,
    hpMax: def.hp,
    ...extra,
    ...(portrait ? { portrait } : {}),
    ...(beast ? { beast } : {}),
  }))
  sheet.summons = [...sheet.summons, ...added]
  const capNote =
    Number.isFinite(stats.cap) && stats.cap > 1 ? ` (${have + count}/${stats.cap})` : ''
  const names = count === 1 ? added[0]!.name : `${count} ${def.name.toLowerCase()}s`
  return `${names} summoned${capNote}.`
}

export function addCustomSummon(sheet: NimbleSheet, name: string, hp: number): string {
  const label = name.trim().slice(0, 60)
  if (!label) return ''
  const max = Math.max(0, Math.floor(hp) || 0)
  const portrait = sheet.summonLooks[`custom:${label}`]?.portrait
  sheet.summons = [
    ...sheet.summons,
    {
      id: crypto.randomUUID(),
      def: '',
      name: label,
      hp: max,
      hpMax: max,
      ...(portrait ? { portrait } : {}),
    },
  ]
  return `${label} summoned.`
}

export function summonFromSpell(
  sheet: NimbleSheet,
  level: number,
  spell: string,
  tier?: number,
): string {
  const def = summonBySource(spell)
  return def && spellByName(spell) ? addSummon(sheet, level, def.id, { tier }) : ''
}

export function summonFromAbility(sheet: NimbleSheet, level: number, ability: string): string {
  const def = summonBySource(ability)
  return def && !spellByName(ability) && !def.permanent ? addSummon(sheet, level, def.id) : ''
}

function remove(sheet: NimbleSheet, ids: string[]) {
  sheet.summons = sheet.summons.filter((s) => !ids.includes(s.id))
}

export function dismissSummon(sheet: NimbleSheet, id: string): string {
  const summon = sheet.summons.find((s) => s.id === id)
  if (!summon) return ''
  remove(sheet, [id])
  return `${summon.name} dismissed.`
}

export function slaySummon(sheet: NimbleSheet, level: number, id: string): string {
  const summon = sheet.summons.find((s) => s.id === id)
  if (!summon) return ''
  remove(sheet, [id])
  const minionDied = COMMANDED.includes(summon.def) || summon.def === 'greater-shadow'
  const def = summonById(minionDied ? 'shadow-minion' : summon.def)
  const notes = def ? summonStats(sheet, level, def).onDeath : []
  let burst = ''
  if (summon.def === 'greater-shadow') {
    const minions = 5 + Math.max(0, (summon.tier ?? 4) - 4)
    addSummon(sheet, level, 'shadow-minion', { ignoreCap: true, count: minions })
    burst = ` It explodes into ${minions} shadow minions.`
  }
  const reactions = notes.length ? ` ${notes.join(' ')}` : ''
  return `${summon.name} is slain.${burst}${reactions}`
}

export function sacrificeSummon(sheet: NimbleSheet, level: number, id: string): string {
  const summon = sheet.summons.find((s) => s.id === id)
  const def = summon && summonById(summon.def)
  if (!summon || !def) return ''
  const rules = summonById(def.minionOf ?? def.id) ?? def
  const effect = summonStats(sheet, level, rules).sacrifice.join(' ')
  remove(sheet, [id])
  const rounds = summon.def === 'lifebinding-spirit' ? ` (${summon.charges ?? 0} rounds)` : ''
  return `${summon.name} sacrificed.${effect ? ` ${effect}${rounds}` : ''}${minionDeathNotes(sheet, level, summon.def)}`
}

function minionDeathNotes(sheet: NimbleSheet, level: number, defId: string): string {
  if (!COMMANDED.includes(defId) && defId !== 'greater-shadow') return ''
  const notes = summonStats(sheet, level, summonById('shadow-minion')!).onDeath
  return notes.length ? ` ${notes.join(' ')}` : ''
}

export function sacrificeMinions(sheet: NimbleSheet, count: number, level = 1): string {
  const minions = sheet.summons.filter((s) => s.def === 'shadow-minion')
  const taken = minions.slice(0, Math.max(0, count))
  remove(
    sheet,
    taken.map((s) => s.id),
  )
  const short = count - taken.length
  const notes = taken.length ? minionDeathNotes(sheet, level, 'shadow-minion') : ''
  return short > 0
    ? ` Only ${taken.length} shadow minion${taken.length === 1 ? '' : 's'} to sacrifice (${short} short).${notes}`
    : notes
}

const COMMANDED = ['shadow-minion', 'favored-pet']

export function minionCount(sheet: NimbleSheet): number {
  return sheet.summons.filter((s) => COMMANDED.includes(s.def) || s.def === 'greater-shadow').length
}

export function endSummons(sheet: NimbleSheet, when: 'rest' | 'encounter' | 'turn'): string[] {
  const ended = sheet.summons.filter((s) => summonById(s.def)?.endsOn?.includes(when))
  remove(
    sheet,
    ended.map((s) => s.id),
  )
  return ended.map((s) => s.name)
}

export function initiativeSummons(sheet: NimbleSheet, level: number): string {
  const def = summonById('shadow-minion')!
  const free = summonStats(sheet, level, def).onInitiative
  if (free < 1) return ''
  addSummon(sheet, level, def.id, { ignoreCap: true, count: free })
  return ` ${free} shadow minions join you for free.`
}

function explode(sides: number, rng: Rng): number[] {
  const extra: number[] = []
  let last = sides
  while (last === sides) {
    last = rollDie(sides, rng)
    extra.push(last)
  }
  return extra
}

function rollMinion(sides: number, rng: Rng): { value: number; miss: boolean; max: boolean } {
  const value = rollDie(sides, rng)
  return { value, miss: value === 1, max: value === sides }
}

export function commandMinions(sheet: NimbleSheet, level: number, rng: Rng = Math.random): string {
  const def = summonById('shadow-minion')!
  const stats = summonStats(sheet, level, def)
  const minions = sheet.summons.filter((s) => COMMANDED.includes(s.def))
  const greater = sheet.summons.find((s) => s.def === 'greater-shadow')
  if (!minions.length && !greater) return ''
  if (sheet.uses['Command minions@turn']?.used)
    return 'You already commanded your minions this turn.'
  sheet.uses['Command minions@turn'] = { ...sheet.uses['Command minions@turn'], used: 1 }
  if (sheet.ownDice) {
    const big = greater
      ? ` and ${5 + Math.max(0, (greater.tier ?? 4) - 4)}d${stats.die} for the ${greater.name}`
      : ''
    return `Minions attack (Reach ${stats.reach}): roll 1d${stats.die} for each of ${minions.length} minion${minions.length === 1 ? '' : 's'}${big} yourself; a 1 misses, a max roll would crit (add any minions it summons by hand).`
  }
  const parts: string[] = []
  let total = 0
  let crits = 0
  for (let i = 0; i < minions.length; i++) {
    const r = rollMinion(stats.die, rng)
    if (r.max) crits += 1
    if (!r.miss) total += r.value
    parts.push(r.miss ? 'miss' : `${r.value}`)
  }
  if (greater) {
    const dice = 5 + Math.max(0, (greater.tier ?? 4) - 4)
    const rolls = Array.from({ length: dice }, () => rollDie(stats.die, rng))
    const sum = rolls.reduce((a, b) => a + b, 0)
    if (rolls[0] === stats.die) crits += 1
    if (rolls[0] !== 1) total += sum
    parts.push(rolls[0] === 1 ? `${greater.name} miss` : `${greater.name} ${sum}`)
  }
  const after: string[] = []
  if (crits && stats.swarm) {
    const before = minionCount(sheet)
    for (let i = 0; i < crits; i++) addSummon(sheet, level, def.id, { ignoreCap: true })
    const gained = minionCount(sheet) - before
    after.push(
      gained
        ? `Swarming Shadows: +${gained} shadow minion${gained === 1 ? '' : 's'}.`
        : 'Swarming Shadows: already at max minions.',
    )
  }
  if (crits) after.push(...stats.onCrit)
  if (crits && stats.critTempHp) {
    const [a = '', b = ''] = stats.critTempHp.split('+')
    const gain = Math.max(0, sheet.stats.INT * Number(a === 'INT') + level * Number(b === 'LVL'))
    sheet.tempHp = Math.max(sheet.tempHp, gain)
    after.push(`Master of Nightfrost: ${gain} temp HP.`)
  }
  const reach = `Reach ${stats.reach}, d${stats.die}`
  return `Minions attack (${reach}): ${parts.join(', ')} = ${total} damage.${after.length ? ` ${after.join(' ')}` : ''}`
}

export function spiritDie(sheet: NimbleSheet, level: number, tier: number | undefined): number {
  const stats = summonStats(sheet, level, summonById('lifebinding-spirit')!)
  return stepDie(6, Math.max(0, (tier ?? 1) - 1), stats.maxDie)
}

export function spiritAct(
  sheet: NimbleSheet,
  level: number,
  mode: 'attack' | 'heal',
  rng: Rng = Math.random,
): string {
  const spirit = sheet.summons.find((s) => s.def === 'lifebinding-spirit')
  if (!spirit) return ''
  const def = summonById('lifebinding-spirit')!
  const stats = summonStats(sheet, level, def)
  const die = spiritDie(sheet, level, spirit.tier)
  if (sheet.ownDice) {
    const plus = mode === 'attack' && stats.damageStat ? `+WIL+${stats.damageStat}` : '+WIL'
    if (mode === 'attack')
      return `${spirit.name} attacks: roll ${stats.diceMult}d${die}${plus} ${stats.damageType} yourself, ignoring armor.`
    const left = Math.max(0, (spirit.charges ?? 0) - 1)
    spirit.charges = left
    if (left === 0) remove(sheet, [spirit.id])
    return `${spirit.name} heals: roll ${stats.diceMult}d${die}${plus} yourself.${left ? ` ${left} heals left.` : ' Its last heal: it fades.'}`
  }
  const rolls = Array.from({ length: stats.diceMult }, () => rollDie(die, rng))
  const crit = mode === 'attack' && rolls[0] === die
  if (crit) rolls.push(...explode(die, rng))
  const sum = rolls.reduce((a, b) => a + b, 0)
  const bonus =
    sheet.stats.WIL + (mode === 'attack' && stats.damageStat ? sheet.stats[stats.damageStat] : 0)
  const amount = Math.max(0, sum + bonus)
  const detail = `${stats.diceMult}d${die} (${rolls.join(', ')}) ${bonus >= 0 ? '+' : '−'} ${Math.abs(bonus)}`
  const high = rolls.some((v) => v >= 6)
  const notes = high ? (mode === 'attack' ? stats.onHighAttack : stats.onHighHeal) : []
  const extra = notes.length ? ` ${notes.join(' ')}` : ''
  if (mode === 'attack')
    return rolls[0] === 1
      ? `${spirit.name} attacks: miss (first die rolled a 1).`
      : `${spirit.name} attacks: ${amount} ${stats.damageType} damage${crit ? ' · critical' : ''}, ignoring armor [${detail}].${extra}`
  const left = Math.max(0, (spirit.charges ?? 0) - 1)
  spirit.charges = left
  if (left === 0) remove(sheet, [spirit.id])
  return `${spirit.name} heals ${amount} HP [${detail}].${extra}${left ? ` ${left} heals left.` : ' Its last heal: it fades.'}`
}

function companionLimits(sheet: NimbleSheet, level: number, def: SummonDef) {
  return (
    abilityCounters(sheet, level)
      .find((e) => abilityBaseName(e.ability.name) === def.source)
      ?.counters.filter((c) => c.name === def.attack?.label) ?? []
  )
}

export function companionBlocked(sheet: NimbleSheet, level: number): string {
  const companion = sheet.summons.find(
    (s) => summonById(s.def)?.permanent && summonById(s.def)?.attack,
  )
  const def = companion && summonById(companion.def)
  const attack = def?.attack
  if (!def || !attack) return ''
  const spent = companionLimits(sheet, level, def).find((c) => c.used >= c.max)
  if (spent) return `${attack.label}: no uses left ${spent.label}.`
  const charges = attack.charges ?? 0
  if (charges && sheet.resource.count < charges)
    return `${attack.label} costs ${charges} Thrill of the Hunt charge${charges === 1 ? '' : 's'}; you have ${sheet.resource.count}.`
  const left = actionsLeft(sheet)
  const actions = attack.actions ?? 0
  if (left < actions)
    return `${attack.label} takes ${actions} action${actions === 1 ? '' : 's'}; you have ${left}.`
  return ''
}

export function companionAttack(sheet: NimbleSheet, level: number, rng: Rng = Math.random): string {
  const companion = sheet.summons.find(
    (s) => summonById(s.def)?.permanent && summonById(s.def)?.attack,
  )
  const def = companion && summonById(companion.def)
  const attack = def?.attack
  if (!companion || !attack) return ''
  const m = /^(\d+)d(\d+)\+(?:(\d+)×)?LVL$/.exec(attack.dice)
  if (!m) return ''
  const blocked = companionBlocked(sheet, level)
  if (blocked) return blocked
  const charges = attack.charges ?? 0
  for (const c of companionLimits(sheet, level, def))
    sheet.uses[c.id] = { ...sheet.uses[c.id], used: c.used + 1 }
  if (attack.actions) spendActions(sheet, attack.actions)
  sheet.resource.count -= charges
  const left = charges
    ? ` ${sheet.resource.count} charge${sheet.resource.count === 1 ? '' : 's'} left.`
    : ''
  if (sheet.ownDice)
    return `${companion.name} — ${attack.label}: roll ${m[1]}d${m[2]} + ${Number(m[3] ?? 1) * level} yourself, ignoring armor; it can't miss.${left}`
  const sides = Number(m[2])
  const rolls = Array.from({ length: Number(m[1]) }, () => rollDie(sides, rng))
  const crit = rolls[0] === sides
  if (crit) rolls.push(...explode(sides, rng))
  const flat = Number(m[3] ?? 1) * level
  const total = rolls.reduce((a, b) => a + b, 0) + flat
  const spent = charges
    ? ` ${sheet.resource.count} charge${sheet.resource.count === 1 ? '' : 's'} left.`
    : ''
  return `${companion.name} — ${attack.label}: ${total} damage${crit ? ' · critical' : ''}, ignoring armor; it can't miss (${rolls.join(', ')} + ${flat}).${spent}`
}

export function summonedWeapons(sheet: NimbleSheet, level: number): NimbleAttack[] {
  return sheet.summons.flatMap((s) => {
    const weapon = summonById(s.def)?.weapon
    if (!weapon) return []
    const count = weapon.count + Math.floor(level / weapon.levelStep)
    const mod = count * sheet.stats[weapon.perDie]
    return [
      {
        name: s.name,
        props: `Summoned, Reach ${weapon.reach}, + ${weapon.perDie} per die, shatters on a hit`,
        dmg: mod ? `${count}d${weapon.die}${mod > 0 ? '+' : ''}${mod}` : `${count}d${weapon.die}`,
        melee: true,
      },
    ]
  })
}

export function afterSummonedAttack(
  sheet: NimbleSheet,
  level: number,
  name: string,
  roll: { miss: boolean; crit: boolean },
): string {
  const summon = sheet.summons.find((s) => s.name === name && summonById(s.def)?.weapon)
  if (!summon || roll.miss) return ''
  remove(sheet, [summon.id])
  const reap = sheet.abilities.some((a) => a.name === 'Reap')
  const minion =
    reap && roll.crit
      ? ` Reap: ${addSummon(sheet, level, 'shadow-minion', { ignoreCap: true })}`
      : ''
  const kill = reap && !roll.crit ? ' Reap: if it killed, add a shadow minion.' : ''
  return ` ${summon.name} shatters.${minion}${kill}`
}
