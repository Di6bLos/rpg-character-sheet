<script setup lang="ts">
// Under the spell row that was cast: the cast's result line, and what the cast left to apply
// to the caster (heal yourself, gain its temporary HP, put the buff on yourself, a sorcerer's
// blood magic on yourself).
defineProps<{
  result: string
  offers: {
    def: { name: string }
    healing?: number
    temp?: number
    offer?: string
    blood?: { name: string; toggles: string[] }
  } | null
  disabled: boolean
}>()
const emit = defineEmits<{ heal: []; temp: []; buff: []; blood: [name: string]; dismiss: [] }>()
</script>

<template>
  <div v-if="result || offers" class="spell-result">
    <p v-if="result" class="roll-status" role="status" aria-live="polite">{{ result }}</p>
    <div
      v-if="offers && (offers.healing || offers.temp || offers.offer || offers.blood)"
      class="spell-result__offers"
    >
      <button
        v-if="offers.healing"
        type="button"
        class="btn btn--sm"
        :disabled="disabled"
        @click="emit('heal')"
      >
        Heal yourself {{ offers.healing }} HP
      </button>
      <button
        v-if="offers.temp"
        type="button"
        class="btn btn--sm"
        :disabled="disabled"
        @click="emit('temp')"
      >
        Gain {{ offers.temp }} temporary HP
      </button>
      <button
        v-if="offers.offer"
        type="button"
        class="btn btn--sm"
        :disabled="disabled"
        @click="emit('buff')"
      >
        {{ offers.offer }} on yourself
      </button>
      <button
        v-for="t in offers.blood?.toggles ?? []"
        :key="t"
        type="button"
        class="btn btn--sm"
        :disabled="disabled"
        :title="`Blood magic: ${offers.blood?.name}`"
        @click="emit('blood', t)"
      >
        {{ t }} on yourself
      </button>
      <button
        type="button"
        class="btn btn--ghost btn--sm"
        :aria-label="`Dismiss ${offers.def.name}'s offers`"
        @click="emit('dismiss')"
      >
        Dismiss
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.spell-result {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 8px;

  .roll-status {
    margin: 0;
  }
}

.spell-result__offers {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
