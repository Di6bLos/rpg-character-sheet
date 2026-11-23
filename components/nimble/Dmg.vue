<script setup lang="ts">
// An attack's damage as it lands on the target (after its armor), with the
// unarmored damage and the rule on hover.
defineProps<{ dmg: string; armorDmg?: string; why?: string }>()
</script>

<template>
  <span
    class="dmg"
    :class="{ 'dmg--armor': armorDmg }"
    :title="why || undefined"
    :aria-label="armorDmg ? `${armorDmg}. ${why}` : undefined"
    >{{ armorDmg || dmg }}</span
  >
</template>

<style scoped lang="scss">
.dmg--armor {
  text-decoration: underline dotted;
  text-underline-offset: 3px;
  cursor: help;
}
</style>
