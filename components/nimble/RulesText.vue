<script setup lang="ts">
// Rules text with "KEY" replaced by the hero's number: "1d12+KEY" reads
// "1d12+2", with the 2 highlighted. Without a key value the text is unchanged.
import type { NimbleStat } from '~/types/sheets'

const props = defineProps<{
  text: string
  keyValue?: { value: number; stats: NimbleStat[] } | null
}>()

type Part = { text: string; key?: false } | { text: string; key: true }

const parts = computed<Part[]>(() => {
  const k = props.keyValue
  const text = props.text
  if (!k || !text.includes('KEY')) return [{ text }]
  const out: Part[] = []
  const re = /(\+)?\bKEY\b/g
  const num = k.value < 0 ? `−${-k.value}` : String(k.value)
  let last = 0
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0
    // "+KEY" with a negative stat reads "−1", not "+−1".
    const prefix = m[1] && k.value >= 0 ? '+' : ''
    out.push({ text: text.slice(last, start) + prefix })
    out.push({ text: num, key: true })
    last = start + m[0].length
  }
  out.push({ text: text.slice(last) })
  return out
})

const title = computed(() =>
  props.keyValue ? `KEY: your higher Key Stat (${props.keyValue.stats.join(' or ')})` : '',
)
</script>

<template>
  <span
    ><template v-for="(p, i) in parts" :key="i"
      ><mark v-if="p.key" class="key" :title="title">{{ p.text }}</mark
      ><template v-else>{{ p.text }}</template></template
    ></span
  >
</template>

<style scoped lang="scss">
.key {
  padding: 0 3px;
  border-radius: 4px;
  background: var(--accent-tint);
  color: var(--accent-text);
  font-weight: 700;
  cursor: help;
}
</style>
