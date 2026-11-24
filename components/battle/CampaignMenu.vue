<script setup lang="ts">
// The campaign part of the battle board's campaign menu: what the campaign is, the
// campaign switcher and "Playing as" (players). Shared by the desktop bar and the phone
// bar; the parent owns the popup. Several root elements, so it sits in the parent's
// menu column as its own rows.
import { systemLabel } from '~/utils/systems'

const emit = defineEmits<{ navigate: [] }>()

const { campaign, isGm, gmControls } = useCampaignBoard()
const { meta, switchable, switchTo, myOptions, seat } = useBoardNav()
</script>

<template>
  <div class="bar__meta">
    <span class="bar__eyebrow">{{ gmControls ? 'GM console' : 'Campaign board' }}</span>
    <span class="small muted">{{ meta }}</span>
  </div>
  <nav v-if="campaign && switchable.length > 1" aria-label="Campaign" class="bar__switch">
    <NuxtLink
      v-for="c in switchable"
      :key="c.id"
      :to="switchTo(c.id)"
      :aria-current="c.id === campaign.id ? 'page' : undefined"
      @click="emit('navigate')"
      >{{ c.name }}</NuxtLink
    >
  </nav>
  <label v-if="campaign && !isGm" class="field">
    <span>Playing as</span>
    <select class="input" :value="campaign.myCharacterId ?? ''" @change="seat">
      <option value="">No character yet</option>
      <option v-for="c in myOptions" :key="c.id" :value="c.id">
        {{ c.name }} · level {{ c.level }}
      </option>
    </select>
  </label>
  <p v-if="campaign && !isGm && !myOptions.length" class="small muted">
    You have no {{ systemLabel(campaign.system) }} character yet.
    <NuxtLink to="/characters">Create one</NuxtLink> to seat it here.
  </p>
</template>

<style scoped lang="scss">
.bar__meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bar__eyebrow {
  font-family: var(--font-heading);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--page-muted);
}

.bar__switch {
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-top: 1px solid var(--line);
  padding-top: 10px;

  a {
    display: flex;
    align-items: center;
    min-height: 38px;
    padding: 0 10px;
    border-radius: min(var(--radius-control), 8px);
    color: var(--page-text);
    text-decoration: none;

    &:hover {
      background: var(--accent-tint);
    }

    &[aria-current='page'] {
      font-weight: 700;
      box-shadow: inset 3px 0 0 var(--accent);
    }
  }
}
</style>
