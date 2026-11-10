<script setup lang="ts">
// Shown where a restricted action would be, with the reason an admin gave.
import { shortDate } from '~/utils/format'

defineProps<{ title: string; fallback?: string }>()

const auth = useAuthStore()
const p = computed(() => auth.permissions)
</script>

<template>
  <div class="restricted" role="note">
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </svg>
    <div>
      <strong>{{ p?.suspended ? 'Your account is suspended' : title }}</strong>
      <span>
        <template v-if="p?.restricted_at"
          >An admin restricted this on {{ shortDate(p.restricted_at) }}.
        </template>
        <template v-if="p?.restriction_reason">Reason: {{ p.restriction_reason }}. </template>
        <slot>{{ fallback }}</slot>
        Contact an admin if you think this is a mistake.
      </span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.restricted {
  display: flex;
  gap: 12px;
  padding: 14px;
  border-radius: min(var(--radius-panel), 10px);
  background: var(--danger-bg);
  border: 1px solid color-mix(in srgb, var(--danger) 45%, transparent);
  color: var(--danger-text);

  svg {
    flex: none;
    margin-top: 2px;
  }

  div {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 14px;
    line-height: 1.5;
  }

  span {
    opacity: 0.9;
  }
}
</style>
