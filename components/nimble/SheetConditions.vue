<script setup lang="ts">
// Conditions: tap to toggle. Bloodied, Dying and Wounded follow HP and Wounds.
import { AUTO_CONDITIONS, CONDITIONS } from '~/data/nimble/core'
import type { NimbleSheet } from '~/types/sheets'
import { isBloodied } from '~/utils/nimblePlay'

const { draft, canEdit } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)

const auto = computed<Record<string, boolean>>(() => ({
  Bloodied: isBloodied(sheet.value),
  Dying: sheet.value.dying && sheet.value.hp === 0,
  Wounded: sheet.value.wounds > 0,
}))

const conditions = computed(() =>
  CONDITIONS.map((c) => {
    const automatic = AUTO_CONDITIONS.includes(c.name)
    return {
      ...c,
      automatic,
      on: automatic ? !!auto.value[c.name] : sheet.value.conditions.includes(c.name),
    }
  }),
)
const active = computed(() => conditions.value.filter((c) => c.on))

function toggle(name: string) {
  if (!canEdit.value) return
  const list = sheet.value.conditions
  sheet.value.conditions = list.includes(name) ? list.filter((c) => c !== name) : [...list, name]
}
</script>

<template>
  <section class="panel stack" style="gap: 12px" aria-labelledby="cond-h">
    <h2 id="cond-h">Conditions</h2>
    <div class="chips" style="gap: 6px">
      <button
        v-for="c in conditions"
        :key="c.name"
        type="button"
        class="chip cond"
        :aria-pressed="c.on"
        :disabled="!canEdit || c.automatic"
        :title="c.automatic ? `${c.desc} Set automatically.` : c.desc"
        @click="toggle(c.name)"
      >
        {{ c.name }}
      </button>
    </div>
    <div v-if="active.length" class="tile" style="gap: 6px">
      <span v-for="c in active" :key="c.name" class="cond-line">
        <strong>{{ c.name }}.</strong> {{ c.desc }}
      </span>
    </div>
  </section>
</template>

<style scoped lang="scss">
.cond {
  min-height: 34px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 600;

  &[aria-pressed='true'] {
    background: var(--warn-bg);
    color: var(--warn-text);
    border-color: var(--accent);
  }

  // Automatic conditions stay readable while not clickable.
  &:disabled {
    opacity: 1;
    cursor: default;
  }
}

@media (pointer: coarse) {
  .cond {
    min-height: 44px;
  }
}

.cond-line {
  font-size: 13px;
  line-height: 1.5;
  color: var(--page-soft);

  strong {
    color: var(--page-text);
  }
}
</style>
