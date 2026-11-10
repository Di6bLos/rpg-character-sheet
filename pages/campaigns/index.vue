<script setup lang="ts">
import type { GameSystem, PendingInvite } from '~/types'
import { MAX_CAMPAIGNS } from '~/stores/campaign'
import { plural, sessionDate } from '~/utils/format'
import { SYSTEMS, systemLabel } from '~/utils/systems'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Campaigns · Lantern' })

const auth = useAuthStore()
const store = useCampaignStore()
const snackbar = useSnackbarStore()

const name = ref('')
const system = ref<GameSystem>('dnd5e')
const pitch = ref('')
const cover = ref<File | null>(null)
const draft = ref('')
const invitees = ref<string[]>([])
const copyLink = ref(false)
const creating = ref(false)
const responding = ref<string | null>(null)
const createdLink = ref('')

const permitted = computed(() => auth.can('can_create_campaigns'))
const atLimit = computed(
  () => store.campaigns.filter((c) => c.myRole === 'gm').length >= MAX_CAMPAIGNS,
)
const blocked = computed(() => !permitted.value || atLimit.value)

onMounted(async () => {
  try {
    await store.fetchMine(true)
  } catch (err) {
    snackbar.error(err, 'Could not load your campaigns')
  }
})

function campaignInitials(campaignName: string) {
  return campaignName
    .replace(/^The /i, '')
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function meta(c: (typeof store.campaigns)[number]) {
  const parts = [
    c.myRole === 'gm' ? 'You run this' : `GM ${c.gmName}`,
    plural(c.playerCount, 'player'),
  ]
  if (c.myRole === 'gm' && c.pendingInvites)
    parts.push(`${plural(c.pendingInvites, 'invite')} pending`)
  if (c.next_session_at) parts.push(`next session ${sessionDate(c.next_session_at)}`)
  return parts.join(' · ')
}

function inviteMeta(invite: PendingInvite) {
  const when = invite.campaign.next_session_at
  return [systemLabel(invite.campaign.system), when ? `starts ${sessionDate(when)}` : '']
    .filter(Boolean)
    .join(' · ')
}

function addInvite() {
  const value = draft.value.trim()
  if (value && !invitees.value.includes(value)) invitees.value.push(value)
  draft.value = ''
}

function onCover(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null
  if (file && !file.type.startsWith('image/')) {
    snackbar.show('Cover must be an image file', 'error')
    return
  }
  cover.value = file
}

async function respond(invite: PendingInvite, accept: boolean) {
  responding.value = invite.id
  try {
    await store.respond(invite.id, accept)
    snackbar.show(accept ? `You joined ${invite.campaign.name}` : 'Invite declined')
  } catch (err) {
    snackbar.error(err, 'Could not answer the invite')
  } finally {
    responding.value = null
  }
}

async function create() {
  if (blocked.value) return
  addInvite()
  creating.value = true
  createdLink.value = ''
  try {
    const { campaign, failed, coverFailed } = await store.create({
      name: name.value.trim() || 'Untitled campaign',
      system: system.value,
      pitch: pitch.value.trim(),
      cover: cover.value,
      invitees: invitees.value,
    })
    const sent = invitees.value.length - failed.length
    if (copyLink.value) {
      createdLink.value = await store.inviteLink(campaign.id)
      try {
        await navigator.clipboard.writeText(createdLink.value)
      } catch {
        // Clipboard can be blocked; the link is shown on the page instead.
      }
    }
    const problems = [
      coverFailed ? 'the cover image couldn’t be uploaded' : '',
      failed.length ? `no player matched ${failed.map((f) => f.who).join(', ')}` : '',
    ].filter(Boolean)
    if (problems.length) {
      snackbar.show(`${campaign.name} created, but ${problems.join(' and ')}.`, 'info', 7000)
    } else {
      snackbar.show(`${campaign.name} created${sent ? ` · ${plural(sent, 'invite')} sent` : ''}`)
    }
    name.value = ''
    pitch.value = ''
    cover.value = null
    invitees.value = []
    copyLink.value = false
  } catch (err) {
    snackbar.error(err, 'Could not create the campaign')
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="page" style="gap: 28px; max-width: 1240px">
    <header class="page-head">
      <div>
        <h1>Campaigns</h1>
        <p>Run your own table or join a friend’s. Whoever creates a campaign is its Game Master.</p>
      </div>
    </header>

    <section
      v-for="invite in store.invites"
      :key="invite.id"
      class="invite"
      aria-label="Invitation"
    >
      <div class="row" style="gap: 14px; flex-wrap: nowrap">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 7l9 6 9-6" />
        </svg>
        <div class="stack" style="gap: 2px">
          <span style="font-size: 15px; font-weight: 600">
            {{ invite.inviterName }} invited you to <strong>{{ invite.campaign.name }}</strong>
          </span>
          <span class="invite__meta">{{ inviteMeta(invite) }}</span>
        </div>
      </div>
      <div class="row" style="gap: 8px">
        <button
          type="button"
          class="btn btn--ghost"
          :disabled="responding === invite.id"
          @click="respond(invite, false)"
        >
          Decline
        </button>
        <button
          type="button"
          class="btn invite__join"
          :disabled="responding === invite.id || auth.isSuspended"
          @click="respond(invite, true)"
        >
          Join campaign
        </button>
      </div>
    </section>

    <div class="layout">
      <section class="mine" aria-labelledby="mine-h">
        <h2 id="mine-h">Your campaigns</h2>
        <div
          v-if="store.loading && !store.loaded"
          class="spinner"
          role="status"
          aria-label="Loading campaigns"
        />
        <p v-else-if="!store.campaigns.length" class="empty">
          You aren’t in a campaign yet. Create one here, or ask a GM for an invite.
        </p>
        <article v-for="c in store.campaigns" :key="c.id" class="panel campaign">
          <div class="campaign__tile">{{ campaignInitials(c.name) }}</div>
          <div class="campaign__body">
            <div class="row" style="gap: 8px">
              <span class="campaign__name">{{ c.name }}</span>
              <span class="badge" :class="`badge--${c.system}`">{{ systemLabel(c.system) }}</span>
              <span class="role" :class="{ 'role--gm': c.myRole === 'gm' }">
                {{ c.myRole === 'gm' ? 'Game Master' : 'Player' }}
              </span>
            </div>
            <span class="small muted" style="font-size: 13px">{{ meta(c) }}</span>
          </div>
          <div class="row" style="gap: 8px">
            <NuxtLink :to="`/campaigns/${c.id}/board`" class="btn btn--ghost"
              >Board &amp; journal</NuxtLink
            >
            <NuxtLink v-if="c.myRole === 'gm'" :to="`/campaigns/${c.id}/gm`" class="btn"
              >Manage</NuxtLink
            >
          </div>
        </article>
      </section>

      <section class="panel create" aria-labelledby="new-h">
        <h2 id="new-h">Create a campaign</h2>

        <RestrictedNotice
          v-if="!permitted"
          title="Campaign creation is turned off for your account"
        >
          You can still join campaigns you’re invited to.
        </RestrictedNotice>
        <div v-else-if="atLimit" class="notice" role="status">
          <strong>Campaign limit reached</strong>
          <span>
            You run {{ MAX_CAMPAIGNS }} of {{ MAX_CAMPAIGNS }} campaigns. Delete one from its GM
            console to start another.
          </span>
        </div>

        <div v-if="createdLink" class="notice notice--ok">
          <strong>Invite link copied</strong>
          <span style="overflow-wrap: anywhere">{{ createdLink }}</span>
        </div>

        <form @submit.prevent="create">
          <fieldset
            :disabled="blocked || creating"
            class="create__form"
            :class="{ 'is-blocked': blocked }"
          >
            <div class="field">
              <label for="cp-name">Campaign name</label>
              <input
                id="cp-name"
                v-model="name"
                class="input"
                maxlength="80"
                placeholder="e.g. The Drowned Crown"
              />
            </div>
            <div class="field">
              <div id="cp-sys" class="label">Game system</div>
              <div role="radiogroup" aria-labelledby="cp-sys" class="systems">
                <button
                  v-for="s in SYSTEMS"
                  :key="s.id"
                  type="button"
                  role="radio"
                  :aria-checked="system === s.id"
                  @click="system = s.id"
                >
                  {{ s.label }}
                </button>
              </div>
            </div>
            <div class="field">
              <label for="cp-desc">Pitch (optional)</label>
              <textarea
                id="cp-desc"
                v-model="pitch"
                class="input"
                rows="3"
                style="min-height: 0"
                placeholder="What’s the hook? Tone, schedule, house rules…"
              />
            </div>
            <label v-if="auth.can('can_upload_documents')" class="btn-dashed upload">
              <input type="file" accept="image/*" @change="onCover" />
              {{ cover ? `Cover: ${cover.name}` : 'Upload cover image' }}
            </label>
            <div class="invites">
              <label for="cp-invite" class="label">Invite players</label>
              <div class="row" style="gap: 8px; flex-wrap: nowrap">
                <input
                  id="cp-invite"
                  v-model="draft"
                  class="input"
                  placeholder="Email or username"
                  autocapitalize="none"
                  @keydown.enter.prevent="addInvite"
                />
                <button type="button" class="btn btn--ghost" @click="addInvite">Add</button>
              </div>
              <div v-if="invitees.length" class="chips">
                <span v-for="(who, i) in invitees" :key="who" class="invitee">
                  {{ who }}
                  <button
                    type="button"
                    :aria-label="`Remove ${who}`"
                    @click="invitees.splice(i, 1)"
                  >
                    ×
                  </button>
                </span>
              </div>
              <button
                type="button"
                class="btn btn--quiet btn--sm"
                style="align-self: flex-start"
                :aria-pressed="copyLink"
                @click="copyLink = !copyLink"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path
                    d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"
                  />
                </svg>
                {{ copyLink ? 'Invite link will be copied on create' : 'Copy invite link' }}
              </button>
            </div>
            <button type="submit" class="btn btn--block" style="min-height: 48px">
              {{ creating ? 'Creating…' : 'Create campaign & send invites' }}
            </button>
          </fieldset>
        </form>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.invite {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-radius: min(var(--radius-panel), 12px);
  background: var(--ok-bg);
  border: 1px solid color-mix(in srgb, var(--ok-text) 28%, transparent);
  color: #efe6d4;

  svg {
    flex: none;
    color: var(--ok-text);
  }

  .btn--ghost {
    color: #efe6d4;
    border-color: color-mix(in srgb, var(--ok-text) 28%, transparent);
  }
}

.invite__meta {
  font-size: 13px;
  color: var(--ok-text);
}

.invite__join {
  background: #6fc2b4;
  color: #0e1f1c;
}

.layout {
  display: flex;
  flex-wrap: wrap;
  gap: 28px;
  align-items: flex-start;
}

.mine {
  flex: 999 1 520px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;

  h2 {
    font-size: 22px;
  }
}

.campaign {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  align-items: center;
  padding: 18px 20px;
}

.campaign__tile {
  flex: 0 0 72px;
  height: 72px;
  border-radius: min(var(--radius-panel), 10px);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-heading);
  font-size: 22px;
  font-weight: 700;
  color: var(--accent-text);
  background: repeating-linear-gradient(
    135deg,
    var(--inset) 0 10px,
    color-mix(in srgb, var(--inset) 82%, #000) 10px 20px
  );
  border: 1px solid var(--line-strong);
}

.campaign__body {
  flex: 1 1 240px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.campaign__name {
  font-size: 17px;
  font-weight: 600;
}

.role {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--track);
  color: var(--page-soft);

  &--gm {
    background: var(--warn-bg);
    color: var(--warn-text);
  }
}

.create {
  flex: 1 1 380px;
  min-width: 0;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;

  h2 {
    font-size: 22px;
  }
}

.create__form {
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;

  &.is-blocked {
    opacity: 0.45;
  }

  .label,
  label:not(.upload) {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--page-muted);
  }
}

.systems {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;

  button {
    min-height: 44px;
    border-radius: min(var(--radius-control), 8px);
    font-weight: 600;
    font-size: 13px;
    background: var(--field);
    color: var(--page-soft);
    border: 1px solid var(--line);

    &[aria-checked='true'] {
      background: var(--accent-tint);
      color: var(--page-text);
      border: 1.5px solid var(--accent);
    }
  }
}

.upload {
  position: relative;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;

  input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  &:focus-within {
    outline: 2px solid var(--accent-text);
    outline-offset: 3px;
  }
}

.invites {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}

.invitee {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 4px 0 12px;
  border-radius: 999px;
  background: var(--track);
  border: 1px solid var(--line);
  font-size: 13px;

  button {
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--page-muted);
    font-size: 16px;
  }
}
</style>
