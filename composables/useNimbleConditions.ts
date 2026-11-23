import { AUTO_CONDITIONS, CONDITIONS } from '~/data/nimble/core'
import type { ConditionEnd, NimbleSheet } from '~/types/sheets'
import {
  END_LABELS,
  SPELL_STATUSES,
  addCondition,
  conditionMods,
  removeCondition,
  setConditionEnd,
} from '~/utils/nimbleConditions'
import { clearEffect, effectDef, endEffect } from '~/utils/nimbleEffects'
import { isBloodied } from '~/utils/nimblePlay'

const SPELL_NAMES = new Set(SPELL_STATUSES.map((s) => s.name))
const ENDS = Object.entries(END_LABELS) as [ConditionEnd | 'manual', string][]

/**
 * Conditions on the Nimble hero in the current sheet editor: every condition and
 * spell status with whether it is on (Bloodied, Dying and Wounded follow HP and
 * Wounds), the active ones with when they end, what they do, statuses from effects,
 * and toggling. Shared by the sheet's Conditions and the battle board's hero column.
 */
export function useNimbleConditions() {
  const { draft, canEdit } = useSheet<NimbleSheet>()
  const sheet = computed(() => draft.value.sheet)

  const auto = computed<Record<string, boolean>>(() => ({
    Bloodied: isBloodied(sheet.value),
    Dying: sheet.value.dying && sheet.value.hp === 0,
    Wounded: sheet.value.wounds > 0,
  }))

  const conditions = computed(() =>
    [...CONDITIONS, ...SPELL_STATUSES].map((c) => {
      const automatic = AUTO_CONDITIONS.includes(c.name)
      return {
        ...c,
        automatic,
        spell: SPELL_NAMES.has(c.name),
        on: automatic ? !!auto.value[c.name] : sheet.value.conditions.includes(c.name),
      }
    }),
  )
  const active = computed(() =>
    conditions.value
      .filter((c) => c.on)
      .map((c) => ({
        ...c,
        end: sheet.value.conditionEnds?.[c.name] ?? ('manual' as const),
        fromEffect: sheet.value.effects.some((e) => e.condition === c.name),
      })),
  )
  const effects = computed(() => {
    const m = conditionMods(sheet.value)
    return [
      ...m.notes.map((n) => `${n} on attacks and attack spells`),
      m.speedNote ? `${m.speedNote}${m.speed !== null ? ` (Speed ${m.speed})` : ''}` : '',
      m.incapacitated ? `${m.incapacitated}: you can’t attack or cast` : '',
      sheet.value.conditions.includes('Dazed')
        ? 'Dazed: you lose 1 action when your turn starts'
        : '',
    ].filter(Boolean)
  })

  function setEnd(name: string, end: ConditionEnd | 'manual') {
    if (canEdit.value) setConditionEnd(sheet.value, name, end)
  }
  const statuses = computed(() =>
    sheet.value.effects.map((e) => ({
      source: e.source,
      label: e.condition === e.source ? e.source : `${e.condition} (${e.source})`,
      until: effectDef(e.source)?.until ?? '',
    })),
  )

  function end(source: string) {
    if (canEdit.value) endEffect(sheet.value, source)
  }

  function toggle(name: string) {
    if (!canEdit.value) return
    if (sheet.value.conditions.includes(name)) {
      clearEffect(sheet.value, name)
      removeCondition(sheet.value, name)
    } else addCondition(sheet.value, name)
  }

  return { conditions, active, effects, statuses, setEnd, end, toggle, ENDS, END_LABELS }
}
