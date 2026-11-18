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
}
</style>
