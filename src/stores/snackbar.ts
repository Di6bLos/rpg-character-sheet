import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useSnackbarStore = defineStore('snackbar', () => {
  const visible = ref(false)
  const message = ref('')
  const color = ref('success')
  const timeout = ref(3000)

  function show(msg: string, c = 'success', t = 3000) {
    message.value = msg
    color.value = c
    timeout.value = t
    visible.value = true
  }

  return { visible, message, color, timeout, show }
})
