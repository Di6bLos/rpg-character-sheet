import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '~/lib/supabase'
import { useAuthStore } from '~/stores/auth'
import type { DocumentFile } from '~/types'

function formatDisplayName(filename: string): string {
    return filename
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
}

export const useDocumentStore = defineStore('document', () => {
    const documents = ref<DocumentFile[]>([])
    const loading = ref(false)
    const error = ref<string | null>(null)

    async function fetchDocuments() {
        const authStore = useAuthStore()
        if (!authStore.session) return
        loading.value = true
        error.value = null
        try {
            const userId = authStore.session.user.id
            const { data, error: fetchError } = await supabase.storage
                .from('documents')
                .list(userId, {
                    sortBy: { column: 'created_at', order: 'desc' },
                })
            if (fetchError) throw fetchError
            documents.value = (data ?? []).map((obj) => ({
                name: obj.name,
                path: `${userId}/${obj.name}`,
                displayName: formatDisplayName(obj.name),
                size: obj.metadata?.size ?? 0,
                created_at: obj.created_at ?? '',
            }))
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Failed to load documents'
        } finally {
            loading.value = false
        }
    }

    async function uploadDocument(file: File) {
        const authStore = useAuthStore()
        if (!authStore.session) throw new Error('Not authenticated')
        const userId = authStore.session.user.id
        const path = `${userId}/${file.name}`
        const { error } = await supabase.storage
            .from('documents')
            .upload(path, file, { upsert: true })
        if (error) throw error
        await fetchDocuments()
    }

    async function downloadDocument(path: string, name: string) {
        const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 60)
        if (error) throw error
        const a = document.createElement('a')
        a.href = data.signedUrl
        a.download = name
        a.click()
    }

    async function deleteDocument(path: string) {
        const { error } = await supabase.storage.from('documents').remove([path])
        if (error) throw error
        documents.value = documents.value.filter((d) => d.path !== path)
    }

    async function getSignedUrl(path: string): Promise<string> {
        const { data, error } = await supabase.storage
            .from('documents')
            .createSignedUrl(path, 3600)
        if (error) throw error
        return data.signedUrl
    }

    return {
        documents,
        loading,
        error,
        fetchDocuments,
        uploadDocument,
        downloadDocument,
        deleteDocument,
        getSignedUrl,
    }
})
