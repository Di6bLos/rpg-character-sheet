import type { Ref } from 'vue'
import { keyboardOpen } from '~/utils/boardLayout'

/** True while the on-screen keyboard is open (the visual viewport is 150px+ shorter). */
export function useKeyboardOpen(): Ref<boolean> {
  const open = ref(false)
  const viewport = typeof window === 'undefined' ? undefined : window.visualViewport
  if (!viewport) return open
  const update = () => {
    open.value = keyboardOpen(window.innerHeight, viewport.height, viewport.scale)
  }
  onMounted(() => {
    update()
    viewport.addEventListener('resize', update)
  })
  onBeforeUnmount(() => viewport.removeEventListener('resize', update))
  return open
}

/**
 * The visual viewport's height (what the on-screen keyboard leaves), or null without one.
 * The phone board fits itself to it while the keyboard is open, so the focused input
 * stays above the keyboard and the page never scrolls.
 */
export function useViewportHeight(): Ref<number | null> {
  const height = ref<number | null>(null)
  const viewport = typeof window === 'undefined' ? undefined : window.visualViewport
  if (!viewport) return height
  const update = () => {
    height.value = viewport.height
  }
  onMounted(() => {
    update()
    viewport.addEventListener('resize', update)
  })
  onBeforeUnmount(() => viewport.removeEventListener('resize', update))
  return height
}
