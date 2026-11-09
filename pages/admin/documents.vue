<script setup lang="ts">
import type { LibraryDocument } from '~/types'
import { formatSize, shortDate } from '~/utils/format'
import { systemLabel } from '~/utils/systems'

definePageMeta({ layout: 'admin', middleware: 'staff' })
useHead({ title: 'Documents · Lantern admin' })

const library = useLibraryStore()
const snackbar = useSnackbarStore()
const target = ref<LibraryDocument | null>(null)
const open = computed({
  get: () => target.value !== null,
  set: (v) => {
    if (!v) target.value = null
  },
})

onMounted(async () => {
  try {
    await library.fetchAll(true)
  } catch (err) {
    snackbar.error(err, 'Could not load documents')
  }
})

async function view(doc: LibraryDocument) {
  if (!(await openFile('library', doc.file_path))) snackbar.show('Could not open the file', 'error')
}

async function remove() {
  const doc = target.value
  if (!doc) return
  try {
    await library.remove(doc)
    snackbar.show(`${doc.name} removed`)
  } catch (err) {
    snackbar.error(err, 'Could not remove the document')
  } finally {
    target.value = null
  }
}
</script>

<template>
  <div class="page" style="max-width: 1100px; gap: 24px">
    <header class="page-head">
      <div>
        <h1>Documents</h1>
        <p>Everything in the shared library, newest first.</p>
      </div>
    </header>
    <section class="panel panel--flush">
      <div
        v-if="library.loading && !library.loaded"
        class="spinner"
        role="status"
        aria-label="Loading documents"
      />
      <div v-else class="table-wrap">
        <table class="table" style="min-width: 720px; font-size: 14px">
          <thead>
            <tr>
              <th scope="col" style="padding-left: 20px">Name</th>
              <th scope="col">System</th>
              <th scope="col">Category</th>
              <th scope="col">Uploaded by</th>
              <th scope="col">Date</th>
              <th scope="col">Size</th>
              <th scope="col" style="text-align: right; padding-right: 20px">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in library.documents" :key="d.id">
              <td style="padding-left: 20px">
                <strong>{{ d.name }}</strong> <span class="muted">.{{ d.ext }}</span>
              </td>
              <td>
                <span class="badge" :class="`badge--${d.system ?? 'any'}`">{{
                  systemLabel(d.system)
                }}</span>
              </td>
              <td>{{ d.category }}</td>
              <td>{{ d.uploader ? `@${d.uploader.handle}` : '—' }}</td>
              <td>{{ shortDate(d.created_at) }}</td>
              <td style="white-space: nowrap">{{ formatSize(d.size) }}</td>
              <td style="padding-right: 20px">
                <div class="row" style="justify-content: flex-end; gap: 6px; flex-wrap: nowrap">
                  <button
                    type="button"
                    class="btn btn--ghost btn--sm"
                    :aria-label="`Open ${d.name}`"
                    @click="view(d)"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    class="btn btn--quiet btn--sm"
                    :aria-label="`Remove ${d.name}`"
                    @click="target = d"
                  >
                    Remove
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!library.documents.length">
              <td colspan="7" class="muted" style="padding: 24px 20px">The library is empty.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <UiDialog v-model="open" :title="`Remove “${target?.name ?? ''}”?`" alert width="460px">
      <p>The document is deleted from the library for everyone.</p>
      <template #actions>
        <button type="button" class="btn btn--ghost" @click="target = null">Keep it</button>
        <button type="button" class="btn btn--danger" @click="remove">Remove document</button>
      </template>
    </UiDialog>
  </div>
</template>
