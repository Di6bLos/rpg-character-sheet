<script setup lang="ts">
import type { NimbleSheet } from '~/types/sheets'
import { keyStatValue } from '~/utils/nimbleBuild'

const props = defineProps<{ name: string }>()

const { draft } = useSheet<NimbleSheet>()
const keyValue = computed(() => keyStatValue(draft.value.sheet))
const { inventions } = useNimbleActions()
const inv = computed(() => inventions.value.find((i) => i.name === props.name))
</script>

<template>
  <details v-if="inv" class="tile invention" :class="{ 'invention--broken': inv.inoperable }">
    <summary>
      <NimbleBrokenIcon v-if="inv.inoperable" />
      <strong>{{ inv.name }}</strong>
      <small>{{ inv.cost }}</small>
    </summary>
    <div class="invention__body">
      <p class="invention__stats">{{ inv.stats }}</p>
      <div v-for="(m, i) in inv.modes" :key="i" class="invention__mode">
        <p>
          <strong v-if="m.name">{{ m.name }}</strong>
          <small v-if="m.cost"> · {{ m.cost }}</small>
          {{ m.text }}
        </p>
        <NimbleMishap v-if="m.mishap" :name="m.mishap.name" :text="m.mishap.text" />
      </div>
      <NimbleMishap v-if="inv.mishap" :name="inv.mishap.name" :text="inv.mishap.text" />
      <NimbleModifiers :target="inv.name" />
      <NimbleInventionUse :name="inv.name" />
      <details class="invention__full">
        <summary>Full rules</summary>
        <p><NimbleRulesText :text="inv.desc" :key-value="keyValue" /></p>
      </details>
    </div>
  </details>
</template>

<style scoped lang="scss">
.invention {
  padding: 0;
  gap: 0;

  > summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 10px 14px;
    cursor: pointer;
    list-style: none;

    &::-webkit-details-marker {
      display: none;
    }

    strong {
      font-size: 14px;
    }

    small {
      font-size: 11px;
      color: var(--page-muted);
    }

    &::after {
      content: '▾';
      margin-left: auto;
      font-size: 12px;
      color: var(--accent-text);
    }
  }

  &[open] {
    border-color: var(--accent);

    > summary::after {
      content: '▴';
    }
  }

  &--broken {
    border: 1px dashed var(--danger);
  }
}

.invention__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 14px 12px;

  p {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--page-soft);
  }
}

.invention__stats {
  font-weight: 700;
  color: var(--accent-text) !important;
}

.invention__mode {
  display: flex;
  flex-direction: column;
  gap: 4px;

  strong {
    color: var(--page-text);
  }

  small {
    font-size: 12px;
    color: var(--page-muted);
  }
}

.invention__full {
  > summary {
    cursor: pointer;
    font-size: 12px;
    color: var(--page-muted);
  }

  p {
    margin-top: 6px;
    font-size: 12px;
  }
}
</style>
