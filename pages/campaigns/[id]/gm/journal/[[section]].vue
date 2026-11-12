<script setup lang="ts">
const route = useRoute()
const SLUGS = ['log', 'characters', 'npcs', 'bestiary'] as const
type Slug = (typeof SLUGS)[number]
const section = computed<Slug>(() => {
  const s = String(route.params.section ?? 'log')
  return (SLUGS as readonly string[]).includes(s) ? (s as Slug) : 'log'
})
</script>

<template>
  <BoardJournalView :section="section" />
</template>
