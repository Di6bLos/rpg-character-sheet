<script setup lang="ts">
defineProps<{ label: string; hideLabel?: boolean; disabled?: boolean; small?: boolean }>()
const checked = defineModel<boolean>({ required: true })
</script>

<template>
  <label class="switch" :class="{ 'is-disabled': disabled, 'switch--small': small }">
    <span :class="{ 'sr-only': hideLabel }" class="switch__label">{{ label }}</span>
    <button
      type="button"
      role="switch"
      :aria-checked="checked"
      :aria-label="label"
      :disabled="disabled"
      class="switch__track"
      @click="checked = !checked"
    >
      <span class="switch__knob" />
    </button>
  </label>
</template>

<style scoped lang="scss">
.switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 44px;
  cursor: pointer;

  &.is-disabled {
    cursor: not-allowed;
  }
}

.switch--small {
  gap: 10px;

  .switch__track {
    width: 36px;
    height: 20px;

    &[aria-checked='true'] .switch__knob {
      left: 19px;
    }
  }

  .switch__knob {
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
  }
}

.switch__track {
  flex: none;
  position: relative;
  width: 52px;
  height: 30px;
  border: 0;
  border-radius: 999px;
  background: var(--track);
  transition: background 0.15s ease;

  &[aria-checked='true'] {
    background: var(--accent);

    .switch__knob {
      left: 26px;
      background: var(--on-accent);
    }
  }
}

.switch__knob {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--page-text);
  transition: left 0.15s ease;
}
</style>
