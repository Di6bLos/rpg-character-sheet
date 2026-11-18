<script setup lang="ts">
// Modal built on the native <dialog>: focus trapping, Esc and the top layer come for free.
const props = withDefaults(
  defineProps<{
    title: string
    width?: string
    alert?: boolean
    /** On phones, slide up from the bottom edge as a sheet instead of centring. */
    sheet?: boolean
  }>(),
  { width: '560px', alert: false, sheet: false },
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

function onClose() {
  if (!el.value?.open) open.value = false
}

function onBackdrop(event: MouseEvent) {
  if (event.target === el.value) open.value = false
}
</script>

<template>
  <dialog
    ref="el"
    class="dialog"
    :class="{ 'dialog--sheet': props.sheet }"
    :role="props.alert ? 'alertdialog' : undefined"
    :aria-labelledby="titleId"
    :style="{ '--dialog-width': props.width }"
    @close="onClose"
    @click="onBackdrop"
  >
    <div v-if="open" class="dialog__body panel">
      <span v-if="props.sheet" class="dialog__grip" aria-hidden="true" />
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

// --- Sheet variant ------------------------------------------------------------
.dialog__grip {
  display: none;
}

.dialog--sheet {
  &[open] .dialog__body {
    animation: dialog-rise 0.22s ease-out;
  }

  &[open]::backdrop {
    animation: dialog-fade 0.22s ease-out;
  }
}

@media (max-width: 560px) {
  .dialog--sheet {
    width: 100vw;
    max-width: 100vw;
    max-height: 88dvh;
    margin: auto 0 0;

    .dialog__body {
      max-height: 88dvh;
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
      border-bottom-width: 0;
      padding-bottom: calc(20px + env(safe-area-inset-bottom));
    }

    &[open] .dialog__body {
      animation: dialog-slide-up 0.28s cubic-bezier(0.22, 1, 0.36, 1);
    }

    .dialog__grip {
      display: block;
      flex: none;
      width: 40px;
      height: 4px;
      margin: -8px auto -8px;
      border-radius: 2px;
      background: currentColor;
      opacity: 0.25;
    }
  }
}

@keyframes dialog-fade {
  from {
    opacity: 0;
  }
}

@keyframes dialog-rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}

@keyframes dialog-slide-up {
  from {
    transform: translateY(100%);
  }
}
</style>
