<script setup lang="ts">
// One row of the Skills panel on the Nimble and PF2e sheets: the name (with what the skill is
// for in a "?" tooltip), its attribute, the system's marks in the `marks` slot (Nimble's
// skill-point dots, PF2e's rank), the value (its breakdown in a tooltip when there is one) and
// Roll.
const props = defineProps<{
  name: string
  sub?: string
  help?: string
  value: string
  /** The value's breakdown, a line each; no tooltip when empty. */
  breakdown?: string[]
  changed?: boolean
  disabled?: boolean
  rollLabel?: string
}>()
const emit = defineEmits<{ roll: [] }>()
const tip = computed(() => props.breakdown?.join('\n') ?? '')
</script>

<template>
  <div class="skill">
    <span class="grow">
      <UiHelp v-if="help" :label="`About ${name}`" :text="help">{{ name }}</UiHelp>
      <template v-else>{{ name }}</template>
      <template v-if="sub"
        >{{ ' ' }}<small>{{ sub }}</small></template
      >
    </span>
    <slot name="marks" />
    <UiTooltip v-if="tip" :title="`${name} ${value}`" :text="tip">
      <strong class="skill__value" :class="{ 'is-changed': changed }" tabindex="0">{{
        value
      }}</strong>
    </UiTooltip>
    <strong v-else>{{ value }}</strong>
    <button
      type="button"
      class="btn btn--ghost btn--sm skill__roll"
      :disabled="disabled"
      :aria-label="rollLabel ?? `Roll ${name}`"
      @click="emit('roll')"
    >
      Roll
    </button>
  </div>
</template>

<style scoped lang="scss">
.skill__roll {
  position: relative;
  min-height: 30px;
  padding: 2px 10px;
}

// A full-size target to tap on touch screens, on both sheets.
@media (pointer: coarse) {
  .skill__roll {
    min-height: 44px;
  }
}

.skill {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  border-bottom: 1px solid var(--track);
  font-size: 14px;

  small {
    font-size: 11px;
    color: var(--page-muted);
  }

  strong {
    min-width: 32px;
    text-align: right;
    font-size: 15px;
    font-variant-numeric: tabular-nums;
  }
}

.skill__value {
  cursor: help;
  border-bottom: 1px dotted var(--line-strong);

  &.is-changed {
    color: var(--warn-text);
  }
}
</style>
