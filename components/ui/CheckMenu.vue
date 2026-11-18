<script setup lang="ts">
defineProps<{ label: string; value: string; placeholder?: string }>()

const uid = useId()
const root = ref<HTMLDetailsElement | null>(null)

function onOutside(event: Event) {
  if (root.value?.open && !root.value.contains(event.target as Node)) root.value.open = false
}

onMounted(() => document.addEventListener('pointerdown', onOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside))
</script>

<template>
  <div class="check-menu">
    <span :id="`${uid}-h`" class="caps">{{ label }}</span>
    <details ref="root" class="check-menu__menu">
      <summary class="input check-menu__field" :aria-labelledby="`${uid}-h ${uid}-v`">
        <span :id="`${uid}-v`" :class="{ muted: !value }">{{
          value || placeholder || 'None'
        }}</span>
      </summary>
      <div class="check-menu__list" role="group" :aria-labelledby="`${uid}-h`">
        <slot />
      </div>
    </details>
  </div>
</template>

<style scoped lang="scss">
.check-menu {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.check-menu__menu {
  position: relative;
}

.check-menu__field {
  display: flex;
  align-items: center;
  padding-right: 36px;
  cursor: pointer;
  list-style: none;
  background-image:
    linear-gradient(45deg, transparent 50%, currentColor 50%),
    linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position:
    calc(100% - 18px) 50%,
    calc(100% - 13px) 50%;
  background-size:
    5px 5px,
    5px 5px;
  background-repeat: no-repeat;

  &::-webkit-details-marker {
    display: none;
  }

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.check-menu__menu[open] > .check-menu__field {
  border-color: var(--accent);
}

.check-menu__list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  max-height: 320px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-control);
  background: var(--field);
  box-shadow: 0 8px 24px rgb(0 0 0 / 35%);
}

:slotted(.check-menu__item) {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 14px;
  color: var(--page-soft);
  cursor: pointer;
}

:slotted(.check-menu__item:hover) {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

:slotted(.check-menu__item.on) {
  color: var(--page-text);
}

:slotted(.check-menu__item input[type='checkbox']) {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}

:slotted(.check-menu__item small) {
  font-size: 12px;
  color: var(--page-muted);
}
</style>
