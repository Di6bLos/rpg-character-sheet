<script setup lang="ts">
// The right column collapsed sideways: a thin rail that opens it again, straight to
// the Party or the Chat. Chat shows its unread count here.
import { plural } from '~/utils/format'

const right = useBattleRight()
const chat = useBoardChat()
const unread = computed(() => chat.totalUnread.value)
</script>

<template>
  <nav class="panel rail" aria-label="Party and chat (collapsed)">
    <BattlePanelToggle
      id="battle-rail-open"
      dir="left"
      label="Show party and chat"
      aria-expanded="false"
      @click="right.toggleColumn()"
    />
    <button type="button" class="rail__btn" title="Party" @click="right.showParty()">
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        <path d="M16 11a3 3 0 1 0 0-6M21 20c0-2.6-1.6-4.8-4-5.6" />
      </svg>
      <span class="sr-only">Show the party</span>
    </button>
    <button type="button" class="rail__btn" title="Chat" @click="right.showChat()">
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
      </svg>
      <span class="sr-only"
        >Show the chat{{ unread ? `, ${plural(unread, 'unread message')}` : '' }}</span
      >
      <span v-if="unread" class="rail__count" aria-hidden="true">{{ unread }}</span>
    </button>
  </nav>
</template>

<style scoped lang="scss">
.rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  min-height: 0;
}

.rail__btn {
  position: relative;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--page-soft);
  cursor: pointer;

  &:hover {
    background: var(--inset);
    color: var(--page-text);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
}

.rail__count {
  position: absolute;
  top: -3px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  box-sizing: border-box;
  border-radius: 999px;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 10px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
