<script setup lang="ts">
// Settings → Suggested NPCs & monsters: stat blocks this player sent for the shared
// pool, and what the moderators decided. Approved ones show up in the Library.
import type { NpcSubmission } from '~/types'
import { shortDate } from '~/utils/format'
import { systemLabel } from '~/utils/systems'

const store = useNpcSubmissionStore()
const auth = useAuthStore()
const snackbar = useSnackbarStore()
const busy = ref<string | null>(null)

onMounted(
  () =>
    void store.fetchMine().catch((err) => snackbar.error(err, 'Could not load your suggestions')),
)

const STATUS = {
  pending: 'Waiting for review',
  approved: 'In the Library',
  rejected: 'Not approved',
} as const

async function withdraw(s: NpcSubmission) {
  busy.value = s.id
  try {
    await store.withdraw(s.id)
    snackbar.show(`${s.name} withdrawn`)
  } catch (err) {
    snackbar.error(err, 'Could not withdraw it')
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <section id="npc-suggestions" class="panel" aria-labelledby="sugg-h">
    <div class="panel-title">
      <h2 id="sugg-h">Suggested NPCs &amp; monsters</h2>
      <NuxtLink v-if="!auth.isSuspended" to="/settings/npcs/new" class="btn btn--sm"
        >Suggest one</NuxtLink
      >
    </div>
    <p class="small muted sugg__intro">
      Made a stat block other GMs would enjoy? Send it in. A moderator reviews each suggestion and,
      once approved, it joins the Library’s NPCs &amp; monsters as Homebrew, credited to you.
    </p>

    <div
      v-if="store.loadingMine && !store.mine.length"
      class="spinner"
      role="status"
      aria-label="Loading your suggestions"
    />
    <p v-else-if="!store.mine.length" class="small muted sugg__empty">
      You haven’t suggested anything yet.
    </p>
    <ul v-else class="sugg__list">
      <li v-for="s in store.mine" :key="s.id" class="sugg__row">
        <div class="sugg__main">
          <strong>{{ s.name }}</strong>
          <span class="small muted">
            {{ systemLabel(s.system) }}{{ s.level ? ` · Level ${s.level}` : '' }} · sent
            {{ shortDate(s.created_at) }}
          </span>
        </div>
        <span class="sugg__status" :class="`is-${s.status}`">{{ STATUS[s.status] }}</span>
        <span class="sugg__tools">
          <NuxtLink
            v-if="s.status === 'approved'"
            :to="{ path: '/library', query: { tab: 'npcs', q: s.name } }"
            class="btn btn--ghost btn--sm"
            >View</NuxtLink
          >
          <template v-else>
            <NuxtLink
              :to="{ path: '/settings/npcs/new', query: { edit: s.id } }"
              class="btn btn--ghost btn--sm"
              >{{ s.status === 'rejected' ? 'Fix & resend' : 'Edit' }}</NuxtLink
            >
            <button
              type="button"
              class="btn btn--quiet btn--sm"
              :disabled="busy === s.id"
              @click="withdraw(s)"
            >
              Withdraw
            </button>
          </template>
        </span>
        <p v-if="s.status === 'rejected' && s.review_note" class="small sugg__note">
          <strong>Moderator:</strong> {{ s.review_note }}
        </p>
      </li>
    </ul>
  </section>
</template>

<style scoped lang="scss">
.sugg__intro {
  margin: 0 0 12px;
}

.sugg__empty {
  margin: 0;
}

.sugg__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.sugg__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  padding: 12px 0;
  border-top: 1px solid var(--line);
}

.sugg__main {
  flex: 1 1 200px;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sugg__status {
  padding: 2px 8px;
  border-radius: var(--radius-control);
  border: 1px solid var(--line);
  font-size: 12px;
  font-weight: 700;

  &.is-approved {
    border-color: var(--accent-text);
    color: var(--accent-text);
  }

  &.is-rejected {
    background: var(--warn-bg);
    color: var(--warn-text);
    border-color: transparent;
  }
}

.sugg__tools {
  display: flex;
  gap: 6px;
}

.sugg__note {
  flex: 1 0 100%;
  margin: 0;
  padding: 8px 12px;
  border-radius: min(var(--radius-control), 8px);
  background: var(--warn-bg);
  color: var(--warn-text);
}
</style>
