import type { Pf2eConditionEnd, Pf2eSheet } from '~/types/sheets'
import {
  endOnUnconscious,
  GIVEN_EFFECTS,
  activeEffects,
  ownEffects,
  setGiven,
  speedNow,
} from '~/utils/pf2eEffects'
import {
  PF2E_AUTO_ENDS,
  PF2E_CONDITION_DEFS,
  PF2E_END_LABELS,
  activeConditions,
  conditionValue,
  pf2eConditionSummary,
  setPf2eConditionEnd,
} from '~/utils/pf2ePlay'

const ENDS = Object.entries(PF2E_END_LABELS) as [Pf2eConditionEnd | 'manual', string][]

/**
 * Conditions on the PF2e hero in the current sheet editor (Player Core pp. 442–447): every
 * condition with whether it's on, its value (frightened 2) and those another gives (prone →
 * off-guard); the active ones with what they do and when they end (frightened counts itself
 * down); what they do to the numbers; and the effects allies give (Bless, Heroism +2).
 */
export function usePf2eConditions() {
  const { draft, canEdit, say } = useSheet<Pf2eSheet>()
  const sheet = computed(() => draft.value.sheet)

  const implied = computed(() => {
    const on = activeConditions(sheet.value)
    return new Set([...on].filter((c) => !sheet.value.conditions.includes(c)))
  })

  /** "Frightened 2" for a valued condition that's on; stunned for a duration has no value. */
  function labelOf(name: string, valued?: boolean) {
    const s = sheet.value
    if (!valued || !s.conditions.includes(name)) return name
    if (name === 'Stunned' && s.conditionValues?.Stunned === undefined) return name
    return `${name} ${conditionValue(s, name)}`
  }

  const chips = computed(() =>
    PF2E_CONDITION_DEFS.map((c) => {
      const on = sheet.value.conditions.includes(c.name)
      return {
        name: c.name,
        label: labelOf(c.name, c.valued),
        on,
        implied: implied.value.has(c.name),
        stepper: !!c.valued && on,
        title: implied.value.has(c.name) ? `${c.effect} (from another condition)` : c.effect,
      }
    }),
  )

  const active = computed(() =>
    PF2E_CONDITION_DEFS.filter((c) => sheet.value.conditions.includes(c.name)).map((c) => {
      const value = conditionValue(sheet.value, c.name)
      return {
        name: c.name,
        label: labelOf(c.name, c.valued),
        desc: c.valued ? c.effect.replace(/\bX\b/g, String(value)) : c.effect,
        end: sheet.value.conditionEnds?.[c.name] ?? 'manual',
        ...(PF2E_AUTO_ENDS[c.name] ? { auto: PF2E_AUTO_ENDS[c.name] } : {}),
        ...(sheet.value.conditionsLocked?.includes(c.name)
          ? { auto: 'For a week, from Resurrect (p. 394).' }
          : {}),
      }
    }),
  )

  const effects = computed(() =>
    pf2eConditionSummary(sheet.value, speedNow(sheet.value, draft.value.level)),
  )

  function toggle(name: string) {
    if (!canEdit.value) return
    const s = sheet.value
    if (s.conditions.includes(name)) {
      s.conditions = s.conditions.filter((c) => c !== name)
      if (s.conditionValues) delete s.conditionValues[name]
      if (s.conditionEnds?.[name]) setPf2eConditionEnd(s, name, 'manual')
      if (s.conditionsLocked?.includes(name))
        s.conditionsLocked = s.conditionsLocked.filter((c) => c !== name)
      return
    }
    s.conditions = [...s.conditions, name]
    // Stunned without a value lasts a duration and takes every action (p. 446): the chip gives 1.
    if (name === 'Stunned') s.conditionValues = { ...s.conditionValues, Stunned: 1 }
    // Falling unconscious ends Rage (Player Core 2 p. 72).
    const ended = name === 'Unconscious' ? endOnUnconscious(s) : ''
    if (ended) say(ended)
  }

  function step(name: string, by: number) {
    if (!canEdit.value) return
    const s = sheet.value
    const next = conditionValue(s, name) + by
    if (next < 1) return toggle(name)
    s.conditionValues = { ...s.conditionValues, [name]: Math.min(9, next) }
  }

  function setEnd(name: string, end: Pf2eConditionEnd | 'manual') {
    if (canEdit.value) setPf2eConditionEnd(sheet.value, name, end)
  }

  // Effects allies give fold away (about 25), showing only those on you, until opened.
  const given = computed(() => new Map((sheet.value.effects?.given ?? []).map((g) => [g.name, g])))
  const alliesOpen = ref(false)
  const shownGiven = computed(() =>
    alliesOpen.value ? GIVEN_EFFECTS : GIVEN_EFFECTS.filter((e) => given.value.has(e.name)),
  )

  function giveToggle(name: string, values?: number[]) {
    if (canEdit.value) setGiven(sheet.value, name, !given.value.has(name), values?.[0])
  }

  function setValue(name: string, value: number) {
    if (canEdit.value) setGiven(sheet.value, name, true, value)
  }

  /** Always-on abilities, and those that count while a toggle is on (Hunt Prey's edge). */
  const own = computed(() => ownEffects(sheet.value))
  const always = computed(() => own.value.filter((e) => e.mode === 'permanent' && !e.requires))
  const withToggle = computed(() => {
    const by = new Map<string, string[]>()
    for (const e of own.value.filter((x) => x.mode === 'permanent' && x.requires))
      by.set(e.requires!, [...(by.get(e.requires!) ?? []), e.name])
    return [...by.entries()]
  })
  /** What allies' effects that are on do, as their notes say. */
  const givenNotes = computed(() =>
    activeEffects(sheet.value)
      .filter((a) => a.def.mode === 'given' && a.def.note)
      .map((a) => `${a.def.name.replace(' (ally)', '')}: ${a.def.note}`),
  )

  return {
    chips,
    active,
    effects,
    toggle,
    step,
    setEnd,
    ENDS,
    given,
    alliesOpen,
    shownGiven,
    giveToggle,
    setValue,
    always,
    withToggle,
    givenNotes,
  }
}
