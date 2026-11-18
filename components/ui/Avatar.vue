<script setup lang="ts">
// A round portrait: the character's uploaded portrait (or any image URL),
// then the Nimble class sigil, then initials as a last resort.
import { portraitUrl } from '~/stores/character'
import { initials } from '~/utils/systems'
import { DEAD_PORTRAIT } from '~/utils/deadPortrait'

const props = withDefaults(
  defineProps<{
    name: string
    /** Path in the `portraits` bucket. */
    portraitPath?: string | null
    /** Any ready image URL (NPC images, signed URLs); wins over `portraitPath`. */
    src?: string | null
    /** Nimble class slug for the sigil fallback. */
    classSlug?: string | null
    /** Nimble companion animal, drawn when there is no image. */
    beast?: string | null
    size?: number
    /** Square with rounded corners (monsters) instead of round. */
    square?: boolean
    /** Greyed out (down, dead). */
    faded?: boolean
    /** A dead hero: a skull in place of the portrait. */
    dead?: boolean
  }>(),
  {
    portraitPath: null,
    src: null,
    classSlug: null,
    beast: null,
    size: 40,
    square: false,
    faded: false,
    dead: false,
  },
)

const failed = ref(false)
const deadFailed = ref(false)
/** Initials from letters only ("Morgan (GM)" → "MG"). */
const letters = computed(() => initials(props.name.replace(/[^\p{L}\p{N}\s]/gu, ' ')))
const url = computed(() => (failed.value ? null : (props.src ?? portraitUrl(props.portraitPath))))
watch(
  () => [props.src, props.portraitPath],
  () => (failed.value = false),
)
</script>

<template>
  <span
    class="ui-avatar"
    :class="{
      'ui-avatar--square': square,
      'ui-avatar--faded': faded && !dead,
      'ui-avatar--dead': dead,
    }"
    :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.38)}px` }"
    aria-hidden="true"
  >
    <img
      v-if="dead && !deadFailed"
      :src="DEAD_PORTRAIT"
      alt=""
      loading="lazy"
      @error="deadFailed = true"
    />
    <UiSkull v-else-if="dead" :size="Math.round(size * 0.66)" />
    <img v-else-if="url" :src="url" alt="" loading="lazy" @error="failed = true" />
    <NimbleBeast v-else-if="beast" :slug="beast" :size="Math.round(size * 0.8)" />
    <NimbleSigil v-else-if="classSlug" :slug="classSlug" :size="Math.round(size * 0.78)" />
    <span v-else>{{ letters }}</span>
  </span>
</template>

<style scoped lang="scss">
.ui-avatar {
  flex: none;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
  background: var(--inset, var(--line));
  color: var(--accent-text);
  font-family: var(--font-heading);
  font-weight: 700;
  line-height: 1;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &--square {
    border-radius: min(var(--radius-control), 10px);
  }

  &--dead {
    background: #000;
    color: #d9d2c5;

    img {
      transform: scale(0.96);
      object-fit: contain;
    }
  }

  &--faded {
    filter: grayscale(1);
    opacity: 0.55;
  }
}
</style>
