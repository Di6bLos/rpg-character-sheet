<script setup lang="ts">
// /campaigns/:id/gm opens the Battle tab for a Nimble campaign in a wide window,
// the Party tab otherwise. (The frame renders this only once the campaign has loaded.)
const route = useRoute()
const wide = useWideBoard()
await navigateTo(
  {
    path: `/campaigns/${String(route.params.id)}/gm/${wide.value ? 'battle' : 'party'}`,
    query: route.query,
    hash: route.hash,
  },
  { replace: true },
)
</script>

<template>
  <div class="spinner" role="status" aria-label="Opening the campaign" />
</template>
