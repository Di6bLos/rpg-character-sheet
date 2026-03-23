<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppBar from '~/components/AppBar.vue'
import PdfViewer from '~/components/PdfViewer.vue'
import { useDocumentStore } from '~/stores/document'
import { useSnackbarStore } from '~/stores/snackbar'
import type { DocumentFile } from '~/types'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Document Library' })

const documentStore = useDocumentStore()
const snackbar = useSnackbarStore()

const viewerDialog = ref(false)
const viewerUrl = ref('')
const viewerFilename = ref('')

onMounted(() => {
    documentStore.fetchDocuments()
})

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString()
}

function getFileIcon(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase()
    if (ext === 'pdf') return 'mdi-file-pdf-box'
    if (ext === 'doc' || ext === 'docx') return 'mdi-file-word'
    if (ext === 'xls' || ext === 'xlsx') return 'mdi-file-excel'
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif')
        return 'mdi-file-image'
    return 'mdi-file'
}

async function download(path: string, name: string) {
    try {
        await documentStore.downloadDocument(path, name)
    } catch {
        snackbar.show('Download failed', 'error')
    }
}

async function openDocument(doc: DocumentFile) {
    const ext = doc.name.split('.').pop()?.toLowerCase()
    if (ext === 'pdf') {
        try {
            viewerUrl.value = await documentStore.getSignedUrl(doc.path)
            viewerFilename.value = doc.displayName
            viewerDialog.value = true
        } catch {
            snackbar.show('Failed to open document', 'error')
        }
    } else {
        await download(doc.path, doc.name)
    }
}
</script>

<template>
    <AppBar />
    <v-main>
        <v-container>
            <v-row align="center" class="mb-4">
                <v-col cols="auto">
                    <v-btn
                        icon
                        variant="text"
                        :to="{ name: 'dashboard' }"
                        aria-label="Back to Dashboard"
                    >
                        <v-icon>mdi-arrow-left</v-icon>
                    </v-btn>
                </v-col>
                <v-col>
                    <h1 class="text-h5">Document Library</h1>
                </v-col>
            </v-row>

            <v-alert
                v-if="documentStore.error"
                type="error"
                class="mb-4"
                :text="documentStore.error"
            />

            <v-progress-linear
                v-if="documentStore.loading"
                indeterminate
                color="primary"
                class="mb-4"
            />

            <v-list v-if="documentStore.documents.length > 0" lines="two">
                <v-list-item
                    v-for="doc in documentStore.documents"
                    :key="doc.path"
                    :prepend-icon="getFileIcon(doc.name)"
                    :title="doc.displayName"
                    :subtitle="`${formatSize(doc.size)} · ${formatDate(doc.created_at)}`"
                    style="cursor: pointer"
                    @click="openDocument(doc)"
                >
                    <template #append>
                        <v-btn
                            icon
                            variant="text"
                            :aria-label="`Download ${doc.name}`"
                            @click.stop="download(doc.path, doc.name)"
                        >
                            <v-icon>mdi-download</v-icon>
                        </v-btn>
                    </template>
                </v-list-item>
            </v-list>

            <div
                v-else-if="!documentStore.loading && !documentStore.error"
                class="text-center mt-8"
            >
                <v-icon size="80" color="grey">mdi-bookshelf</v-icon>
                <p class="text-body-1 mt-4">No documents have been published yet.</p>
            </div>
        </v-container>
    </v-main>

    <!-- PDF Viewer Dialog -->
    <v-dialog v-model="viewerDialog" fullscreen>
        <PdfViewer
            v-if="viewerDialog"
            :url="viewerUrl"
            :filename="viewerFilename"
            @close="viewerDialog = false"
        />
    </v-dialog>
</template>
