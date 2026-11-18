<template>
  <svg
    class="broken"
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path
      d="M12 3v2.2M12 18.8V21M4.2 7.5l1.9 1.1M17.9 15.4l1.9 1.1M4.2 16.5l1.9-1.1M17.9 8.6l1.9-1.1"
    />
    <path d="M9.5 7.2A5 5 0 0 1 16.4 9" />
    <path d="M16.9 12.6a5 5 0 0 1-6 4.2" />
    <path d="M8.6 15.9A5 5 0 0 1 7.1 11" />
    <path d="M13 6l-2 5 3 2-2 5" />
  </svg>
</template>

<style scoped>
.broken {
  flex: none;
  color: var(--danger, #e2735f);
  vertical-align: -3px;
}
</style>
