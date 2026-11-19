<script setup lang="ts">
// The hero column's summons, one compact row each: name, HP and Slain (the sheet's
// slay, with its on-death effects; the result also goes to party chat).
import type { NimbleSheet } from '~/types/sheets'

const { draft, canEdit } = useSheet<NimbleSheet>()
const chat = useBoardChat()
const { slay } = useNimbleSummons({
  onResult: (message) => void chat.send(`${draft.value.name} · ${message}`, 'party', 'action'),
})
const summons = computed(() => draft.value.sheet.summons ?? [])
</script>

<template>
  <div v-if="summons.length" class="sum">
    <span class="sect">Summons</span>
    <ul class="sum__list">
      <li v-for="s in summons" :key="s.id" class="sum__row">
        <span class="sum__name">{{ s.name }}</span>
        <span class="sum__hp">{{ s.hpMax ? `${s.hp}/${s.hpMax} HP` : '—' }}</span>
        <button
          type="button"
          class="btn btn--quiet btn--sm sum__slay"
          :aria-label="`Mark ${s.name} slain`"
          :disabled="!canEdit"
          @click="slay(s.id)"
        >
          Slain
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.sum {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sum__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.sum__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  border-bottom: 1px solid var(--track);
  font-size: 13px;
}

.sum__name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sum__hp {
  font-size: 12px;
  color: var(--page-muted);
  font-variant-numeric: tabular-nums;
}

.sum__slay {
  min-height: 24px;
  padding: 0 8px;
  font-size: 12px;
}
</style>
