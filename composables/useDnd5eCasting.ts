import type { InjectionKey } from 'vue'
import type { Dnd5eSpellDef } from '~/data/dnd5e/types'
import type { Dnd5eSheet, Dnd5eSpellRef } from '~/types/sheets'
import { showOutcome } from '~/utils/dice'
import { heal, payCost } from '~/utils/dnd5ePlay'
import {
  type Dnd5eCastOption,
  castOptions,
  castSpell,
  castWhy,
  damageLine,
  spellCost,
} from '~/utils/dnd5eSpells'

export interface Dnd5eCastingApi {
  /** The hero's spells, one per spell (a spell two features give shows once). */
  spells: ComputedRef<Dnd5eSpellRef[]>
  defOf: (slug: string) => Dnd5eSpellDef | undefined
  options: (ref: Dnd5eSpellRef) => Dnd5eCastOption[]
  /** The cast option picked for the spell (the upcast control), or the cheapest one left. */
  option: (ref: Dnd5eSpellRef) => Dnd5eCastOption | undefined
  choose: (ref: Dnd5eSpellRef, key: string) => void
  why: (ref: Dnd5eSpellRef) => string
  damage: (ref: Dnd5eSpellRef) => string
  cast: (ref: Dnd5eSpellRef) => void
  /** Healing the last cast rolled, offered to the caster ("Heal yourself"). */
  healed: Ref<{ key: string; amount: number } | null>
  healSelf: () => void
  typed: ReturnType<typeof useTypedRoll>
}

const KEY: InjectionKey<Dnd5eCastingApi> = Symbol('dnd5e-casting')

/**
 * Casting for the 5e sheet in the current sheet editor, shared by the Spells panel and the
 * Attacks panel's Spells group: the spells with their options (slots, pact slots, free casts,
 * rituals), the upcast picked per spell, why one can't be cast, and Cast (it pays the action
 * on the turn, then castSpell in utils/dnd5eSpells.ts rolls against the Target row). Manual dice
 * go through useTypedRoll; results show under the spell (`spell:<slug>`).
 */
export function provideDnd5eCasting(): Dnd5eCastingApi {
  const { draft, canEdit, say } = useSheet<Dnd5eSheet>()
  const { data, target, attackMode } = useDnd5eSheet()
  const { claim } = useResultOwner()
  const typed = useTypedRoll()
  const sheet = computed(() => draft.value.sheet)
  const level = computed(() => draft.value.level)
  const defs = computed(() => new Map((data.value?.spells ?? []).map((s) => [s.slug, s])))
  const defOf = (slug: string) => defs.value.get(slug)

  const spells = computed(() => {
    const seen = new Map<string, Dnd5eSpellRef>()
    for (const r of sheet.value.spells ?? []) {
      const had = seen.get(r.slug)
      if (!had || (had.book && !r.book) || (!had.free && r.free)) seen.set(r.slug, r)
    }
    return [...seen.values()]
  })

  const picked = ref<Record<string, string>>({})

  function options(ref: Dnd5eSpellRef) {
    const def = defOf(ref.slug)
    return def ? castOptions(sheet.value, level.value, ref, def) : []
  }

  function option(ref: Dnd5eSpellRef) {
    const all = options(ref)
    const chosen = all.find((o) => o.key === picked.value[ref.slug])
    if (chosen) return chosen
    return all.find((o) => o.left === undefined || o.left > 0) ?? all[0]
  }

  function choose(ref: Dnd5eSpellRef, key: string) {
    picked.value = { ...picked.value, [ref.slug]: key }
  }

  function why(ref: Dnd5eSpellRef) {
    const def = defOf(ref.slug)
    if (!def) return data.value ? 'Not in the spell data' : 'Loading…'
    return castWhy(sheet.value, def, option(ref))
  }

  function damage(ref: Dnd5eSpellRef) {
    const def = defOf(ref.slug)
    const opt = option(ref)
    return def && opt ? damageLine(sheet.value, level.value, ref, def, opt.level) : ''
  }

  const healed = ref<{ key: string; amount: number } | null>(null)

  function cast(ref: Dnd5eSpellRef) {
    const def = defOf(ref.slug)
    const opt = option(ref)
    if (!canEdit.value || !def || !opt) return
    const key = `spell:${ref.slug}`
    const stop = castWhy(sheet.value, def, opt)
    if (stop) return claim(key, () => say(`${def.name}: ${stop}.`))
    typed.run(key, def.name, () => {
      payCost(sheet.value, level.value, opt.kind === 'ritual' ? 'time' : spellCost(def))
      const r = castSpell(sheet.value, level.value, ref, def, opt, {
        target: target.value,
        mode: attackMode.value,
      })
      healed.value = r.healing ? { key, amount: r.healing } : null
      claim(key, () => say(r.line))
      showOutcome({ label: def.name, total: r.damage ?? r.healing, detail: r.line })
    })
    if (def.attack) attackMode.value = 'normal'
    if (opt.kind !== 'slot') delete picked.value[ref.slug]
  }

  function healSelf() {
    const h = healed.value
    if (!canEdit.value || !h) return
    healed.value = null
    claim(h.key, () => say(heal(sheet.value, h.amount)))
  }

  const api: Dnd5eCastingApi = {
    spells,
    defOf,
    options,
    option,
    choose,
    why,
    damage,
    cast,
    healed,
    healSelf,
    typed,
  }
  provide(KEY, api)
  return api
}

export function useDnd5eCasting(): Dnd5eCastingApi {
  const api = inject(KEY)
  if (!api) throw new Error('useDnd5eCasting() must be used inside the 5e sheet')
  return api
}
