<script setup lang="ts">
import { DAMAGE_TYPES as TYPES } from '~/utils/nimbleItems'

const model = defineModel<string>()

const picked = computed(() =>
  (model.value ?? '')
    .split(/\s*[,/]\s*/)
    .map((t) => t.trim())
    .filter(Boolean),
)

function toggle(type: string, on: boolean) {
  const set = new Set(picked.value.map((t) => t.toLowerCase()))
  if (on) set.add(type.toLowerCase())
  else set.delete(type.toLowerCase())
  model.value = TYPES.filter((t) => set.has(t.toLowerCase())).join(', ')
}
</script>

<template>
  <UiCheckMenu label="Damage type" :value="picked.join(', ')">
    <label
      v-for="t in TYPES"
      :key="t"
      class="check-menu__item"
      :class="{ on: picked.some((p) => p.toLowerCase() === t.toLowerCase()) }"
    >
      <input
        type="checkbox"
        :checked="picked.some((p) => p.toLowerCase() === t.toLowerCase())"
        @change="toggle(t, ($event.target as HTMLInputElement).checked)"
      />
      <span>{{ t }}</span>
    </label>
  </UiCheckMenu>
</template>
