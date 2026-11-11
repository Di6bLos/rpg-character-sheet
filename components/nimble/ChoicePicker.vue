<script setup lang="ts">
// One level-up / creation choice: pick N options (cards), one per school, or
// write in an answer (Epic Boon).
import type { NimbleStat } from '~/types/sheets'
import { validatePicks, type ResolvedChoice } from '~/utils/nimbleBuild'

const props = defineProps<{
  choice: ResolvedChoice
  showErrors?: boolean
  /** Replaces KEY in option text with the hero's number. */
  keyValue?: { value: number; stats: NimbleStat[] } | null
}>()
const model = defineModel<string[]>({ default: () => [] })

const uid = useId()
const single = computed(() => props.choice.count === 1 && !props.choice.perGroup)
const error = computed(() => validatePicks(props.choice, model.value))

const groups = computed(() => {
  const map = new Map<string, typeof props.choice.options>()
  for (const o of props.choice.options) {
    const g = o.group ?? ''
    map.set(g, [...(map.get(g) ?? []), o])
  }
  return [...map.entries()].map(([name, options]) => ({ name, options }))
})
const showGroupNames = computed(() => groups.value.length > 1)

const hint = computed(() => {
  const c = props.choice
  if (c.text) return 'Write it in'
  if (!c.options.length) return 'Nothing left to choose'
  if (c.perGroup) return 'Choose one from each school'
  const left = Math.min(c.count, c.options.length) - model.value.length
  return left > 0 ? `${left} left to choose` : 'Done'
})

function isOn(value: string) {
  return model.value.includes(value)
}

function toggle(value: string, group?: string) {
  const c = props.choice
  if (single.value) {
    model.value = isOn(value) ? [] : [value]
    return
  }
  if (isOn(value)) {
    model.value = model.value.filter((v) => v !== value)
    return
  }
  let next = [...model.value]
  if (c.perGroup) {
    const sameGroup = new Set(c.options.filter((o) => o.group === group).map((o) => o.value))
    next = next.filter((v) => !sameGroup.has(v))
  } else if (next.length >= c.count) next = next.slice(1)
  model.value = [...next, value]
}

const text = computed({
  get: () => model.value[0] ?? '',
  set: (v: string) => (model.value = v ? [v] : []),
})
</script>

<template>
  <fieldset class="pick" :aria-describedby="`${uid}-hint`">
    <legend class="pick__label">{{ choice.label }}</legend>
    <p :id="`${uid}-hint`" class="pick__hint" :class="{ done: !error }">
      {{ hint }}
      <span v-if="showErrors && error" class="pick__error" role="alert"> · {{ error }}</span>
    </p>

    <textarea
      v-if="choice.text"
      v-model="text"
      class="input"
      rows="2"
      :placeholder="choice.placeholder"
      :aria-label="choice.label"
    />

    <template v-else>
      <div v-for="g in groups" :key="g.name" class="pick__group">
        <div v-if="showGroupNames && g.name" class="caps">{{ g.name }}</div>
        <div class="pick__options">
          <button
            v-for="o in g.options"
            :key="o.value"
            type="button"
            class="option"
            :role="single ? 'radio' : 'checkbox'"
            :aria-checked="isOn(o.value)"
            @click="toggle(o.value, o.group)"
          >
            <span class="option__mark" aria-hidden="true" />
            <span class="option__body">
              <strong>{{ o.label }}</strong>
              <NimbleRulesText :text="o.desc" :key-value="keyValue" />
            </span>
          </button>
        </div>
      </div>
    </template>
  </fieldset>
</template>

<style scoped lang="scss">
.pick {
  border: 0;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  // Fieldsets ignore min-height:auto, so inside a flex column (the dialog body)
  // they shrink and their options spill over what follows.
  flex-shrink: 0;
}

.pick__label {
  float: left;
  width: 100%;
  padding: 0;
  font-weight: 700;
  font-size: 15px;

  // Floated legends sit inside the box; clear what comes after.
  + * {
    clear: both;
  }
}

.pick__hint {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent-text);

  &.done {
    color: var(--page-muted);
  }
}

.pick__error {
  color: var(--danger-text);
}

.pick__group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pick__options {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr));
  gap: 8px;
}

.option {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  text-align: left;
  padding: 10px 12px;
  border-radius: min(var(--radius-panel), 10px);
  background: var(--field);
  color: var(--page-text);
  border: 1px solid var(--line);

  &:hover {
    border-color: var(--accent);
  }

  &[aria-checked='true'] {
    border: 1.5px solid var(--accent);
    background: var(--accent-tint);

    .option__mark {
      background: var(--accent);
      border-color: var(--accent);
      box-shadow: inset 0 0 0 3px var(--panel-bg);
    }
  }

  &:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
}

.option__mark {
  flex: none;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  border-radius: 50%;
  border: 1.5px solid var(--line-strong);
}

.option__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  strong {
    font-size: 14px;
  }

  span {
    font-size: 13px;
    line-height: 1.45;
    color: var(--page-soft);
  }
}
</style>
