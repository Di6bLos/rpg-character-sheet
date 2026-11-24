<script setup lang="ts">
// The campaign board and GM console share this frame (design/screens/BoardShell.dc.html):
// campaign title, campaign switcher, preview / console links and the routed tabs.
// On the battle board (Battle tab, Nimble) the header and tabs hide and
// the battle bar shows them instead, reading the same state through `useBoardNav()`.
import { plural } from '~/utils/format'
import { systemLabel } from '~/utils/systems'

const props = defineProps<{ unread?: number }>()

const { mode, campaign, isGm, base } = useCampaignBoard()
const { meta, tabs, isCurrent, switchable, switchTo, myOptions, seat } = provideBoardNav(
  () => props.unread ?? 0,
)

const { battle: nimble } = useBoardLayout()
const battle = computed(() => nimble.value && isCurrent('battle'))
</script>

<template>
  <div v-if="campaign" class="page shell" :class="{ 'shell--battle': battle }">
    <header v-if="!battle" class="shell__head">
      <div class="shell__title">
        <div class="shell__eyebrow">{{ mode === 'console' ? 'GM console' : 'Campaign board' }}</div>
        <h1>{{ campaign.name }}</h1>
        <div class="shell__meta">{{ meta }}</div>
      </div>
      <div class="shell__tools">
        <div v-if="switchable.length > 1" role="group" aria-label="Campaign" class="seg">
          <NuxtLink
            v-for="c in switchable"
            :key="c.id"
            :to="switchTo(c.id)"
            :aria-current="c.id === campaign.id ? 'page' : undefined"
            >{{ c.name }}</NuxtLink
          >
        </div>
        <template v-if="!isGm">
          <label class="playing">
            <span>Playing as</span>
            <select class="input" :value="campaign.myCharacterId ?? ''" @change="seat">
              <option value="">No character yet</option>
              <option v-for="c in myOptions" :key="c.id" :value="c.id">
                {{ c.name }} · level {{ c.level }}
              </option>
            </select>
          </label>
          <NuxtLink
            v-if="campaign.myCharacterId"
            :to="`/character/${campaign.myCharacterId}?campaign=${campaign.id}`"
            class="btn btn--ghost"
            >Open sheet</NuxtLink
          >
        </template>
      </div>
    </header>
    <p v-if="!battle && mode === 'board' && !isGm && !myOptions.length" class="small muted">
      You have no {{ systemLabel(campaign.system) }} character yet.
      <NuxtLink to="/characters">Create one</NuxtLink> to seat it here.
    </p>

    <nav v-if="!battle" aria-label="Board sections" class="shell__tabs">
      <NuxtLink
        v-for="t in tabs"
        :key="t.id"
        :to="`${base}/${t.id}`"
        :aria-current="isCurrent(t.id) ? 'page' : undefined"
      >
        {{ t.label }}
        <span v-if="t.badge" class="shell__badge" :aria-label="plural(t.badge, 'unread message')">{{
          t.badge
        }}</span>
      </NuxtLink>
    </nav>

    <slot />
  </div>
</template>

<style scoped lang="scss">
.shell {
  max-width: 1280px;
  gap: 22px;
  padding-top: 28px;
  padding-bottom: 64px;
}

// The battle board takes the whole width and height under the app nav.
.shell--battle {
  max-width: none;
  padding: 0;
  gap: 0;
}

.shell__head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: 18px;
}

.shell__title {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;

  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-size: clamp(34px, 4.6vw, 56px);
    line-height: 1.05;
    letter-spacing: var(--display-spacing, 0);
  }
}

.shell__eyebrow {
  font-family: var(--font-heading);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--page-muted);
}

.shell__meta {
  font-size: 16px;
  color: var(--page-muted);
}

.shell__tools {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.seg {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px;
  border-radius: var(--radius-control);
  background: var(--field);
  border: 1px solid var(--line);

  > a,
  > button {
    display: inline-flex;
    align-items: center;
    min-height: 40px;
    padding: 0 14px;
    border: 0;
    border-radius: min(var(--radius-control), 8px);
    background: transparent;
    color: var(--page-muted);
    font-size: 14px;
    font-weight: 600;
    text-decoration: none;

    &[aria-pressed='true'],
    &[aria-current='page'] {
      background: var(--inset);
      color: var(--page-text);
      box-shadow: inset 0 0 0 1px var(--line-strong);
    }
  }
}

.playing {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--page-soft);

  .input {
    width: auto;
    min-width: 200px;
  }
}

.shell__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  border-bottom: 1px solid var(--line);

  a {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 52px;
    padding: 0 20px;
    font-family: var(--font-heading);
    font-size: 20px;
    font-weight: 700;
    color: var(--page-muted);
    text-decoration: none;

    &[aria-current='page'] {
      color: var(--page-text);
      box-shadow: inset 0 -3px 0 var(--accent);
    }
  }
}

.shell__badge {
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  box-sizing: border-box;
  border-radius: 999px;
  background: var(--accent);
  color: var(--on-accent);
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 560px) {
  .shell__tabs a {
    padding: 0 12px;
    font-size: 17px;
  }

  .playing {
    flex-wrap: wrap;

    .input {
      min-width: 0;
      width: 100%;
    }
  }
}
</style>
