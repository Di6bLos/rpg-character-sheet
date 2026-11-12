<script setup lang="ts">
// The campaign board and GM console share this frame (design/screens/BoardShell.dc.html):
// campaign title, campaign switcher, preview / console links and the routed tabs.
import { plural, sessionDate } from '~/utils/format'
import { systemLabel } from '~/utils/systems'

const props = defineProps<{ unread?: number }>()

const route = useRoute()
const store = useCampaignStore()
const characters = useCharacterStore()
const snackbar = useSnackbarStore()
const { mode, campaign, campaignId, isGm, base, reloadRoster } = useCampaignBoard()

const meta = computed(() => {
  const c = campaign.value
  if (!c) return ''
  return [
    systemLabel(c.system),
    `GM ${c.gmName}`,
    plural(c.playerCount, 'player'),
    c.next_session_at ? `next session ${sessionDate(c.next_session_at)}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
})

/** Campaigns this user can switch to from here (the console only lists ones they run). */
const switchable = computed(() =>
  mode === 'console' ? store.campaigns.filter((c) => c.myRole === 'gm') : store.campaigns,
)

const tabs = computed(() => {
  const list = [
    { id: 'party', label: 'Party', badge: props.unread ?? 0 },
    { id: 'journal', label: 'Journal', badge: 0 },
    { id: 'maps', label: 'Maps & images', badge: 0 },
  ]
  if (mode === 'console') list.push({ id: 'npcs', label: 'NPCs', badge: 0 })
  return list
})

function isCurrent(id: string) {
  return route.path === `${base.value}/${id}` || route.path.startsWith(`${base.value}/${id}/`)
}
/** Same tab in another campaign: its console if you run it, its board if you play in it. */
function switchTo(id: string) {
  const current = tabs.value.find((t) => isCurrent(t.id))?.id ?? 'party'
  const gm = store.byId(id)?.myRole === 'gm'
  const tab = !gm && current === 'npcs' ? 'party' : current
  return `/campaigns/${id}/${gm ? 'gm' : 'board'}/${tab}`
}

// --- Playing as (players on the board) ------------------------------------------
const myOptions = computed(() =>
  characters.characters.filter((c) => c.system === campaign.value?.system),
)
onMounted(() => void characters.fetchMine())

async function seat(event: Event) {
  const value = (event.target as HTMLSelectElement).value || null
  try {
    await store.seatCharacter(campaignId.value, value)
    await reloadRoster()
    snackbar.show(value ? 'Character seated at this table' : 'Character removed from this table')
  } catch (err) {
    snackbar.error(err, 'Could not change your character')
  }
}
</script>

<template>
  <div v-if="campaign" class="page shell">
    <header class="shell__head">
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
    <p v-if="mode === 'board' && !isGm && !myOptions.length" class="small muted">
      You have no {{ systemLabel(campaign.system) }} character yet.
      <NuxtLink to="/characters">Create one</NuxtLink> to seat it here.
    </p>

    <nav aria-label="Board sections" class="shell__tabs">
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
