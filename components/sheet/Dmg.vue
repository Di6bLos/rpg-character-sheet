<script setup lang="ts">
// An attack's damage (Nimble: as it lands on the target after its armor), with the unarmored
// damage or what changed it on hover, focus or a tap (UiTooltip).
defineProps<{ dmg: string; armorDmg?: string; why?: string }>()
</script>

<template>
  <UiTooltip v-if="why" :title="armorDmg || dmg" :text="why">
    <span
      class="dmg dmg--why"
      :class="{ 'dmg--armor': armorDmg }"
      tabindex="0"
      :aria-label="armorDmg ? `${armorDmg}. ${why}` : undefined"
      >{{ armorDmg || dmg }}</span
    >
  </UiTooltip>
  <span v-else class="dmg" :class="{ 'dmg--armor': armorDmg }">{{ armorDmg || dmg }}</span>
</template>

<style scoped lang="scss">
.dmg--armor {
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}

.dmg--why {
  cursor: help;
}
</style>
