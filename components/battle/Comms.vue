<script setup lang="ts">
// The battle board's Chat / Scribe panel: one panel, two tabs. Chat is the
// party chat as it is today (threads, Battle log, unread badges); the Scribe tab
// shows only when it is available to this user (the same check as LorePanel). Fills
// the rest of the right column; only the message lists scroll.
import type { RosterEntry } from '~/types'
import { plural } from '~/utils/format'

const props = defineProps<{ roster: RosterEntry[] }>()

const chat = useBoardChat()
const tab = useCommsTab()
const loreAvailable = useLoreAvailable()
const uid = useId()
const right = useBattleRight()
const { gmControls } = useCampaignBoard()
const auth = useAuthStore()
// Chat closes when the Party / Chat handle is dragged to the bottom (only while the
// Party has heroes to list, since that handle shows only then).
const hasHeroes = computed(() =>
  props.roster.some((r) => !!r.character_id && (gmControls.value || r.user_id !== auth.userId)),
)
const open = computed(() => !(hasHeroes.value && right.chatClosed.value))

const current = computed(() => (tab.value === 'lore' && loreAvailable.value ? 'lore' : 'chat'))

// The chat counts messages as read only while it is in view: its tab open, the
// panel unfolded and the column not collapsed.
const chatInView = computed(
  () => current.value === 'chat' && open.value && right.state.value.column,
)
watch(chatInView, (on) => chat.setVisible(on), { flush: 'post' })
// BoardChat marks itself visible as it mounts; correct that if it is out of view.
onMounted(() => chat.setVisible(chatInView.value))

// On the Chat tab's badge; a closed Chat shows its own missed count instead.
const unread = computed(() => (chatInView.value || !open.value ? 0 : chat.totalUnread.value))

/** A tab click also unfolds the panel. */
function pick(t: 'chat' | 'lore') {
  tab.value = t
  if (!open.value) right.showChat()
}

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
  <section class="panel comms" :class="{ 'comms--folded': !open }" aria-label="Chat and Scribe">
    <div class="comms__head">
      <div role="tablist" aria-label="Chat or Scribe" class="comms__tabs" @keydown="onKey">
        <button
          :id="`${uid}-chat-tab`"
          type="button"
          role="tab"
          :aria-selected="current === 'chat'"
          :aria-controls="`${uid}-chat`"
          :tabindex="current === 'chat' ? 0 : -1"
          :aria-label="unread ? `Chat, ${plural(unread, 'unread message')}` : undefined"
          @click="pick('chat')"
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
          @click="pick('lore')"
        >
          <span aria-hidden="true">✦</span> Scribe
        </button>
      </div>
      <!-- Closed: the messages missed since, in place of the log. -->
      <span
        v-if="!open && chat.totalUnread.value"
        class="comms__missed"
        :title="plural(chat.totalUnread.value, 'missed message')"
        role="status"
        :aria-label="plural(chat.totalUnread.value, 'missed message')"
        >{{ chat.totalUnread.value }}</span
      >
    </div>
    <div
      v-show="open && current === 'chat'"
      :id="`${uid}-chat`"
      role="tabpanel"
      :aria-labelledby="`${uid}-chat-tab`"
      class="comms__pane comms__pane--chat"
    >
      <BoardChat :roster="roster" />
    </div>
    <div
      v-if="loreAvailable"
      v-show="open && current === 'lore'"
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
  // What the Party card leaves of the column.
  flex: 1 1 0;
  box-sizing: border-box;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
}

.comms--folded {
  flex: none;
  padding-bottom: 6px;
}

.comms__head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 5px 14px 0;
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
    min-height: 26px;
    padding: 0 10px;
    border: 0;
    border-radius: 999px;
    background: none;
    font-family: var(--font-heading);
    font-size: 12px;
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

.comms__missed {
  margin-left: auto;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  box-sizing: border-box;
  border-radius: 999px;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
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

  // Everything a size down from the Party tab's chat; targets stay at least 24px.
  :deep(.chat__tabs button) {
    gap: 4px;
    min-height: 28px;
    padding: 0 8px 0 4px;
    font-size: 12px;
  }

  // UiAvatar sizes itself inline, so these override it.
  :deep(.chat__tabs .ui-avatar),
  :deep(.chat__party) {
    width: 20px !important;
    height: 20px !important;
    font-size: 8px !important;
  }

  :deep(.chat__party svg) {
    width: 11px;
    height: 11px;
  }

  :deep(.chat__unread) {
    min-width: 16px;
    height: 16px;
    font-size: 10px;
  }

  :deep(.chat__toggle) {
    min-height: 24px;
    font-size: 11px;
  }

  :deep(.chat__note) {
    padding: 2px 14px 3px;
    font-size: 11px;
  }

  :deep(.chat__log) {
    padding-inline: 14px;
    gap: 6px;
  }

  :deep(.chat__log li) {
    gap: 6px;
  }

  :deep(.chat__log li > .ui-avatar) {
    width: 22px !important;
    height: 22px !important;
    font-size: 8px !important;
  }

  :deep(.chat__log .ui-avatar svg) {
    max-width: 80%;
    max-height: 80%;
  }

  :deep(.chat__msg) {
    gap: 2px;
  }

  :deep(.chat__meta) {
    font-size: 11px;
  }

  :deep(.chat__bubble) {
    padding: 5px 9px;
    border-radius: 11px 11px 11px 3px;
    font-size: 13px;
    line-height: 1.35;
  }

  :deep(.is-me .chat__bubble) {
    border-radius: 11px 11px 3px 11px;
  }

  :deep(.chat__log li.is-action) {
    padding: 3px 8px;
    font-size: 12px;
  }

  :deep(.chat__action-time) {
    font-size: 10px;
  }

  :deep(.chat__empty) {
    font-size: 12px;
    padding: 12px 0;
  }

  :deep(.chat__form) {
    gap: 6px;
    padding: 6px 14px 8px;
  }

  :deep(.chat__form .input) {
    min-height: 32px;
    padding: 5px 10px;
    font-size: 13px;
  }

  :deep(.chat__form .btn) {
    min-height: 32px;
    padding: 0 12px;
    font-size: 13px;
  }

  // Beside the tabs.
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

// Scribe: the panel's own chat; there is nothing to collapse here.
.comms__pane--lore {
  padding: 10px 14px 14px;

  :deep([data-lp-dismiss]) {
    display: none;
  }

  // The tab already names the Scribe: no second heading.
  :deep(.lore__who strong) {
    display: none;
  }

  // "Co-GM" (or "Rules & your hero"), the provider and the free-agent help sit in the
  // tab row's right end, where Chat has its Battle log switch.
  :deep(.lore__sub) {
    position: absolute;
    top: 4px;
    right: 14px;
    min-height: 24px;
    font-size: 11px;
  }

  // With nothing left in the header row (no Clear button yet), drop its line.
  :deep(.lore__head:not(:has(> .btn--sm))) {
    padding: 0;
    border: 0;
  }
}
</style>
