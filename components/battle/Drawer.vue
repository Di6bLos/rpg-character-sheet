<script setup lang="ts">
// The tablet board's drawer (768–1279px): Party, Chat or Scribe, 360px wide from
// the right edge over the actions, on a dimmed backdrop. A modal <dialog>, as UiDialog:
// Escape, a tap on the backdrop and the ✕ close it, and closing hands focus back to what
// opened it. Its tabs switch between the panes without closing; only the open pane is
// mounted (`tab` in the default slot). The slide-in respects reduced motion.
import type { DrawerTab } from '~/composables/useBattleRight'

const props = defineProps<{ tabs: DrawerTab[] }>()
const tab = defineModel<DrawerTab | null>({ required: true })
defineSlots<{ default?: (props: { tab: DrawerTab }) => unknown }>()

const LABELS: Record<DrawerTab, string> = { party: 'Party', chat: 'Chat', scribe: '✦ Scribe' }

const el = ref<HTMLDialogElement | null>(null)
const uid = useId()

watch(
  [tab, el],
  ([open, dialog]) => {
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // Focus the tab it opened on (Chat, Scribe), not the first one in the list. Whisper
      // then moves focus on into the message box.
      nextTick(() => document.getElementById(`${uid}-${open}`)?.focus())
    } else if (!open && dialog.open) dialog.close()
  },
  { immediate: true },
)

/** Escape (the dialog's own cancel) closes it. */
function onClose() {
  if (!el.value?.open) tab.value = null
}

function onBackdrop(event: MouseEvent) {
  if (event.target === el.value) tab.value = null
}

function onKey(event: KeyboardEvent) {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
  const at = tab.value ? props.tabs.indexOf(tab.value) : -1
  if (at < 0) return
  event.preventDefault()
  const step = event.key === 'ArrowRight' ? 1 : -1
  const next = props.tabs[(at + step + props.tabs.length) % props.tabs.length]
  if (!next) return
  tab.value = next
  nextTick(() => document.getElementById(`${uid}-${next}`)?.focus())
}
</script>

<template>
  <dialog
    ref="el"
    class="drawer"
    :aria-label="tab ? LABELS[tab].replace('✦ ', '') : 'Party and chat'"
    data-track-area="Drawer"
    @close="onClose"
    @click="onBackdrop"
  >
    <div v-if="tab" class="drawer__body">
      <header class="drawer__head">
        <div
          role="tablist"
          aria-label="Party, chat or Scribe"
          class="drawer__tabs"
          @keydown="onKey"
        >
          <button
            v-for="t in tabs"
            :id="`${uid}-${t}`"
            :key="t"
            type="button"
            role="tab"
            :aria-selected="t === tab"
            :aria-controls="`${uid}-pane`"
            :tabindex="t === tab ? 0 : -1"
            @click="tab = t"
          >
            {{ LABELS[t] }}
          </button>
        </div>
        <button type="button" class="drawer__close" aria-label="Close" @click="tab = null">
          ✕
        </button>
      </header>
      <div
        :id="`${uid}-pane`"
        class="drawer__pane"
        role="tabpanel"
        :aria-labelledby="`${uid}-${tab}`"
      >
        <slot :tab="tab" />
      </div>
    </div>
  </dialog>
</template>

<style scoped lang="scss">
.drawer {
  position: fixed;
  inset: 0 0 0 auto;
  width: min(360px, 100vw);
  max-width: 100vw;
  height: 100dvh;
  max-height: 100dvh;
  margin: 0;
  padding: 0;
  border: 0;
  border-left: 1px solid var(--line-strong);
  // Opaque in every theme: the page's own base colour.
  background: var(--page-base);
  color: var(--page-text);
  box-shadow: -18px 0 40px rgba(0, 0, 0, 0.45);
  overflow: hidden;

  &::backdrop {
    background: rgba(5, 4, 3, 0.6);
  }

  &[open] {
    animation: drawer-in 0.24s cubic-bezier(0.22, 1, 0.36, 1);
  }

  &[open]::backdrop {
    animation: drawer-fade 0.24s ease-out;
  }
}

.drawer__body {
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: calc(10px + env(safe-area-inset-top)) calc(12px + env(safe-area-inset-right))
    calc(12px + env(safe-area-inset-bottom)) 12px;
}

.drawer__head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
}

.drawer__tabs {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
  background: var(--inset);

  button {
    flex: 1 1 0;
    min-width: 0;
    min-height: 44px;
    padding: 0 10px;
    border: 0;
    border-radius: 999px;
    background: none;
    font-family: var(--font-heading);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--page-muted);
    white-space: nowrap;

    // Page text on a light accent wash stays readable on every theme.
    &[aria-selected='true'] {
      background: color-mix(in srgb, var(--accent) 24%, transparent);
      color: var(--page-text);
    }

    &:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }
  }
}

.drawer__close {
  flex: none;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  background: var(--inset);
  color: var(--page-text);
  font-size: 16px;

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
}

// The pane fills the rest; Chat and Scribe scroll their own message lists, the party
// list scrolls here.
.drawer__pane {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--line-strong) transparent;
}

@keyframes drawer-in {
  from {
    transform: translateX(100%);
  }
}

@keyframes drawer-fade {
  from {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .drawer[open],
  .drawer[open]::backdrop {
    animation: none;
  }
}
</style>
