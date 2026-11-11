<script setup lang="ts">
// Every ability with its full text. Those with limited uses are also counted in
// the Actions panel.
import type { NimbleSheet } from '~/types/sheets'
import { keyStatValue } from '~/utils/nimbleBuild'

const { draft } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)
const keyValue = computed(() => keyStatValue(sheet.value))
</script>

<template>
  <section class="panel stack" style="gap: 12px" aria-labelledby="ab-h">
    <h2 id="ab-h">All abilities</h2>
    <div class="abilities">
      <article v-for="(a, i) in sheet.abilities" :key="i" class="tile ability">
        <div class="ability__head">
          <strong>{{ a.name }}</strong>
          <small>{{ a.src }}{{ a.level ? ` · L${a.level}` : '' }}</small>
        </div>
        <p><NimbleRulesText :text="a.desc" :key-value="keyValue" /></p>
      </article>
    </div>
    <p v-if="!sheet.abilities.length" class="empty">No abilities recorded yet.</p>
  </section>
</template>

<style scoped lang="scss">
.abilities {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(340px, 100%), 1fr));
  gap: 8px;
  align-items: start;
}

.ability {
  gap: 6px;
  padding: 12px 14px;

  p {
    font-size: 13px;
    line-height: 1.5;
    color: var(--page-soft);
    // Upgrades append "Level N: …" on new lines.
    white-space: pre-line;
  }
}

.ability__head {
  display: flex;
  align-items: baseline;
  gap: 4px 8px;
  flex-wrap: wrap;

  strong {
    font-size: 14px;
  }

  small {
    font-size: 11px;
    color: var(--page-muted);
  }
}
</style>
