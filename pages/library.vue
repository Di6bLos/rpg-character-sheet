<script setup lang="ts">
import type { ReportTarget } from '~/components/ReportDialog.vue'
import { LIBRARY_ACCEPT, LIBRARY_CATEGORIES } from '~/stores/library'
import type { GameSystem, LibraryCategory, LibraryDocument } from '~/types'
import { formatSize, shortDate } from '~/utils/format'
import { SYSTEMS, systemLabel } from '~/utils/systems'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Library · Lantern' })

const auth = useAuthStore()
const store = useLibraryStore()
const site = useSiteStore()
const route = useRoute()

/** Documents, or the shared NPC pool (hidden when admins switch the pool off). */
const tab = computed(() =>
  route.query.tab === 'npcs' && site.settings.npc_pool_library ? 'npcs' : 'documents',
)
const snackbar = useSnackbarStore()

const cat = ref<'All' | LibraryCategory>('All')
const q = ref('')
const dragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const canUpload = computed(() => auth.can('can_upload_documents'))

onMounted(async () => {
  try {
    await store.fetchAll(true)
  } catch (err) {
    snackbar.error(err, 'Could not load the library')
  }
})

const categories = computed(() =>
  (['All', ...LIBRARY_CATEGORIES] as const).map((label) => ({
    label,
    count:
      label === 'All'
        ? store.documents.length
        : store.documents.filter((d) => d.category === label).length,
  })),
)

const shown = computed(() => {
  const term = q.value.trim().toLowerCase()
  return store.documents.filter(
    (d) =>
      (cat.value === 'All' || d.category === cat.value) &&
      (!term ||
        d.name.toLowerCase().includes(term) ||
        systemLabel(d.system).toLowerCase().includes(term) ||
        (d.uploader?.display_name ?? '').toLowerCase().includes(term)),
  )
})

// --- Upload ------------------------------------------------------------------
const pending = ref<File | null>(null)
const queue = ref<File[]>([])
const upName = ref('')
const upSystem = ref<GameSystem | ''>('')
const upCategory = ref<LibraryCategory>('Reference')
const uploading = ref(false)

const uploadOpen = computed({
  get: () => pending.value !== null,
  set: (v) => {
    if (!v) {
      pending.value = null
      queue.value = []
    }
  },
})

function nextInQueue() {
  const file = queue.value.shift() ?? null
  pending.value = file
  if (file)
    upName.value = file.name
      .replace(/\.[^.]+$/, '')
      .replace(/[-_]+/g, ' ')
      .trim()
}

function take(files: File[]) {
  if (!canUpload.value) return
  const ok: File[] = []
  for (const file of files) {
    const reason = store.rejectReason(file)
    if (reason) snackbar.show(reason, 'error', 5000)
    else ok.push(file)
  }
  if (!ok.length) return
  queue.value = ok
  nextInQueue()
}

function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  take(Array.from(input.files ?? []))
  input.value = ''
}

function onDrop(event: DragEvent) {
  dragging.value = false
  take(Array.from(event.dataTransfer?.files ?? []))
}

async function confirmUpload() {
  const file = pending.value
  if (!file || !upName.value.trim()) return
  uploading.value = true
  try {
    await store.upload(file, {
      name: upName.value.trim(),
      system: upSystem.value || null,
      category: upCategory.value,
    })
    snackbar.show(`${upName.value.trim()} added to the library`)
    nextInQueue()
  } catch (err) {
    snackbar.error(err, 'Could not upload the document')
  } finally {
    uploading.value = false
  }
}

// --- Open / remove / report -----------------------------------------------------
const viewing = ref<{ url: string; name: string } | null>(null)

async function open(doc: LibraryDocument) {
  const url = await signedUrl('library', doc.file_path)
  if (!url) return snackbar.show('Could not open the document', 'error')
  if (doc.ext === 'pdf') viewing.value = { url, name: doc.name }
  else window.open(url, '_blank', 'noopener')
}

const removeTarget = ref<LibraryDocument | null>(null)
const removeOpen = computed({
  get: () => removeTarget.value !== null,
  set: (v) => {
    if (!v) removeTarget.value = null
  },
})

async function confirmRemove() {
  const doc = removeTarget.value
  if (!doc) return
  try {
    await store.remove(doc)
    snackbar.show(`${doc.name} removed`)
  } catch (err) {
    snackbar.error(err, 'Could not remove the document')
  } finally {
    removeTarget.value = null
  }
}

const reportTarget = ref<ReportTarget | null>(null)
function report(doc: LibraryDocument) {
  reportTarget.value = {
    target_type: 'library',
    target_id: doc.id,
    bucket: 'library',
    file_path: doc.file_path,
    file_name: `${doc.name}.${doc.ext}`,
    where_label: 'Document library',
    uploader_id: doc.uploaded_by,
  }
}
</script>

<template>
  <div class="page" style="gap: 24px">
    <header class="page-head">
      <div>
        <div class="eyebrow" style="letter-spacing: 0.14em; font-size: 11px">
          Shared with everyone
        </div>
        <h1 style="margin-top: 6px">Document library</h1>
        <p>
          General rules, references and homebrew any player or GM can read from their dashboard.
          Campaign-specific notes go in that campaign’s journal.
        </p>
      </div>
      <button
        v-if="canUpload && tab === 'documents'"
        type="button"
        class="btn"
        @click="fileInput?.click()"
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
          <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
        </svg>
        Upload document
      </button>
      <input
        ref="fileInput"
        type="file"
        class="sr-only"
        tabindex="-1"
        aria-label="Upload documents"
        :accept="LIBRARY_ACCEPT"
        multiple
        @change="onPick"
      />
    </header>

    <nav v-if="site.settings.npc_pool_library" aria-label="Library sections" class="lib-tabs">
      <NuxtLink to="/library" :aria-current="tab === 'documents' ? 'page' : undefined"
        >Documents</NuxtLink
      >
      <NuxtLink
        :to="{ path: '/library', query: { tab: 'npcs' } }"
        :aria-current="tab === 'npcs' ? 'page' : undefined"
        >NPCs &amp; monsters</NuxtLink
      >
    </nav>

    <LibraryNpcPool v-if="tab === 'npcs'" />

    <template v-else>
      <RestrictedNotice v-if="!canUpload" title="Uploads are turned off for your account">
        You can still open everything in the library.
      </RestrictedNotice>

      <div class="toolbar">
        <div class="chips" role="group" aria-label="Category">
          <button
            v-for="c in categories"
            :key="c.label"
            type="button"
            class="chip"
            :aria-pressed="cat === c.label"
            @click="cat = c.label"
          >
            {{ c.label }} <span>{{ c.count }}</span>
          </button>
        </div>
        <div class="search">
          <label for="lib-q" class="sr-only">Search documents</label>
          <input
            id="lib-q"
            v-model="q"
            class="input"
            type="search"
            placeholder="Search documents"
          />
        </div>
      </div>

      <section class="panel panel--flush" aria-label="Documents">
        <div
          v-if="store.loading && !store.loaded"
          class="spinner"
          role="status"
          aria-label="Loading documents"
        />
        <div
          v-else
          class="table-wrap"
          tabindex="0"
          role="region"
          aria-label="Table, scroll sideways for more"
        >
          <table class="table" style="min-width: 820px; font-size: 14px">
            <thead>
              <tr>
                <th scope="col" style="padding-left: 20px">Name</th>
                <th scope="col">System</th>
                <th scope="col">Category</th>
                <th scope="col">Added by</th>
                <th scope="col">Date</th>
                <th scope="col">Size</th>
                <th scope="col" style="text-align: right; padding-right: 20px">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in shown" :key="d.id">
                <td style="padding-left: 20px">
                  <button type="button" class="name" @click="open(d)">
                    <span class="ext">{{ d.ext.toUpperCase() }}</span>
                    <strong>{{ d.name }}</strong>
                  </button>
                </td>
                <td>
                  <span class="badge" :class="`badge--${d.system ?? 'any'}`">{{
                    systemLabel(d.system)
                  }}</span>
                </td>
                <td class="soft">{{ d.category }}</td>
                <td class="soft">{{ d.uploader?.display_name ?? 'Former member' }}</td>
                <td class="soft">{{ shortDate(d.created_at) }}</td>
                <td class="soft" style="white-space: nowrap">{{ formatSize(d.size) }}</td>
                <td style="padding-right: 20px">
                  <div class="row" style="justify-content: flex-end; gap: 6px; flex-wrap: nowrap">
                    <button
                      type="button"
                      class="btn btn--ghost btn--sm"
                      :aria-label="`Open ${d.name}`"
                      @click="open(d)"
                    >
                      Open
                    </button>
                    <button
                      v-if="d.uploaded_by === auth.userId || auth.isStaff"
                      type="button"
                      class="btn btn--quiet btn--sm"
                      :aria-label="`Remove ${d.name}`"
                      @click="removeTarget = d"
                    >
                      Remove
                    </button>
                    <button
                      v-if="d.uploaded_by !== auth.userId"
                      type="button"
                      class="btn btn--quiet btn--sm"
                      :aria-label="`Report ${d.name}`"
                      @click="report(d)"
                    >
                      Report
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="!shown.length">
                <td colspan="7" class="muted" style="padding: 24px 20px">
                  {{
                    store.documents.length
                      ? 'No documents match that search.'
                      : 'The library is empty. Upload the first document.'
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div
        v-if="canUpload"
        class="drop"
        :class="{ 'is-over': dragging }"
        role="button"
        tabindex="0"
        @click="fileInput?.click()"
        @keydown.enter.prevent="fileInput?.click()"
        @keydown.space.prevent="fileInput?.click()"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <strong>Drop files here to share with everyone</strong>
        <span>PDF, Word, text or Markdown · up to 50 MB</span>
      </div>
    </template>

    <UiDialog v-model="uploadOpen" title="Add to the library" width="520px">
      <form class="stack" @submit.prevent="confirmUpload">
        <p class="small muted">
          {{ pending?.name }} · {{ formatSize(pending?.size ?? 0) }}
          <template v-if="queue.length"> · {{ queue.length }} more after this</template>
        </p>
        <div class="field">
          <label for="up-name">Name</label>
          <input id="up-name" v-model="upName" class="input" maxlength="160" required />
        </div>
        <div class="row" style="align-items: flex-start">
          <div class="field grow">
            <label for="up-system">System</label>
            <select id="up-system" v-model="upSystem" class="input">
              <option value="">Any system</option>
              <option v-for="s in SYSTEMS" :key="s.id" :value="s.id">{{ s.label }}</option>
            </select>
          </div>
          <div class="field grow">
            <label for="up-cat">Category</label>
            <select id="up-cat" v-model="upCategory" class="input">
              <option v-for="c in LIBRARY_CATEGORIES" :key="c">{{ c }}</option>
            </select>
          </div>
        </div>
        <div class="row" style="justify-content: flex-end">
          <button type="button" class="btn btn--ghost" @click="uploadOpen = false">Cancel</button>
          <button type="submit" class="btn" :disabled="uploading || !upName.trim()">
            {{ uploading ? 'Uploading…' : 'Share with everyone' }}
          </button>
        </div>
      </form>
    </UiDialog>

    <UiDialog
      v-model="removeOpen"
      :title="`Remove “${removeTarget?.name ?? ''}”?`"
      alert
      width="460px"
    >
      <p>The document is deleted from the library for everyone.</p>
      <template #actions>
        <button type="button" class="btn btn--ghost" @click="removeTarget = null">Keep it</button>
        <button type="button" class="btn btn--danger" @click="confirmRemove">
          Remove document
        </button>
      </template>
    </UiDialog>

    <ReportDialog :target="reportTarget" @close="reportTarget = null" />
    <PdfViewer v-if="viewing" :url="viewing.url" :filename="viewing.name" @close="viewing = null" />
  </div>
</template>

<style scoped lang="scss">
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.chip span {
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}

.search {
  flex: 0 1 280px;
}

.name {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--page-text);
  text-align: left;

  &:hover strong {
    color: var(--accent-text);
  }
}

.ext {
  flex: none;
  font-size: 10px;
  font-weight: 800;
  padding: 4px 6px;
  border-radius: 4px;
  background: var(--warn-bg);
  color: var(--warn-text);
  font-family: Inter, system-ui, sans-serif;
}

.soft {
  color: var(--page-soft);
}

.drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 28px 20px;
  border: 1.5px dashed var(--line-strong);
  border-radius: var(--radius-panel);
  text-align: center;
  cursor: pointer;

  span {
    font-size: 14px;
    color: var(--page-muted);
  }

  &.is-over,
  &:hover {
    border-color: var(--accent);
    background: var(--accent-tint);
  }
}
.lib-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  border-bottom: 1px solid var(--line);

  a {
    display: inline-flex;
    align-items: center;
    min-height: 48px;
    padding: 0 18px;
    font-family: var(--font-heading);
    font-size: 18px;
    font-weight: 700;
    color: var(--page-muted);
    text-decoration: none;

    &[aria-current='page'] {
      color: var(--page-text);
      box-shadow: inset 0 -3px 0 var(--accent);
    }
  }
}
</style>
