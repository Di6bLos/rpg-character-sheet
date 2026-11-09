<script setup lang="ts">
// Modal built on the native <dialog>: focus trapping, Esc and the top layer come for free.
const props = withDefaults(
  defineProps<{
    title: string
    width?: string
    alert?: boolean
  }>(),
  { width: '560px', alert: false },
)

const open = defineModel<boolean>({ required: true })
const el = ref<HTMLDialogElement | null>(null)
const titleId = useId()

watch(
  [open, el],
  ([isOpen, dialog]) => {
    if (!dialog) return
    if (isOpen && !dialog.open) dialog.showModal()
    else if (!isOpen && dialog.open) dialog.close()
  },
  { immediate: true },
)

function onBackdrop(event: MouseEvent) {
  if (event.target === el.value) open.value = false
}
</script>

<template>
  <dialog
    ref="el"
    class="dialog"
    :role="props.alert ? 'alertdialog' : undefined"
    :aria-labelledby="titleId"
    :style="{ '--dialog-width': props.width }"
    @close="open = false"
    @click="onBackdrop"
  >
    <div v-if="open" class="dialog__body panel">
      <header class="dialog__head">
        <div class="grow">
          <slot name="eyebrow" />
          <h2 :id="titleId">{{ title }}</h2>
        </div>
        <button
          type="button"
          class="btn btn--ghost btn--icon"
          aria-label="Close"
          @click="open = false"
        >
          ×
        </button>
      </header>
      <div class="dialog__scroll">
        <slot />
      </div>
      <footer v-if="$slots.actions" class="dialog__actions">
        <slot name="actions" />
      </footer>
    </div>
  </dialog>
</template>

<style scoped lang="scss">
.dialog {
  width: min(var(--dialog-width), calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  overflow: visible;

  &::backdrop {
    background: rgba(5, 4, 3, 0.72);
    backdrop-filter: blur(2px);
  }
}

.dialog__body {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: calc(100dvh - 32px);
  overflow: hidden;
}

.dialog__scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
  // Room for focus rings, which the scroll container would otherwise clip.
  margin: -4px;
  padding: 4px;
}

.dialog__head,
.dialog__actions {
  flex: none;
}

.dialog__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;

  h2 {
    font-size: 24px;
  }
}

.dialog__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px;
}
</style>
