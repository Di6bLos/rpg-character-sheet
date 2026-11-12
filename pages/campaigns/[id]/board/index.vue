<script setup lang="ts">
// /campaigns/:id/board opens the Party tab.
const route = useRoute()
await navigateTo(
  {
    path: `/campaigns/${String(route.params.id)}/board/party`,
    query: route.query,
    hash: route.hash,
  },
  { replace: true },
)
</script>

<template>
  <div class="spinner" role="status" aria-label="Opening the party" />
</template>
