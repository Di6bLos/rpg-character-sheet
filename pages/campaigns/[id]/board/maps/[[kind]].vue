<script setup lang="ts">
const route = useRoute()
const kind = computed(() => (route.params.kind === 'images' ? 'images' : 'maps'))
</script>

<template>
  <BoardMapsView :kind="kind" />
</template>
