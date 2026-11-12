<script setup lang="ts">
// GM console → NPCs sub-navigation: Index and Generator.
defineProps<{ current: 'index' | 'new' }>()
const { campaignId } = useCampaignBoard()
const npcs = useNpcStore()
</script>

<template>
  <div class="npc-tabs">
    <nav aria-label="NPC sections" class="seg">
      <NuxtLink
        :to="`/campaigns/${campaignId}/gm/npcs`"
        :aria-current="current === 'index' ? 'page' : undefined"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4 5h16M4 12h16M4 19h10" />
        </svg>
        Index
      </NuxtLink>
      <NuxtLink
        :to="`/campaigns/${campaignId}/gm/npcs/new`"
        :aria-current="current === 'new' ? 'page' : undefined"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
        </svg>
        Generator
      </NuxtLink>
    </nav>
    <span class="small muted">{{ npcs.campaignNpcs.length }} in this campaign</span>
  </div>
</template>

<style scoped lang="scss">
.npc-tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.seg {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: var(--radius-control);
  background: var(--field);
  border: 1px solid var(--line);

  a {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 42px;
    padding: 0 18px;
    border-radius: min(var(--radius-control), 8px);
    color: var(--page-muted);
    font-size: 15px;
    font-weight: 600;
    text-decoration: none;

    &[aria-current='page'] {
      background: var(--inset);
      color: var(--page-text);
      box-shadow: inset 0 0 0 1px var(--line-strong);
    }
  }
}
</style>
