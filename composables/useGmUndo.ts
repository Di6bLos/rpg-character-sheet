import type { InjectionKey, Ref } from 'vue'
import type { useInitiative } from '~/composables/useInitiative'

/**
 * The GM's last turn change on the battle board (Next turn, New round, Make active turn,
 * a turn passed when a hero ran out of actions), for the top bar's Undo. Each of those
 * also keeps its toast's Undo. It is forgotten once the turn moves any other way (Previous
 * turn, another GM tab), so Undo never puts back a turn from before that.
 */
export interface GmUndo {
  /** What Undo would take back ("Next turn"); empty when there is nothing. */
  label: Readonly<Ref<string>>
  set: (label: string, undo: () => Promise<void>) => void
  undo: () => Promise<void>
}

const KEY: InjectionKey<GmUndo> = Symbol('gm-undo')

/** Created once per battle board (View), beside the initiative it watches. */
export function provideGmUndo(init: ReturnType<typeof useInitiative>): GmUndo {
  const label = ref('')
  let run: (() => Promise<void>) | null = null
  /** The turn and round right after the change; any other turn ends the Undo. */
  let at = ''
  const where = () => `${init.turnId.value ?? ''}:${init.round.value}`

  function clear() {
    label.value = ''
    run = null
    at = ''
  }

  watch(where, (now) => {
    if (at && now !== at) clear()
  })

  const api: GmUndo = {
    label: readonly(label),
    set(name, undo) {
      label.value = name
      run = undo
      at = where()
    },
    async undo() {
      const job = run
      clear()
      await job?.()
    },
  }
  provide(KEY, api)
  return api
}

export function useGmUndo(): GmUndo | null {
  return inject(KEY, null)
}
