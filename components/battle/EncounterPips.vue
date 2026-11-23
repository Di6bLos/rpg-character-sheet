<script setup lang="ts">
// An encounter card's action pips. A monster's are buttons (a click spends the next pip,
// a spent one refunds down to it); a hero's come from their sheet and only show.
const props = defineProps<{ name: string; total: number; used: number; readonly?: boolean }>()
const emit = defineEmits<{ set: [used: number] }>()

function onPip(n: number) {
  emit('set', n <= props.used ? n - 1 : props.used + 1)
}
</script>

<template>
  <span class="ep" role="group" :aria-label="`${name} actions`">
    <template v-if="readonly">
      <i v-for="n in total" :key="n" :class="{ 'is-used': n <= used }" aria-hidden="true" />
      <span class="sr-only">{{ total - used }} of {{ total }} actions left</span>
    </template>
    <template v-else>
      <button
        v-for="n in total"
        :key="n"
        type="button"
        :class="{ 'is-used': n <= used }"
        :aria-label="`${n <= used ? 'Refund' : 'Spend'} action ${n}`"
        @click.stop="onPip(n)"
      />
    </template>
  </span>
</template>

<style scoped lang="scss">
.ep {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;

  i,
  button {
    width: 12px;
    height: 12px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--accent);

    &.is-used {
      background: transparent;
      box-shadow: inset 0 0 0 1.5px var(--page-muted);
    }
  }

  i {
    width: 9px;
    height: 9px;
  }

  button {
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
  }
}
</style>
