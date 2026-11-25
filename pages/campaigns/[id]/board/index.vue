<script setup lang="ts">
// /campaigns/:id/board opens the Battle tab (every system), query and hash kept.
definePageMeta({
  redirect: (to) => ({
    path: `${to.path.replace(/\/$/, '')}/battle`,
    query: to.query,
    hash: to.hash,
  }),
})
</script>

<template>
  <div />
</template>
