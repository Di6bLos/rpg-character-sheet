<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppBar from '@/components/AppBar.vue'
import { useDocumentStore } from '@/stores/document'

const documentStore = useDocumentStore()

const uploadDialog = ref(false)
const uploadFile = ref<File | null>(null)
const uploading = ref(false)
const snackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref('success')

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
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif') return 'mdi-file-image'
  return 'mdi-file'
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  uploadFile.value = input.files?.[0] ?? null
}

function openUploadDialog() {
  uploadFile.value = null
  uploadDialog.value = true
}

async function confirmUpload() {
  if (!uploadFile.value) return
  uploading.value = true
  try {
    await documentStore.uploadDocument(uploadFile.value)
    uploadDialog.value = false
    showSnackbar('Document uploaded successfully', 'success')
  } catch {
    showSnackbar('Upload failed', 'error')
  } finally {
    uploading.value = false
  }
}

async function download(path: string, name: string) {
  try {
    await documentStore.downloadDocument(path, name)
  } catch {
    showSnackbar('Download failed', 'error')
  }
}

function showSnackbar(message: string, color: string) {
  snackbarMessage.value = message
  snackbarColor.value = color
  snackbar.value = true
}
</script>

<template>
  <AppBar />
  <v-main>
    <v-container>
      <v-row align="center" class="mb-4">
        <v-col>
          <h1 class="text-h5">Document Library</h1>
        </v-col>
        <v-col cols="auto">
          <v-btn color="primary" prepend-icon="mdi-upload" @click="openUploadDialog">
            Upload
          </v-btn>
        </v-col>
      </v-row>

      <v-progress-linear v-if="documentStore.loading" indeterminate color="primary" class="mb-4" />

      <v-list v-if="documentStore.documents.length > 0" lines="two">
        <v-list-item
          v-for="doc in documentStore.documents"
          :key="doc.path"
          :prepend-icon="getFileIcon(doc.name)"
          :title="doc.displayName"
          :subtitle="`${formatSize(doc.size)} · ${formatDate(doc.created_at)}`"
        >
          <template #append class="mb-4">
            <v-btn icon variant="text" @click="download(doc.path, doc.name)">
              <v-icon>mdi-download</v-icon>
            </v-btn>
          </template>
        </v-list-item>
      </v-list>

      <div v-else-if="!documentStore.loading" class="text-center mt-8">
        <v-icon size="80" color="grey">mdi-bookshelf</v-icon>
        <p class="text-body-1 mt-4">No documents yet. Upload your first file!</p>
      </div>
    </v-container>
  </v-main>

  <!-- Upload Dialog -->
  <v-dialog v-model="uploadDialog" max-width="480">
    <v-card title="Upload Document">
      <v-card-text>
        <v-file-input
          label="Choose file"
          variant="outlined"
          accept="*/*"
          :model-value="uploadFile ? [uploadFile] : []"
          @change="onFileChange"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="uploadDialog = false">Cancel</v-btn>
        <v-btn
          color="primary"
          :disabled="!uploadFile"
          :loading="uploading"
          @click="confirmUpload"
        >
          Upload
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Snackbar -->
  <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="3000">
    {{ snackbarMessage }}
  </v-snackbar>
</template>
