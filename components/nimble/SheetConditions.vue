<script setup lang="ts">
// Conditions: tap to toggle. Bloodied, Dying and Wounded follow HP and Wounds.
import type { ConditionEnd } from '~/types/sheets'

const { canEdit } = useSheet()
const { conditions, active, effects, statuses, setEnd, end, toggle, ENDS } = useNimbleConditions()
</script>

<template>
  <div class="conditions stack" style="gap: 10px">
    <div class="caps">Conditions</div>
    <div class="chips" style="gap: 6px">
      <button
        v-for="c in conditions.filter((x) => !x.spell)"
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
    <div class="chips" style="gap: 6px">
      <span class="cond-group">Spell and ally statuses</span>
      <button
        v-for="c in conditions.filter((x) => x.spell)"
        :key="c.name"
        type="button"
        class="chip cond"
        :aria-pressed="c.on"
        :disabled="!canEdit"
        :title="c.desc"
        @click="toggle(c.name)"
      >
        {{ c.name }}
      </button>
    </div>
    <ul v-if="statuses.length" class="statuses">
      <li v-for="st in statuses" :key="st.source">
        <span class="grow"
          ><strong>{{ st.label }}</strong> <small>{{ st.until }}</small></span
        >
        <button
          type="button"
          class="btn btn--quiet btn--sm"
          :disabled="!canEdit"
          :aria-label="`End ${st.label}`"
          @click="end(st.source)"
        >
          End
        </button>
      </li>
    </ul>
    <div v-if="active.length" class="tile active" style="gap: 8px">
      <div v-for="c in active" :key="c.name" class="cond-line">
        <span class="grow"
          ><strong>{{ c.name }}.</strong> {{ c.desc }}</span
        >
        <label v-if="!c.automatic && !c.fromEffect" class="cond-end">
          <span class="sr-only">When {{ c.name }} ends</span>
          <select
            class="input"
            :value="c.end"
            :disabled="!canEdit"
            @change="
              setEnd(c.name, ($event.target as HTMLSelectElement).value as ConditionEnd | 'manual')
            "
          >
            <option v-for="[value, label] in ENDS" :key="value" :value="value">
              Ends {{ label }}
            </option>
          </select>
        </label>
      </div>
      <ul v-if="effects.length" class="cond-effects">
        <li v-for="e in effects" :key="e">{{ e }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cond-group {
  align-self: center;
  margin-right: 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--page-muted);
}

.active .cond-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
}

.cond-end select {
  min-height: 32px;
  padding: 2px 30px 2px 8px;
  font-size: 12px;
}

.cond-effects {
  margin: 0;
  padding: 6px 0 0 16px;
  border-top: 1px solid var(--track);
  font-size: 12px;
  color: var(--warn-text);
}

.statuses {
  list-style: none;
  margin: 0;
  padding: 0;

  li {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    border-bottom: 1px solid var(--track);
    font-size: 13px;
  }

  small {
    color: var(--page-muted);
  }
}

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
