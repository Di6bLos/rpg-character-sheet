import { ref } from 'vue'
import { defineStore } from 'pinia'

export type ToastKind = 'success' | 'error' | 'info'

export const useSnackbarStore = defineStore('snackbar', () => {
  const visible = ref(false)
  const message = ref('')
  const kind = ref<ToastKind>('success')
  let timer: ReturnType<typeof setTimeout> | undefined

  function show(msg: string, k: ToastKind = 'success', timeout = 3500) {
    message.value = msg
    kind.value = k
    visible.value = true
    clearTimeout(timer)
    timer = setTimeout(() => (visible.value = false), timeout)
  }

  /** Show an error toast from anything thrown. */
  function error(err: unknown, fallback = 'Something went wrong') {
    const msg = err instanceof Error ? err.message : (err as { message?: string })?.message
    show(msg || fallback, 'error', 5000)
  }

  return { visible, message, kind, show, error }
})
