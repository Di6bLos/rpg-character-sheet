<script setup lang="ts">
// What shows in the rail while the right column is closed: the chat's missed
// messages. The rail itself is the drag handle that opens the column again.
const chat = useBoardChat()
const missed = computed(() => chat.totalUnread.value)
</script>

<template>
  <span v-if="missed" class="rail__count" :title="`${missed} missed in chat`" aria-hidden="true">
    {{ missed }}
  </span>
</template>

<style scoped lang="scss">
.rail__count {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  min-width: 18px;
  height: 18px;
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
  // Above the rail's drag handle; clicks go through to it.
  z-index: 2;
  pointer-events: none;
}
</style>
