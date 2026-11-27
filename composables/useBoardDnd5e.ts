import type { InjectionKey, ShallowRef } from 'vue'
import { DND5E_CASTING, type Dnd5eCastingApi } from '~/composables/useDnd5eCasting'
import { DND5E_SHEET, type Dnd5eSheetApi } from '~/composables/useDnd5eSheet'

/** What the 5e sheet's panels share, made once per hero editor on the battle board. */
export interface BoardDnd5e {
  sheet: Dnd5eSheetApi
  casting: Dnd5eCastingApi
}

/** The current hero's 5e sheet state, set by BattleDnd5eApis and read through HeroScope. */
export const BOARD_DND5E: InjectionKey<ShallowRef<BoardDnd5e | null>> = Symbol('board-dnd5e')

/** An object that reads through to `get()`'s current value (see provideBoardHero). */
function forward<T extends object>(get: () => T | null | undefined, name: string): T {
  return new Proxy({} as T, {
    get: (_target, key) => {
      const api = get()
      if (api) return Reflect.get(api, key)
      if (typeof key !== 'string' || key.startsWith('__v') || key === 'then') return undefined
      throw new Error(`${name}(): no 5e hero yet (read "${key}" outside \`v-if="hero"\`)`)
    },
  })
}

/**
 * HeroScope's stable 5e provider, beside provideBoardHero: the 5e sheet data and casting live
 * in BattleDnd5eApis (under HeroEditor, which holds the editor they read), and the board's 5e
 * parts reach them through useDnd5eSheet() and useDnd5eCasting() as the sheet's panels do.
 * HeroScope mounts those parts only once the current hero's are set.
 */
export function provideBoardDnd5e(): ShallowRef<BoardDnd5e | null> {
  const current = shallowRef<BoardDnd5e | null>(null)
  provide(BOARD_DND5E, current)
  provide(
    DND5E_SHEET,
    forward(() => current.value?.sheet, 'useDnd5eSheet'),
  )
  provide(
    DND5E_CASTING,
    forward(() => current.value?.casting, 'useDnd5eCasting'),
  )
  return current
}

/**
 * Makes the 5e sheet state for the hero editor above (the data, Target row, odds and casting,
 * as the 5e sheet does) and hands it to HeroScope. Call once, in BattleDnd5eApis.
 */
export function hostBoardDnd5e(): void {
  const sheet = provideDnd5eSheet()
  const casting = provideDnd5eCasting(sheet)
  const host = inject(BOARD_DND5E, null)
  if (!host) return
  host.value = { sheet, casting }
  onBeforeUnmount(() => {
    if (host.value?.sheet === sheet) host.value = null
  })
}
