// The 3D dice preferences, kept per browser: whether the dice tray animates the app's
// rolls and how fast the dice tumble. Shared by the tray's "Don't animate dice" box
// and Settings, so both always show the same choice.

const SKIP_KEY = 'lantern-dice-skip'
const SPEED_KEY = 'lantern-dice-speed'

export const DICE_SPEED = { min: 0.5, max: 3, step: 0.25, initial: 1 } as const

const animate = ref(true)
const speed = ref<number>(DICE_SPEED.initial)
let loaded = false

function clampSpeed(n: number): number {
  if (!Number.isFinite(n)) return DICE_SPEED.initial
  return Math.min(DICE_SPEED.max, Math.max(DICE_SPEED.min, n))
}

function load() {
  if (loaded || !import.meta.client) return
  loaded = true
  try {
    animate.value = localStorage.getItem(SKIP_KEY) !== '1'
    const saved = localStorage.getItem(SPEED_KEY)
    if (saved !== null) speed.value = clampSpeed(Number(saved))
  } catch {
    // Private windows can refuse storage; the defaults hold.
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // The choice still holds for this visit.
  }
}

export function useDiceAnimation() {
  load()
  return {
    animate: readonly(animate),
    speed: readonly(speed),
    setAnimate(on: boolean) {
      animate.value = on
      store(SKIP_KEY, on ? '0' : '1')
    },
    setSpeed(n: number) {
      speed.value = clampSpeed(n)
      store(SPEED_KEY, String(speed.value))
    },
  }
}

/** "1×", "1.5×", "0.75×". */
export function speedLabel(n: number): string {
  return `${Number(n.toFixed(2))}×`
}
