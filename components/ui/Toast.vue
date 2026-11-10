<script setup lang="ts">
const snackbar = useSnackbarStore()
</script>

<template>
  <div class="toast-host" aria-live="polite" aria-atomic="true">
    <Transition name="toast">
      <div
        v-if="snackbar.visible"
        class="toast"
        :class="`toast--${snackbar.kind}`"
        :role="snackbar.kind === 'error' ? 'alert' : 'status'"
      >
        <span>{{ snackbar.message }}</span>
        <button type="button" aria-label="Dismiss" @click="snackbar.visible = false">×</button>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.toast-host {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 24px;
  display: flex;
  justify-content: center;
  padding: 0 16px;
  pointer-events: none;
  z-index: 200;
}

.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 560px;
  padding: 12px 12px 12px 18px;
  border-radius: 10px;
  background: var(--ok-bg);
  color: var(--ok-text);
  border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  font-size: 15px;

  &--error {
    background: var(--danger-bg);
    color: var(--danger-text);
  }

  &--info {
    background: var(--warn-bg);
    color: var(--warn-text);
  }

  button {
    flex: none;
    width: 32px;
    height: 32px;
    border: 0;
    background: none;
    font-size: 20px;
    line-height: 1;
    border-radius: 6px;
  }
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
