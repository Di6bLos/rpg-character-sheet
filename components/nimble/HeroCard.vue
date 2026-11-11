<script setup lang="ts">
// Selectable class card for the Nimble hero picker: sigil, NAME, tagline.
defineProps<{
  slug: string
  name: string
  tagline: string
  complexity?: number
  selected?: boolean
  badge?: string
}>()
defineEmits<{ select: [] }>()
</script>

<template>
  <button type="button" class="hero" :aria-pressed="selected" @click="$emit('select')">
    <span class="hero__art">
      <NimbleSigil :slug="slug" :size="100" />
      <span v-if="badge" class="hero__badge">{{ badge }}</span>
    </span>
    <span class="hero__name">{{ name }}</span>
    <span class="hero__tagline">{{ tagline }}</span>
    <span v-if="complexity" class="hero__complexity" :aria-label="`Complexity ${complexity} of 3`">
      <i v-for="n in 3" :key="n" :class="{ on: n <= complexity }" />
    </span>
  </button>
</template>

<style scoped lang="scss">
.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 18px 14px 16px;
  text-align: center;
  background: var(--panel-bg);
  color: var(--panel-text);
  border: 1px solid var(--panel-line);
  border-radius: min(var(--radius-panel), 12px);
  box-shadow: var(--panel-shadow);
  transition:
    border-color 0.15s ease,
    transform 0.15s ease;

  &:hover {
    border-color: var(--accent);
  }

  &[aria-pressed='true'] {
    border: 2px solid var(--accent);
    padding: 17px 13px 15px;
    background: color-mix(in srgb, var(--accent) 10%, var(--panel-bg));
  }

  &:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
}

.hero__art {
  position: relative;
  width: 112px;
  height: 112px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-ink);
  background: radial-gradient(
    circle at 50% 40%,
    color-mix(in srgb, var(--accent) 22%, transparent),
    color-mix(in srgb, var(--accent) 4%, transparent) 70%
  );
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
}

.hero__badge {
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-line-strong);
  color: var(--panel-soft);
  white-space: nowrap;
}

@media (max-width: 560px) {
  .hero {
    padding: 14px 8px 12px;

    &[aria-pressed='true'] {
      padding: 13px 7px 11px;
    }
  }

  .hero__art {
    width: 84px;
    height: 84px;

    :deep(svg) {
      width: 76px;
      height: 76px;
    }
  }

  .hero__name {
    font-size: 15px !important;
  }

  .hero__tagline {
    font-size: 12px !important;
  }
}

.hero__name {
  margin-top: 6px;
  font-family: var(--font-heading);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.hero__tagline {
  font-size: 13px;
  line-height: 1.4;
  color: var(--panel-soft);
}

.hero__complexity {
  display: flex;
  gap: 4px;
  margin-top: 2px;

  i {
    width: 8px;
    height: 8px;
    transform: rotate(45deg);
    border: 1px solid var(--panel-line-strong);

    &.on {
      background: var(--accent);
      border-color: var(--accent);
    }
  }
}
</style>
