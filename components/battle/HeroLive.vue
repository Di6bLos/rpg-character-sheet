<script setup lang="ts">
// Renders nothing: applies what reaches the seated hero from elsewhere while the battle
// board is open (statuses other heroes give, like Helped, and the GM's HP and condition
// changes). HeroScope mounts it once beside the board, so it runs on every frame and tab
// (the phone shows the hero column only on its Hero tab). `basic` (PF2e): only the GM's HP
// and condition changes.
const props = defineProps<{ basic?: boolean }>()
if (!props.basic) useHeroEffects()
useHeroHpChanges()
useHeroConditionChanges()
</script>

<!-- eslint-disable-next-line vue/valid-template-root -->
<template></template>
