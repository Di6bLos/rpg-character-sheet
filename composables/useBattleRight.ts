/**
 * The battle board's right column, sized by dragging (no buttons): its width, which
 * snaps to closed (a thin rail) when dragged narrow enough, and how it is shared
 * between Party (top) and Chat (bottom). `split` is the Party's share: 0 closes the
 * Party to its header line, 1 closes Chat to a strip with the missed messages.
 * Remembered per browser. On a tablet in portrait there is no right column: Party, Chat and
 * Scribe open one at a time in a drawer (`drawer`, not remembered).
 */
interface RightState {
  /** False: the column is closed to the rail. */
  column: boolean
  /** The open column's width in px. */
  width: number
  split: number
}

export const RIGHT_WIDTH = { min: 260, max: 600, initial: 340, close: 160 }
export const RIGHT_SPLIT = { initial: 0.5 }
/** A panel dragged smaller than this closes. */
export const RIGHT_CLOSE_PX = 72

/** The tablet drawer's tabs. */
export type DrawerTab = 'party' | 'chat' | 'scribe'

const KEY = 'lantern:battle-right'
const OPEN: RightState = { column: true, width: RIGHT_WIDTH.initial, split: RIGHT_SPLIT.initial }

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

function load(): RightState {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<RightState> | null
    return {
      column: saved?.column ?? OPEN.column,
      width: typeof saved?.width === 'number' ? saved.width : OPEN.width,
      split: typeof saved?.split === 'number' ? clamp(saved.split, 0, 1) : OPEN.split,
    }
  } catch {
    return { ...OPEN }
  }
}

export function useBattleRight() {
  const state = useState<RightState>('battle-right', load)
  const drawer = useState<DrawerTab | null>('battle-drawer', () => null)
  const { layout } = useBoardLayout()

  function set(patch: Partial<RightState>, save = true) {
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
    partyClosed: computed(() => state.value.split <= 0),
    chatClosed: computed(() => state.value.split >= 1),
    /** The tablet drawer's open tab; null while it is closed. */
    drawer: readonly(drawer),
    /** Opens the tablet drawer on `tab`, or closes it (null). */
    openDrawer: (tab: DrawerTab | null) => {
      drawer.value = tab
    },
    /**
     * Opens the column with Chat showing (Whisper, a click on a closed Chat); on a tablet
     * in portrait, the drawer on Chat.
     */
    showChat: () => {
      if (layout.value === 'tablet') {
        drawer.value = 'chat'
        return
      }
      set({
        column: true,
        split: state.value.split >= 1 ? RIGHT_SPLIT.initial : state.value.split,
      })
    },
    /** `save: false` while dragging; the drop saves. */
    setColumn: (open: boolean, save = true) => set({ column: open }, save),
    /** Closes the column, remembering `width` for when it opens again. */
    closeAt: (width: number) =>
      set({ column: false, width: Math.round(clamp(width, RIGHT_WIDTH.min, RIGHT_WIDTH.max)) }),
    setWidth: (px: number, save = true) =>
      set({ column: true, width: Math.round(clamp(px, RIGHT_WIDTH.min, RIGHT_WIDTH.max)) }, save),
    setSplit: (share: number, save = true) => set({ split: clamp(share, 0, 1) }, save),
    save: () => set({}),
  }
}
