import type { InjectionKey, Ref } from 'vue'
import type { Pf2eCost } from '~/utils/pf2eAbilityRules'

/**
 * A spell the Attacks panel's Spells group offers (as Nimble's does): an attack spell or a
 * damage spell with a save, cast from the Spells panel that knows it. Its result shows where
 * the Spells panel shows it too (`key`).
 */
export interface Pf2eSpellAttack {
  key: string
  id: string
  name: string
  /** "Cantrip", "Rank 2", "Focus". */
  group: string
  cost?: Pf2eCost
  /** "Spell attack" or "basic Reflex", and what it deals. */
  line: string
  text: string
  why: string
  cast: () => void
  /** Manual dice: what the cast still needs typed, or ''; `typed` gives it. */
  prompt: string
  typed: (values: number[]) => void
}

const KEY: InjectionKey<Ref<Record<string, Pf2eSpellAttack[]>>> = Symbol('pf2e-spell-attacks')

/** The sheet holds the list; each Spells panel fills its own part (by panel id). */
export function providePf2eSpellAttacks() {
  const list = ref<Record<string, Pf2eSpellAttack[]>>({})
  provide(KEY, list)
  return list
}

export function usePf2eSpellAttacks(): Ref<Record<string, Pf2eSpellAttack[]>> {
  return inject(KEY, () => ref<Record<string, Pf2eSpellAttack[]>>({}), true)
}
