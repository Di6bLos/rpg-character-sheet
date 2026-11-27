import type { InjectionKey, ShallowRef } from 'vue'
import { type Dnd5eData, loadDnd5e } from '~/data/dnd5e'
import type { Dnd5eSheet } from '~/types/sheets'
import type { Dnd5eColumns, Dnd5eTarget } from '~/utils/dnd5eAttacks'
import { DND5E_BUILD_SETS, type Dnd5eBuildData, walkDnd5e } from '~/utils/dnd5eBuild'
import { type Dnd5eEntry, heroColumns, heroEntries } from '~/utils/dnd5eFeatures'
import { isBuiltDnd5e } from '~/utils/dnd5eLevelUp'
import { acNow, type D20Mode } from '~/utils/dnd5ePlay'
import type { Dnd5eLastRoll } from '~/utils/dnd5eRerolls'

/** The data sets the 5e sheet plays from (magic items load when the inventory asks). */
const SETS = [...DND5E_BUILD_SETS, 'masteries', 'conditions'] as const
type SheetData = Pick<Dnd5eData, (typeof SETS)[number]>

export interface Dnd5eSheetApi {
  /** The data, once loaded (null until then, or when it failed: the sheet still works from what it holds). */
  data: ShallowRef<SheetData | null>
  /** Each class's table columns at that class's level ("Rage Damage", "Sneak Attack"). */
  columns: ComputedRef<Dnd5eColumns>
  /** Every feature, trait, feat and option as a usable entry. */
  entries: ComputedRef<Dnd5eEntry[]>
  /** What the Target row knows (the Attacks and Spells panels share it). */
  target: Ref<Dnd5eTarget>
  /** Advantage or Disadvantage the table calls for the next attack (cleared after it and each turn). */
  attackMode: Ref<D20Mode>
  /** The build walked to the hero's level, for AC from worn gear (null for a hand-made hero). */
  build: ComputedRef<ReturnType<typeof walkDnd5e>>
  /** The D20 Test just rolled, for the rerolls and boosts offered under it. */
  lastRoll: Ref<Dnd5eLastRoll | null>
}

/** The 5e sheet's shared data and state (provideDnd5eSheet); the battle board provides it too. */
export const DND5E_SHEET: InjectionKey<Dnd5eSheetApi> = Symbol('dnd5e-sheet')

/**
 * Loads the 5e data for the sheet in the current sheet editor and provides what its panels
 * share: the class columns, the feature entries, the Target row and the attack's odds. Saves the
 * hero's AC now as `currentAc` when it or the base AC changes, never on load.
 */
export function provideDnd5eSheet(): Dnd5eSheetApi {
  const { draft, canEdit } = useSheet<Dnd5eSheet>()
  const data = shallowRef<SheetData | null>(null)
  onMounted(async () => {
    try {
      const sets = await Promise.all(SETS.map((k) => loadDnd5e(k)))
      data.value = Object.fromEntries(SETS.map((k, i) => [k, sets[i]])) as unknown as SheetData
    } catch {
      // The panels fall back to what the sheet holds (typed weapons, feature text).
    }
  })
  const sheet = computed(() => draft.value.sheet)
  const level = computed(() => draft.value.level)
  const columns = computed<Dnd5eColumns>(() => heroColumns(sheet.value, level.value, data.value))
  const entries = computed(() => heroEntries(sheet.value, level.value, data.value, columns.value))
  const build = computed(() => {
    const s = sheet.value
    if (!data.value || !isBuiltDnd5e(s) || !s.creation) return null
    return walkDnd5e(
      { creation: s.creation, choices: s.choices ?? {} },
      level.value,
      data.value as Dnd5eBuildData,
      s.abilities,
    )
  })
  watch([() => acNow(sheet.value, level.value).value, () => sheet.value.ac], ([value, base]) => {
    const now = sheet.value.currentAc
    if (canEdit.value && (now?.value !== value || now.base !== base))
      sheet.value.currentAc = { value, base }
  })
  const id = draft.value.id
  const target = useState<Dnd5eTarget>(`dnd5e-target-${id}`, () => ({ ac: null }))
  const attackMode = useState<D20Mode>(`dnd5e-odds-${id}`, () => 'normal')
  const lastRoll = shallowRef<Dnd5eLastRoll | null>(null)
  const api: Dnd5eSheetApi = { data, columns, entries, target, attackMode, build, lastRoll }
  provide(DND5E_SHEET, api)
  return api
}

export function useDnd5eSheet(): Dnd5eSheetApi {
  const api = inject(DND5E_SHEET)
  if (!api) throw new Error('useDnd5eSheet() must be used inside the 5e sheet')
  return api
}
