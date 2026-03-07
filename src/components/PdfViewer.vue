<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import openjpegWasmUrl from 'pdfjs-dist/wasm/openjpeg.wasm?url'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import _jbig2WasmUrl from 'pdfjs-dist/wasm/jbig2.wasm?url'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import _qcmsWasmUrl from 'pdfjs-dist/wasm/qcms_bg.wasm?url'
import cMapSampleUrl from 'pdfjs-dist/cmaps/78-EUC-H.bcmap?url'
import iccUrl from 'pdfjs-dist/iccs/CGATS001Compat-v2-micro.icc?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const wasmUrl = openjpegWasmUrl.replace(/[^/]+$/, '')
const cMapUrl = cMapSampleUrl.replace(/[^/]+$/, '')
const iccBaseUrl = iccUrl.replace(/[^/]+$/, '')

const props = defineProps<{
  url: string
  filename: string
}>()

const emit = defineEmits<{
  close: []
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const canvasWrapRef = ref<HTMLDivElement | null>(null)
const currentPage = ref(1)
const totalPages = ref(0)
const rotation = ref(0)
const loading = ref(true)
const error = ref<string | null>(null)

let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null

async function loadPdf() {
  loading.value = true
  error.value = null
  try {
    pdfDoc = await pdfjsLib.getDocument({
      url: props.url,
      isOffscreenCanvasSupported: false,
      wasmUrl,
      cMapUrl,
      cMapPacked: true,
      iccUrl: iccBaseUrl,
    }).promise
    totalPages.value = pdfDoc.numPages
    currentPage.value = 1
    await renderPage()
  } catch {
    error.value = 'Failed to load PDF'
  } finally {
    loading.value = false
  }
}

async function renderPage() {
  if (!pdfDoc || !canvasRef.value) return
  loading.value = true
  try {
    const page = await pdfDoc.getPage(currentPage.value)
    const canvas = canvasRef.value

    const containerWidth = Math.min(canvasWrapRef.value?.clientWidth || 800, 900)
    const viewport = page.getViewport({ scale: 1, rotation: rotation.value })
    const scale = containerWidth / viewport.width
    const scaledViewport = page.getViewport({ scale, rotation: rotation.value })

    canvas.width = scaledViewport.width
    canvas.height = scaledViewport.height

    await page.render({ canvas, viewport: scaledViewport }).promise
  } catch {
    error.value = 'Failed to render page'
  } finally {
    loading.value = false
  }
}

function prevPage() {
  if (currentPage.value > 1) currentPage.value--
}

function nextPage() {
  if (currentPage.value < totalPages.value) currentPage.value++
}

function rotate() {
  rotation.value = (rotation.value + 90) % 360
}

onMounted(loadPdf)
watch([currentPage, rotation], renderPage)
</script>

<template>
  <v-card class="d-flex flex-column" style="height: 100vh">
    <v-toolbar density="compact" color="surface">
      <v-btn icon @click="emit('close')">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="text-truncate">{{ filename }}</v-toolbar-title>
      <v-spacer />
      <v-btn icon :disabled="currentPage <= 1 || loading" @click="prevPage">
        <v-icon>mdi-chevron-left</v-icon>
      </v-btn>
      <span class="text-body-2 mx-2" style="white-space: nowrap">
        {{ currentPage }} / {{ totalPages }}
      </span>
      <v-btn icon :disabled="currentPage >= totalPages || loading" @click="nextPage">
        <v-icon>mdi-chevron-right</v-icon>
      </v-btn>
      <v-btn icon :disabled="loading" @click="rotate">
        <v-icon>mdi-rotate-right</v-icon>
      </v-btn>
    </v-toolbar>

    <v-card-text class="flex-grow-1 overflow-auto pa-0 d-flex align-center justify-center">
      <v-progress-circular v-if="loading" indeterminate color="primary" size="48" />
      <v-alert v-else-if="error" type="error" class="ma-4">{{ error }}</v-alert>
      <div
        v-show="!loading && !error"
        ref="canvasWrapRef"
        style="width: 100%; max-width: 1200px; max-height: 100%; overflow: auto; padding: 16px; box-sizing: border-box"
      >
        <canvas ref="canvasRef" style="display: block; width: 100%; height: auto" />
      </div>
    </v-card-text>
  </v-card>
</template>
