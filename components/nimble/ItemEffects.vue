<script setup lang="ts">
import { CONDITIONS } from '~/data/nimble/core'
import type { CustomItem, CustomItemEffect, CustomItemEffectKind } from '~/types/sheets'
import { DAMAGE_TYPES, ITEM_EFFECTS, itemEffectText } from '~/utils/nimbleItems'

const model = defineModel<CustomItemEffect[]>({ default: () => [] })
const props = defineProps<{ kind: CustomItem['kind'] }>()

const options = computed(() =>
  ITEM_EFFECTS.filter((d) => props.kind === 'weapon' || !d.weapon).map((d) => {
    const held = model.value.find((e) => e.kind === d.kind)
    return {
      ...d,
      on: !!held,
      value: {
        kind: d.kind,
        ...(d.dice ? { dice: held?.dice ?? d.dice } : {}),
        ...(d.type ? { type: held?.type ?? d.type } : {}),
        ...(d.condition ? { condition: held?.condition ?? d.condition } : {}),
      } as CustomItemEffect,
    }
  }),
)

const summary = computed(() =>
  options.value
    .filter((o) => o.on)
    .map((o) => itemEffectText(o.value))
    .join('; '),
)

function write(kind: CustomItemEffectKind, on: boolean, patch: Partial<CustomItemEffect> = {}) {
  model.value = options.value.flatMap((o) =>
    (o.kind === kind ? on : o.on) ? [o.kind === kind ? { ...o.value, ...patch } : o.value] : [],
  )
}

function text(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value
}
</script>

<template>
  <UiCheckMenu label="Effects" :value="summary">
    <label v-for="o in options" :key="o.kind" class="check-menu__item fx" :class="{ on: o.on }">
      <input
        type="checkbox"
        :checked="o.on"
        @change="write(o.kind, ($event.target as HTMLInputElement).checked)"
      />
      <span class="fx__label">{{ o.label }}</span>
      <span class="fx__controls">
        <input
          v-if="o.dice"
          class="input fx__dice"
          :value="o.value.dice"
          maxlength="10"
          :aria-label="`${o.label} dice`"
          @change="write(o.kind, true, { dice: text($event).replace(/\s+/g, '') })"
        />
        <select
          v-if="o.type"
          class="input fx__select"
          :value="o.value.type"
          :aria-label="`${o.label} damage type`"
          @change="write(o.kind, true, { type: text($event) })"
        >
          <option v-for="t in DAMAGE_TYPES" :key="t" :value="t">{{ t }}</option>
        </select>
        <select
          v-if="o.condition"
          class="input fx__select"
          :value="o.value.condition"
          :aria-label="`${o.label} condition`"
          @change="write(o.kind, true, { condition: text($event) })"
        >
          <option v-for="c in CONDITIONS" :key="c.name" :value="c.name">{{ c.name }}</option>
        </select>
      </span>
    </label>
  </UiCheckMenu>
</template>

<style scoped lang="scss">
.fx {
  flex-wrap: wrap;
}

.fx__label {
  flex: 1 1 140px;
}

.fx__controls {
  display: flex;
  gap: 6px;
  margin-left: auto;
}

.fx__dice {
  width: 72px;
  min-height: 30px;
  padding: 2px 8px;
}

.fx__select {
  width: auto;
  min-height: 30px;
  padding: 2px 30px 2px 8px;
}
</style>
