<script setup lang="ts">
definePageMeta({ layout: 'auth' })
useHead({ title: 'Not found · Lantern' })
</script>

<template>
  <div class="stack">
    <h1 style="font-size: 28px">This page is off the map</h1>
    <p class="muted">The link may be old, or the page may have moved.</p>
    <NuxtLink to="/dashboard" class="btn btn--block">Go to the dashboard</NuxtLink>
  </div>
</template>
