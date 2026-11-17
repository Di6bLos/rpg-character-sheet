<script setup lang="ts">
// A slim mana bar for party roster cards; temporary mana shows past the pool.
const props = defineProps<{
  mana: { current: number; max: number; temp: number }
  name: string
}>()

const g = computed(() => {
  const max = Math.max(0, props.mana.max)
  const now = Math.min(max, Math.max(0, props.mana.current))
  const temp = Math.max(0, props.mana.temp)
  const total = max + temp || 1
  return {
    now,
    max,
    temp,
    pct: `${Math.round((now / total) * 100)}%`,
    tempPct: `${Math.round((temp / total) * 100)}%`,
    total: max + temp,
    label: `${props.name}: mana`,
    text: `${now} of ${max}${temp ? `, plus ${temp} temporary` : ''}`,
  }
})
</script>

<template>
  <div class="mana">
    <span class="caps">Mana</span>
    <div
      class="mana__bar"
      role="meter"
      :aria-label="g.label"
      aria-valuemin="0"
      :aria-valuemax="g.total"
      :aria-valuenow="g.now + g.temp"
      :aria-valuetext="g.text"
    >
      <span class="mana__fill" :style="{ width: g.pct }" />
      <span class="mana__temp" :style="{ left: g.pct, width: g.tempPct }" />
    </div>
    <span class="mana__txt">
      {{ g.now }} / {{ g.max }}<template v-if="g.temp"> +{{ g.temp }}</template>
    </span>
  </div>
</template>

<style scoped lang="scss">
.mana {
  display: flex;
  align-items: center;
  gap: 8px;
}

.caps {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--page-muted);
}

.mana__bar {
  position: relative;
  flex: 1 1 auto;
  max-width: 220px;
  height: 8px;
  border-radius: 999px;
  background: var(--track);
  overflow: hidden;
}

.mana__fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 999px;
  background: var(--secondary);
}

.mana__temp {
  position: absolute;
  top: 0;
  bottom: 0;
  // Striped, so it reads as different from the pool without relying on colour.
  background: repeating-linear-gradient(
    -45deg,
    var(--secondary) 0 3px,
    color-mix(in srgb, var(--secondary) 35%, transparent) 3px 6px
  );
}

.mana__txt {
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
