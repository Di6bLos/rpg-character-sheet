/**
 * The battle board's left column (the hero, or the GM's stat block), sized by dragging
 * its right edge like the right column: its width, which snaps to closed (a thin rail)
 * when dragged narrow enough. Until dragged it keeps the default width for the viewer
 * (the GM's stat block is a little wider). Remembered per browser. On tablet-wide
 * (1024–1199px) it has its own default and dragged width (`wide`), so the desktop's stays
 * as it was; with touch there it is fixed at the default.
 */
import { WIDE_COLUMNS, clampWidth, columnWidth } from '~/utils/battleColumns'

interface LeftState {
  /** False: the column is closed to the rail. */
  column: boolean
  /** The open column's width in px on desktop; null: the default. */
  width: number | null
  /** The open column's width in px on tablet-wide with a mouse; null: the default. */
  wide: number | null
}

export const LEFT_WIDTH = { min: 240, max: 520, close: 140, player: 320, gm: 340 }

const KEY = 'lantern:battle-left'
const OPEN: LeftState = { column: true, width: null, wide: null }

const clamp = (v: number) => clampWidth(v, LEFT_WIDTH)
const clampWide = (v: number) => clampWidth(v, WIDE_COLUMNS.left)

function load(): LeftState {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<LeftState> | null
    return {
      column: saved?.column ?? OPEN.column,
      width: typeof saved?.width === 'number' ? clamp(saved.width) : OPEN.width,
      wide: typeof saved?.wide === 'number' ? clampWide(saved.wide) : OPEN.wide,
    }
  } catch {
    return { ...OPEN }
  }
}

export function useBattleLeft() {
  const state = useState<LeftState>('battle-left', load)
  const { layout, touch } = useBoardLayout()
  const wide = computed(() => layout.value === 'tablet-wide')

  function set(patch: Partial<LeftState>, save = true) {
    state.value = { ...state.value, ...patch }
    if (!save) return
    try {
      localStorage.setItem(KEY, JSON.stringify(state.value))
    } catch {
      // Not remembered this time (private window, blocked storage).
    }
  }

  /** The width patch for `px` in the current layout's own field. */
  const sized = (px: number): Partial<LeftState> =>
    wide.value ? { wide: clampWide(px) } : { width: clamp(px) }

  return {
    state: readonly(state),
    /** The drag bounds for the current layout. */
    bounds: computed(() => (wide.value ? WIDE_COLUMNS.left : LEFT_WIDTH)),
    /** The open width: the dragged one, else the default for the GM or a player. */
    widthFor: (gm: boolean) =>
      columnWidth({
        wide: wide.value,
        touch: touch.value,
        desktop: state.value.width,
        tabletWide: state.value.wide,
        desktopDefault: gm ? LEFT_WIDTH.gm : LEFT_WIDTH.player,
        wideDefault: WIDE_COLUMNS.left.width,
      }),
    /** `save: false` while dragging; the drop saves. */
    setColumn: (open: boolean, save = true) => set({ column: open }, save),
    /** Closes the column, remembering `width` for when it opens again. */
    closeAt: (width: number) => set({ column: false, ...sized(width) }),
    setWidth: (px: number, save = true) => set({ column: true, ...sized(px) }, save),
    save: () => set({}),
  }
}
