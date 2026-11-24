<script setup lang="ts">
// The phone board's bottom tabs (utils/boardLayout's phoneTabs for the viewer's role),
// each an icon over its label, 62px tall plus the bottom safe area. Chat carries the same
// unread badge as the battle board's Chat tab (useChatBadge).
import type { PhoneTab } from '~/utils/boardLayout'
import { plural } from '~/utils/format'

const props = defineProps<{
  tabs: PhoneTab[]
  /** The content panel the tabs control (aria-controls). */
  panelId: string
}>()
const tab = defineModel<PhoneTab>({ required: true })

const LABELS: Record<PhoneTab, string> = {
  actions: 'Actions',
  hero: 'Hero',
  party: 'Party',
  chat: 'Chat',
  scribe: 'Scribe',
  encounter: 'Encounter',
  creature: 'Creature',
}

// 24×24 outline icons, drawn for these tabs.
const ICONS: Record<PhoneTab, string> = {
  actions:
    'M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M9.5 17.5 21 6V3h-3L6.5 14.5M11 19l-6-6M8 16l-4 4M5 21l-2-2',
  hero: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z',
  party: 'M12 3 5 6v5c0 4.4 3 8.2 7 10 4-1.8 7-5.6 7-10V6l-7-3Z',
  chat: 'M4 5h16v11H9l-5 4V5Z',
  scribe:
    'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15Z',
  encounter: 'M4 6h16M4 12h16M4 18h16',
  creature: 'M12 3l8 9-8 9-8-9 8-9Z',
}

const unread = useChatBadge(() => tab.value === 'chat')

function onKey(event: KeyboardEvent) {
  const i = props.tabs.indexOf(tab.value)
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (!step || i < 0) return
  event.preventDefault()
  const next = props.tabs[(i + step + props.tabs.length) % props.tabs.length]
  if (!next) return
  tab.value = next
  nextTick(() => document.getElementById(`phone-tab-${next}`)?.focus())
}
</script>

<template>
  <nav class="ptabs" aria-label="Battle board">
    <div role="tablist" class="ptabs__list" @keydown="onKey">
      <button
        v-for="t in tabs"
        :id="`phone-tab-${t}`"
        :key="t"
        type="button"
        role="tab"
        class="ptabs__tab"
        :data-track="`Phone tab ${LABELS[t]}`"
        :aria-selected="tab === t"
        :aria-controls="panelId"
        :tabindex="tab === t ? 0 : -1"
        @click="tab = t"
      >
        <svg
          class="ptabs__icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path :d="ICONS[t]" />
        </svg>
        <span>{{ LABELS[t] }}</span>
        <template v-if="t === 'chat' && unread">
          <span class="ptabs__badge" aria-hidden="true">{{ unread }}</span>
          <span class="sr-only">, {{ plural(unread, 'unread message') }}</span>
        </template>
      </button>
    </div>
  </nav>
</template>

<style scoped lang="scss">
.ptabs {
  flex: none;
  border-top: 1px solid var(--line);
  background: var(--nav-bg);
  padding-bottom: env(safe-area-inset-bottom);
}

.ptabs__list {
  height: 62px;
  display: flex;
}

.ptabs__tab {
  all: unset;
  position: relative;
  flex: 1 1 0;
  min-width: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-size: 11px;
  color: var(--page-muted);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &[aria-selected='true'] {
    color: color-mix(in srgb, var(--accent) 70%, var(--page-text));
    font-weight: 700;

    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 30%;
      right: 30%;
      height: 2px;
      border-radius: 2px;
      background: var(--accent);
    }
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -4px;
    border-radius: 8px;
  }
}

.ptabs__icon {
  width: 22px;
  height: 22px;
}

.ptabs__badge {
  position: absolute;
  top: 7px;
  right: calc(50% - 22px);
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  box-sizing: border-box;
  border-radius: 999px;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 10.5px;
  font-weight: 700;
  display: grid;
  place-items: center;
}
</style>
