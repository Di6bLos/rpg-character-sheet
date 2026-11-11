<script setup lang="ts">
// Original runic sigils for the Nimble classes (design/sigils, cleaned copies in
// assets/sigils). The Nimble license does not allow the books' art, so these
// stand in as class "portraits". Inlined so the ink follows the theme text and
// the motif follows the accent.
const props = withDefaults(defineProps<{ slug: string; size?: number }>(), { size: 64 })

const files = import.meta.glob<string>('~/assets/sigils/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** Inner markup of each sigil, keyed by class slug. */
const SIGILS: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, svg]) => [
    path.replace(/^.*\/(.+)\.svg$/, '$1'),
    svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, ''),
  ]),
)

const inner = computed(() => SIGILS[props.slug] ?? '')
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- bundled, trusted SVG markup -->
  <svg
    v-if="inner"
    class="sigil"
    :width="size"
    :height="size"
    viewBox="0 0 400 400"
    stroke="currentColor"
    fill="currentColor"
    aria-hidden="true"
    v-html="inner"
  />
  <svg
    v-else
    class="sigil"
    :width="size"
    :height="size"
    viewBox="0 0 64 64"
    fill="none"
    stroke="currentColor"
    stroke-width="2.6"
    aria-hidden="true"
  >
    <path d="M32 12 L52 32 L32 52 L12 32 Z" />
  </svg>
</template>

<style lang="scss">
// Not scoped: the classes live in the v-html markup.
.sigil {
  // Ink (guides, runes) follows the text; the motif follows the accent,
  // readable on panels (darkened on Cursed parchment).
  color: var(--page-text);
  --sigil-accent: var(--accent-ink);
  flex: none;
  filter: drop-shadow(0 0 6px color-mix(in srgb, var(--accent) 35%, transparent));

  .sa {
    stroke: var(--sigil-accent, #c9a24d);
  }

  .fa {
    fill: var(--sigil-accent, #c9a24d);
  }
}

[data-theme='cursed'] .sigil {
  filter: none;
}
</style>
