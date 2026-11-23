<script setup lang="ts">
import type { NimbleSheet } from '~/types/sheets'
import { keyStatValue } from '~/utils/nimbleBuild'

const MAX_USES = 200

defineProps<{ items: ReturnType<typeof useNimbleActions>['abilities']['value'] }>()

const { draft, canEdit } = useSheet<NimbleSheet>()
const sheet = computed(() => draft.value.sheet)
const keyValue = computed(() => keyStatValue(sheet.value))
const { spend } = useNimbleActions()

const editing = ref('')
/** Amount typed into a pool's Spend field, by counter. */
const amounts = reactive<Record<string, number>>({})
const uid = useId()
const domId = (prefix: string, id: string) => `${uid}-${prefix}-${id.replace(/[^\w-]/g, '_')}`

/** Opening or closing the max editor swaps the controls; keep keyboard focus with them. */
async function focusOn(id: string) {
  await nextTick()
  document.getElementById(id)?.focus()
}

function toggleEdit(id: string) {
  editing.value = editing.value === id ? '' : id
  focusOn(domId(editing.value ? 'max' : 'link', id))
}

function setMax(id: string, event: Event) {
  if (!canEdit.value) return
  const value = Number((event.target as HTMLInputElement).value)
  const max = Math.max(1, Math.min(MAX_USES, Math.floor(value) || 1))
  const used = Math.min(sheet.value.uses[id]?.used ?? 0, max)
  sheet.value.uses[id] = { max, used }
}

function resetMax(id: string, rule: number) {
  if (!canEdit.value) return
  sheet.value.uses[id] = { used: Math.min(sheet.value.uses[id]?.used ?? 0, rule) }
  toggleEdit(id)
}
</script>

<template>
  <details
    v-for="a in items"
    :key="`${a.key}-${a.level ?? 0}`"
    name="nimble-action"
    class="tile ability"
  >
    <summary>
      <strong>{{ a.name }}</strong>
      <small>{{ a.src }}</small>
      <span class="ability__left">
        {{ a.counters.map((c) => `${c.left} / ${c.max}`).join(' · ') }}
      </span>
    </summary>
    <div class="ability__body">
      <p><NimbleRulesText :text="a.desc" :key-value="keyValue" /></p>
      <NimbleModifiers :target="a.name" />
      <div v-for="c in a.counters" :key="c.id" class="counter">
        <div class="uses">
          <div v-if="c.pips" class="row" style="gap: 6px" aria-hidden="true">
            <i v-for="n in c.max" :key="n" :class="{ on: n <= c.left }" />
          </div>
          <div v-else class="meter uses__bar"><span :style="{ width: c.pct + '%' }" /></div>
          <span class="uses__left" aria-live="polite">
            <template v-if="c.name">{{ c.name }}: </template>{{ c.left }} of {{ c.max }} left
            {{ c.label }}
          </span>
          <small v-if="c.costText" class="counter__cost">{{ c.costText }}</small>
          <div class="row" style="gap: 6px; margin-left: auto">
            <template v-if="!c.pips">
              <label class="sr-only" :for="domId('amt', c.id)">Amount of {{ a.name }}</label>
              <input
                :id="domId('amt', c.id)"
                v-model.number="amounts[c.id]"
                class="input"
                type="number"
                min="1"
                :max="c.max"
                placeholder="1"
                :disabled="!canEdit"
              />
            </template>
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              :disabled="!canEdit || c.used === 0"
              :aria-label="`Regain ${c.name || a.name} (${c.label})`"
              @click="spend(c, a.name, -(c.pips ? 1 : amounts[c.id] || 1))"
            >
              {{ c.pips ? 'Undo' : 'Restore' }}
            </button>
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              :disabled="!canEdit || c.left === 0 || c.short || !!c.notNow"
              :title="c.notNow || (c.short ? 'Not enough actions left' : undefined)"
              :aria-label="`Use ${c.name || a.name} (${c.label})`"
              @click="spend(c, a.name, c.pips ? 1 : amounts[c.id] || 1)"
            >
              {{ c.pips ? 'Use' : 'Spend' }}
            </button>
          </div>
        </div>
        <span v-if="c.hint && a.counters.length > 1" class="counter__hint">{{ c.hint }}</span>
        <div v-if="editing === c.id" class="uses uses--edit">
          <label :for="domId('max', c.id)">Uses {{ c.label }}</label>
          <input
            :id="domId('max', c.id)"
            class="input"
            type="number"
            min="1"
            :max="MAX_USES"
            :value="c.max"
            @change="setMax(c.id, $event)"
          />
          <button
            v-if="c.max !== c.rule"
            type="button"
            class="btn btn--quiet btn--sm"
            style="margin-left: auto"
            @click="resetMax(c.id, c.rule)"
          >
            Reset to {{ c.rule }}
          </button>
        </div>
        <button
          v-if="canEdit"
          :id="domId('link', c.id)"
          type="button"
          class="link"
          :aria-expanded="editing === c.id"
          @click="toggleEdit(c.id)"
        >
          {{ editing === c.id ? 'Done' : 'Change max' }}
        </button>
      </div>
    </div>
  </details>
</template>

<style scoped lang="scss">
.ability {
  padding: 0;
  gap: 0;

  summary {
    display: flex;
    align-items: baseline;
    gap: 4px 8px;
    flex-wrap: wrap;
    min-height: 44px;
    padding: 12px 14px;
    cursor: pointer;

    strong {
      font-size: 14px;
    }

    small {
      font-size: 11px;
      color: var(--page-muted);
    }
  }

  p {
    font-size: 13px;
    line-height: 1.5;
    color: var(--page-soft);
    // Upgrades append "Level N: …" on new lines.
    white-space: pre-line;
  }

  &[open] {
    border-color: var(--accent);
  }
}

.ability__left {
  margin-left: auto;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--accent-text);
}

.ability__body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 0 14px 12px;

  .uses {
    width: 100%;
  }
}

.counter {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
}

.counter__hint {
  font-size: 12px;
  color: var(--page-muted);
}

.counter__cost {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--page-muted);
}

.link {
  padding: 4px 0;
  border: 0;
  background: none;
  color: var(--accent-text);
  font-size: 12px;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.uses {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;

  i {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1.5px var(--line-strong);

    &.on {
      background: var(--accent);
      box-shadow: none;
    }
  }

  label {
    font-size: 13px;
    color: var(--page-soft);
  }

  .input {
    width: 84px;
    min-height: 36px;
  }
}

.uses__bar {
  flex: 1 1 120px;
}

.uses__left {
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

@media (pointer: coarse) {
  .link {
    min-height: 44px;
  }
}
</style>
