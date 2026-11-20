/**
 * The battle board's right column: whether the column is open (or collapsed sideways
 * to a rail) and whether its Party and Chat panels are open. Remembered per browser.
 */
interface RightState {
  column: boolean
  party: boolean
  chat: boolean
}

const KEY = 'lantern:battle-right'
const OPEN: RightState = { column: true, party: true, chat: true }

function load(): RightState {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<RightState> | null
    return { ...OPEN, ...(saved ?? {}) }
  } catch {
    return { ...OPEN }
  }
}

export function useBattleRight() {
  const state = useState<RightState>('battle-right', load)

  function set(patch: Partial<RightState>) {
    state.value = { ...state.value, ...patch }
    try {
      localStorage.setItem(KEY, JSON.stringify(state.value))
    } catch {
      // Not remembered this time (private window, blocked storage).
    }
  }

  return {
    state: readonly(state),
    toggleColumn: () => set({ column: !state.value.column }),
    toggleParty: () => set({ party: !state.value.party }),
    toggleChat: () => set({ chat: !state.value.chat }),
    /** Opens the column with the Party panel showing. */
    showParty: () => set({ column: true, party: true }),
    /** Opens the column with Chat showing (Whisper, the rail's Chat button). */
    showChat: () => set({ column: true, chat: true }),
  }
}
