<script setup lang="ts">
// The 5e sheet's Actions, as Nimble's: the hero's features, feats, traits and options that take
// an action, a Bonus Action or nothing at all, with their uses and Use (Dnd5eEntryCard), split
// by cost; then the 2024 core actions (SRD 5.2.1 pp. 9–11): Dash, Disengage and Dodge set what
// the sheet tracks, the others say what they do. Reactions and attacks have their own panels.
// The logic is useDnd5eActions, shared with the battle board's action tiles.
import { DND5E_CORE_ACTIONS } from '~/utils/dnd5eFeatures'
import { costWhy } from '~/utils/dnd5ePlay'

const { canEdit, resultFor, sheet, sections, helping, ally, helpAlly, core } = useDnd5eActions()
</script>

<template>
  <section class="panel stack" style="gap: 14px" aria-labelledby="d5-act-h">
    <UiFold name="Actions" />
    <div class="title-help">
      <h2 id="d5-act-h">Actions</h2>
      <UiHelp
        label="About actions"
        text="Your features by what they take: an action, a Bonus Action, or nothing. Use pays it on the Turn panel, spends a use and rolls what it rolls. Uses come back on a Short or Long Rest as each says. The core actions anyone can take are below (SRD 5.2.1 pp. 9–11)."
      />
    </div>
    <details v-for="s in sections" :key="s.id" class="atk-group" open>
      <summary>
        <span class="caps">{{ s.label }}</span>
        <span class="badge badge--outline">{{ s.entries.length }}</span>
      </summary>
      <div class="cards">
        <Dnd5eEntryCard v-for="e in s.entries" :key="e.key" :entry="e" />
      </div>
    </details>
    <details class="atk-group">
      <summary>
        <span class="caps">Core actions</span>
        <span class="badge badge--outline">Anyone</span>
      </summary>
      <div class="cards">
        <div v-for="a in DND5E_CORE_ACTIONS" :key="a.id" class="tile core">
          <div class="row" style="gap: 8px; justify-content: space-between">
            <strong>{{ a.name }}</strong>
            <Dnd5eCostPill :cost="a.cost" />
          </div>
          <p class="small muted" style="margin: 0">{{ a.text }}</p>
          <div v-if="a.id === 'help' && helping.allies.value.length" class="row" style="gap: 6px">
            <select v-model="ally" class="input input--sm" aria-label="Ally to help">
              <option value="">Help whom?</option>
              <option v-for="h in helping.allies.value" :key="h.id" :value="h.id">
                {{ h.name }}
              </option>
            </select>
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              :disabled="!canEdit || !ally || !!helping.why.value"
              @click="helpAlly"
            >
              {{ helping.why.value || 'Help' }}
            </button>
          </div>
          <button
            v-else-if="!['attack', 'magic'].includes(a.id)"
            type="button"
            class="btn btn--ghost btn--sm"
            :disabled="!canEdit || !!costWhy(sheet, a.cost)"
            @click="core(a.id)"
          >
            {{ costWhy(sheet, a.cost) || a.name }}
          </button>
          <p v-if="resultFor(`core:${a.id}`)" class="roll-status" role="status">
            {{ resultFor(`core:${a.id}`) }}
          </p>
        </div>
      </div>
    </details>
  </section>
</template>

<style scoped lang="scss">
@use '../../assets/styles/attacks';

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
  gap: 8px;
  align-items: start;
}

.core {
  gap: 8px;
  padding: 14px;
}
</style>
