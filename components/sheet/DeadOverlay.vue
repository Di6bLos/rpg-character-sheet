<script setup lang="ts">
// A dead hero's portrait on the Nimble and PF2e sheets: `public/images/dead-portrait.jpg` over
// the uploaded one (kept), or the skull when that file is missing (utils/deadPortrait.ts). Put it
// in SheetPortrait's `#overlay` slot.
import { DEAD_PORTRAIT } from '~/utils/deadPortrait'

defineProps<{ name: string }>()
const failed = ref(false)
</script>

<template>
  <div class="dead-overlay" role="img" :aria-label="`${name} is dead`">
    <img v-if="!failed" :src="DEAD_PORTRAIT" alt="" @error="failed = true" />
    <UiSkull v-else :size="96" />
  </div>
</template>

<style scoped lang="scss">
.dead-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: inherit;
  background: #000;
  color: #d9d2c5;

  img {
    position: absolute;
    inset: 3% 0;
    width: 100%;
    height: 94%;
    object-fit: contain;
  }
}
</style>
