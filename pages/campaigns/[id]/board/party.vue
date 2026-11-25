<script setup lang="ts">
// The old Party (classic) tab: links to it open Battle, query and hash kept. A route
// redirect, so the old path is never rendered (or counted by usage analytics).
definePageMeta({
  redirect: (to) => ({
    path: to.path.replace(/\/party\/?$/, '/battle'),
    query: to.query,
    hash: to.hash,
  }),
})
</script>

<template>
  <div />
</template>
