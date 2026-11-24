import { getCurrentScope, onScopeDispose } from 'vue'
import { LONG_PRESS_MS, LONG_PRESS_SLOP } from '~/utils/boardLayout'

/** How long the click and contextmenu guards outlive the finger lifting. */
const RELEASE_MS = 400

/**
 * Long-press for touch: `onPress` runs when a finger stays down for 500ms without moving
 * more than 8px. Bind the four handlers to the element. `enabled` (checked on pointerdown)
 * says whether the press does anything; when it doesn't, the browser's own menu and the
 * tap work as usual. When it does, from pointerdown the native `contextmenu` is blocked
 * (Android fires it at about the same moment as the timer), and once the press has fired
 * the click that ends the touch is swallowed, however long the finger stays down.
 */
export function useLongPress(
  onPress: (el: HTMLElement) => void,
  enabled: () => boolean = () => true,
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let release: ReturnType<typeof setTimeout> | undefined
  let origin: { x: number; y: number } | null = null
  let fired = false
  let armed = false

  const stopMenu = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
  }
  const stopClick = (e: Event) => {
    if (!fired) return
    e.preventDefault()
    e.stopPropagation()
    disarm()
  }

  function arm() {
    if (armed) return
    armed = true
    window.addEventListener('contextmenu', stopMenu, { capture: true })
    window.addEventListener('click', stopClick, { capture: true })
  }

  function disarm() {
    clearTimeout(release)
    release = undefined
    fired = false
    if (!armed) return
    armed = false
    window.removeEventListener('contextmenu', stopMenu, { capture: true })
    window.removeEventListener('click', stopClick, { capture: true })
  }

  function cancel() {
    clearTimeout(timer)
    timer = undefined
    origin = null
  }

  function onPointerdown(e: PointerEvent) {
    if (e.pointerType === 'mouse') return
    cancel()
    disarm()
    if (!enabled()) return
    const el = e.currentTarget as HTMLElement
    origin = { x: e.clientX, y: e.clientY }
    arm()
    timer = setTimeout(() => {
      cancel()
      fired = true
      onPress(el)
    }, LONG_PRESS_MS)
  }

  function onPointermove(e: PointerEvent) {
    if (!origin) return
    if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > LONG_PRESS_SLOP) {
      cancel()
      disarm()
    }
  }

  function onPointerup() {
    cancel()
    // The click (and a late contextmenu) follows the lift at once; drop the guards after.
    if (armed) release = setTimeout(disarm, RELEASE_MS)
  }

  function onPointercancel() {
    cancel()
    disarm()
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      cancel()
      disarm()
    })
  }

  return { onPointerdown, onPointermove, onPointerup, onPointercancel }
}
