// Pathfinder 2e spellcasting on the sheet (Player Core pp. 297–303): spell attack and DC,
// cantrips heightened to half your level, casting from slots (prepared or spontaneous,
// heightened into a higher slot), a cleric's divine font, focus spells and Refocus, daily
// preparations, and the flat check for casting while stupefied (p. 446).
import type { Pf2eSheet, Pf2eSlotRank, Pf2eSpellRef, Pf2eSpellcasting } from '~/types/sheets'
import { rollDie } from '~/utils/dice'
import { adjusted, conditionValue, proficiency } from '~/utils/pf2ePlay'

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

/** Spontaneous casting (p. 297): spend a slot of the spell's rank or higher. */
export function castSpontaneous(s: Pf2eSheet, spell: Pf2eSpellRef, rank: number): string {
  const sc = s.spellcasting
  const slot = sc?.slots[rank - 1]
  if (!sc || !slot) return `No rank ${rank} slots.`
  if (rank < spell.rank) return `${spell.name} is a rank ${spell.rank} spell.`
  if (slot.used >= slot.max) return `No rank ${rank} slots left today.`
  slot.used += 1
  const flat = stupefiedCheck(s)
  return `Cast ${spell.name}${heightenNote(spell, rank)}: ${slot.max - slot.used} rank ${rank} slot${slot.max - slot.used === 1 ? '' : 's'} left.${flat.note}`
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

/** A divine font slot: heal or harm at the highest rank. */
export function castFont(s: Pf2eSheet): string {
  const font = s.spellcasting?.font
  if (!font) return 'No divine font.'
  if (font.used >= font.max) return 'No divine font slots left today.'
  font.used += 1
  const rank = highestRank(s.spellcasting!)
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
  return 'Daily preparations: spell slots, Focus Points and daily abilities restored.'
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
