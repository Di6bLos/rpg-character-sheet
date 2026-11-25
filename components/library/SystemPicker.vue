<script setup lang="ts">
// The game system chips at the top of the Library's Rules, Spells and Classes tabs. Systems the
// tab has nothing for yet show as "coming soon".
import { RULES_SYSTEMS, type RulesSystem } from '~/data/rules'
import type { GameSystem } from '~/types'

const props = defineProps<{
  current?: GameSystem
  isReady: (s: RulesSystem) => boolean
  /** What's coming, for the soon chips' tooltip: "rules", "spells". */
  what: string
}>()
const emit = defineEmits<{ pick: [id: GameSystem] }>()
</script>

<template>
  <div class="chips" role="group" aria-label="Game system">
    <template v-for="s in RULES_SYSTEMS" :key="s.id">
      <button
        v-if="props.isReady(s)"
        type="button"
        class="chip"
        :aria-pressed="props.current === s.id"
        @click="emit('pick', s.id)"
      >
        {{ s.label }}
      </button>
      <span v-else class="chip chip--soon" :title="`${s.label} ${props.what} are on the way`">
        {{ s.label }} <small>coming soon</small>
      </span>
    </template>
  </div>
</template>

<style scoped lang="scss">
.chip--soon {
  border-style: dashed;
  color: var(--page-muted);
  cursor: default;

  small {
    font-size: 12px;
  }
}
</style>
