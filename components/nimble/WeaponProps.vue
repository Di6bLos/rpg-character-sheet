<script setup lang="ts">
const model = defineModel<string>()

interface PropDef {
  key: string
  label: string
  value?: number
  text: (n: number) => string
  read: RegExp
}

const PROPS: PropDef[] = [
  { key: '2h', label: '2-handed', text: () => '2-handed', read: /\b2-handed\b/ },
  { key: 'light', label: 'Light', text: () => 'Light', read: /\bLight\b/ },
  { key: 'vicious', label: 'Vicious', text: () => 'Vicious', read: /\bVicious\b/ },
  { key: 'reach', label: 'Reach', value: 2, text: (n) => `Reach ${n}`, read: /\bReach (\d+)/ },
  {
    key: 'thrown',
    label: 'Thrown',
    value: 4,
    text: (n) => `Thrown ${n}`,
    read: /\bThrown (\d+)/,
  },
  { key: 'range', label: 'Range', value: 12, text: (n) => `Range ${n}`, read: /\bRange (\d+)/ },
  {
    key: 'load',
    label: 'Load',
    value: 1,
    text: (n) => `Load: ${n} action${n === 1 ? '' : 's'}`,
    read: /\bLoad: (\d+) actions?/,
  },
]

const state = computed(() =>
  PROPS.map((p) => {
    const m = p.read.exec(model.value ?? '')
    return { ...p, on: !!m, n: m?.[1] ? Number(m[1]) : (p.value ?? 0) }
  }),
)

function write(list: { text: (n: number) => string; on: boolean; n: number }[]) {
  model.value = list
    .filter((p) => p.on)
    .map((p) => p.text(p.n))
    .join(', ')
}

function toggle(key: string, on: boolean) {
  write(state.value.map((p) => (p.key === key ? { ...p, on } : p)))
}

function setValue(key: string, event: Event) {
  const n = Math.max(
    1,
    Math.min(99, Math.floor(Number((event.target as HTMLInputElement).value)) || 1),
  )
  write(state.value.map((p) => (p.key === key ? { ...p, n, on: true } : p)))
}
</script>

<template>
  <UiCheckMenu label="Properties" :value="model ?? ''">
    <label v-for="p in state" :key="p.key" class="check-menu__item" :class="{ on: p.on }">
      <input
        type="checkbox"
        :checked="p.on"
        @change="toggle(p.key, ($event.target as HTMLInputElement).checked)"
      />
      <span>{{ p.label }}</span>
      <input
        v-if="p.value !== undefined"
        type="number"
        class="input wprops__n"
        min="1"
        max="99"
        :value="p.n"
        :aria-label="`${p.label} ${p.key === 'load' ? 'actions' : 'spaces'}`"
        @change="setValue(p.key, $event)"
      />
      <small v-if="p.value !== undefined">{{ p.key === 'load' ? 'actions' : 'spaces' }}</small>
    </label>
  </UiCheckMenu>
</template>

<style scoped lang="scss">
.wprops__n {
  width: 64px;
  min-height: 30px;
  margin-left: auto;
  padding: 2px 8px;
}
</style>
