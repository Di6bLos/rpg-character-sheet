<script setup lang="ts">
// A word with its rules on hover, focus or a tap (a weapon property or trait, a rune, a spell
// name), on the Nimble and PF2e sheets: the text in the slot, dotted underline, and UiTooltip
// with `title` and `text`. Without `text` it's the plain word.
defineProps<{ title?: string; text?: string; chip?: boolean }>()
</script>

<template>
  <UiTooltip v-if="text" :title="title" :text="text">
    <span class="rule-tip" :class="{ 'rule-tip--chip': chip }" tabindex="0"><slot /></span>
  </UiTooltip>
  <span v-else :class="{ 'rule-tip--chip': chip }"><slot /></span>
</template>

<style scoped lang="scss">
.rule-tip {
  cursor: help;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}

.rule-tip--chip {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--track);
  border: 1px solid var(--line);
  color: var(--page-soft);
  text-decoration: none;
}
</style>
