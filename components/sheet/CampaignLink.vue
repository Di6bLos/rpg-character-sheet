<script setup lang="ts">
const { campaignName, campaignId } = useSheet()
</script>

<template>
  <NuxtLink
    v-if="campaignId"
    :to="`/campaigns/${campaignId}/board`"
    class="campaign-link"
    :title="`Open the ${campaignName} board`"
    >{{ campaignName }}</NuxtLink
  >
  <span v-else>{{ campaignName }}</span>
</template>

<style scoped lang="scss">
.campaign-link {
  color: inherit;
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, currentColor 40%, transparent);
  text-underline-offset: 3px;

  &:hover {
    color: var(--accent-text);
    text-decoration-color: currentColor;
  }

  // A 44px tall touch target around the name, without moving the line.
  @media (pointer: coarse) {
    position: relative;

    &::after {
      content: '';
      position: absolute;
      top: 50%;
      left: -4px;
      right: -4px;
      height: 44px;
      transform: translateY(-50%);
    }
  }
}
</style>
