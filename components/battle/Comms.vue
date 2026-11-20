<script setup lang="ts">
// The battle board's Chat / Lore Master panel: one panel, two tabs. Chat is the
// party chat as it is today (threads, Battle log, unread badges); the Lore Master tab
// shows only when it is available to this user (the same check as LorePanel). Fills
// the rest of the right column; only the message lists scroll.
import type { RosterEntry } from '~/types'
import { plural } from '~/utils/format'

defineProps<{ roster: RosterEntry[] }>()

const chat = useBoardChat()
const tab = useCommsTab()
const loreAvailable = useLoreAvailable()
const uid = useId()

const current = computed(() => (tab.value === 'lore' && loreAvailable.value ? 'lore' : 'chat'))

// The chat counts messages as read only while it is in view.
watch(current, (t) => chat.setVisible(t === 'chat'), { flush: 'post' })
// BoardChat marks itself visible as it mounts; correct that if the Lore tab was left open.
onMounted(() => chat.setVisible(current.value === 'chat'))

const unread = computed(() => (current.value === 'lore' ? chat.totalUnread.value : 0))

function onKey(event: KeyboardEvent) {
  if (!loreAvailable.value) return
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault()
    tab.value = current.value === 'chat' ? 'lore' : 'chat'
    nextTick(() => document.getElementById(`${uid}-${tab.value}-tab`)?.focus())
  }
}
</script>

<template>
  <section class="panel comms" aria-label="Chat and Lore Master">
    <div class="comms__head">
      <div role="tablist" aria-label="Chat or Lore Master" class="comms__tabs" @keydown="onKey">
        <button
          :id="`${uid}-chat-tab`"
          type="button"
          role="tab"
          :aria-selected="current === 'chat'"
          :aria-controls="`${uid}-chat`"
          :tabindex="current === 'chat' ? 0 : -1"
          :aria-label="unread ? `Chat, ${plural(unread, 'unread message')}` : undefined"
          @click="tab = 'chat'"
        >
          Chat
          <span v-if="unread" class="comms__count" aria-hidden="true">{{ unread }}</span>
        </button>
        <button
          v-if="loreAvailable"
          :id="`${uid}-lore-tab`"
          type="button"
          role="tab"
          :aria-selected="current === 'lore'"
          :aria-controls="`${uid}-lore`"
          :tabindex="current === 'lore' ? 0 : -1"
          @click="tab = 'lore'"
        >
          <span aria-hidden="true">✦</span> Lore Master
        </button>
      </div>
    </div>
    <div
      v-show="current === 'chat'"
      :id="`${uid}-chat`"
      role="tabpanel"
      :aria-labelledby="`${uid}-chat-tab`"
      class="comms__pane comms__pane--chat"
    >
      <BoardChat :roster="roster" />
    </div>
    <div
      v-if="loreAvailable"
      v-show="current === 'lore'"
      :id="`${uid}-lore`"
      role="tabpanel"
      :aria-labelledby="`${uid}-lore-tab`"
      class="comms__pane comms__pane--lore"
    >
      <BoardLorePanelChat :drawer="false" />
    </div>
  </section>
</template>

<style scoped lang="scss">
.comms {
  position: relative;
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
}

.comms__head {
  flex: none;
  display: flex;
  align-items: center;
  min-height: 36px;
  padding: 6px 14px 0;
}

.comms__tabs {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
  background: var(--inset);

  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 30px;
    padding: 0 12px;
    border: 0;
    border-radius: 999px;
    background: none;
    font-family: var(--font-heading);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--page-muted);

    // Page text on a light accent wash stays readable on every theme (Cursed parchment too).
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

.comms__count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  box-sizing: border-box;
  border-radius: 999px;
  background: var(--accent);
  color: var(--on-accent);
  font-family: var(--font-body);
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.comms__pane {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

// Chat: borrow BoardChat's panel without its frame. Its heading stays for screen
// readers; the Battle log switch moves up beside the tabs.
.comms__pane--chat {
  :deep(.chat) {
    flex: 1 1 0;
    height: auto;
    max-height: none;
    min-height: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  :deep(.chat__head) {
    padding: 6px 14px 0;
  }

  // Tighter than the Party tab's chat, so the log keeps its room in a short window.
  // One row of conversations however many members there are: the extra ones scroll
  // sideways (keyboard focus scrolls them into view).
  :deep(.chat__tabs) {
    flex-wrap: nowrap;
    overflow-x: auto;
    // Room for the pills' focus ring inside the scroller.
    margin: -3px -3px 0;
    padding: 3px 3px 6px;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }

    button {
      flex: none;
    }
  }

  :deep(.chat__note) {
    padding: 2px 14px 3px;
    font-size: 12px;
  }

  :deep(.chat__log) {
    padding-inline: 14px;
  }

  :deep(.chat__form) {
    padding: 8px 14px 10px;
  }

  :deep(.chat__title) {
    position: absolute;
    top: 4px;
    right: 14px;
  }

  :deep(.chat__title h2) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}

// Lore Master: the panel's own chat; there is nothing to collapse here.
.comms__pane--lore {
  padding: 10px 14px 14px;

  :deep([data-lp-dismiss]) {
    display: none;
  }
}
</style>
