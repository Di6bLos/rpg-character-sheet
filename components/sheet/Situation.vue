<script setup lang="ts">
// The chips and steppers above the attack cards of the Nimble and PF2e sheets for what the
// table decides now: chips for situations the player turns on (Nimble: Taunted, Frightened;
// PF2e: fortune and misfortune), then steppers for the GM's calls (Nimble: disadvantage and
// advantage; PF2e: circumstance bonus and penalty). Each system's panel holds the values.
defineProps<{
  chipsLabel?: string
  chips: { key: string; label: string; on: boolean }[]
  steppers: { key: string; label: string; hint: string; value: number; max: number }[]
}>()
const emit = defineEmits<{ toggle: [key: string]; step: [key: string, by: number] }>()
const { canEdit } = useSheet()
</script>

<template>
  <div class="situation">
    <template v-if="chips.length">
      <span v-if="chipsLabel" class="caps">{{ chipsLabel }}</span>
      <button
        v-for="c in chips"
        :key="c.key"
        type="button"
        class="chip"
        :class="{ 'chip--on': c.on }"
        :aria-pressed="c.on"
        :disabled="!canEdit"
        @click="emit('toggle', c.key)"
      >
        {{ c.label }}
      </button>
    </template>
    <div
      v-for="o in steppers"
      :key="o.key"
      class="odds-step"
      :class="{ 'is-on': o.value > 0 }"
      role="group"
      :aria-label="`${o.label}: ${o.value} ${o.hint}`"
    >
      <span>{{ o.label }}</span>
      <button
        type="button"
        class="step step--xs"
        :aria-label="`Less ${o.label.toLowerCase()}`"
        :disabled="!canEdit || o.value === 0"
        @click="emit('step', o.key, -1)"
      >
        −
      </button>
      <strong aria-live="polite">{{ o.value }}</strong>
      <button
        type="button"
        class="step step--xs"
        :aria-label="`More ${o.label.toLowerCase()}`"
        :disabled="!canEdit || o.value >= o.max"
        @click="emit('step', o.key, 1)"
      >
        +
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.situation {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;

  .chip--on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--page-text);
  }
}

.odds-step {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px 2px 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 13px;

  strong {
    min-width: 1ch;
    text-align: center;
  }

  &.is-on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }
}
</style>
