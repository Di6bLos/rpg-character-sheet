import { LONG_PRESS_MS, LONG_PRESS_SLOP } from '~/utils/boardLayout'

/**
 * Long-press for touch: `onPress` runs when a finger stays down for 500ms without moving
 * more than 8px. Bind the four handlers to the element. The `contextmenu` and `click` that
 * follow a long-press are swallowed once, so the browser's own menu and the tap action
 * stay quiet.
 */
export function useLongPress(onPress: (el: HTMLElement) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let origin: { x: number; y: number } | null = null

  function clear() {
    clearTimeout(timer)
    timer = undefined
    origin = null
  }

  function swallow() {
    const stop = (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
    }
    const off = () => {
      window.removeEventListener('contextmenu', stop, true)
      window.removeEventListener('click', onClick, true)
      clearTimeout(expire)
    }
    const onClick = (e: Event) => {
      stop(e)
      off()
    }
    const expire = setTimeout(off, 800)
    window.addEventListener('contextmenu', stop, true)
    window.addEventListener('click', onClick, true)
  }

  function onPointerdown(e: PointerEvent) {
    if (e.pointerType === 'mouse') return
    clear()
    const el = e.currentTarget as HTMLElement
    origin = { x: e.clientX, y: e.clientY }
    timer = setTimeout(() => {
      clear()
      swallow()
      onPress(el)
    }, LONG_PRESS_MS)
  }

  function onPointermove(e: PointerEvent) {
    if (!origin) return
    if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > LONG_PRESS_SLOP) clear()
  }

  return { onPointerdown, onPointermove, onPointerup: clear, onPointercancel: clear }
}
