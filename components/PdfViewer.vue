<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
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

    const padding = 32
    const containerWidth = (canvasWrapRef.value?.clientWidth || window.innerWidth) - padding
    const containerHeight = (canvasWrapRef.value?.clientHeight || window.innerHeight - 56) - padding
    const dpr = window.devicePixelRatio || 1
    const viewport = page.getViewport({ scale: 1, rotation: rotation.value })
    const scale = Math.min(containerWidth / viewport.width, containerHeight / viewport.height)
    const scaledViewport = page.getViewport({ scale: scale * dpr, rotation: rotation.value })

    canvas.width = scaledViewport.width
    canvas.height = scaledViewport.height
    canvas.style.width = `${scaledViewport.width / dpr}px`
    canvas.style.height = `${scaledViewport.height / dpr}px`

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

onMounted(async () => {
  await nextTick()
  loadPdf()
})
watch([currentPage, rotation], renderPage)
</script>

<template>
  <div class="pdf">
    <div class="pdf__bar">
      <button type="button" class="btn btn--ghost btn--sm" @click="emit('close')">
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
          <path d="M15 6l-6 6 6 6" />
        </svg>
        Back to library
      </button>
      <strong class="pdf__name">{{ filename }}</strong>
      <div class="row" style="gap: 6px; flex-wrap: nowrap">
        <button
          type="button"
          class="step"
          aria-label="Previous page"
          :disabled="currentPage <= 1 || loading"
          @click="prevPage"
        >
          ‹
        </button>
        <span class="pdf__count" aria-live="polite">{{ currentPage }} / {{ totalPages }}</span>
        <button
          type="button"
          class="step"
          aria-label="Next page"
          :disabled="currentPage >= totalPages || loading"
          @click="nextPage"
        >
          ›
        </button>
        <button type="button" class="btn btn--ghost btn--sm" :disabled="loading" @click="rotate">
          Rotate
        </button>
      </div>
    </div>
    <div class="pdf__stage">
      <div v-if="loading" class="spinner" role="status" aria-label="Loading document" />
      <div v-if="error" class="notice notice--error" role="alert">{{ error }}</div>
      <div v-show="!loading && !error" ref="canvasWrapRef" class="pdf__wrap">
        <canvas ref="canvasRef" />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.pdf {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  flex-direction: column;
  background: var(--page-base);
}

.pdf__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 16px;
  background: var(--nav-bg);
  border-bottom: 1px solid var(--line);
}

.pdf__name {
  flex: 1 1 160px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pdf__count {
  min-width: 64px;
  text-align: center;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.pdf__stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pdf__wrap {
  width: 100%;
  height: 100%;
  overflow: auto;
  padding: 16px;
  display: flex;
  align-items: flex-start;
  justify-content: center;

  canvas {
    display: block;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
  }
}
</style>
