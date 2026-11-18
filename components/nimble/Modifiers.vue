<script setup lang="ts">
import type { NimbleSheet } from '~/types/sheets'
import { abilityModifiers } from '~/utils/nimbleBuild'
import { summonModifiers } from '~/utils/nimbleSummons'

const props = defineProps<{ target?: string; summon?: string }>()

const { draft } = useSheet<NimbleSheet>()
const mods = computed(() =>
  props.summon
    ? summonModifiers(draft.value.sheet, props.summon)
    : abilityModifiers(draft.value.sheet, props.target ?? ''),
)
</script>

<template>
  <div v-if="mods.length" class="mods">
    <span class="mods__caps">Upgraded by</span>
    <details v-for="m in mods" :key="m.name" class="mod">
      <summary>{{ m.name }}</summary>
      <p>{{ m.text }}</p>
    </details>
  </div>
</template>

<style scoped lang="scss">
.mods {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 10px;
  border-left: 2px solid var(--accent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--accent) 7%, transparent);
  text-align: left;
}

.mods__caps {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent-text);
}

.mod {
  > summary {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
    font-size: 12px;
    font-weight: 700;
    color: var(--page-text);
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

  &[open] > summary::after {
    content: '▴';
  }

  p {
    margin: 0 0 4px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--page-soft);
  }
}
</style>
