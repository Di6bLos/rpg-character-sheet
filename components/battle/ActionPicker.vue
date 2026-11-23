<script setup lang="ts">
// The picks behind an action tile (Opportunity Attack's melee weapons, Help's allies),
// in a popover under the tile. Each pick has its own availability; a dimmed one does
// nothing, and using one closes the popover.
import type { BattleChoice } from '~/composables/useBattleActions'

defineProps<{ choices: BattleChoice[]; anchor: HTMLElement | null; name: string }>()
const open = defineModel<boolean>({ required: true })

function pick(choice: BattleChoice, close: (refocus?: boolean) => void) {
  if (choice.unavailable !== '') return
  choice.use()
  close(true)
}
</script>

<template>
  <BattleActionPop v-model="open" :anchor="anchor" :label="`Choose for ${name}`">
    <template #default="{ close }">
      <button
        v-for="c in choices"
        :key="c.key"
        type="button"
        class="pick"
        :aria-disabled="c.unavailable !== '' || undefined"
        @click="pick(c, close)"
      >
        <span>{{ c.label }}</span>
        <small v-if="c.unavailable">{{ c.unavailable }}</small>
      </button>
    </template>
  </BattleActionPop>
</template>

<style scoped lang="scss">
.pick {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: min(var(--radius-control), 8px);
  background: var(--inset);
  color: var(--page-text);
  font: inherit;
  font-size: 12.5px;
  text-align: left;

  &:hover,
  &:focus-visible {
    border-color: var(--accent);
  }

  &[aria-disabled='true'] {
    opacity: 0.55;
    cursor: not-allowed;
  }

  small {
    font-size: 11px;
    color: var(--page-muted);
  }
}
</style>
