<script setup lang="ts">
// GM console: invites, the players table, next session date and deleting the campaign.
import type { RosterEntry } from '~/types'
import { plural, toLocalInput } from '~/utils/format'

const auth = useAuthStore()
const store = useCampaignStore()
const snackbar = useSnackbarStore()
const { campaign, campaignId, roster } = useCampaignBoard()

const players = computed(() => roster.value.filter((r) => r.user_id !== auth.userId))

// --- Invites --------------------------------------------------------------------
const inviteDraft = ref('')
const inviting = ref(false)
const linkCopied = ref(false)

async function sendInvite() {
  const who = inviteDraft.value.trim()
  if (!who) return
  inviting.value = true
  try {
    await store.invite(campaignId.value, who)
    snackbar.show(`Invite sent to ${who}`)
    inviteDraft.value = ''
  } catch (err) {
    snackbar.error(err, 'Could not send the invite')
  } finally {
    inviting.value = false
  }
}

async function copyLink() {
  try {
    const link = await store.inviteLink(campaignId.value)
    await navigator.clipboard.writeText(link)
    linkCopied.value = true
    snackbar.show('Invite link copied')
  } catch (err) {
    snackbar.error(err, 'Could not copy the invite link')
  }
}

// --- Next session -----------------------------------------------------------------
const nextSession = ref(toLocalInput(campaign.value?.next_session_at ?? null))
watch(
  () => campaign.value?.next_session_at,
  (v) => (nextSession.value = toLocalInput(v ?? null)),
)

async function saveSession() {
  try {
    await store.update(campaignId.value, {
      next_session_at: nextSession.value ? new Date(nextSession.value).toISOString() : null,
    })
    snackbar.show(nextSession.value ? 'Next session saved' : 'Next session cleared')
  } catch (err) {
    snackbar.error(err, 'Could not save the session date')
  }
}

// --- Remove a player --------------------------------------------------------------
const removeTarget = ref<RosterEntry | null>(null)
const removeOpen = computed({
  get: () => removeTarget.value !== null,
  set: (open) => {
    if (!open) removeTarget.value = null
  },
})

async function confirmRemove() {
  const target = removeTarget.value
  if (!target) return
  try {
    await store.removeMember(campaignId.value, target.user_id)
    roster.value = roster.value.filter((r) => r.user_id !== target.user_id)
    snackbar.show(`${target.display_name} was removed from the campaign`)
  } catch (err) {
    snackbar.error(err, 'Could not remove the player')
  } finally {
    removeTarget.value = null
  }
}

function classLine(r: RosterEntry) {
  if (!r.character_id) return '—'
  const who = [r.summary?.lineage, r.summary?.class].filter(Boolean).join(' ')
  return `${who || 'Adventurer'} · ${r.character_level}`
}

// --- Delete campaign --------------------------------------------------------------
const deleteOpen = ref(false)
const deleteConfirm = ref('')
const deleting = ref(false)
const deleteMatches = computed(
  () =>
    deleteConfirm.value.trim().toLowerCase() === (campaign.value?.name ?? '').trim().toLowerCase(),
)
watch(deleteOpen, (open) => {
  if (open) deleteConfirm.value = ''
})

async function confirmDeleteCampaign() {
  const c = campaign.value
  if (!c || !deleteMatches.value) return
  deleting.value = true
  try {
    await store.removeCampaign(c.id)
    deleteOpen.value = false
    snackbar.show(`${c.name} was deleted`)
    await navigateTo('/campaigns')
  } catch (err) {
    snackbar.error(err, 'Could not delete the campaign')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <section v-if="campaign" class="panel panel--flush table-admin" aria-labelledby="players-h">
    <div class="table-admin__head">
      <h2 id="players-h">Players &amp; invites</h2>
      <form class="row" style="gap: 8px" @submit.prevent="sendInvite">
        <label for="invite" class="small soft">Invite player</label>
        <input
          id="invite"
          v-model="inviteDraft"
          class="input"
          style="width: 220px; max-width: 100%"
          placeholder="Email or username"
          autocapitalize="none"
        />
        <button type="submit" class="btn btn--ghost" :disabled="inviting || !inviteDraft.trim()">
          Send invite
        </button>
        <button type="button" class="btn btn--quiet" @click="copyLink">
          {{ linkCopied ? 'Invite link copied' : 'Copy invite link' }}
        </button>
      </form>
    </div>
    <div
      class="table-wrap"
      tabindex="0"
      role="region"
      aria-label="Players, scroll sideways for more"
    >
      <table class="table" style="min-width: 680px; font-size: 14px">
        <thead>
          <tr>
            <th scope="col" style="padding-left: 20px">Character</th>
            <th scope="col">Player</th>
            <th scope="col">Class · level</th>
            <th scope="col">HP</th>
            <th scope="col">AC</th>
            <th scope="col" style="text-align: right; padding-right: 20px">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in players" :key="r.user_id">
            <td style="padding-left: 20px">
              <div class="row" style="flex-wrap: nowrap">
                <UiAvatar
                  :name="r.character_name ?? r.display_name"
                  :portrait-path="r.portrait_path"
                  :class-slug="r.summary?.classSlug ?? null"
                  :size="36"
                />
                <strong>{{ r.character_name ?? 'No character chosen' }}</strong>
              </div>
            </td>
            <td class="soft">{{ r.display_name }}</td>
            <td class="soft">{{ classLine(r) }}</td>
            <td>
              {{ r.character_id ? `${r.summary?.hp ?? '—'} / ${r.summary?.hpMax ?? '—'}` : '—' }}
            </td>
            <td>{{ r.summary?.ac ?? '—' }}</td>
            <td style="padding-right: 20px">
              <div class="row" style="justify-content: flex-end; gap: 8px; flex-wrap: nowrap">
                <NuxtLink
                  v-if="r.character_id"
                  :to="`/character/${r.character_id}?campaign=${campaignId}`"
                  class="btn btn--ghost btn--sm"
                >
                  View sheet
                </NuxtLink>
                <button
                  type="button"
                  class="btn btn--quiet btn--sm"
                  :aria-label="`Remove ${r.display_name} from the campaign`"
                  @click="removeTarget = r"
                >
                  Remove
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="!players.length">
            <td colspan="6" class="muted" style="padding: 20px">
              No players yet. Invite someone by email or username, or share the invite link.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <form class="table-admin__schedule" @submit.prevent="saveSession">
      <label for="next-session">Next session</label>
      <input
        id="next-session"
        v-model="nextSession"
        class="input"
        type="datetime-local"
        style="width: auto"
      />
      <button type="submit" class="btn btn--ghost">Save date</button>
    </form>
  </section>

  <section v-if="campaign" class="panel danger" aria-labelledby="danger-h">
    <div>
      <h2 id="danger-h">Delete this campaign</h2>
      <p class="small muted">
        Removes the board, journal, messages, invites, NPCs and initiative for every player, along
        with all uploaded maps and files. Characters are kept. This can’t be undone.
      </p>
    </div>
    <button type="button" class="btn btn--danger" @click="deleteOpen = true">
      Delete campaign
    </button>
  </section>

  <UiDialog
    v-if="campaign"
    v-model="deleteOpen"
    :title="`Delete ${campaign.name}?`"
    alert
    width="480px"
  >
    <form id="delete-campaign" class="stack" @submit.prevent="confirmDeleteCampaign">
      <p>
        Everything in this campaign is deleted for all
        {{ plural(campaign.playerCount + 1, 'member') }}. Their characters stay on their accounts.
      </p>
      <div class="field">
        <label for="delete-confirm"
          >Type <strong>{{ campaign.name }}</strong> to confirm</label
        >
        <input
          id="delete-confirm"
          v-model="deleteConfirm"
          class="input"
          autocomplete="off"
          spellcheck="false"
        />
      </div>
    </form>
    <template #actions>
      <button type="button" class="btn btn--ghost" @click="deleteOpen = false">
        Keep campaign
      </button>
      <button
        type="submit"
        form="delete-campaign"
        class="btn btn--danger"
        :disabled="deleting || !deleteMatches"
      >
        {{ deleting ? 'Deleting…' : 'Delete campaign' }}
      </button>
    </template>
  </UiDialog>

  <UiDialog
    v-model="removeOpen"
    :title="`Remove ${removeTarget?.display_name ?? 'player'}?`"
    alert
    width="460px"
  >
    <p>
      They lose access to this campaign’s board, journal and messages. You can invite them again
      later.
    </p>
    <template #actions>
      <button type="button" class="btn btn--ghost" @click="removeTarget = null">Keep player</button>
      <button type="button" class="btn btn--danger" @click="confirmRemove">
        Remove from campaign
      </button>
    </template>
  </UiDialog>
</template>

<style scoped lang="scss">
.table-admin__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px;

  h2 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 22px;
  }
}

.soft {
  color: var(--page-soft);
}

.table-admin__schedule {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid var(--line);

  label {
    font-weight: 600;
  }
}

.danger {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-color: color-mix(in srgb, var(--danger) 40%, var(--panel-line));

  h2 {
    margin: 0 0 4px;
  }

  p {
    max-width: 640px;
  }
}
</style>
