<script setup lang="ts">
// Portrait frame + upload control. Layouts restyle it through the `frame` class
// and the upload label slot.
withDefaults(defineProps<{ placeholder?: string; uploadLabel?: string; hideUpload?: boolean }>(), {
  placeholder: 'No portrait yet',
  uploadLabel: 'Upload portrait',
  hideUpload: false,
})

const { draft, portrait, canEdit, uploadingPortrait, onPortrait } = useSheet()
</script>

<template>
  <div class="portrait">
    <div class="portrait__frame">
      <img v-if="portrait" :src="portrait" :alt="`Portrait of ${draft.name}`" />
      <div v-else-if="$slots.empty" class="portrait__empty">
        <slot name="empty" />
      </div>
      <div v-else class="portrait__empty">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="2" />
          <path d="M21 17l-5-5-9 8" />
        </svg>
        {{ placeholder }}
      </div>
      <slot name="overlay" />
    </div>
    <label v-if="canEdit && !hideUpload" class="portrait__upload">
      <input type="file" accept="image/*" :disabled="uploadingPortrait" @change="onPortrait" />
      {{ uploadingPortrait ? 'Uploading…' : uploadLabel }}
    </label>
  </div>
</template>

<style scoped lang="scss">
.portrait {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.portrait__frame {
  position: relative;
  width: var(--portrait-w, 200px);
  height: var(--portrait-h, 240px);
  border-radius: var(--portrait-radius, 10px);
  border: 1px solid var(--line-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  background: repeating-linear-gradient(
    135deg,
    var(--inset) 0 10px,
    color-mix(in srgb, var(--inset) 82%, #000) 10px 20px
  );

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: inherit;
  }
}

.portrait__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--page-muted);
  font-size: 13px;
}

.portrait__upload {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  border-radius: var(--radius-control);
  border: 1px solid var(--line-strong);
  color: var(--page-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;

  input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  &:focus-within {
    outline: 2px solid var(--accent-text);
    outline-offset: 3px;
  }
}
</style>
