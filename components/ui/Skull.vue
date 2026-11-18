<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 48 })
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 64 64"
    fill="currentColor"
    aria-hidden="true"
    class="ui-skull"
  >
    <path
      d="M32 4C18.7 4 9 13.6 9 26.4c0 7.4 3.3 13 8.4 16.4V50c0 2.2 1.8 4 4 4h3v4h4.6v-4h6v4h4.6v-4h3c2.2 0 4-1.8 4-4v-7.2C51.7 39.4 55 33.8 55 26.4 55 13.6 45.3 4 32 4Zm-10.5 33.5c-3.9 0-7-3.1-7-7s3.1-6.5 7-6.5 7 2.6 7 6.5-3.1 7-7 7Zm10.5 7.3-3.6-6.3h7.2L32 44.8Zm10.5-7.3c-3.9 0-7-3.1-7-7s3.1-6.5 7-6.5 7 2.6 7 6.5-3.1 7-7 7Z"
    />
  </svg>
</template>
