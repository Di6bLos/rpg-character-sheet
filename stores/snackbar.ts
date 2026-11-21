import { ref } from 'vue'
import { defineStore } from 'pinia'

export type ToastKind = 'success' | 'error' | 'info'

/** A button on the toast (Undo); clicking it runs `run` and closes the toast. */
export interface ToastAction {
  label: string
  run: () => void | Promise<void>
}

export const useSnackbarStore = defineStore('snackbar', () => {
  const visible = ref(false)
  const message = ref('')
  const kind = ref<ToastKind>('success')
  const action = ref<ToastAction | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined

  function show(msg: string, k: ToastKind = 'success', timeout = 3500, act?: ToastAction) {
    message.value = msg
    kind.value = k
    action.value = act ?? null
    visible.value = true
    clearTimeout(timer)
    timer = setTimeout(() => (visible.value = false), timeout)
  }

  /** Show an error toast from anything thrown. */
  function error(err: unknown, fallback = 'Something went wrong') {
    const msg = err instanceof Error ? err.message : (err as { message?: string })?.message
    show(msg || fallback, 'error', 5000)
  }

  function runAction() {
    const act = action.value
    visible.value = false
    action.value = null
    if (act) void act.run()
  }

  return { visible, message, kind, action, show, error, runAction }
})
