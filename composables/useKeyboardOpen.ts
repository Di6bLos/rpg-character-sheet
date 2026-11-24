import type { Ref } from 'vue'
import { keyboardOpen } from '~/utils/boardLayout'

/** True while the on-screen keyboard is open (the visual viewport is 150px+ shorter). */
export function useKeyboardOpen(): Ref<boolean> {
  const open = ref(false)
  const viewport = typeof window === 'undefined' ? undefined : window.visualViewport
  if (!viewport) return open
  const update = () => {
    open.value = keyboardOpen(window.innerHeight, viewport.height)
  }
  onMounted(() => {
    update()
    viewport.addEventListener('resize', update)
  })
  onBeforeUnmount(() => viewport.removeEventListener('resize', update))
  return open
}
