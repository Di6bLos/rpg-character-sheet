<script setup lang="ts">
const store = useNotificationsStore()
</script>

<template>
  <div class="notices" role="status" aria-live="polite">
    <TransitionGroup name="notice">
      <article
        v-for="n in store.notices"
        :key="n.id"
        class="notice"
        :class="`notice--${n.kind}`"
        @mouseenter="store.pause(n.id)"
        @mouseleave="store.resume(n.id)"
        @focusin="store.pause(n.id)"
        @focusout="store.resume(n.id)"
      >
        <NuxtLink :to="n.to" class="notice__link" @click="store.dismiss(n.id)">
          <span class="notice__title">{{ n.title }}</span>
          <span class="notice__who">{{ n.subtitle }}</span>
          <span v-if="n.body" class="notice__body">{{ n.body }}</span>
        </NuxtLink>
        <button
          type="button"
          class="notice__close"
          aria-label="Dismiss notification"
          @click="store.dismiss(n.id)"
        >
          <span aria-hidden="true">×</span>
        </button>
      </article>
    </TransitionGroup>
  </div>
</template>

<style scoped lang="scss">
.notices {
  position: fixed;
  top: 76px;
  right: 16px;
  z-index: 210;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(360px, calc(100vw - 32px));
  pointer-events: none;
}

.notice {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 4px;
  background: var(--panel-bg);
  color: var(--panel-text);
  border: 1px solid var(--panel-line);
  border-left: 4px solid var(--accent);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  // Same remap as .panel, so accent text stays readable on light panels (Cursed parchment).
  --accent-text: var(--accent-ink);

  &--secret {
    border-left-style: double;
    border-left-width: 6px;
  }
}

.notice__link {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 4px 12px 14px;
  color: inherit;
  text-decoration: none;
  border-radius: 10px 0 0 10px;

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
}

.notice__title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent-text);
}

.notice__who {
  font-size: 13px;
  color: var(--panel-muted);
  overflow-wrap: anywhere;
}

.notice__body {
  font-size: 15px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.notice__close {
  flex: none;
  width: 44px;
  height: 44px;
  margin: 2px 2px 0 0;
  border: 0;
  background: none;
  color: var(--panel-muted);
  font-size: 20px;
  line-height: 1;
  border-radius: 6px;
  cursor: pointer;

  &:hover {
    color: var(--panel-text);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
}

.notice-enter-active,
.notice-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.notice-enter-from,
.notice-leave-to {
  opacity: 0;
  transform: translateX(12px);
}

@media (prefers-reduced-motion: reduce) {
  .notice-enter-active,
  .notice-leave-active {
    transition: none;
  }
}
</style>
