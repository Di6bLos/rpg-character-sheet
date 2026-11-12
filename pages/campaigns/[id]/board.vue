<script setup lang="ts">
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ReportTarget } from '~/components/ReportDialog.vue'
import { supabase } from '~/lib/supabase'
import type { BoardItem, JournalAttachment, JournalEntry, RosterEntry } from '~/types'
import {
  extOf,
  formatSize,
  plural,
  safeFileName,
  sessionDate,
  shortDate,
  stamp,
} from '~/utils/format'
import { authorLabel } from '~/utils/roster'
import { systemLabel } from '~/utils/systems'

definePageMeta({ middleware: 'auth' })

const BUCKET = 'campaign-files'
const MAX_FILE = 25 * 1024 * 1024

const route = useRoute()
const auth = useAuthStore()
const store = useCampaignStore()
const characters = useCharacterStore()
const snackbar = useSnackbarStore()

const campaignId = computed(() => String(route.params.id))
const campaign = computed(() => store.byId(campaignId.value))
const isGm = computed(() => campaign.value?.myRole === 'gm')

const loading = ref(true)
const items = ref<BoardItem[]>([])
const entries = ref<JournalEntry[]>([])
const roster = ref<RosterEntry[]>([])
const thumbs = ref<Record<string, string>>({})
const selectedId = ref<string | null>(null)
const zoom = ref(1)
const gmView = ref(true)
const uploading = ref(false)
const reportTarget = ref<ReportTarget | null>(null)
let channel: RealtimeChannel | null = null

useHead({ title: () => `${campaign.value?.name ?? 'Campaign board'} · Lantern` })

const canUpload = computed(() => auth.can('can_upload_documents'))
const canPost = computed(() => auth.can('can_post_journal'))

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

function nameOf(userId: string) {
  return roster.value.find((r) => r.user_id === userId)?.display_name ?? 'Former member'
}
function authorOf(e: JournalEntry) {
  return authorLabel(roster.value, e.author_id, e.author?.display_name)
}
function roleOf(userId: string) {
  const entry = roster.value.find((r) => r.user_id === userId)
  return entry ? (entry.role === 'gm' ? 'Game Master' : 'Player') : 'Former member'
}

// --- Board -------------------------------------------------------------------
const visibleItems = computed(() =>
  isGm.value && !gmView.value ? items.value.filter((i) => !i.hidden) : items.value,
)
const selected = computed(
  () => visibleItems.value.find((i) => i.id === selectedId.value) ?? visibleItems.value[0] ?? null,
)
const groups = computed(() =>
  (
    [
      ['map', 'Maps'],
      ['image', 'Images'],
      ['handout', 'Handouts'],
    ] as const
  )
    .map(([kind, label]) => ({ label, list: visibleItems.value.filter((i) => i.kind === kind) }))
    .filter((g) => g.list.length),
)

async function loadThumbs() {
  const missing = items.value.filter((i) => !thumbs.value[i.id])
  const urls = await Promise.all(missing.map((i) => signedUrl(BUCKET, i.file_path)))
  missing.forEach((item, idx) => {
    const url = urls[idx]
    if (url) thumbs.value[item.id] = url
  })
}

async function loadBoard() {
  const { data, error } = await supabase
    .from('board_items')
    .select('*')
    .eq('campaign_id', campaignId.value)
    .order('created_at', { ascending: false })
  if (error) throw error
  items.value = (data ?? []) as BoardItem[]
  await loadThumbs()
}

async function loadJournal() {
  const { data, error } = await supabase
    .from('journal_entries')
    .select(
      '*, author:profiles!journal_entries_author_id_fkey(display_name), journal_attachments(*)',
    )
    .eq('campaign_id', campaignId.value)
    .order('created_at', { ascending: false })
  if (error) throw error
  entries.value = (data ?? []) as unknown as JournalEntry[]
}

async function load() {
  loading.value = true
  try {
    await store.fetchMine()
    if (!campaign.value) return
    const [rosterRows] = await Promise.all([
      store.roster(campaignId.value),
      loadBoard(),
      loadJournal(),
      characters.fetchMine(),
    ])
    roster.value = rosterRows
    subscribe()
  } catch (err) {
    snackbar.error(err, 'Could not load the campaign board')
  } finally {
    loading.value = false
  }
}

function subscribe() {
  if (channel) void supabase.removeChannel(channel)
  const filter = `campaign_id=eq.${campaignId.value}`
  channel = supabase
    .channel(`board-${campaignId.value}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'board_items', filter },
      () => void loadBoard(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'journal_entries', filter },
      () => void loadJournal(),
    )
    .subscribe()
}

onMounted(load)
watch(campaignId, load)
onBeforeUnmount(() => {
  if (channel) void supabase.removeChannel(channel)
})
watch(selected, () => (zoom.value = 1))

function titleFromFile(name: string) {
  return (
    name
      .replace(/\.[^.]+$/, '')
      .replace(/[-_]+/g, ' ')
      .trim()
      .slice(0, 120) || 'Untitled'
  )
}

async function onUpload(event: Event, kind: BoardItem['kind']) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length) return
  uploading.value = true
  let added = 0
  try {
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        snackbar.show(`${file.name} isn’t an image`, 'error')
        continue
      }
      if (file.size > MAX_FILE) {
        snackbar.show(`${file.name} is over 25 MB`, 'error')
        continue
      }
      const path = `${campaignId.value}/board/${crypto.randomUUID()}-${safeFileName(file.name)}`
      const upload = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type })
      if (upload.error) throw upload.error
      const { data, error } = await supabase
        .from('board_items')
        .insert({
          campaign_id: campaignId.value,
          title: titleFromFile(file.name),
          kind,
          file_path: path,
        })
        .select()
        .single()
      if (error) throw error
      selectedId.value = (data as BoardItem).id
      added++
    }
    if (added) {
      await loadBoard()
      snackbar.show(`${plural(added, kind === 'map' ? 'map' : 'image')} pinned to the board`)
    }
  } catch (err) {
    snackbar.error(err, 'Could not upload to the board')
  } finally {
    uploading.value = false
  }
}

async function toggleHidden(item: BoardItem) {
  const { error } = await supabase
    .from('board_items')
    .update({ hidden: !item.hidden })
    .eq('id', item.id)
  if (error) return snackbar.error(error, 'Could not change visibility')
  item.hidden = !item.hidden
  snackbar.show(item.hidden ? 'Hidden from players' : 'Revealed to the party')
}

async function renameItem(item: BoardItem, event: Event) {
  const title = (event.target as HTMLInputElement).value.trim()
  if (!title || title === item.title) return
  const { error } = await supabase.from('board_items').update({ title }).eq('id', item.id)
  if (error) return snackbar.error(error, 'Could not rename')
  item.title = title
}

const removeItemTarget = ref<BoardItem | null>(null)
const removeItemOpen = computed({
  get: () => removeItemTarget.value !== null,
  set: (v) => {
    if (!v) removeItemTarget.value = null
  },
})

async function confirmRemoveItem() {
  const item = removeItemTarget.value
  if (!item) return
  const { error } = await supabase.from('board_items').delete().eq('id', item.id)
  if (error) return snackbar.error(error, 'Could not remove from the board')
  await supabase.storage.from(BUCKET).remove([item.file_path])
  items.value = items.value.filter((i) => i.id !== item.id)
  removeItemTarget.value = null
}

function reportItem(item: BoardItem) {
  reportTarget.value = {
    target_type: 'board',
    target_id: item.id,
    bucket: BUCKET,
    file_path: item.file_path,
    file_name: item.title,
    where_label: `${campaign.value?.name ?? 'Campaign'} board`,
    uploader_id: item.created_by,
  }
}

// --- Playing as ----------------------------------------------------------------
const myOptions = computed(() =>
  characters.characters.filter((c) => c.system === campaign.value?.system),
)

async function seat(event: Event) {
  const value = (event.target as HTMLSelectElement).value || null
  try {
    await store.seatCharacter(campaignId.value, value)
    roster.value = await store.roster(campaignId.value)
    snackbar.show(value ? 'Character seated at this table' : 'Character removed from this table')
  } catch (err) {
    snackbar.error(err, 'Could not change your character')
  }
}

// --- Journal -------------------------------------------------------------------
const jFilter = ref<'all' | 'party' | 'private' | 'files'>('all')
const jTitle = ref('')
const jBody = ref('')
const jFiles = ref<File[]>([])
const jVis = ref<'party' | 'gm'>('party')
const posting = ref(false)

const filters = computed(() => {
  const all = entries.value
  return [
    { id: 'all' as const, label: 'All', count: all.length },
    {
      id: 'party' as const,
      label: 'Party',
      count: all.filter((e) => e.visibility === 'party').length,
    },
    {
      id: 'private' as const,
      label: 'Private',
      count: all.filter((e) => e.visibility === 'gm').length,
    },
    {
      id: 'files' as const,
      label: 'With files',
      count: all.filter((e) => e.journal_attachments.length).length,
    },
  ]
})

const shownEntries = computed(() =>
  entries.value.filter((e) => {
    if (jFilter.value === 'party') return e.visibility === 'party'
    if (jFilter.value === 'private') return e.visibility === 'gm'
    if (jFilter.value === 'files') return e.journal_attachments.length > 0
    return true
  }),
)

const privateLabel = computed(() => (isGm.value ? 'Only me (GM notes)' : 'Only me & the GM'))

function onAttach(event: Event) {
  const input = event.target as HTMLInputElement
  const picked = Array.from(input.files ?? [])
  input.value = ''
  const ok = picked.filter((f) => {
    if (f.size <= MAX_FILE) return true
    snackbar.show(`${f.name} is over 25 MB`, 'error')
    return false
  })
  jFiles.value = [...jFiles.value, ...ok].slice(0, 5)
}

async function post() {
  const title = jTitle.value.trim()
  if (!title) return
  posting.value = true
  try {
    const { data, error } = await supabase
      .from('journal_entries')
      .insert({
        campaign_id: campaignId.value,
        title,
        body: jBody.value.trim(),
        visibility: jVis.value,
      })
      .select('id')
      .single()
    if (error) throw error
    const entryId = (data as { id: string }).id
    for (const file of jFiles.value) {
      const path = `${campaignId.value}/journal/${entryId}/${crypto.randomUUID()}-${safeFileName(file.name)}`
      const upload = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || 'application/octet-stream' })
      if (upload.error) {
        snackbar.error(upload.error, `Could not attach ${file.name}`)
        continue
      }
      await supabase
        .from('journal_attachments')
        .insert({ entry_id: entryId, file_path: path, name: file.name, size: file.size })
    }
    jTitle.value = ''
    jBody.value = ''
    jFiles.value = []
    await loadJournal()
    snackbar.show('Posted to the journal')
  } catch (err) {
    snackbar.error(err, 'Could not post the entry')
  } finally {
    posting.value = false
  }
}

async function openAttachment(file: JournalAttachment) {
  if (!(await openFile(BUCKET, file.file_path))) snackbar.show('Could not open the file', 'error')
}

function reportAttachment(entry: JournalEntry, file: JournalAttachment) {
  reportTarget.value = {
    target_type: 'journal',
    target_id: file.id,
    bucket: BUCKET,
    file_path: file.file_path,
    file_name: file.name,
    where_label: `${campaign.value?.name ?? 'Campaign'} journal`,
    uploader_id: entry.author_id,
  }
}

const removeEntryTarget = ref<JournalEntry | null>(null)
const removeEntryOpen = computed({
  get: () => removeEntryTarget.value !== null,
  set: (v) => {
    if (!v) removeEntryTarget.value = null
  },
})

async function confirmRemoveEntry() {
  const entry = removeEntryTarget.value
  if (!entry) return
  const paths = entry.journal_attachments.map((a) => a.file_path)
  const { error } = await supabase.from('journal_entries').delete().eq('id', entry.id)
  if (error) return snackbar.error(error, 'Could not delete the entry')
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
  entries.value = entries.value.filter((e) => e.id !== entry.id)
  removeEntryTarget.value = null
}
</script>

<template>
  <div v-if="loading" class="spinner" role="status" aria-label="Loading campaign board" />
  <div v-else-if="!campaign" class="page page--narrow">
    <div class="empty">
      <h1 style="font-size: 24px; margin-bottom: 8px">You’re not in this campaign</h1>
      <p style="margin-bottom: 16px">
        Boards and journals are only visible to a campaign’s members.
      </p>
      <NuxtLink to="/campaigns" class="btn">Go to campaigns</NuxtLink>
    </div>
  </div>
  <div v-else class="page board" style="max-width: 1240px; gap: 28px; padding-top: 36px">
    <header class="hero">
      <div class="hero__kicker">Campaign board &amp; journal</div>
      <h1>{{ campaign.name }}</h1>
      <div class="hero__meta">{{ meta }}</div>
      <nav v-if="store.campaigns.length > 1" aria-label="Your campaigns" class="hero__tabs">
        <NuxtLink
          v-for="c in store.campaigns"
          :key="c.id"
          :to="`/campaigns/${c.id}/board`"
          class="chip"
          :class="{ 'is-active': c.id === campaign.id }"
          :aria-current="c.id === campaign.id ? 'page' : undefined"
        >
          {{ c.name }}
        </NuxtLink>
      </nav>
      <div class="small muted">
        Each campaign keeps its own board and journal. Only its members can see them.
      </div>
      <div class="hero__tools">
        <div v-if="isGm" role="group" aria-label="Preview as" class="seg">
          <button type="button" :aria-pressed="!gmView" @click="gmView = false">Player view</button>
          <button type="button" :aria-pressed="gmView" @click="gmView = true">GM view</button>
        </div>
        <NuxtLink v-if="isGm" :to="`/campaigns/${campaign.id}/gm`" class="btn btn--ghost"
          >GM console</NuxtLink
        >
        <label v-else class="playing">
          <span>Playing as</span>
          <select class="input" :value="campaign.myCharacterId ?? ''" @change="seat">
            <option value="">No character yet</option>
            <option v-for="c in myOptions" :key="c.id" :value="c.id">
              {{ c.name }} · level {{ c.level }}
            </option>
          </select>
        </label>
        <NuxtLink
          v-if="!isGm && campaign.myCharacterId"
          :to="`/character/${campaign.myCharacterId}?campaign=${campaign.id}`"
          class="btn btn--ghost"
          >Open sheet</NuxtLink
        >
      </div>
      <p v-if="!isGm && !myOptions.length" class="small muted">
        You have no {{ systemLabel(campaign.system) }} character yet.
        <NuxtLink to="/characters">Create one</NuxtLink> to seat it here.
      </p>
    </header>

    <div class="viewer-row">
      <section class="panel viewer" aria-label="Selected map or image">
        <div class="viewer__stage">
          <img
            v-if="selected && thumbs[selected.id]"
            :src="thumbs[selected.id]"
            :alt="selected.title"
            :style="{ transform: `scale(${zoom})` }"
          />
          <div v-else class="viewer__empty">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
              <path d="M9 3v15M15 6v15" />
            </svg>
            <span>{{ selected ? 'Loading image…' : 'Nothing is pinned to the board yet' }}</span>
          </div>
          <div v-if="selected" class="viewer__zoom">
            <button
              type="button"
              aria-label="Zoom in"
              :disabled="zoom >= 3"
              @click="zoom = Math.min(3, zoom + 0.5)"
            >
              +
            </button>
            <button
              type="button"
              aria-label="Zoom out"
              :disabled="zoom <= 1"
              @click="zoom = Math.max(1, zoom - 0.5)"
            >
              −
            </button>
          </div>
          <span v-if="selected?.hidden" class="badge badge--restricted viewer__hidden"
            >Hidden from players</span
          >
        </div>
        <div v-if="selected" class="viewer__foot">
          <div class="grow">
            <input
              v-if="isGm || selected.created_by === auth.userId"
              class="viewer__title viewer__title--edit"
              :value="selected.title"
              aria-label="Title"
              maxlength="120"
              @change="renameItem(selected, $event)"
            />
            <h2 v-else class="viewer__title">{{ selected.title }}</h2>
            <div class="hero__meta" style="font-size: 15px">
              {{
                selected.kind === 'map' ? 'Map' : selected.kind === 'image' ? 'Image' : 'Handout'
              }}
              · pinned by {{ nameOf(selected.created_by) }} · {{ shortDate(selected.created_at) }}
            </div>
          </div>
          <div class="row" style="gap: 8px">
            <button
              v-if="isGm"
              type="button"
              class="btn btn--ghost btn--sm"
              @click="toggleHidden(selected)"
            >
              {{ selected.hidden ? 'Reveal to players' : 'Hide from players' }}
            </button>
            <button
              v-if="isGm || selected.created_by === auth.userId"
              type="button"
              class="btn btn--ghost btn--sm"
              @click="removeItemTarget = selected"
            >
              Remove from board
            </button>
            <button
              v-if="selected.created_by !== auth.userId"
              type="button"
              class="btn btn--quiet btn--sm"
              @click="reportItem(selected)"
            >
              Report
            </button>
          </div>
        </div>
      </section>

      <aside class="pinned" aria-label="Pinned to the board">
        <h2 class="rule-title">Pinned<span aria-hidden="true" /></h2>
        <template v-for="g in groups" :key="g.label">
          <div class="pinned__group">
            <span>{{ g.label }}</span
            ><span>{{ g.list.length }}</span>
          </div>
          <button
            v-for="it in g.list"
            :key="it.id"
            type="button"
            class="pin"
            :aria-pressed="selected?.id === it.id"
            @click="selectedId = it.id"
          >
            <span
              class="pin__thumb"
              :style="thumbs[it.id] ? { backgroundImage: `url('${thumbs[it.id]}')` } : undefined"
            />
            <span class="pin__text">
              <strong>{{ it.title }}</strong>
              <small>{{ it.hidden ? 'Hidden · GM only' : nameOf(it.created_by) }}</small>
            </span>
          </button>
        </template>
        <p v-if="!groups.length" class="small muted">
          Maps and images pinned here show up for the whole party.
        </p>
        <RestrictedNotice v-if="!canUpload" title="Uploads are turned off for your account" />
        <div v-else class="pinned__upload">
          <label class="btn-dashed" :class="{ 'is-busy': uploading }">
            <input
              type="file"
              accept="image/*"
              multiple
              :disabled="uploading"
              @change="onUpload($event, 'map')"
            />
            {{ uploading ? 'Uploading…' : 'Upload map' }}
          </label>
          <label class="btn-dashed" :class="{ 'is-busy': uploading }">
            <input
              type="file"
              accept="image/*"
              multiple
              :disabled="uploading"
              @change="onUpload($event, 'image')"
            />
            Add images
          </label>
        </div>
        <p class="small muted" style="font-size: 13px">
          Campaign notes and documents go in the journal below. General rulebooks live in the
          <NuxtLink to="/library">document library</NuxtLink>.
        </p>
      </aside>
    </div>

    <section class="journal" aria-labelledby="jr-h">
      <h2 id="jr-h" class="journal__title">
        <span aria-hidden="true" />The Journal<span aria-hidden="true" />
      </h2>
      <p class="small muted" style="text-align: center">
        Notes and documents for {{ campaign.name }}, from its players and GM. Only members of this
        campaign can see them.
      </p>
      <div class="chips" style="justify-content: center">
        <button
          v-for="f in filters"
          :key="f.id"
          type="button"
          class="chip"
          :aria-pressed="jFilter === f.id"
          @click="jFilter = f.id"
        >
          {{ f.label }} <span>{{ f.count }}</span>
        </button>
      </div>

      <div class="journal__cols">
        <form class="panel compose" aria-label="New journal entry" @submit.prevent="post">
          <div class="row" style="gap: 10px; flex-wrap: nowrap">
            <span class="avatar">{{ (auth.profile?.display_name?.[0] ?? '?').toUpperCase() }}</span>
            <strong style="font-size: 18px">New entry as {{ auth.profile?.display_name }}</strong>
          </div>
          <RestrictedNotice
            v-if="!canPost"
            title="Journal posting is turned off for your account"
          />
          <fieldset v-else :disabled="posting" class="compose__fields">
            <div class="field">
              <label for="j-title">Title</label>
              <input id="j-title" v-model="jTitle" class="input" maxlength="160" required />
            </div>
            <div class="field">
              <label for="j-body">Entry</label>
              <textarea id="j-body" v-model="jBody" class="input" rows="5" />
            </div>
            <label v-if="canUpload" class="btn-dashed attach">
              <input type="file" multiple @change="onAttach" />
              {{
                jFiles.length
                  ? `${plural(jFiles.length, 'file')} attached · add more`
                  : 'Attach documents'
              }}
            </label>
            <div v-if="jFiles.length" class="chips">
              <span v-for="(f, i) in jFiles" :key="f.name + i" class="filechip">
                {{ f.name }}
                <button type="button" :aria-label="`Remove ${f.name}`" @click="jFiles.splice(i, 1)">
                  ×
                </button>
              </span>
            </div>
            <div class="field">
              <div id="j-vis" class="label">Share with</div>
              <div role="radiogroup" aria-labelledby="j-vis" class="seg seg--wide">
                <button
                  type="button"
                  role="radio"
                  :aria-checked="jVis === 'party'"
                  @click="jVis = 'party'"
                >
                  Whole party
                </button>
                <button
                  type="button"
                  role="radio"
                  :aria-checked="jVis === 'gm'"
                  @click="jVis = 'gm'"
                >
                  {{ privateLabel }}
                </button>
              </div>
            </div>
            <button
              type="submit"
              class="btn btn--block"
              style="min-height: 48px"
              :disabled="!jTitle.trim()"
            >
              {{ posting ? 'Posting…' : 'Post to journal' }}
            </button>
          </fieldset>
        </form>

        <div class="entries">
          <article
            v-for="e in shownEntries"
            :key="e.id"
            class="panel entry"
            :class="{ 'entry--private': e.visibility === 'gm' }"
          >
            <div class="entry__head">
              <span class="entry__author">
                <strong>{{ authorOf(e).primary }}</strong>
                <span v-if="authorOf(e).secondary" class="entry__player">{{
                  authorOf(e).secondary
                }}</span>
              </span>
              <span class="entry__role">{{ roleOf(e.author_id) }}</span>
              <span v-if="e.visibility === 'gm'" class="badge badge--restricted">
                {{ e.author_id === auth.userId ? privateLabel : 'Private to the GM' }}
              </span>
              <span class="entry__date">{{ stamp(e.created_at) }}</span>
            </div>
            <h3>{{ e.title }}</h3>
            <p v-if="e.body">{{ e.body }}</p>
            <div v-if="e.journal_attachments.length" class="row" style="gap: 8px">
              <span v-for="file in e.journal_attachments" :key="file.id" class="filebtn">
                <button type="button" @click="openAttachment(file)">
                  <span class="ext">{{ extOf(file.name).toUpperCase() || 'FILE' }}</span>
                  {{ file.name }}
                  <small>{{ formatSize(file.size) }}</small>
                </button>
                <button
                  v-if="e.author_id !== auth.userId"
                  type="button"
                  class="filebtn__report"
                  :aria-label="`Report ${file.name}`"
                  title="Report this file"
                  @click="reportAttachment(e, file)"
                >
                  ⚑
                </button>
              </span>
            </div>
            <button
              v-if="e.author_id === auth.userId || isGm"
              type="button"
              class="btn btn--quiet btn--sm entry__delete"
              @click="removeEntryTarget = e"
            >
              Delete entry
            </button>
          </article>
          <p v-if="!shownEntries.length" class="empty">Nothing here yet.</p>
        </div>
      </div>
    </section>

    <ReportDialog :target="reportTarget" @close="reportTarget = null" />

    <UiDialog
      v-model="removeItemOpen"
      :title="`Remove “${removeItemTarget?.title ?? ''}”?`"
      alert
      width="460px"
    >
      <p>The image is deleted from this campaign’s board for everyone.</p>
      <template #actions>
        <button type="button" class="btn btn--ghost" @click="removeItemTarget = null">
          Keep it
        </button>
        <button type="button" class="btn btn--danger" @click="confirmRemoveItem">
          Remove from board
        </button>
      </template>
    </UiDialog>

    <UiDialog
      v-model="removeEntryOpen"
      :title="`Delete “${removeEntryTarget?.title ?? ''}”?`"
      alert
      width="460px"
    >
      <p>The entry and its attachments are deleted for everyone in the campaign.</p>
      <template #actions>
        <button type="button" class="btn btn--ghost" @click="removeEntryTarget = null">
          Keep entry
        </button>
        <button type="button" class="btn btn--danger" @click="confirmRemoveEntry">
          Delete entry
        </button>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped lang="scss">
.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;

  h1 {
    font-family: var(--font-display);
    font-size: clamp(40px, 6vw, 72px);
    line-height: 1;
    letter-spacing: 0.01em;
    overflow-wrap: anywhere;
  }
}

.hero__kicker {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--accent-text);
}

.hero__meta {
  font-size: 17px;
  color: var(--page-soft);
}

.hero__tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  padding-top: 8px;

  a {
    text-decoration: none;
    min-height: 44px;
    font-size: 15px;
    font-weight: 600;
  }
}

.hero__tools .seg {
  background: var(--nav-bg);
}

.hero__tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding-top: 6px;
}

.playing {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: var(--page-soft);

  select {
    width: auto;
    min-width: 220px;
  }
}

.seg {
  display: inline-grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 4px;
  padding: 4px;
  border-radius: min(var(--radius-panel), 10px);
  background: var(--field);
  border: 1px solid var(--line);

  button {
    min-height: 40px;
    padding: 0 16px;
    border: 0;
    border-radius: min(var(--radius-control), 7px);
    background: transparent;
    color: var(--page-soft);
    font-weight: 600;
    font-size: 14px;

    &[aria-pressed='true'],
    &[aria-checked='true'] {
      background: var(--accent);
      color: var(--on-accent);
    }
  }

  &--wide {
    display: grid;
  }
}

.viewer-row {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: flex-start;
}

.viewer {
  flex: 999 1 560px;
  min-width: 0;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.viewer__stage {
  position: relative;
  height: min(520px, 70vh);
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: min(var(--radius-panel), 10px);
  background:
    repeating-linear-gradient(0deg, transparent 0 23px, var(--track) 23px 24px),
    repeating-linear-gradient(90deg, var(--field) 0 23px, var(--track) 23px 24px);

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    transform-origin: center;
    transition: transform 0.2s ease;
  }
}

.viewer__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 18px 26px;
  border: 1px solid var(--line);
  background: var(--panel-bg);
  color: var(--page-soft);
  text-align: center;
  border-radius: min(var(--radius-panel), 10px);
}

.viewer__zoom {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;

  button {
    width: 44px;
    height: 44px;
    border-radius: min(var(--radius-control), 8px);
    border: 1px solid var(--line-strong);
    background: var(--panel-bg);
    color: var(--page-text);
    font-size: 20px;
  }
}

.viewer__hidden {
  position: absolute;
  left: 12px;
  top: 12px;
}

.viewer__foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: 10px;
  padding: 0 6px 4px;
}

.viewer__title {
  font-family: var(--font-heading);
  font-size: 26px;
  font-weight: 700;

  &--edit {
    width: 100%;
    background: transparent;
    border: 0;
    border-bottom: 1px dashed transparent;
    padding: 0;
    color: inherit;

    &:hover,
    &:focus {
      border-bottom-color: var(--line-strong);
    }
  }
}

.pinned {
  flex: 1 1 280px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rule-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 4px;

  span {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, var(--line-strong), transparent);
  }
}

.pinned__group {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--page-muted);
  padding-top: 4px;
}

.pin {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  text-align: left;
  background: var(--panel-bg);
  color: var(--panel-text);
  border: 1px solid var(--panel-line);
  border-radius: min(var(--radius-panel), 12px);

  &[aria-pressed='true'] {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-tint);
  }
}

.pin__thumb {
  flex: 0 0 72px;
  height: 54px;
  border-radius: min(var(--radius-panel), 6px);
  background: var(--track) center / cover no-repeat;
}

.pin__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  strong {
    font-size: 16px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    font-size: 12px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--panel-muted);
  }
}

.pinned__upload {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 6px;
}

.btn-dashed {
  position: relative;
  justify-content: center;
  cursor: pointer;

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

  &.is-busy {
    opacity: 0.6;
  }
}

.journal {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 12px;
}

.journal__title {
  display: flex;
  align-items: center;
  gap: 18px;
  font-family: var(--font-display);
  font-size: clamp(30px, 4vw, 44px);

  span {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--line-strong));

    &:last-child {
      background: linear-gradient(90deg, var(--line-strong), transparent);
    }
  }
}

.chip span {
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}

.journal__cols {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: flex-start;
  padding-top: 8px;
}

.compose {
  flex: 1 1 320px;
  min-width: 0;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.compose__fields {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;

  label:not(.btn-dashed),
  .label {
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
}

.attach {
  justify-content: flex-start;
}

.filechip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 4px 0 12px;
  border-radius: 999px;
  background: var(--track);
  border: 1px solid var(--line);
  font-size: 13px;
  max-width: 100%;

  button {
    width: 32px;
    height: 32px;
    border: 0;
    background: transparent;
    color: var(--page-muted);
    font-size: 16px;
  }
}

.entries {
  flex: 999 1 520px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.entry {
  padding: 20px 24px;
  border-left: 3px solid var(--accent);
  display: flex;
  flex-direction: column;
  gap: 10px;

  &--private {
    border-left-color: var(--secondary);
  }

  h3 {
    font-size: 23px;
    font-weight: 700;
    line-height: 1.15;
  }

  p {
    font-size: 16px;
    line-height: 1.6;
    white-space: pre-line;
    color: var(--page-soft);
  }
}

.entry__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px;

  strong {
    font-size: 17px;
  }
}

.entry__author {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.entry__player {
  font-size: 13px;
  color: var(--page-muted);
}

.entry__role {
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--page-muted);
}

.entry__date {
  margin-left: auto;
  font-size: 14px;
  color: var(--page-muted);
}

.entry__delete {
  align-self: flex-end;
}

.filebtn {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: min(var(--radius-control), 8px);
  background: var(--field);
  overflow: hidden;

  button {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 0 14px;
    border: 0;
    background: transparent;
    color: var(--page-text);
    font-size: 15px;
    font-weight: 500;
  }

  small {
    color: var(--page-muted);
  }
}

.filebtn__report {
  border-left: 1px solid var(--line) !important;
  color: var(--page-muted) !important;
  padding: 0 12px !important;
}

.ext {
  font-size: 10px;
  font-weight: 800;
  padding: 4px 6px;
  border-radius: 4px;
  background: var(--warn-bg);
  color: var(--warn-text);
  font-family: Inter, system-ui, sans-serif;
}
</style>
