<script setup lang="ts">
// One pick of the 5e builder or level-up (`Dnd5ePick` from utils/dnd5eBuild): a short list as
// chips, a long one or one with rules text (feats, spells, invocations) as option cards, and an
// Ability Score Improvement as +1 steps (+2 to one ability is the same ability twice).
import { type Dnd5ePick, pickElementId, pickProblem } from '~/utils/dnd5eBuild'

const props = defineProps<{ pick: Dnd5ePick; showErrors?: boolean }>()
const model = defineModel<string[] | undefined>({ required: true })
const values = computed(() => model.value ?? [])

/** The element id of a pick, for the level-up's and builder's jump links. */
const id = computed(() => pickElementId(props.pick.key))
const problem = computed(() => pickProblem(props.pick, model.value))
const asCards = computed(
  () => props.pick.options.length > 18 || props.pick.options.some((o) => o.text),
)
const countText = computed(() => (props.pick.optional ? 'optional' : `choose ${props.pick.count}`))

function toggle(optionId: string) {
  const on = values.value.includes(optionId)
  const option = props.pick.options.find((o) => o.id === optionId)
  if (!on && option?.disabled) return
  if (props.pick.count === 1) model.value = on ? [] : [optionId]
  else if (on) model.value = values.value.filter((v) => v !== optionId)
  else if (values.value.length < props.pick.count) model.value = [...values.value, optionId]
}

const times = (optionId: string) => values.value.filter((v) => v === optionId).length
function step(optionId: string, by: 1 | -1) {
  if (by === 1) {
    if (values.value.length >= props.pick.count) return
    model.value = [...values.value, optionId]
    return
  }
  const i = values.value.lastIndexOf(optionId)
  if (i >= 0) model.value = values.value.filter((_, j) => j !== i)
}
</script>

<template>
  <section :id="id" class="pick" :aria-labelledby="`${id}-h`">
    <div class="pick__head">
      <h4 :id="`${id}-h`" tabindex="-1">{{ pick.label }}</h4>
      <span class="small muted">{{ pick.from }} · {{ countText }}</span>
    </div>
    <p v-if="pick.note" class="small muted">{{ pick.note }}</p>

    <div v-if="pick.repeat" class="steps" role="group" :aria-label="pick.label">
      <div
        v-for="o in pick.options"
        :key="o.id"
        class="steps__row"
        :class="{ on: times(o.id) > 0 }"
      >
        <span class="steps__name">
          {{ o.name }}
          <span v-if="o.meta" class="small muted">{{ o.meta }}</span>
        </span>
        <span class="steps__ctl">
          <button
            type="button"
            class="step step--sm"
            :aria-label="`Less ${o.name}`"
            :disabled="times(o.id) === 0"
            @click="step(o.id, -1)"
          >
            −
          </button>
          <strong aria-live="polite">+{{ times(o.id) }}</strong>
          <button
            type="button"
            class="step step--sm"
            :aria-label="`More ${o.name}`"
            :disabled="!!o.disabled || values.length >= pick.count"
            :title="o.disabled"
            @click="step(o.id, 1)"
          >
            +
          </button>
        </span>
      </div>
    </div>

    <Pf2eOptionCards
      v-else-if="asCards"
      :model-value="values"
      :options="pick.options"
      :label="pick.label"
      :multiple="pick.count > 1"
      :max="pick.count"
      hide-unavailable
      @update:model-value="model = $event"
    />

    <div v-else class="chips" role="group" :aria-label="pick.label">
      <button
        v-for="o in pick.options"
        :key="o.id"
        type="button"
        class="chip"
        :class="{ 'is-off': !!o.disabled && !values.includes(o.id) }"
        :aria-pressed="values.includes(o.id)"
        :aria-disabled="!!o.disabled && !values.includes(o.id)"
        :title="o.disabled ?? o.meta"
        @click="toggle(o.id)"
      >
        {{ o.name }}
        <span v-if="o.disabled && !values.includes(o.id)" class="sr-only">({{ o.disabled }})</span>
      </button>
    </div>

    <p v-if="showErrors && problem" class="err" role="alert">{{ problem }}</p>
  </section>
</template>

<style scoped lang="scss">
.pick {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pick__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 12px;

  h4 {
    margin: 0;
    font-size: 15px;
  }

  h4:focus {
    outline: none;
  }
}

.chip.is-off {
  opacity: 0.5;
  text-decoration: line-through;
}

.steps {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr));
  gap: 8px;
}

.steps__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 10px;

  &.on {
    border-color: var(--accent);
  }
}

.steps__name {
  display: flex;
  flex-direction: column;
  font-weight: 600;
}

.steps__ctl {
  display: flex;
  align-items: center;
  gap: 6px;
}

.err {
  margin: 0;
  color: var(--danger-text);
  font-size: 14px;
}
</style>
