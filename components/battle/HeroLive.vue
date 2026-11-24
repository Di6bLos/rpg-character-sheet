<script setup lang="ts">
// Renders nothing: applies what reaches the seated hero from elsewhere while the battle
// board is open (statuses other heroes give, like Helped, and the GM's HP and condition
// changes). HeroScope mounts it once beside the board, so it runs on every frame and tab
// (the phone shows the hero column only on its Hero tab).
useHeroEffects()
useHeroHpChanges()
useHeroConditionChanges()
</script>

<template>
  <slot />
</template>
