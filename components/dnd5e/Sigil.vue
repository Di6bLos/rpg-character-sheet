<script setup lang="ts">
// Original line sigils for the 5e classes, drawn for Lantern: no book art is used (see the
// rpg-rules skill's licensing.md). The ink follows the text colour, like the Nimble sigils.
const props = withDefaults(defineProps<{ slug: string; size?: number }>(), { size: 64 })

/** Path data per class on a 64 × 64 grid. */
const PATHS: Record<string, string[]> = {
  artificer: [
    'M32 18a14 14 0 1 0 0.01 0Z',
    'M32 26a6 6 0 1 0 0.01 0Z',
    'M32 8v8M32 48v8M8 32h8M48 32h8M15 15l6 6M43 43l6 6M49 15l-6 6M21 43l-6 6',
  ],
  barbarian: [
    'M20 54L44 10',
    'M38 12c8-2 15 3 16 11-6-1-11 1-14 5',
    'M30 26c-8 2-11 9-9 16 4-4 9-5 14-4',
  ],
  bard: [
    'M20 14c-4 12-4 24 4 32h16c8-8 8-20 4-32',
    'M20 14c4 4 8 4 12 0 4 4 8 4 12 0',
    'M27 20v24M32 18v26M37 20v24',
    'M24 46v8h16v-8',
  ],
  cleric: [
    'M32 20a12 12 0 1 0 0.01 0Z',
    'M32 6v10M32 48v10M6 32h10M48 32h10',
    'M32 26v12M26 32h12',
  ],
  druid: [
    'M32 8C14 22 14 42 32 56c18-14 18-34 0-48Z',
    'M32 16v40',
    'M32 30l-8-6M32 38l9-7M32 46l-7-5',
  ],
  fighter: ['M32 6v36', 'M27 12l5-6 5 6v30H27Z', 'M20 42h24', 'M32 42v10', 'M28 56h8'],
  monk: ['M44 13A22 22 0 1 0 51 24', 'M32 24a5 5 0 1 0 0.01 0Z', 'M32 38v8'],
  paladin: ['M32 6l20 7v16c0 13-9 22-20 27-11-5-20-14-20-27V13Z', 'M32 16v30M23 26h18'],
  ranger: ['M18 8c16 8 16 40 0 48', 'M18 8v48', 'M10 32h40', 'M44 27l6 5-6 5', 'M12 28l-3 4 3 4'],
  rogue: ['M14 50L42 22', 'M42 22l8-12-12 8', 'M20 36l8 8', 'M10 54l6-6'],
  sorcerer: [
    'M32 56c-11 0-16-8-14-17 2-7 8-10 8-18 6 4 8 10 7 15 3-2 4-6 4-9 7 6 10 13 8 20-2 6-7 9-13 9Z',
    'M32 56c-4 0-6-4-4-8 1-3 4-4 4-8 4 4 6 8 4 12-1 2-2 4-4 4Z',
  ],
  warlock: [
    'M6 32c8-12 17-18 26-18s18 6 26 18c-8 12-17 18-26 18S14 44 6 32Z',
    'M32 24a8 8 0 1 0 0.01 0Z',
    'M32 29v6',
  ],
  wizard: [
    'M32 6L18 46h28Z',
    'M10 50c8-4 36-4 44 0',
    'M30 22l2-5 2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3Z',
  ],
}

const paths = computed(() => PATHS[props.slug] ?? ['M32 12L52 32L32 52L12 32Z'])
</script>

<template>
  <svg
    class="dnd5e-sigil"
    :width="size"
    :height="size"
    viewBox="0 0 64 64"
    fill="none"
    stroke="currentColor"
    stroke-width="2.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="(d, i) in paths" :key="i" :d="d" />
  </svg>
</template>

<style scoped lang="scss">
.dnd5e-sigil {
  flex: none;
  color: var(--accent-ink);
}
</style>
