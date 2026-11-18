<script setup lang="ts">
const props = defineProps<{ campaignId: string; characterId: string; fallback: string }>()

const { order, turnId, round } = useInitiative(
  computed(() => props.campaignId),
  ref(false),
  { channel: `turn-who-${props.characterId}` },
)
const acting = computed(() => order.value.find((c) => c.id === turnId.value) ?? null)
const text = computed(() =>
  acting.value && acting.value.character_id !== props.characterId
    ? `${acting.value.name}’s turn · round ${round.value}`
    : props.fallback,
)
</script>

<template>
  <span class="who">{{ text }}</span>
</template>

<style scoped lang="scss">
.who {
  font-size: 13px;
  font-weight: 600;
  color: var(--page-soft);
}
</style>
