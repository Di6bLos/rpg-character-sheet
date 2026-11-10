<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 28 })
</script>

<template>
  <span class="logo">
    <svg
      :width="size"
      :height="size"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M16 3 28 10v12L16 29 4 22V10z" />
      <path d="M16 3v8M4 10l6 4M28 10l-6 4M10 14h12l-6 9zM16 23v6M10 14l-6 8M22 14l6 8" />
    </svg>
    <span class="logo__word">Lantern</span>
  </span>
</template>

<style scoped lang="scss">
.logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--page-text);

  svg {
    color: var(--accent-text);
  }
}

.logo__word {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: var(--display-spacing);
  text-transform: uppercase;
}

html[data-theme='gothic'] .logo__word {
  text-transform: none;
  font-weight: 400;
  font-size: 26px;
}

html[data-theme='cursed'] .logo__word {
  text-transform: none;
  font-weight: 400;
  font-size: 24px;
}
</style>
