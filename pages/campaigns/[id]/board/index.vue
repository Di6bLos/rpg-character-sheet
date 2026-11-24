<script setup lang="ts">
// /campaigns/:id/board opens the Battle tab for a Nimble campaign,
// the Party tab otherwise. (The frame renders this only once the campaign has loaded.)
const route = useRoute()
const { battle } = useBoardLayout()
await navigateTo(
  {
    path: `/campaigns/${String(route.params.id)}/board/${battle.value ? 'battle' : 'party'}`,
    query: route.query,
    hash: route.hash,
  },
  { replace: true },
)
</script>

<template>
  <div class="spinner" role="status" aria-label="Opening the campaign" />
</template>
