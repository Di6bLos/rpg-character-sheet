<script setup lang="ts">
// An encounter card's action pips. A monster's are buttons (a click spends the next pip,
// a spent one refunds down to it); a hero's come from their sheet and only show.
// Compact (phone): each button is a 44px target, 8px apart, around a larger pip.
const props = defineProps<{
  name: string
  total: number
  used: number
  readonly?: boolean
  compact?: boolean
}>()
const emit = defineEmits<{ set: [used: number] }>()

function onPip(n: number) {
  emit('set', n <= props.used ? n - 1 : props.used + 1)
}
</script>

<template>
  <span class="ep" :class="{ 'ep--compact': compact }" role="group" :aria-label="`${name} actions`">
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

// The pip is drawn inside the 44px button, so the target is big and the look stays.
.ep--compact {
  gap: 8px;

  i {
    width: 14px;
    height: 14px;
  }

  button {
    position: relative;
    width: 44px;
    height: 44px;
    background: transparent;

    &::after {
      content: '';
      position: absolute;
      inset: 13px;
      border-radius: 50%;
      background: var(--accent);
    }

    &.is-used {
      box-shadow: none;

      &::after {
        background: transparent;
        box-shadow: inset 0 0 0 1.5px var(--page-muted);
      }
    }

    &:focus-visible {
      outline-offset: -4px;
    }
  }
}
</style>
