<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppBar from '~/components/AppBar.vue'
import PdfViewer from '~/components/PdfViewer.vue'
import { useDocumentStore } from '~/stores/document'
import { useSnackbarStore } from '~/stores/snackbar'
import type { DocumentFile } from '~/types'

definePageMeta({ middleware: 'auth' })

const documentStore = useDocumentStore()
const snackbar = useSnackbarStore()

const uploadDialog = ref(false)
const uploadFile = ref<File | null>(null)
const uploading = ref(false)
const uploadSizeError = ref('')

const deleteDialog = ref(false)
const docToDelete = ref<DocumentFile | null>(null)

const viewerDialog = ref(false)
const viewerUrl = ref('')
const viewerFilename = ref('')

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

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

function onFileChange(event: Event) {
    const input = event.target as HTMLInputElement
    uploadFile.value = input.files?.[0] ?? null
    uploadSizeError.value =
        uploadFile.value && uploadFile.value.size > MAX_FILE_SIZE
            ? 'File exceeds the 50 MB limit'
            : ''
}

function openUploadDialog() {
    uploadFile.value = null
    uploadSizeError.value = ''
    uploadDialog.value = true
}

async function confirmUpload() {
    if (!uploadFile.value) return
    if (uploadFile.value.size > MAX_FILE_SIZE) {
        uploadSizeError.value = 'File exceeds the 50 MB limit'
        return
    }
    uploading.value = true
    try {
        await documentStore.uploadDocument(uploadFile.value)
        uploadDialog.value = false
        snackbar.show('Document uploaded successfully', 'success')
    } catch {
        snackbar.show('Upload failed', 'error')
    } finally {
        uploading.value = false
    }
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

function openDeleteDialog(doc: DocumentFile) {
    docToDelete.value = doc
    deleteDialog.value = true
}

async function confirmDelete() {
    if (!docToDelete.value) return
    try {
        await documentStore.deleteDocument(docToDelete.value.path)
        snackbar.show('Document deleted', 'success')
    } catch {
        snackbar.show('Delete failed', 'error')
    } finally {
        deleteDialog.value = false
        docToDelete.value = null
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
                <v-col cols="auto">
                    <v-btn color="primary" prepend-icon="mdi-upload" @click="openUploadDialog">
                        <span class="d-none d-sm-inline">Upload</span>
                    </v-btn>
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
                        <v-btn
                            icon
                            variant="text"
                            color="error"
                            :aria-label="`Delete ${doc.name}`"
                            @click.stop="openDeleteDialog(doc)"
                        >
                            <v-icon>mdi-delete</v-icon>
                        </v-btn>
                    </template>
                </v-list-item>
            </v-list>

            <div
                v-else-if="!documentStore.loading && !documentStore.error"
                class="text-center mt-8"
            >
                <v-icon size="80" color="grey">mdi-bookshelf</v-icon>
                <p class="text-body-1 mt-4">No documents yet. Upload your first file!</p>
                <v-btn
                    color="primary"
                    prepend-icon="mdi-upload"
                    class="mt-4"
                    @click="openUploadDialog"
                >
                    Upload
                </v-btn>
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

    <!-- Upload Dialog -->
    <v-dialog v-model="uploadDialog" max-width="480">
        <v-card title="Upload Document">
            <v-card-text>
                <v-file-input
                    label="Choose file"
                    variant="outlined"
                    accept=".pdf,application/pdf,.doc,application/msword,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.xls,application/vnd.ms-excel,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/*"
                    hint="Accepted: PDF, Word, Excel, images · Max 50 MB"
                    persistent-hint
                    :model-value="uploadFile ? [uploadFile] : []"
                    :error-messages="uploadSizeError"
                    @change="onFileChange"
                />
            </v-card-text>
            <v-card-actions>
                <v-spacer />
                <v-btn variant="text" @click="uploadDialog = false">Cancel</v-btn>
                <v-btn
                    color="primary"
                    :disabled="!uploadFile || !!uploadSizeError"
                    :loading="uploading"
                    @click="confirmUpload"
                >
                    Upload
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>

    <!-- Delete Confirmation Dialog -->
    <v-dialog v-model="deleteDialog" max-width="400">
        <v-card title="Delete Document">
            <v-card-text>
                Are you sure you want to delete
                <strong>{{ docToDelete?.displayName }}</strong>? This cannot be undone.
            </v-card-text>
            <v-card-actions>
                <v-spacer />
                <v-btn variant="text" @click="deleteDialog = false">Cancel</v-btn>
                <v-btn color="error" @click="confirmDelete">Delete</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>
