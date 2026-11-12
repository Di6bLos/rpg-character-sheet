<script setup lang="ts">
// Journal tab: session log, characters (backstories + GM secrets), NPCs and the
// bestiary, with search and a compose form for the open section.
import type { ReportTarget } from '~/components/ReportDialog.vue'
import { supabase } from '~/lib/supabase'
import type {
  CampaignNpc,
  JournalAttachment,
  JournalEntry,
  JournalSection,
  RosterEntry,
} from '~/types'
import { extOf, formatSize, plural, shortDate, stamp } from '~/utils/format'
import { authorLabel } from '~/utils/roster'

type JournalSlug = 'log' | 'characters' | 'npcs' | 'bestiary'

const props = defineProps<{ section: JournalSlug }>()

const auth = useAuthStore()
const snackbar = useSnackbarStore()
const { campaign, campaignId, gmControls, isGm, roster, base } = useCampaignBoard()
const journal = useJournal(campaignId)

const SLUG_TO_SECTION: Record<JournalSlug, JournalSection> = {
  log: 'log',
  characters: 'character',
  npcs: 'npc',
  bestiary: 'bestiary',
}

const SECTIONS: Record<
  JournalSlug,
  {
    label: string
    title: string
    blurb: string
    newLabel: string
    titleField: string
    bodyField: string
  }
> = {
  log: {
    label: 'Session log',
    title: 'Session log',
    blurb: 'What happened, session by session.',
    newLabel: 'New session entry',
    titleField: 'Title',
    bodyField: 'What happened',
  },
  characters: {
    label: 'Characters',
    title: 'Characters',
    blurb: 'Who everyone is. Backstories come from each character sheet.',
    newLabel: 'New character note',
    titleField: 'Title',
    bodyField: 'Note',
  },
  npcs: {
    label: 'NPCs',
    title: 'People we’ve met',
    blurb: 'Everyone the party has met. Anyone can add what they learned.',
    newLabel: 'Add someone we met',
    titleField: 'Name',
    bodyField: 'Notes',
  },
  bestiary: {
    label: 'Bestiary',
    title: 'Bestiary',
    blurb: 'Creatures the party has faced. Facts appear as the GM reveals them.',
    newLabel: 'Add a creature',
    titleField: 'Name',
    bodyField: 'What we learned',
  },
}

const sec = computed(() => SECTIONS[props.section])
const dbSection = computed(() => SLUG_TO_SECTION[props.section])

/** Row-level security already hides GM-only entries from players. */
const entries = computed(() => journal.entries.value)

const heroes = computed(() => roster.value.filter((r) => r.character_id))

// --- Search ---------------------------------------------------------------------
const q = ref('')
const needle = computed(() => q.value.trim().toLowerCase())
function matches(e: JournalEntry) {
  if (!needle.value) return true
  const f = e.fields ?? {}
  return [e.title, e.body, f.role, f.notes, f.met, ...(f.facts ?? []).map((x) => `${x.k} ${x.v}`)]
    .filter(Boolean)
    .some((s) => s!.toLowerCase().includes(needle.value))
}
function heroMatches(r: RosterEntry) {
  if (!needle.value) return true
  return [
    r.character_name,
    r.display_name,
    r.summary?.class,
    r.summary?.lineage,
    r.summary?.backstory,
  ]
    .filter(Boolean)
    .some((s) => s!.toLowerCase().includes(needle.value))
}

const counts = computed(() => ({
  log: entries.value.filter((e) => e.section === 'log').length,
  characters: heroes.value.length,
  npcs: entries.value.filter((e) => e.section === 'npc').length,
  bestiary: entries.value.filter((e) => e.section === 'bestiary').length,
}))

const shown = computed(() =>
  entries.value.filter((e) => e.section === dbSection.value && matches(e)),
)
const shownHeroes = computed(() => heroes.value.filter(heroMatches))

/** Session number by date (oldest = 1). */
const sessionNo = computed(() => {
  const logs = entries.value
    .filter((e) => e.section === 'log')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  return new Map(logs.map((e, i) => [e.id, i + 1]))
})

const empty = computed(() => {
  if (props.section === 'characters') return !shownHeroes.value.length
  return !shown.value.length
})
const emptyText = computed(() => {
  if (needle.value) return `Nothing matches “${q.value.trim()}”.`
  return {
    log: 'No sessions written up yet. Add the first one.',
    characters: 'No one has seated a character yet.',
    npcs: 'No one met yet. NPCs the GM adds to a fight or a scene show up here too.',
    bestiary: 'No creatures yet. They appear here when they enter initiative.',
  }[props.section]
})

// --- Character secrets (GM) ------------------------------------------------------
function secretsFor(characterId: string) {
  return entries.value.filter(
    (e) => e.section === 'character' && e.fields?.character_id === characterId,
  )
}
const secretDraft = ref<Record<string, string>>({})
async function addSecret(r: RosterEntry) {
  const body = (secretDraft.value[r.character_id!] ?? '').trim()
  if (!body) return
  const ok = await journal.post({
    section: 'character',
    title: `Secret · ${r.character_name ?? r.display_name}`,
    body,
    visibility: 'gm',
    files: [],
    fields: { character_id: r.character_id! },
  })
  if (ok) secretDraft.value[r.character_id!] = ''
}

// --- NPC data for the GM (stat blocks for revealing facts) -------------------------
type NpcLite = Pick<CampaignNpc, 'id' | 'stat_block' | 'level' | 'gm_notes'>
const npcs = ref<Record<string, NpcLite>>({})
async function loadNpcs() {
  if (!isGm.value) return
  const { data, error } = await supabase
    .from('campaign_npcs')
    .select('id, stat_block, level, gm_notes')
    .eq('campaign_id', campaignId.value)
  if (error) return snackbar.error(error, 'Could not load the NPC stat blocks')
  npcs.value = Object.fromEntries(((data ?? []) as NpcLite[]).map((n) => [n.id, n]))
}
onMounted(loadNpcs)
watch(campaignId, loadNpcs)

// --- Compose --------------------------------------------------------------------
const composeOpen = ref(false)
const cTitle = ref('')
const cBody = ref('')
const cRole = ref('')
const cVis = ref<'party' | 'gm'>('party')
const cFiles = ref<File[]>([])
const canPost = computed(() => auth.can('can_post_journal'))
const canUpload = computed(() => auth.can('can_upload_documents'))
const privateLabel = computed(() => (isGm.value ? 'Only me (GM notes)' : 'Only me & the GM'))
watch(
  () => props.section,
  () => (composeOpen.value = false),
)

function onAttach(event: Event) {
  const input = event.target as HTMLInputElement
  const picked = Array.from(input.files ?? [])
  input.value = ''
  const ok = picked.filter((f) => {
    if (f.size <= MAX_CAMPAIGN_FILE) return true
    snackbar.show(`${f.name} is over 25 MB`, 'error')
    return false
  })
  cFiles.value = [...cFiles.value, ...ok].slice(0, 5)
}

async function post() {
  const ok = await journal.post({
    section: dbSection.value,
    title: cTitle.value,
    body: props.section === 'npcs' || props.section === 'bestiary' ? '' : cBody.value,
    visibility: cVis.value,
    files: props.section === 'log' ? cFiles.value : [],
    fields:
      props.section === 'npcs'
        ? { role: cRole.value.trim(), notes: cBody.value.trim(), facts: [] }
        : props.section === 'bestiary'
          ? { notes: cBody.value.trim(), facts: [] }
          : {},
  })
  if (!ok) return
  cTitle.value = ''
  cBody.value = ''
  cRole.value = ''
  cFiles.value = []
  composeOpen.value = false
}

// --- Log entry actions ------------------------------------------------------------
function authorOf(e: JournalEntry) {
  return authorLabel(roster.value, e.author_id, e.author?.display_name)
}

async function openAttachment(file: JournalAttachment) {
  if (!(await openFile(CAMPAIGN_BUCKET, file.file_path)))
    snackbar.show('Could not open the file', 'error')
}

const reportTarget = ref<ReportTarget | null>(null)
function reportAttachment(entry: JournalEntry, file: JournalAttachment) {
  reportTarget.value = {
    target_type: 'journal',
    target_id: file.id,
    bucket: CAMPAIGN_BUCKET,
    file_path: file.file_path,
    file_name: file.name,
    where_label: `${campaign.value?.name ?? 'Campaign'} journal`,
    uploader_id: entry.author_id,
  }
}

// --- Editing a log entry (its author or the GM) -----------------------------------
const editingId = ref<string | null>(null)
const eTitle = ref('')
const eBody = ref('')
const eVis = ref<'party' | 'gm'>('party')
const saving = ref(false)

function canEdit(e: JournalEntry) {
  return e.author_id === auth.userId || isGm.value
}
function startEdit(e: JournalEntry) {
  editingId.value = e.id
  eTitle.value = e.title
  eBody.value = e.body
  eVis.value = e.visibility
}
async function saveEdit(e: JournalEntry) {
  saving.value = true
  try {
    if (
      await journal.updateEntry(e, {
        title: eTitle.value,
        body: eBody.value,
        visibility: eVis.value,
      })
    ) {
      editingId.value = null
    }
  } finally {
    saving.value = false
  }
}

const removeTarget = ref<JournalEntry | null>(null)
const removeOpen = computed({
  get: () => removeTarget.value !== null,
  set: (v) => {
    if (!v) removeTarget.value = null
  },
})
async function confirmRemove() {
  if (removeTarget.value) await journal.remove(removeTarget.value)
  removeTarget.value = null
}
</script>

<template>
  <div class="journal">
    <nav aria-label="Journal sections" class="journal__nav">
      <label for="j-search" class="journal__label">Search the journal</label>
      <input
        id="j-search"
        v-model="q"
        type="search"
        class="input"
        placeholder="Names, places, clues…"
      />
      <NuxtLink
        v-for="(s, slug) in SECTIONS"
        :key="slug"
        :to="{
          path: slug === 'log' ? `${base}/journal` : `${base}/journal/${slug}`,
        }"
        class="journal__sec"
        :class="`journal__sec--${slug}`"
        :aria-current="slug === section ? 'page' : undefined"
      >
        <span class="journal__dot" aria-hidden="true" />
        <span class="grow">{{ s.label }}</span>
        <span class="journal__count">{{ counts[slug] }}</span>
      </NuxtLink>
      <button
        v-if="section !== 'characters' && canPost"
        type="button"
        class="btn btn--block journal__new"
        :aria-expanded="composeOpen"
        @click="composeOpen = !composeOpen"
      >
        {{ composeOpen ? 'Close' : sec.newLabel }}
      </button>
      <RestrictedNotice
        v-else-if="!canPost"
        title="Journal posting is turned off for your account"
      />
    </nav>

    <div class="journal__main">
      <div class="journal__head">
        <h2>{{ sec.title }}</h2>
        <p>{{ sec.blurb }}</p>
      </div>

      <form
        v-if="composeOpen"
        class="panel compose"
        :aria-label="sec.newLabel"
        @submit.prevent="post"
      >
        <div class="compose__title">{{ sec.newLabel }}</div>
        <fieldset :disabled="journal.posting.value" class="stack">
          <div class="field">
            <label for="c-title">{{ sec.titleField }}</label>
            <input id="c-title" v-model="cTitle" class="input" maxlength="160" required />
          </div>
          <div v-if="section === 'npcs'" class="field">
            <label for="c-role">Who they are</label>
            <input
              id="c-role"
              v-model="cRole"
              class="input"
              maxlength="120"
              placeholder="Ferryman on the Greywater"
            />
          </div>
          <div class="field">
            <label for="c-body">{{ sec.bodyField }}</label>
            <textarea id="c-body" v-model="cBody" class="input" rows="4" />
          </div>
          <div class="compose__row">
            <div role="radiogroup" aria-label="Who can see this" class="seg">
              <button
                type="button"
                role="radio"
                :aria-checked="cVis === 'party'"
                @click="cVis = 'party'"
              >
                Whole party
              </button>
              <button type="button" role="radio" :aria-checked="cVis === 'gm'" @click="cVis = 'gm'">
                {{ privateLabel }}
              </button>
            </div>
            <label v-if="section === 'log' && canUpload" class="btn-dashed attach">
              <input type="file" multiple @change="onAttach" />
              {{
                cFiles.length
                  ? `${plural(cFiles.length, 'file')} attached · add more`
                  : 'Attach documents'
              }}
            </label>
            <button type="submit" class="btn compose__go" :disabled="!cTitle.trim()">
              {{ journal.posting.value ? 'Adding…' : 'Add to journal' }}
            </button>
          </div>
          <div v-if="cFiles.length" class="chips">
            <span v-for="(f, i) in cFiles" :key="f.name + i" class="filechip">
              {{ f.name }}
              <button type="button" :aria-label="`Remove ${f.name}`" @click="cFiles.splice(i, 1)">
                ×
              </button>
            </span>
          </div>
        </fieldset>
      </form>

      <div
        v-if="journal.loading.value"
        class="spinner"
        role="status"
        aria-label="Loading the journal"
      />
      <div v-else-if="empty" class="journal__empty">{{ emptyText }}</div>

      <!-- Session log -->
      <ol v-else-if="section === 'log'" class="log">
        <li v-for="e in shown" :key="e.id">
          <div class="log__rail" aria-hidden="true">
            <span class="log__no" :class="{ 'is-private': e.visibility === 'gm' }">
              <small>Session</small><b>{{ sessionNo.get(e.id) }}</b>
            </span>
            <span class="log__line" />
          </div>
          <article class="panel log__entry">
            <div class="log__top">
              <h3>{{ e.title }}</h3>
              <span v-if="e.visibility === 'gm'" class="private">
                {{ e.author_id === auth.userId ? privateLabel : 'Private to the GM' }}
              </span>
              <span class="log__meta">
                {{ authorOf(e).primary
                }}<template v-if="authorOf(e).secondary"> ({{ authorOf(e).secondary }})</template> ·
                {{ stamp(e.created_at)
                }}<template v-if="e.edited_at"> · edited {{ stamp(e.edited_at) }}</template>
              </span>
            </div>
            <form
              v-if="editingId === e.id"
              class="stack log__edit"
              :aria-label="`Edit ${e.title}`"
              @submit.prevent="saveEdit(e)"
            >
              <div class="field">
                <label :for="`e-title-${e.id}`">Title</label>
                <input
                  :id="`e-title-${e.id}`"
                  v-model="eTitle"
                  class="input"
                  maxlength="160"
                  required
                />
              </div>
              <div class="field">
                <label :for="`e-body-${e.id}`">What happened</label>
                <textarea :id="`e-body-${e.id}`" v-model="eBody" class="input" rows="6" />
              </div>
              <div class="compose__row">
                <div role="radiogroup" aria-label="Who can see this" class="seg">
                  <button
                    type="button"
                    role="radio"
                    :aria-checked="eVis === 'party'"
                    @click="eVis = 'party'"
                  >
                    Whole party
                  </button>
                  <button
                    type="button"
                    role="radio"
                    :aria-checked="eVis === 'gm'"
                    @click="eVis = 'gm'"
                  >
                    {{ e.author_id === auth.userId ? privateLabel : 'Author & GM only' }}
                  </button>
                </div>
                <span class="row compose__go" style="gap: 8px">
                  <button type="button" class="btn btn--ghost btn--sm" @click="editingId = null">
                    Cancel
                  </button>
                  <button type="submit" class="btn btn--sm" :disabled="saving || !eTitle.trim()">
                    {{ saving ? 'Saving…' : 'Save changes' }}
                  </button>
                </span>
              </div>
            </form>
            <p v-else-if="e.body" class="log__body">{{ e.body }}</p>
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
            <div v-if="canEdit(e) && editingId !== e.id" class="row log__tools" style="gap: 6px">
              <button type="button" class="btn btn--ghost btn--sm" @click="startEdit(e)">
                Edit
              </button>
              <button type="button" class="btn btn--quiet btn--sm" @click="removeTarget = e">
                Delete entry
              </button>
            </div>
          </article>
        </li>
      </ol>

      <!-- Characters -->
      <div v-else-if="section === 'characters'" class="chars">
        <article v-for="r in shownHeroes" :key="r.user_id" class="panel char">
          <div class="char__who">
            <UiAvatar
              :name="r.character_name ?? r.display_name"
              :portrait-path="r.portrait_path"
              :class-slug="r.summary?.classSlug ?? null"
              :size="64"
            />
            <span class="char__names">
              <h3>{{ r.character_name }}</h3>
              <span>
                {{
                  [r.summary?.lineage, r.summary?.class].filter(Boolean).join(' ') || 'Adventurer'
                }}
                {{ r.character_level }} · played by {{ r.display_name }}
              </span>
            </span>
          </div>
          <p v-if="r.summary?.backstory" class="char__bg">{{ r.summary.backstory }}</p>
          <p v-else class="small muted">
            {{
              r.user_id === auth.userId
                ? 'Add a background story on your sheet and it shows here.'
                : 'No background story yet.'
            }}
          </p>
          <template v-if="gmControls">
            <div v-for="s in secretsFor(r.character_id!)" :key="s.id" class="char__secret">
              <span class="char__secret-label">GM secret · {{ shortDate(s.created_at) }}</span>
              <span>{{ s.body }}</span>
              <button type="button" class="btn btn--quiet btn--sm" @click="removeTarget = s">
                Delete
              </button>
            </div>
            <form class="char__add" @submit.prevent="addSecret(r)">
              <label :for="`sec-${r.character_id}`" class="sr-only"
                >GM secret about {{ r.character_name }}</label
              >
              <input
                :id="`sec-${r.character_id}`"
                v-model="secretDraft[r.character_id!]"
                class="input"
                maxlength="2000"
                placeholder="Add a GM-only secret…"
              />
              <button
                type="submit"
                class="btn btn--ghost btn--sm"
                :disabled="!(secretDraft[r.character_id!] ?? '').trim()"
              >
                Save
              </button>
            </form>
          </template>
        </article>
      </div>

      <!-- NPCs and bestiary -->
      <div v-else :class="section === 'npcs' ? 'npcs' : 'beasts'">
        <BoardJournalNpcCard
          v-for="e in shown"
          :key="e.id"
          :entry="e"
          :journal="journal"
          :npc="e.campaign_npc_id ? (npcs[e.campaign_npc_id] ?? null) : null"
          :gm="gmControls"
        />
      </div>
    </div>

    <ReportDialog :target="reportTarget" @close="reportTarget = null" />

    <UiDialog
      v-model="removeOpen"
      :title="`Delete “${removeTarget?.title ?? ''}”?`"
      alert
      width="460px"
    >
      <p>The entry and its attachments are deleted for everyone in the campaign.</p>
      <template #actions>
        <button type="button" class="btn btn--ghost" @click="removeTarget = null">
          Keep entry
        </button>
        <button type="button" class="btn btn--danger" @click="confirmRemove">Delete entry</button>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped lang="scss">
.journal {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: flex-start;
}

.journal__nav {
  flex: 1 1 230px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;

  .input {
    margin-bottom: 8px;
  }
}

.journal__label {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--page-muted);
}

.journal__sec {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 0 14px;
  border-radius: var(--radius-control);
  border: 1px solid transparent;
  color: var(--page-muted);
  font-size: 17px;
  font-weight: 600;
  text-decoration: none;

  &[aria-current='page'] {
    background: var(--inset);
    border-color: var(--line-strong);
    color: var(--page-text);
  }
}

.journal__dot {
  flex: 0 0 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);

  .journal__sec--characters & {
    background: var(--secondary, var(--accent));
  }

  .journal__sec--npcs & {
    background: var(--ok-text, var(--accent));
  }

  .journal__sec--bestiary & {
    background: var(--danger);
  }
}

.journal__count {
  font-size: 13px;
  font-weight: 700;
}

.journal__new {
  margin-top: 8px;
  min-height: 48px;
  font-family: var(--font-heading);
  font-size: 17px;
}

.journal__main {
  flex: 999 1 620px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.journal__head {
  display: flex;
  flex-direction: column;
  gap: 4px;

  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 36px;
    line-height: 1.1;
  }

  p {
    margin: 0;
    font-size: 16px;
    color: var(--page-muted);
  }
}

.journal__empty {
  padding: 28px;
  text-align: center;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-panel);
  color: var(--page-muted);
  font-size: 16px;
}

.compose {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;

  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
  }
}

.compose__title {
  font-family: var(--font-heading);
  font-size: 20px;
  font-weight: 700;
}

.compose__row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.compose__go {
  margin-left: auto;
}

.seg {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: var(--radius-control);
  border: 1px solid var(--line);
  background: var(--field);

  button {
    min-height: 38px;
    padding: 0 14px;
    border: 0;
    border-radius: min(var(--radius-control), 7px);
    background: transparent;
    color: var(--page-soft);
    font-size: 14px;
    font-weight: 600;

    &[aria-checked='true'] {
      background: var(--accent);
      color: var(--on-accent);
    }
  }
}

.attach {
  position: relative;

  input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
}

.filechip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 4px 4px 10px;
  border-radius: var(--radius-control);
  background: var(--inset);
  border: 1px solid var(--line);
  font-size: 13px;

  button {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 0;
    background: transparent;
    color: var(--page-muted);
  }
}

.log {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;

  > li {
    display: flex;
    gap: 16px;
  }
}

.log__rail {
  flex: 0 0 64px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding-top: 6px;
}

.log__no {
  width: 62px;
  height: 62px;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--accent);
  background: var(--field);
  line-height: 1;

  &.is-private {
    border-style: dashed;
    border-color: var(--line-strong);
  }

  small {
    font-size: 9px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--page-muted);
  }

  b {
    font-family: var(--font-heading);
    font-size: 22px;
  }
}

.log__line {
  flex: 1;
  width: 1px;
  background: var(--line);
}

.log__entry {
  flex: 1;
  min-width: 0;
  padding: 18px 22px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.log__top {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px;

  h3 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 24px;
    line-height: 1.15;
  }
}

.private {
  padding: 3px 10px;
  border-radius: var(--radius-control);
  border: 1px dashed var(--accent-text);
  color: var(--accent-text);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.log__meta {
  margin-left: auto;
  font-size: 14px;
  color: var(--page-muted);
}

.log__body {
  margin: 0;
  font-size: 17px;
  line-height: 1.6;
  color: var(--page-soft);
  white-space: pre-wrap;
}

.log__tools {
  align-self: flex-start;
}

.log__edit {
  gap: 10px;
}

.chars {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(360px, 100%), 1fr));
  gap: 16px;
}

.char {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.char__who {
  display: flex;
  align-items: center;
  gap: 14px;
}

.char__names {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  h3 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 23px;
    line-height: 1.15;
  }

  span {
    font-size: 14px;
    color: var(--page-muted);
  }
}

.char__bg {
  margin: 0;
  font-size: 16px;
  line-height: 1.6;
  color: var(--page-soft);
  white-space: pre-wrap;
}

.char__secret {
  padding: 10px 12px;
  border-radius: min(var(--radius-control), 8px);
  border: 1px dashed var(--accent-text);
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 15px;
  line-height: 1.5;

  .btn {
    align-self: flex-start;
  }
}

.char__secret-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent-text);
}

.char__add {
  display: flex;
  gap: 8px;

  .input {
    flex: 1;
    min-width: 0;
  }
}

.npcs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(290px, 100%), 1fr));
  gap: 16px;
}

.beasts {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

@media (max-width: 560px) {
  .log__rail {
    display: none;
  }
}
</style>
