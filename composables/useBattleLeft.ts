/**
 * The battle board's left column (the hero, or the GM's stat block), sized by dragging
 * its right edge like the right column: its width, which snaps to closed (a thin rail)
 * when dragged narrow enough. Until dragged it keeps the default width for the viewer
 * (the GM's stat block is a little wider). Remembered per browser.
 */
interface LeftState {
  /** False: the column is closed to the rail. */
  column: boolean
  /** The open column's width in px; null: the default. */
  width: number | null
}

export const LEFT_WIDTH = { min: 240, max: 520, close: 140, player: 320, gm: 340 }

const KEY = 'lantern:battle-left'
const OPEN: LeftState = { column: true, width: null }

const clamp = (v: number) => Math.round(Math.min(LEFT_WIDTH.max, Math.max(LEFT_WIDTH.min, v)))

function load(): LeftState {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<LeftState> | null
    return {
      column: saved?.column ?? OPEN.column,
      width: typeof saved?.width === 'number' ? clamp(saved.width) : OPEN.width,
    }
  } catch {
    return { ...OPEN }
  }
}

export function useBattleLeft() {
  const state = useState<LeftState>('battle-left', load)

  function set(patch: Partial<LeftState>, save = true) {
    state.value = { ...state.value, ...patch }
    if (!save) return
    try {
      localStorage.setItem(KEY, JSON.stringify(state.value))
    } catch {
      // Not remembered this time (private window, blocked storage).
    }
  }

  return {
    state: readonly(state),
    /** The open width: the dragged one, else the default for the GM or a player. */
    widthFor: (gm: boolean) => state.value.width ?? (gm ? LEFT_WIDTH.gm : LEFT_WIDTH.player),
    /** `save: false` while dragging; the drop saves. */
    setColumn: (open: boolean, save = true) => set({ column: open }, save),
    /** Closes the column, remembering `width` for when it opens again. */
    closeAt: (width: number) => set({ column: false, width: clamp(width) }),
    setWidth: (px: number, save = true) => set({ column: true, width: clamp(px) }, save),
    save: () => set({}),
  }
}
