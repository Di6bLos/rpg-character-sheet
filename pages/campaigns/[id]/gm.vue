<script setup lang="ts">
import { authorLabel } from '~/utils/roster'
import { supabase } from '~/lib/supabase'
import type { Combatant, Encounter, Message, RosterEntry } from '~/types'
import { rollDie } from '~/utils/dice'
import { plural, sessionDate, timeAgo, toLocalInput } from '~/utils/format'
import { initials, systemLabel } from '~/utils/systems'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const auth = useAuthStore()
const store = useCampaignStore()
const snackbar = useSnackbarStore()

const campaignId = computed(() => String(route.params.id))
const campaign = computed(() => store.byId(campaignId.value))
const gmCampaigns = computed(() => store.campaigns.filter((c) => c.myRole === 'gm'))

const loading = ref(true)
const roster = ref<RosterEntry[]>([])
const combatants = ref<Combatant[]>([])
const encounter = ref<Encounter | null>(null)
const sent = ref<Message[]>([])

useHead({ title: () => `${campaign.value?.name ?? 'GM console'} · Lantern` })

const players = computed(() => roster.value.filter((r) => r.user_id !== auth.userId))
const meta = computed(() => {
  const c = campaign.value
  if (!c) return ''
  return [
    systemLabel(c.system),
    plural(c.playerCount, 'player'),
    c.next_session_at ? `next session ${sessionDate(c.next_session_at)}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
})

async function load() {
  loading.value = true
  try {
    await store.fetchMine()
    if (!campaign.value || campaign.value.myRole !== 'gm') return
    const id = campaignId.value
    const [rosterRows, combatantRes, encounterRes, messageRes] = await Promise.all([
      store.roster(id),
      supabase.from('combatants').select('*').eq('campaign_id', id),
      supabase.from('encounters').select('*').eq('campaign_id', id).maybeSingle(),
      supabase
        .from('messages')
        .select('*')
        .eq('campaign_id', id)
        .eq('sender_id', auth.userId!)
        .order('created_at', { ascending: false })
        .limit(20),
    ])
    roster.value = rosterRows
    combatants.value = (combatantRes.data ?? []) as Combatant[]
    encounter.value = (encounterRes.data as Encounter | null) ?? {
      campaign_id: id,
      round: 1,
      active_combatant: null,
    }
    sent.value = (messageRes.data ?? []) as Message[]
    nextSession.value = toLocalInput(campaign.value.next_session_at)
  } catch (err) {
    snackbar.error(err, 'Could not load the GM console')
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(campaignId, load)

// --- Initiative --------------------------------------------------------------
const order = computed(() =>
  [...combatants.value].sort(
    (a, b) =>
      b.initiative - a.initiative || b.init_mod - a.init_mod || a.name.localeCompare(b.name),
  ),
)
const activeId = computed(() => {
  const current = encounter.value?.active_combatant
  return order.value.some((c) => c.id === current) ? current : (order.value[0]?.id ?? null)
})

const KIND_LABEL = { pc: 'PC', npc: 'NPC', monster: 'Monster' } as const

function hpPct(c: Combatant) {
  return c.hp_max > 0 ? Math.max(0, Math.min(100, Math.round((c.hp / c.hp_max) * 100))) : 0
}

async function saveEncounter(patch: Partial<Encounter>) {
  if (!encounter.value) return
  Object.assign(encounter.value, patch)
  const { error } = await supabase.from('encounters').upsert({
    campaign_id: campaignId.value,
    round: encounter.value.round,
    active_combatant: encounter.value.active_combatant,
  })
  if (error) snackbar.error(error, 'Could not update the turn order')
}

function nextTurn() {
  if (!order.value.length || !encounter.value) return
  const idx = order.value.findIndex((c) => c.id === activeId.value)
  const next = idx + 1
  if (next >= order.value.length) {
    void saveEncounter({ active_combatant: order.value[0]!.id, round: encounter.value.round + 1 })
  } else {
    void saveEncounter({ active_combatant: order.value[next]!.id })
  }
}

async function rollForNpcs() {
  const npcs = combatants.value.filter((c) => c.kind !== 'pc')
  if (!npcs.length) return
  for (const c of npcs) c.initiative = rollDie(20) + c.init_mod
  const results = await Promise.all(
    npcs.map((c) =>
      supabase.from('combatants').update({ initiative: c.initiative }).eq('id', c.id),
    ),
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) snackbar.error(failed.error, 'Could not save the new initiative')
  await saveEncounter({ active_combatant: order.value[0]?.id ?? null })
}

async function adjustHp(c: Combatant, delta: number) {
  c.hp = Math.max(0, Math.min(c.hp_max, c.hp + delta))
  const { error } = await supabase.from('combatants').update({ hp: c.hp }).eq('id', c.id)
  if (error) snackbar.error(error, 'Could not update hit points')
}

async function removeCombatant(c: Combatant) {
  const { error } = await supabase.from('combatants').delete().eq('id', c.id)
  if (error) return snackbar.error(error, 'Could not remove the combatant')
  combatants.value = combatants.value.filter((x) => x.id !== c.id)
}

async function resetEncounter() {
  const { error } = await supabase.from('combatants').delete().eq('campaign_id', campaignId.value)
  if (error) return snackbar.error(error, 'Could not clear the encounter')
  combatants.value = []
  await saveEncounter({ round: 1, active_combatant: null })
}

const addOpen = ref(false)
const blank = () => ({
  name: '',
  kind: 'monster' as Combatant['kind'],
  initiative: 10,
  init_mod: 0,
  hp: 10,
  ac: 12,
})
const draftCombatant = ref(blank())
const adding = ref(false)

async function insertCombatants(rows: Partial<Combatant>[]) {
  const { data, error } = await supabase
    .from('combatants')
    .insert(rows.map((r) => ({ ...r, campaign_id: campaignId.value })))
    .select()
  if (error) throw error
  combatants.value.push(...((data ?? []) as Combatant[]))
}

async function addCombatant() {
  const d = draftCombatant.value
  if (!d.name.trim()) return
  adding.value = true
  try {
    await insertCombatants([
      {
        name: d.name.trim(),
        kind: d.kind,
        initiative: d.initiative,
        init_mod: d.init_mod,
        hp: d.hp,
        hp_max: d.hp,
        ac: d.ac,
      },
    ])
    draftCombatant.value = blank()
    addOpen.value = false
  } catch (err) {
    snackbar.error(err, 'Could not add the combatant')
  } finally {
    adding.value = false
  }
}

const partyToAdd = computed(() =>
  roster.value.filter(
    (r) => r.character_id && !combatants.value.some((c) => c.character_id === r.character_id),
  ),
)

/** Adds every seated character that isn't in the order yet, rolling their initiative. */
async function addParty() {
  if (!partyToAdd.value.length) return
  adding.value = true
  try {
    await insertCombatants(
      partyToAdd.value.map((r) => {
        const mod = r.summary?.initMod ?? 0
        return {
          name: r.character_name ?? r.display_name,
          kind: 'pc' as const,
          initiative: rollDie(20) + mod,
          init_mod: mod,
          hp: r.summary?.hp ?? 0,
          hp_max: r.summary?.hpMax ?? 0,
          ac: r.summary?.ac ?? 10,
          character_id: r.character_id,
        }
      }),
    )
    addOpen.value = false
  } catch (err) {
    snackbar.error(err, 'Could not add the party')
  } finally {
    adding.value = false
  }
}

// --- Messages ----------------------------------------------------------------
const mode = ref<'group' | 'secret'>('group')
const to = ref<string[]>([])
const draft = ref('')
const sending = ref(false)
const composer = ref<HTMLTextAreaElement | null>(null)
const canMessage = computed(() => auth.can('can_send_messages'))

/** Inline name for a recipient list: the character, with the player in brackets. */
function nameOf(userId: string) {
  const { primary, secondary } = authorLabel(roster.value, userId)
  if (primary === 'Former member') return 'Former player'
  return secondary ? `${primary} (${secondary})` : primary
}

function toggleRecipient(userId: string) {
  to.value = to.value.includes(userId)
    ? to.value.filter((x) => x !== userId)
    : [...to.value, userId]
}

const sendHint = computed(() => {
  if (mode.value === 'group') return 'Shows up on every player’s dashboard'
  return to.value.length
    ? `Visible to: ${to.value.map(nameOf).join(', ')}`
    : 'Pick at least one player'
})

function whisper(entry: RosterEntry) {
  mode.value = 'secret'
  to.value = [entry.user_id]
  composer.value?.focus()
  composer.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

async function send() {
  const body = draft.value.trim()
  if (!body || (mode.value === 'secret' && !to.value.length)) return
  sending.value = true
  try {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        campaign_id: campaignId.value,
        body,
        recipient_ids: mode.value === 'secret' ? to.value : null,
      })
      .select()
      .single()
    if (error) throw error
    sent.value.unshift(data as Message)
    draft.value = ''
  } catch (err) {
    snackbar.error(err, 'Could not send the message')
  } finally {
    sending.value = false
  }
}

// --- Roster, invites, schedule -------------------------------------------------
const inviteDraft = ref('')
const inviting = ref(false)
const inviteInput = ref<HTMLInputElement | null>(null)
const nextSession = ref('')
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

// --- Delete campaign -----------------------------------------------------------
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
  <div v-if="loading" class="spinner" role="status" aria-label="Loading GM console" />
  <div v-else-if="!campaign || campaign.myRole !== 'gm'" class="page page--narrow">
    <div class="empty">
      <h1 style="font-size: 24px; margin-bottom: 8px">This console is for the Game Master</h1>
      <p style="margin-bottom: 16px">Only whoever runs the campaign can open it.</p>
      <NuxtLink to="/campaigns" class="btn">Go to campaigns</NuxtLink>
    </div>
  </div>
  <div v-else class="page" style="gap: 28px; max-width: 1240px; padding-top: 36px">
    <header class="page-head">
      <div>
        <div class="eyebrow" style="font-size: 11px; letter-spacing: 0.14em">GM console</div>
        <h1 style="font-size: clamp(28px, 3.6vw, 40px); margin-top: 6px">{{ campaign.name }}</h1>
        <div class="small" style="color: var(--page-soft); margin-top: 6px">{{ meta }}</div>
      </div>
      <div class="row" style="gap: 10px">
        <NuxtLink :to="`/campaigns/${campaign.id}/board`" class="btn btn--ghost">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
            <path d="M9 3v15M15 6v15" />
          </svg>
          Open this campaign’s board &amp; journal
        </NuxtLink>
        <button type="button" class="btn" @click="inviteInput?.focus()">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add player
        </button>
      </div>
    </header>

    <nav aria-label="Your campaigns as GM" class="switcher">
      <NuxtLink
        v-for="c in gmCampaigns"
        :key="c.id"
        :to="`/campaigns/${c.id}/gm`"
        :aria-current="c.id === campaign.id ? 'page' : undefined"
      >
        <strong>{{ c.name }}</strong>
        <span>{{ systemLabel(c.system) }} · {{ plural(c.playerCount, 'player') }}</span>
      </NuxtLink>
      <NuxtLink to="/campaigns" class="switcher__new">+ New campaign</NuxtLink>
    </nav>

    <div class="cols">
      <section class="panel panel--flush" aria-labelledby="init-h">
        <div class="panel-head">
          <div class="row" style="align-items: baseline">
            <h2 id="init-h">Initiative</h2>
            <span class="small muted" style="font-size: 13px"
              >Round {{ encounter?.round ?? 1 }}</span
            >
          </div>
          <div class="row" style="gap: 8px">
            <button
              type="button"
              class="btn btn--ghost"
              style="font-size: 13px"
              :disabled="!order.length"
              @click="rollForNpcs"
            >
              Roll for NPCs
            </button>
            <button
              type="button"
              class="btn"
              style="font-size: 13px"
              :disabled="!order.length"
              @click="nextTurn"
            >
              Next turn
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
        <ol v-if="order.length" class="order">
          <li v-for="c in order" :key="c.id" :class="{ 'is-active': c.id === activeId }">
            <div class="order__init">{{ c.initiative }}</div>
            <div class="order__body">
              <div class="row" style="gap: 8px">
                <span class="order__name">{{ c.name }}</span>
                <span class="kind" :class="`kind--${c.kind}`">{{ KIND_LABEL[c.kind] }}</span>
                <span v-if="c.id === activeId" class="order__now">Acting now</span>
              </div>
              <div class="row" style="gap: 10px; flex-wrap: nowrap">
                <div
                  class="meter meter--thin order__bar"
                  :class="{ 'meter--accent': hpPct(c) <= 50 }"
                >
                  <span :style="{ width: hpPct(c) + '%' }" />
                </div>
                <span class="order__hp">{{ c.hp }} / {{ c.hp_max }} HP</span>
              </div>
            </div>
            <div class="order__ac">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
              </svg>
              <strong>{{ c.ac }}</strong>
              <span class="sr-only">Armor class</span>
            </div>
            <div class="order__tools">
              <button
                type="button"
                :aria-label="`${c.name}: lose 1 hit point`"
                @click="adjustHp(c, -1)"
              >
                −
              </button>
              <button
                type="button"
                :aria-label="`${c.name}: gain 1 hit point`"
                @click="adjustHp(c, 1)"
              >
                +
              </button>
              <button
                type="button"
                :aria-label="`Remove ${c.name} from initiative`"
                @click="removeCombatant(c)"
              >
                ×
              </button>
            </div>
          </li>
        </ol>
        <p v-else class="empty" style="margin: 16px 20px">
          No one is in the order yet. Add the party or a combatant to begin.
        </p>
        <div class="row" style="padding: 0 20px 18px">
          <button type="button" class="btn-dashed" style="font-size: 13px" @click="addOpen = true">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add combatant
          </button>
          <button
            v-if="order.length"
            type="button"
            class="btn btn--quiet btn--sm"
            @click="resetEncounter"
          >
            End encounter
          </button>
        </div>
      </section>

      <section class="panel panel--flush" aria-labelledby="msg-h">
        <div class="panel-head"><h2 id="msg-h">Send a message</h2></div>
        <div class="composer">
          <RestrictedNotice v-if="!canMessage" title="Messaging is turned off for your account" />
          <template v-else>
            <div role="group" aria-label="Message type" class="mode">
              <button type="button" :aria-pressed="mode === 'group'" @click="mode = 'group'">
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
                  <circle cx="9" cy="8" r="3" />
                  <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
                  <circle cx="17" cy="9" r="2.5" />
                  <path d="M16 14.2c2.9.3 5 2.7 5 5.8" />
                </svg>
                Whole party
              </button>
              <button
                type="button"
                class="mode__secret"
                :aria-pressed="mode === 'secret'"
                @click="mode = 'secret'"
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
                  <rect x="5" y="11" width="14" height="9" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
                Secret
              </button>
            </div>
            <div v-if="mode === 'secret'" class="stack" style="gap: 8px">
              <div class="small" style="font-size: 12px; font-weight: 600; color: var(--page-soft)">
                Only these players will see it
              </div>
              <div class="chips">
                <button
                  v-for="p in players"
                  :key="p.user_id"
                  type="button"
                  class="chip recipient"
                  :aria-pressed="to.includes(p.user_id)"
                  @click="toggleRecipient(p.user_id)"
                >
                  {{ p.display_name
                  }}{{ p.character_name ? ` · ${p.character_name.split(' ')[0]}` : '' }}
                </button>
                <span v-if="!players.length" class="small muted">No players have joined yet.</span>
              </div>
            </div>
            <label for="gm-draft" class="sr-only">Message</label>
            <textarea
              id="gm-draft"
              ref="composer"
              v-model="draft"
              class="input"
              rows="3"
              style="min-height: 0"
              maxlength="4000"
              :placeholder="
                mode === 'secret'
                  ? 'Whisper something only the selected players will see…'
                  : 'Message the whole party…'
              "
            />
            <div class="row" style="justify-content: space-between">
              <span class="small muted" style="font-size: 12px">{{ sendHint }}</span>
              <button
                type="button"
                class="btn"
                :class="{ 'btn--secret': mode === 'secret' }"
                :disabled="sending || !draft.trim() || (mode === 'secret' && !to.length)"
                @click="send"
              >
                {{ mode === 'secret' ? 'Send secret' : 'Send to party' }}
              </button>
            </div>
          </template>
        </div>
        <div class="sent">
          <div class="eyebrow" style="padding: 14px 20px 6px; font-size: 11px">Sent</div>
          <div v-for="m in sent" :key="m.id" class="sent__row">
            <div class="row" style="gap: 8px">
              <span class="sent__tag" :class="{ 'sent__tag--secret': m.recipient_ids }">
                {{
                  m.recipient_ids ? `Secret · ${m.recipient_ids.map(nameOf).join(', ')}` : 'Party'
                }}
              </span>
              <span class="small muted" style="font-size: 12px">{{ timeAgo(m.created_at) }}</span>
            </div>
            <div class="sent__body">{{ m.body }}</div>
          </div>
          <p v-if="!sent.length" class="small muted" style="padding: 6px 20px 16px">
            Nothing sent yet.
          </p>
        </div>
      </section>
    </div>

    <section class="panel panel--flush" aria-labelledby="roster-h">
      <div class="panel-head">
        <h2 id="roster-h">Party roster</h2>
        <form class="row" style="gap: 8px" @submit.prevent="sendInvite">
          <label for="invite" class="small" style="font-size: 13px; color: var(--page-soft)"
            >Invite player</label
          >
          <input
            id="invite"
            ref="inviteInput"
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
        aria-label="Table, scroll sideways for more"
      >
        <table class="table" style="min-width: 760px; font-size: 14px">
          <thead>
            <tr>
              <th scope="col" style="padding-left: 20px">Character</th>
              <th scope="col">Player</th>
              <th scope="col">Class · level</th>
              <th scope="col">HP</th>
              <th scope="col">AC</th>
              <th scope="col">Passive Perc.</th>
              <th scope="col" style="text-align: right; padding-right: 20px">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in players" :key="r.user_id">
              <td style="padding-left: 20px">
                <div class="row" style="flex-wrap: nowrap">
                  <div class="avatar roster__avatar">
                    {{ initials(r.character_name ?? r.display_name) }}
                  </div>
                  <strong>{{ r.character_name ?? 'No character chosen' }}</strong>
                </div>
              </td>
              <td class="soft">{{ r.display_name }}</td>
              <td class="soft">{{ classLine(r) }}</td>
              <td>
                {{ r.character_id ? `${r.summary?.hp ?? '—'} / ${r.summary?.hpMax ?? '—'}` : '—' }}
              </td>
              <td>{{ r.summary?.ac ?? '—' }}</td>
              <td>{{ r.summary?.passivePerception ?? '—' }}</td>
              <td style="padding-right: 20px">
                <div class="row" style="justify-content: flex-end; gap: 8px; flex-wrap: nowrap">
                  <button type="button" class="btn btn--sm whisper" @click="whisper(r)">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="5" y="11" width="14" height="9" rx="2" />
                      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    </svg>
                    Secret
                  </button>
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
              <td colspan="7" class="muted" style="padding: 20px">
                No players yet. Invite someone by email or username, or share the invite link.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <form class="schedule" @submit.prevent="saveSession">
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

    <section class="panel danger" aria-labelledby="danger-h">
      <div>
        <h2 id="danger-h">Delete this campaign</h2>
        <p class="small muted">
          Removes the board, journal, messages, invites and initiative for every player, along with
          all uploaded maps and files. Characters are kept. This can’t be undone.
        </p>
      </div>
      <button type="button" class="btn btn--danger" @click="deleteOpen = true">
        Delete campaign
      </button>
    </section>

    <UiDialog v-model="deleteOpen" :title="`Delete ${campaign.name}?`" alert width="480px">
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

    <UiDialog v-model="addOpen" title="Add to initiative" width="520px">
      <div v-if="partyToAdd.length" class="row" style="justify-content: space-between">
        <span class="small">
          {{ plural(partyToAdd.length, 'party character') }} not in the order yet.
        </span>
        <button type="button" class="btn btn--ghost" :disabled="adding" @click="addParty">
          Add the party
        </button>
      </div>
      <form class="stack" @submit.prevent="addCombatant">
        <div class="field">
          <label for="cb-name">Name</label>
          <input
            id="cb-name"
            v-model="draftCombatant.name"
            class="input"
            maxlength="80"
            placeholder="Ash Ghoul A"
            required
          />
        </div>
        <div class="add-grid">
          <div class="field">
            <label for="cb-kind">Kind</label>
            <select id="cb-kind" v-model="draftCombatant.kind" class="input">
              <option value="monster">Monster</option>
              <option value="npc">NPC</option>
              <option value="pc">PC</option>
            </select>
          </div>
          <div class="field">
            <label for="cb-init">Initiative</label>
            <input
              id="cb-init"
              v-model.number="draftCombatant.initiative"
              class="input"
              type="number"
            />
          </div>
          <div class="field">
            <label for="cb-mod">Init. modifier</label>
            <input
              id="cb-mod"
              v-model.number="draftCombatant.init_mod"
              class="input"
              type="number"
            />
          </div>
          <div class="field">
            <label for="cb-hp">Hit points</label>
            <input
              id="cb-hp"
              v-model.number="draftCombatant.hp"
              class="input"
              type="number"
              min="0"
            />
          </div>
          <div class="field">
            <label for="cb-ac">Armor class</label>
            <input id="cb-ac" v-model.number="draftCombatant.ac" class="input" type="number" />
          </div>
        </div>
        <div class="row" style="justify-content: flex-end">
          <button type="button" class="btn btn--ghost" @click="addOpen = false">Cancel</button>
          <button type="submit" class="btn" :disabled="adding || !draftCombatant.name.trim()">
            Add combatant
          </button>
        </div>
      </form>
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
        <button type="button" class="btn btn--ghost" @click="removeTarget = null">
          Keep player
        </button>
        <button type="button" class="btn btn--danger" @click="confirmRemove">
          Remove from campaign
        </button>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped lang="scss">
.switcher {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;

  a {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 2px;
    min-height: 52px;
    padding: 6px 14px;
    border-radius: min(var(--radius-control), 8px);
    text-decoration: none;
    background: var(--panel-bg);
    color: var(--panel-soft);
    box-shadow: inset 0 0 0 1px var(--panel-line);

    strong {
      font-size: 14px;
      font-weight: 600;
    }

    span {
      font-size: 12px;
      color: var(--panel-muted);
    }

    &[aria-current='page'] {
      color: var(--panel-text);
      box-shadow: inset 0 0 0 1.5px var(--accent);
    }
  }

  .switcher__new {
    flex-direction: row;
    align-items: center;
    padding: 0 16px;
    background: transparent;
    box-shadow: none;
    border: 1px dashed var(--line-strong);
    color: var(--page-text);
    font-size: 14px;
    font-weight: 600;
  }
}

.cols {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(420px, 100%), 1fr));
  gap: 24px;
  align-items: start;
}

.panel-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--line);

  h2 {
    font-size: 20px;
  }
}

.order {
  list-style: none;
  margin: 0;
  padding: 8px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;

  li {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 12px;
    border-radius: min(var(--radius-panel), 10px);
    background: var(--field);
    box-shadow: inset 0 0 0 1px var(--track);

    @media (max-width: 560px) {
      flex-wrap: wrap;
    }

    &.is-active {
      background: var(--accent-tint);
      box-shadow: inset 0 0 0 1.5px var(--accent);

      .order__init {
        background: var(--accent);
        color: var(--on-accent);
        box-shadow: none;
      }
    }
  }
}

.order__init {
  flex: 0 0 44px;
  height: 44px;
  border-radius: min(var(--radius-control), 8px);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-heading);
  font-size: 20px;
  font-weight: 700;
  background: var(--panel-bg);
  box-shadow: inset 0 0 0 1px var(--line);
}

.order__body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.order__name {
  font-size: 15px;
  font-weight: 600;
}

.order__now {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-text);
}

.order__bar {
  flex: 0 1 140px;
}

.order__hp {
  font-size: 12px;
  color: var(--page-soft);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.order__ac {
  flex: none;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 6px;
  color: var(--page-muted);

  strong {
    font-size: 13px;
    color: var(--page-text);
  }
}

.order__tools {
  flex: none;
  display: flex;
  gap: 4px;

  @media (max-width: 560px) {
    flex-basis: 100%;
    justify-content: flex-end;
  }

  @media (pointer: coarse) {
    button {
      width: 44px;
      height: 44px;
    }
  }

  button {
    width: 36px;
    height: 36px;
    border-radius: min(var(--radius-control), 8px);
    border: 1px solid var(--line);
    background: var(--panel-bg);
    color: var(--page-text);
    font-size: 18px;
    line-height: 1;
  }
}

.kind {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--track);
  color: var(--page-soft);

  &--pc {
    background: var(--warn-bg);
    color: var(--warn-text);
  }

  &--npc {
    background: var(--ok-bg);
    color: var(--ok-text);
  }
}

.composer {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.mode {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  padding: 4px;
  border-radius: min(var(--radius-panel), 10px);
  background: var(--field);
  border: 1px solid var(--line);

  button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    border-radius: min(var(--radius-control), 7px);
    border: 0;
    background: transparent;
    color: var(--page-soft);
    font-weight: 600;
    font-size: 14px;

    &[aria-pressed='true'] {
      background: var(--accent);
      color: var(--on-accent);
    }
  }

  .mode__secret[aria-pressed='true'] {
    background: var(--secondary);
    color: var(--on-secondary);
  }
}

.recipient {
  min-height: 40px;
  background: var(--field);
  font-weight: 600;
  font-size: 13px;

  &[aria-pressed='true'] {
    background: var(--ok-bg);
    color: var(--ok-text);
    border: 1.5px solid var(--secondary);
  }
}

.btn--secret {
  background: var(--secondary);
  color: var(--on-secondary);
}

.sent {
  border-top: 1px solid var(--line);
}

.sent__row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 20px 12px;
  border-bottom: 1px solid var(--track);
}

.sent__tag {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent-text);

  &--secret {
    color: var(--secondary);
  }
}

.sent__body {
  font-size: 14px;
  line-height: 1.5;
  color: var(--page-soft);
  white-space: pre-wrap;
}

.soft {
  color: var(--page-soft);
}

.roster__avatar {
  border: 1px solid var(--line-strong);
  background: var(--field);
  font-size: 13px;
}

.whisper {
  background: var(--ok-bg);
  color: var(--ok-text);
  border-color: color-mix(in srgb, var(--ok-text) 28%, transparent);
}

.schedule {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid var(--line);

  label {
    font-size: 13px;
    color: var(--page-soft);
  }
}

.danger {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-color: color-mix(in srgb, var(--danger) 35%, var(--panel-line));

  h2 {
    font-size: 20px;
    margin-bottom: 4px;
  }

  p {
    max-width: 62ch;
  }
}

.add-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}
</style>
