import type { Dnd5eClassCasting, Dnd5eSheet } from '~/types/sheets'
import { levelName, pactLeft, slotsLeft, slotsMax, spellNumbers } from '~/utils/dnd5eSpells'

/** One spell level's slots: how many the hero has and has left. */
export interface Dnd5eSlotRow {
  level: number
  label: string
  max: number
  left: number
}

/** A spellcasting class of a multiclass hero with its live spell attack and save DC. */
export interface Dnd5eCasterRow {
  cc: Dnd5eClassCasting
  attack: number
  dc: number
  /** The DC differs from the one the build recorded (an effect raises it). */
  changed: boolean
}

/**
 * The 5e spell slots of the hero in the current sheet editor (SRD 5.2.1 pp. 104–106): the
 * shared slots per level and the Pact Magic slots, each pip tapped to spend or restore one,
 * and on a multiclass hero each spellcasting class's own attack, DC and highest spell level
 * (SRD 5.2.1 p. 25). Shared by the sheet's Spells panel and the battle board's hero column.
 */
export function useDnd5eSpellSlots() {
  const { draft, canEdit } = useSheet<Dnd5eSheet>()
  const sheet = computed(() => draft.value.sheet)
  const level = computed(() => draft.value.level)

  const levels = computed<Dnd5eSlotRow[]>(() => {
    const left = slotsLeft(sheet.value)
    return slotsMax(sheet.value)
      .map((max, i) => ({ level: i + 1, label: levelName(i + 1), max, left: left[i] ?? 0 }))
      .filter((r) => r.max > 0 || r.left > 0)
  })

  const pact = computed(() => {
    const p = sheet.value.castingStats?.pact
    if (!p || p.slots < 1) return null
    return {
      level: p.level,
      label: levelName(p.level),
      slots: p.slots,
      left: pactLeft(sheet.value),
    }
  })

  /** Tapping pip `n` of a level: a lit one spends down to it, an empty one restores up to it. */
  function toggleSlot(lvl: number, n: number) {
    if (!canEdit.value) return
    const max = slotsMax(sheet.value)[lvl - 1] ?? 0
    const left = slotsLeft(sheet.value)[lvl - 1] ?? 0
    const used = [...(sheet.value.slotsUsed ?? [])]
    while (used.length < 9) used.push(0)
    used[lvl - 1] = n <= left ? max - n + 1 : max - n
    sheet.value.slotsUsed = used
  }

  function togglePact(n: number) {
    const p = pact.value
    if (!canEdit.value || !p) return
    sheet.value.pactUsed = n <= p.left ? p.slots - n + 1 : p.slots - n
  }

  const casters = computed<Dnd5eCasterRow[]>(() =>
    (sheet.value.castingClasses ?? []).map((cc) => {
      const n = spellNumbers(sheet.value, level.value, { ability: cc.ability })
      return { cc, attack: n.attack, dc: n.dc, changed: n.dc !== cc.saveDc }
    }),
  )

  return { canEdit, levels, pact, toggleSlot, togglePact, casters }
}
