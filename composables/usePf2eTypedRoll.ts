import type { Pf2eSheet } from '~/types/sheets'
import { withTypedDice } from '~/utils/dice'

/** Panel state a roll changes beside the sheet (the Attacks panel's fortune, MAP step…). */
export interface Pf2eRollState {
  save: () => unknown
  load: (state: never) => void
}

/** Puts a plain copy back into the reactive sheet, key by key. */
function putBack(sheet: Pf2eSheet, copy: Pf2eSheet) {
  const live = sheet as unknown as Record<string, unknown>
  for (const k of Object.keys(live)) if (!(k in copy)) delete live[k]
  Object.assign(sheet, copy)
}

/**
 * Manual dice for PF2e rolls made inside the rules (an ability's check, Strikes and damage, a
 * spell's attack, damage and healing): with `profiles.own_dice` on, `run` plays the roll with
 * the player's dice (`withTypedDice`). When it needs more, the sheet goes back as it was and
 * `prompt(key)` asks for them ("2d6 you rolled"), a roll at a time; `submit` adds them and
 * plays it again from the start, so the app does the maths and the count is checked. Off, it
 * just runs. One per panel; `key` is the row or card whose entry shows the prompt.
 */
export function usePf2eTypedRoll(state?: Pf2eRollState) {
  const { draft, say } = useSheet<Pf2eSheet>()
  const auth = useAuthStore()
  const ownDice = computed(() => auth.profile?.own_dice ?? false)
  const pending = ref<{
    key: string
    label: string
    values: number[]
    need: { count: number; sides: number }
    fn: () => void
  } | null>(null)

  function attempt(key: string, label: string, fn: () => void, values: number[]) {
    const sheet = draft.value.sheet
    const copy = JSON.parse(JSON.stringify(sheet)) as Pf2eSheet
    const kept = state?.save()
    const back = () => {
      putBack(sheet, copy)
      if (state) state.load(kept as never)
    }
    try {
      const r = withTypedDice(values, fn)
      if (r.done) {
        pending.value = null
        return
      }
      back()
      pending.value = { key, label, values, need: r.need, fn }
    } catch (e) {
      back()
      pending.value = null
      say(`${label}: ${e instanceof Error ? e.message : 'those dice don’t fit'}. Roll it again.`)
    }
  }

  function run(key: string, label: string, fn: () => void) {
    if (!ownDice.value) return fn()
    attempt(key, label, fn, [])
  }

  function submit(values: number[]) {
    const p = pending.value
    if (p) attempt(p.key, p.label, p.fn, [...p.values, ...values])
  }

  /** What the entry under `key` asks for, or ''. */
  function prompt(key: string) {
    const p = pending.value
    if (!p || p.key !== key) return ''
    const { count, sides } = p.need
    return `${p.label}: ${count === 1 ? 'the' : count} d${sides}${count === 1 ? '' : 's'} you rolled${p.values.length ? `, after the ${p.values.length} typed` : ''}`
  }

  return { ownDice, run, submit, prompt, cancel: () => (pending.value = null) }
}
