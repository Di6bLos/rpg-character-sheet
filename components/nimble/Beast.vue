<script setup lang="ts">
// Companion animal icons from game-icons.net (CC BY 3.0, see assets/beasts/CREDITS.md),
// inlined so they take the theme accent.
const props = withDefaults(defineProps<{ slug: string; size?: number }>(), { size: 48 })

const files = import.meta.glob<string>('~/assets/beasts/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const BEASTS: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, svg]) => [
    path.replace(/^.*\/(.+)\.svg$/, '$1'),
    svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, ''),
  ]),
)

const inner = computed(() => BEASTS[props.slug] ?? '')
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- bundled, trusted SVG markup -->
  <svg
    v-if="inner"
    class="beast"
    :width="size"
    :height="size"
    viewBox="0 0 512 512"
    fill="currentColor"
    aria-hidden="true"
    v-html="inner"
  />
</template>

<style scoped lang="scss">
.beast {
  flex: none;
  color: var(--accent-ink, #c9a24d);
}
</style>
