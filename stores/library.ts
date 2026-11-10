import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '~/lib/supabase'
import type { GameSystem, LibraryCategory, LibraryDocument } from '~/types'
import { extOf, safeFileName } from '~/utils/format'

export const LIBRARY_CATEGORIES: LibraryCategory[] = [
  'Rules',
  'Reference',
  'Guides',
  'Homebrew',
  'Sheets',
]
export const LIBRARY_ACCEPT = '.pdf,.doc,.docx,.txt,.md'
export const LIBRARY_MAX_BYTES = 50 * 1024 * 1024
const ALLOWED = new Set(['pdf', 'doc', 'docx', 'txt', 'md'])

export const useLibraryStore = defineStore('library', () => {
  const documents = ref<LibraryDocument[]>([])
  const loaded = ref(false)
  const loading = ref(false)

  async function fetchAll(force = false) {
    if (loaded.value && !force) return
    loading.value = true
    try {
      const { data, error } = await supabase
        .from('library_documents')
        .select('*, uploader:profiles!library_documents_uploaded_by_fkey(display_name, handle)')
        .order('created_at', { ascending: false })
      if (error) throw error
      documents.value = (data ?? []) as unknown as LibraryDocument[]
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  /** Why a file can't be uploaded, or null when it is fine. */
  function rejectReason(file: File): string | null {
    if (!ALLOWED.has(extOf(file.name)))
      return `${file.name}: only PDF, Word, text or Markdown files`
    if (file.size > LIBRARY_MAX_BYTES) return `${file.name} is over 50 MB`
    return null
  }

  async function upload(
    file: File,
    meta: { name: string; system: GameSystem | null; category: LibraryCategory },
  ) {
    const auth = useAuthStore()
    const path = `${auth.userId}/${crypto.randomUUID()}-${safeFileName(file.name)}`
    const stored = await supabase.storage
      .from('library')
      .upload(path, file, { contentType: file.type || 'application/octet-stream' })
    if (stored.error) throw stored.error
    const { error } = await supabase.from('library_documents').insert({
      name: meta.name,
      file_path: path,
      ext: extOf(file.name),
      size: file.size,
      system: meta.system,
      category: meta.category,
    })
    if (error) {
      await supabase.storage.from('library').remove([path])
      throw error
    }
    await fetchAll(true)
  }

  async function remove(doc: LibraryDocument) {
    const { error } = await supabase.from('library_documents').delete().eq('id', doc.id)
    if (error) throw error
    documents.value = documents.value.filter((d) => d.id !== doc.id)
    // Storage reports failures in `error` rather than throwing.
    const removed = await supabase.storage.from('library').remove([doc.file_path])
    if (removed.error) {
      throw new Error(
        `${doc.name} was removed from the library, but its file couldn’t be deleted from storage (${removed.error.message}).`,
      )
    }
  }

  function reset() {
    documents.value = []
    loaded.value = false
  }

  return { documents, loaded, loading, fetchAll, rejectReason, upload, remove, reset }
})
