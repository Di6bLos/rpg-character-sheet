// Pathfinder 2e spellcasting on the sheet (Player Core pp. 297–303): spell attack and DC,
// cantrips heightened to half your level, casting from slots (prepared or spontaneous,
// heightened into a higher slot), a cleric's divine font, focus spells and Refocus, daily
// preparations, and the flat check for casting while stupefied (p. 446).
import type { Pf2eSpellDef } from '~/data/pf2e/types'
import type { Pf2eSheet, Pf2eSlotRank, Pf2eSpellRef, Pf2eSpellcasting } from '~/types/sheets'
import { type Rng, rollDie } from '~/utils/dice'
import { setGiven, toggleEffect } from '~/utils/pf2eEffects'
import { adjusted, conditionValue, proficiency } from '~/utils/pf2ePlay'
import { type Pf2eCastRoll, castRolls, effectValue, spellRules } from '~/utils/pf2eSpellRules'

/** Cantrips and focus spells heighten to half your level, rounded up (p. 298). */
export const heightenedRank = (level: number) => Math.max(1, Math.ceil(level / 2))

/** Focus pool: one point per focus spell that costs one, up to 3 (p. 298). */
export const focusPoolMax = (focus: Pf2eSpellRef[], cantrips: Set<string>) =>
  Math.min(3, focus.filter((f) => !cantrips.has(f.id)).length)

/** A cleric's divine font slots: 4, 5 from 5th level, 6 from 15th (Player Core p. 108). */
export const fontSlots = (level: number) => (level >= 15 ? 6 : level >= 5 ? 5 : 4)

/** Spell attack modifier and spell DC after conditions (stupefied, frightened…). */
export function spellNumbers(s: Pf2eSheet, sc: Pf2eSpellcasting, level: number) {
  const base = s.attrs[sc.attr] + proficiency(sc.rank, level)
  return {
    attack: adjusted(s, base, { kind: 'attack', attr: sc.attr }),
    dc: adjusted(s, 10 + base, { kind: 'classDc', attr: sc.attr }),
  }
}

/**
 * Spell attack and DC for a hero without spellcasting of their own (a champion's or monk's
 * focus spells): the class DC, and that less 10 as the attack.
 */
export function focusNumbers(s: Pf2eSheet) {
  const dc = s.saves.find((x) => x.label === 'Class DC')?.value ?? 10
  return {
    attack: adjusted(s, dc - 10, { kind: 'attack', attr: s.keyAttr }),
    dc: adjusted(s, dc, { kind: 'classDc', attr: s.keyAttr }),
  }
}

/** The highest rank with at least one slot. */
export const highestRank = (sc: Pf2eSpellcasting) =>
  sc.slots.reduce((top, r, i) => (r.max > 0 ? i + 1 : top), 0)

/**
 * Stupefied: Cast a Spell needs a DC 5 + stupefied flat check or the spell is disrupted
 * (p. 446). Returns the line to add, and whether it went off.
 */
export function stupefiedCheck(s: Pf2eSheet) {
  const value = conditionValue(s, 'Stupefied')
  if (!value) return { ok: true, note: '' }
  const roll = rollDie(20)
  const dc = 5 + value
  return roll >= dc
    ? { ok: true, note: ` Stupefied flat check ${roll} vs DC ${dc}: it goes off.` }
    : { ok: false, note: ` Stupefied flat check ${roll} vs DC ${dc}: the spell is disrupted.` }
}

const heightenNote = (spell: Pf2eSpellRef, rank: number) =>
  rank > spell.rank ? ` at rank ${rank} (heightened from ${spell.rank})` : ` at rank ${rank}`

/**
 * The rank a repertoire spell goes off at from a slot (p. 297): a spontaneous caster heightens
 * only to a rank they know the spell at, a signature spell to any slot's rank. From a higher
 * slot otherwise it's cast at the rank it's known, without heightened effects.
 */
export const spontaneousRank = (spell: Pf2eSpellRef, slotRank: number) =>
  spell.signature ? slotRank : spell.rank

/** Spontaneous casting (p. 297): spend a slot of the spell's rank or higher. */
export function castSpontaneous(s: Pf2eSheet, spell: Pf2eSpellRef, slotRank: number): string {
  const sc = s.spellcasting
  const slot = sc?.slots[slotRank - 1]
  if (!sc || !slot) return `No rank ${slotRank} slots.`
  if (slotRank < spell.rank) return `${spell.name} is a rank ${spell.rank} spell.`
  if (slot.used >= slot.max) return `No rank ${slotRank} slots left today.`
  slot.used += 1
  const rank = spontaneousRank(spell, slotRank)
  const from = rank < slotRank ? ` from a rank ${slotRank} slot (not heightened)` : ''
  const left = slot.max - slot.used
  const flat = stupefiedCheck(s)
  return `Cast ${spell.name}${heightenNote(spell, rank)}${from}: ${left} rank ${slotRank} slot${left === 1 ? '' : 's'} left.${flat.note}`
}

/** Prepared casting: the spell in that slot is spent. */
export function castPrepared(s: Pf2eSheet, rank: number, index: number): string {
  const sc = s.spellcasting
  const entry = sc?.slots[rank - 1]?.prepared?.[index]
  if (!sc || !entry?.id) return 'Nothing prepared in that slot.'
  if (entry.cast) return 'That slot was already cast today.'
  const spell = sc.spells.find((x) => x.id === entry.id)
  entry.cast = true
  const flat = stupefiedCheck(s)
  return `Cast ${spell?.name ?? 'the spell'}${spell ? heightenNote(spell, rank) : ''}.${flat.note}`
}

/** A divine font slot: heal or harm at the highest rank of the hero's spell slots. */
export function castFont(s: Pf2eSheet): string {
  const font = s.spellcasting?.font
  if (!font) return 'No divine font.'
  const rank = highestRank(s.spellcasting!)
  if (!rank) return 'No spell slots yet: your divine font casts at your highest slot rank.'
  if (font.used >= font.max) return 'No divine font slots left today.'
  font.used += 1
  const flat = stupefiedCheck(s)
  return `Cast ${font.spell} at rank ${rank} from your divine font: ${font.max - font.used} left.${flat.note}`
}

/** A cantrip: free, heightened to half your level. */
export function castCantrip(s: Pf2eSheet, spell: Pf2eSpellRef, level: number): string {
  const flat = stupefiedCheck(s)
  return `Cast ${spell.name} (cantrip, rank ${heightenedRank(level)}).${flat.note}`
}

/** A focus spell costs 1 Focus Point; focus cantrips cost none (p. 298). */
export function castFocus(
  s: Pf2eSheet,
  spell: Pf2eSpellRef,
  level: number,
  cantrip: boolean,
): string {
  const rank = heightenedRank(level)
  if (!cantrip) {
    if (s.focus.current < 1) return 'No Focus Points left: Refocus to regain one.'
    s.focus.current -= 1
  }
  const flat = stupefiedCheck(s)
  const left = cantrip
    ? ''
    : ` ${s.focus.current} Focus Point${s.focus.current === 1 ? '' : 's'} left.`
  return `Cast ${spell.name} (focus ${cantrip ? 'cantrip' : 'spell'}, rank ${rank}).${left}${flat.note}`
}

/** Refocus (p. 298): 10 minutes regains 1 Focus Point. */
export function refocus(s: Pf2eSheet): string {
  if (s.focus.current >= s.focus.max) return 'Your focus pool is full.'
  s.focus.current += 1
  return `Refocused: ${s.focus.current}/${s.focus.max} Focus Points.`
}

/** Daily preparations: slots, divine font and the focus pool come back. */
export function dailyPreparations(s: Pf2eSheet): string {
  const sc = s.spellcasting
  if (sc) {
    for (const r of sc.slots) {
      r.used = 0
      for (const p of r.prepared ?? []) p.cast = false
    }
    if (sc.font) sc.font.used = 0
  }
  s.focus.current = s.focus.max
  s.used = []
  return `Daily preparations: ${sc ? 'spell slots, ' : ''}Focus Points and daily abilities restored.`
}

/** Slots for a level from the class's spells-per-day row; prepared slots start empty. */
export function slotsFor(row: number[], kind: Pf2eSpellcasting['kind']): Pf2eSlotRank[] {
  return Array.from({ length: 10 }, (_, i) => {
    const max = row[i] ?? 0
    return kind === 'prepared'
      ? { max, used: 0, prepared: Array.from({ length: max }, () => ({ id: null, cast: false })) }
      : { max, used: 0 }
  })
}

/** Grows or shrinks one rank's slots (the player adjusting after a level-up). */
export function setSlotMax(sc: Pf2eSpellcasting, rank: number, max: number) {
  const r = sc.slots[rank - 1]
  if (!r) return
  r.max = Math.max(0, Math.min(9, max))
  r.used = Math.min(r.used, r.max)
  if (sc.kind === 'prepared') {
    const prepared = r.prepared ?? []
    r.prepared = Array.from({ length: r.max }, (_, i) => prepared[i] ?? { id: null, cast: false })
  }
}

/** A cast went off: a slot or point was spent and the stupefied flat check didn't disrupt it. */
export const castWentOff = (message: string) =>
  message.startsWith('Cast ') && !message.includes('the spell is disrupted')

/** How the player casts it: the action version, a melee spell attack, the attack's MAP. */
export interface Pf2eCastChoice {
  actions?: number
  melee?: boolean
  /** 0 for the first attack this turn, 1 and 2 for the second and third (−5, −10). */
  attackNumber?: number
  targetAc?: number | null
  rng?: Rng
}

const MAP = [0, 5, 10]

/**
 * Rolls what a cast spell does at the rank it went off (utils/pf2eSpellRules.ts): the spell
 * attack (MAP counted, p. 402) or the DC its save is against, damage and healing. A spell that
 * only ever affects the caster (Shield, Mystic Armor, Bless's emanation) turns on its effect.
 */
export function castEffect(
  s: Pf2eSheet,
  spell: Pf2eSpellDef,
  rank: number,
  level: number,
  choice: Pf2eCastChoice = {},
): Pf2eCastRoll & { selfEffect?: string } {
  const numbers = s.spellcasting ? spellNumbers(s, s.spellcasting, level) : focusNumbers(s)
  const map = MAP[choice.attackNumber ?? 0] ?? 0
  const roll = castRolls(spell, {
    rank,
    actions: choice.actions,
    melee: choice.melee,
    attackBonus: numbers.attack.value - map,
    dc: numbers.dc.value,
    targetAc: choice.targetAc,
    rng: choice.rng,
  })
  const effect = spellRules(spell).effect
  if (!effect?.self) return roll
  const selfEffect = effectOnSelf(s, spell, rank, level)
  return { ...roll, text: `${roll.text} ${selfEffect}`.trim(), selfEffect }
}

/**
 * Turns on a spell's effect for the caster (data/pf2e/effects.ts): their own toggle (Shield,
 * Mystic Armor, the anthems), or the effect as an ally gives it (Heroism +2 at 6th rank).
 */
export function effectOnSelf(s: Pf2eSheet, spell: Pf2eSpellDef, rank: number, level: number) {
  const def = spellRules(spell).effect?.def
  if (!def) return ''
  if (def.mode === 'toggle') {
    if (s.effects?.on.includes(def.name)) return `${def.name} is already on.`
    return toggleEffect(s, def.name, level)
  }
  const value = effectValue(spell, def, rank)
  setGiven(s, def.name, true, value)
  return `${def.name}${value === undefined ? '' : ` +${value}`} is on you.`
}
