import type { InjectionKey, Ref } from 'vue'

/** The battle board's last action result, shared by the action panel and the phone's result bar. */
export interface BattleResult {
  /** The line the action panel shows ("Iriel: use Staff" with own dice). */
  text: Ref<string>
  /** The full text behind a shortened result (own dice), for its tooltip. */
  detail: Ref<string>
  /** Goes up with every result, so a repeat of the same line still counts as new. */
  seq: Ref<number>
  set: (text: string, detail?: string) => void
}

const KEY: InjectionKey<BattleResult> = Symbol('battle-result')

function create(): BattleResult {
  const text = ref('')
  const detail = ref('')
  const seq = ref(0)
  return {
    text,
    detail,
    seq,
    set(t, d = '') {
      text.value = t
      detail.value = d
      seq.value++
    },
  }
}

/**
 * Created once by HeroScope (reset when the hero changes), so the result
 * outlives a tab switch or a frame change (rotation) and every panel reads the same one.
 */
export function provideBattleResult(): BattleResult {
  const result = create()
  provide(KEY, result)
  return result
}

/** The board's shared result; a fresh one outside the battle board's hero editor. */
export function useBattleResult(): BattleResult {
  return inject(KEY, null) ?? create()
}
