<script setup lang="ts">
import type { NimbleSheet } from '~/types/sheets'
import { abilityModifiers } from '~/utils/nimbleBuild'

const props = defineProps<{ target: string }>()

const { draft } = useSheet<NimbleSheet>()
const mods = computed(() => abilityModifiers(draft.value.sheet, props.target))
</script>

<template>
  <details v-if="mods.length" class="mods">
    <summary>
      <span class="mods__caps">Upgraded by ({{ mods.length }})</span>
      <span class="mods__names">{{ mods.map((m) => m.name).join(', ') }}</span>
    </summary>
    <p v-for="m in mods" :key="m.name">
      <strong>{{ m.name }}</strong> {{ m.text }}
    </p>
  </details>
</template>

<style scoped lang="scss">
.mods {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 10px;
  border-left: 2px solid var(--accent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--accent) 7%, transparent);

  p {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--page-soft);
    text-align: left;
  }
}

.mods > summary {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px 8px;
  cursor: pointer;
  list-style: none;

  &::-webkit-details-marker {
    display: none;
  }

  &::after {
    content: '▾';
    margin-left: auto;
    font-size: 11px;
    color: var(--accent-text);
  }
}

.mods[open] > summary::after {
  content: '▴';
}

.mods__names {
  font-size: 11px;
  color: var(--page-muted);
  text-align: left;
}

.mods__caps {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent-text);
}
</style>
