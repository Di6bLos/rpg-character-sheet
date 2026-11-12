<script setup lang="ts">
// Maps & images tab: a large map viewer with zoom and drag-to-pan beside the
// list of maps, and an image masonry with a lightbox. GM controls hide/reveal.
import type { ReportTarget } from '~/components/ReportDialog.vue'
import type { BoardItem } from '~/types'
import { plural, shortDate } from '~/utils/format'
import { authorLabel } from '~/utils/roster'

defineProps<{ kind: 'maps' | 'images' }>()

const auth = useAuthStore()
const { campaign, campaignId, gmControls, roster, base } = useCampaignBoard()
const board = useBoardItems(campaignId)

const canUpload = computed(() => auth.can('can_upload_documents'))

/** Row-level security already hides unrevealed items from players. */
const visible = computed(() => board.items.value)
const maps = computed(() => visible.value.filter((i) => i.kind === 'map'))
const images = computed(() => visible.value.filter((i) => i.kind !== 'map'))

function byName(userId: string) {
  return authorLabel(roster.value, userId).primary
}
function canEdit(item: BoardItem) {
  return gmControls.value || item.created_by === auth.userId
}

// --- Map viewer -------------------------------------------------------------------
const mapId = ref<string | null>(null)
const map = computed(() => maps.value.find((m) => m.id === mapId.value) ?? maps.value[0] ?? null)
const mapIndex = computed(() => (map.value ? maps.value.indexOf(map.value) : -1))
function stepMap(d: number) {
  if (!maps.value.length) return
  const i = (mapIndex.value + d + maps.value.length) % maps.value.length
  mapId.value = maps.value[i]!.id
}

const zoom = ref(1)
const pan = ref({ x: 0, y: 0 })
let drag: { id: number; x: number; y: number; px: number; py: number } | null = null
watch(map, () => {
  zoom.value = 1
  pan.value = { x: 0, y: 0 }
})
function setZoom(z: number) {
  zoom.value = Math.min(4, Math.max(1, z))
  if (zoom.value === 1) pan.value = { x: 0, y: 0 }
}
function onWheel(e: WheelEvent) {
  if (!e.ctrlKey && !e.metaKey) return
  e.preventDefault()
  setZoom(zoom.value + (e.deltaY < 0 ? 0.25 : -0.25))
}
function onDown(e: PointerEvent) {
  if (zoom.value === 1) return
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, px: pan.value.x, py: pan.value.y }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function onMove(e: PointerEvent) {
  if (!drag || drag.id !== e.pointerId) return
  pan.value = {
    x: drag.px + (e.clientX - drag.x) / zoom.value,
    y: drag.py + (e.clientY - drag.y) / zoom.value,
  }
}
function onUp() {
  drag = null
}
function onKey(e: KeyboardEvent) {
  const step = 40 / zoom.value
  const moves: Record<string, [number, number]> = {
    ArrowLeft: [step, 0],
    ArrowRight: [-step, 0],
    ArrowUp: [0, step],
    ArrowDown: [0, -step],
  }
  if (e.key === '+' || e.key === '=') return setZoom(zoom.value + 0.5)
  if (e.key === '-') return setZoom(zoom.value - 0.5)
  const m = moves[e.key]
  if (!m || zoom.value === 1) return
  e.preventDefault()
  pan.value = { x: pan.value.x + m[0], y: pan.value.y + m[1] }
}

// --- Lightbox ---------------------------------------------------------------------
const lbIndex = ref(-1)
const lb = computed(() => images.value[lbIndex.value] ?? null)
const lbOpen = computed({
  get: () => lb.value !== null,
  set: (v) => {
    if (!v) lbIndex.value = -1
  },
})
function stepLb(d: number) {
  const n = images.value.length
  if (n) lbIndex.value = (lbIndex.value + d + n) % n
}

// --- Upload / edit ----------------------------------------------------------------
async function onUpload(event: Event, kind: BoardItem['kind']) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  const id = await board.upload(files, kind)
  if (id && kind === 'map') mapId.value = id
}

const removeTarget = ref<BoardItem | null>(null)
const removeOpen = computed({
  get: () => removeTarget.value !== null,
  set: (v) => {
    if (!v) removeTarget.value = null
  },
})
async function confirmRemove() {
  const item = removeTarget.value
  if (!item) return
  if (lb.value?.id === item.id) lbIndex.value = -1
  await board.remove(item)
  removeTarget.value = null
}

const reportTarget = ref<ReportTarget | null>(null)
function report(item: BoardItem) {
  reportTarget.value = {
    target_type: 'board',
    target_id: item.id,
    bucket: CAMPAIGN_BUCKET,
    file_path: item.file_path,
    file_name: item.title,
    where_label: `${campaign.value?.name ?? 'Campaign'} board`,
    uploader_id: item.created_by,
  }
}
</script>

<template>
  <div class="maps">
    <div class="maps__bar">
      <nav aria-label="Maps or images" class="seg">
        <NuxtLink
          :to="{ path: `${base}/maps` }"
          :aria-current="kind === 'maps' ? 'page' : undefined"
          >Maps <span class="seg__n">{{ maps.length }}</span></NuxtLink
        >
        <NuxtLink
          :to="{ path: `${base}/maps/images` }"
          :aria-current="kind === 'images' ? 'page' : undefined"
          >Images <span class="seg__n">{{ images.length }}</span></NuxtLink
        >
      </nav>
      <template v-if="canUpload">
        <label v-if="kind === 'maps'" class="btn" :class="{ 'is-busy': board.uploading.value }">
          <input
            type="file"
            accept="image/*"
            multiple
            class="file"
            :disabled="board.uploading.value"
            @change="onUpload($event, 'map')"
          />
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
            <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
          </svg>
          {{ board.uploading.value ? 'Uploading…' : 'Upload map' }}
        </label>
        <label v-else class="btn" :class="{ 'is-busy': board.uploading.value }">
          <input
            type="file"
            accept="image/*"
            multiple
            class="file"
            :disabled="board.uploading.value"
            @change="onUpload($event, 'image')"
          />
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
          </svg>
          {{ board.uploading.value ? 'Uploading…' : 'Add images' }}
        </label>
      </template>
      <RestrictedNotice v-else title="Uploads are turned off for your account" />
    </div>

    <div v-if="board.loading.value" class="spinner" role="status" aria-label="Loading the board" />

    <!-- Maps -->
    <section v-else-if="kind === 'maps'" class="panel viewer" aria-label="Maps">
      <div class="viewer__main">
        <div
          id="map-view"
          class="viewer__stage"
          :class="{ 'is-zoomed': zoom > 1 }"
          tabindex="0"
          :aria-label="
            map
              ? `${map.title}. Plus and minus zoom; arrow keys move the map when zoomed.`
              : 'No map'
          "
          @wheel="onWheel"
          @pointerdown="onDown"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointercancel="onUp"
          @keydown="onKey"
        >
          <img
            v-if="map && board.urls.value[map.id]"
            :src="board.urls.value[map.id]"
            :alt="map.title"
            draggable="false"
            :style="{ transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)` }"
          />
          <div v-else class="viewer__empty">
            <svg
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
              <path d="M9 3v15M15 6v15" />
            </svg>
            <span>{{
              map ? 'Loading map…' : 'No maps yet. Upload one to show the party where they are.'
            }}</span>
          </div>
          <span v-if="map?.hidden" class="viewer__chip viewer__chip--hidden"
            >Hidden from players</span
          >
          <template v-if="maps.length > 1">
            <button
              type="button"
              class="viewer__nav viewer__nav--prev"
              aria-label="Previous map"
              @click.stop="stepMap(-1)"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <button
              type="button"
              class="viewer__nav viewer__nav--next"
              aria-label="Next map"
              @click.stop="stepMap(1)"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </template>
          <div v-if="map" class="viewer__zoom" @pointerdown.stop>
            <button
              type="button"
              aria-label="Zoom in"
              :disabled="zoom >= 4"
              @click="setZoom(zoom + 0.5)"
            >
              +
            </button>
            <button
              type="button"
              aria-label="Zoom out"
              :disabled="zoom <= 1"
              @click="setZoom(zoom - 0.5)"
            >
              −
            </button>
          </div>
          <span v-if="map" class="viewer__chip viewer__chip--count"
            >{{ mapIndex + 1 }} / {{ maps.length }}</span
          >
        </div>
        <div v-if="map" class="viewer__foot">
          <div class="grow">
            <input
              v-if="canEdit(map)"
              class="viewer__title viewer__title--edit"
              :value="map.title"
              aria-label="Map title"
              maxlength="120"
              @change="board.rename(map, ($event.target as HTMLInputElement).value)"
            />
            <h2 v-else class="viewer__title">{{ map.title }}</h2>
            <div class="viewer__meta">
              {{ map.hidden ? 'Prepared' : 'Pinned' }} by {{ byName(map.created_by) }} ·
              {{ shortDate(map.created_at) }}
              <template v-if="zoom > 1"> · drag to move</template>
            </div>
          </div>
          <div class="row" style="gap: 8px">
            <button
              v-if="gmControls"
              type="button"
              class="btn btn--ghost btn--sm"
              :aria-pressed="!map.hidden"
              @click="board.toggleHidden(map)"
            >
              {{ map.hidden ? 'Reveal to players' : 'Hide from players' }}
            </button>
            <button
              v-if="canEdit(map)"
              type="button"
              class="btn btn--quiet btn--sm"
              @click="removeTarget = map"
            >
              Remove
            </button>
            <button
              v-if="map.created_by !== auth.userId"
              type="button"
              class="btn btn--quiet btn--sm"
              @click="report(map)"
            >
              Report
            </button>
          </div>
        </div>
      </div>
      <div
        v-if="maps.length"
        class="viewer__list"
        role="tablist"
        aria-label="Choose a map"
        aria-orientation="vertical"
      >
        <div class="viewer__count">{{ plural(maps.length, 'map') }}</div>
        <button
          v-for="m in maps"
          :key="m.id"
          type="button"
          role="tab"
          aria-controls="map-view"
          :aria-selected="map?.id === m.id"
          class="pin"
          @click="mapId = m.id"
        >
          <span
            class="pin__thumb"
            :style="
              board.urls.value[m.id]
                ? { backgroundImage: `url('${board.urls.value[m.id]}')` }
                : undefined
            "
          />
          <span class="pin__text">
            <strong>{{ m.title }}</strong>
            <small>{{
              m.hidden ? 'Prepared, not revealed' : `Revealed · ${shortDate(m.created_at)}`
            }}</small>
          </span>
        </button>
      </div>
    </section>

    <!-- Images -->
    <section v-else class="images" aria-label="Images">
      <p class="muted">{{ plural(images.length, 'image') }} shared with the party</p>
      <div v-if="images.length" class="masonry">
        <button
          v-for="(im, i) in images"
          :key="im.id"
          type="button"
          class="panel masonry__item"
          :aria-label="`Open ${im.title}`"
          @click="lbIndex = i"
        >
          <span class="masonry__img">
            <img
              v-if="board.urls.value[im.id]"
              :src="board.urls.value[im.id]"
              alt=""
              loading="lazy"
            />
            <span v-if="im.hidden" class="viewer__chip viewer__chip--hidden">Hidden</span>
          </span>
          <span class="masonry__cap">
            <strong>{{ im.title }}</strong>
            <small>{{ byName(im.created_by) }} · {{ shortDate(im.created_at) }}</small>
          </span>
        </button>
      </div>
      <p v-else class="empty">
        No images yet. Portraits, handouts and sketches the party shares appear here.
      </p>
    </section>

    <UiDialog v-model="lbOpen" :title="lb?.title ?? ''" width="min(1080px, 96vw)">
      <figure v-if="lb" class="lb">
        <div class="lb__stage">
          <img v-if="board.urls.value[lb.id]" :src="board.urls.value[lb.id]" :alt="lb.title" />
          <template v-if="images.length > 1">
            <button
              type="button"
              class="viewer__nav viewer__nav--prev"
              aria-label="Previous image"
              @click="stepLb(-1)"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <button
              type="button"
              class="viewer__nav viewer__nav--next"
              aria-label="Next image"
              @click="stepLb(1)"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </template>
        </div>
        <figcaption class="lb__cap">
          <span class="muted"
            >{{ byName(lb.created_by) }} · {{ shortDate(lb.created_at) }} · {{ lbIndex + 1 }} /
            {{ images.length }}</span
          >
          <span class="row" style="gap: 8px; margin-left: auto">
            <button
              v-if="gmControls"
              type="button"
              class="btn btn--ghost btn--sm"
              @click="board.toggleHidden(lb)"
            >
              {{ lb.hidden ? 'Reveal to players' : 'Hide from players' }}
            </button>
            <button
              v-if="canEdit(lb)"
              type="button"
              class="btn btn--quiet btn--sm"
              @click="removeTarget = lb"
            >
              Remove
            </button>
            <button
              v-if="lb.created_by !== auth.userId"
              type="button"
              class="btn btn--quiet btn--sm"
              @click="report(lb)"
            >
              Report
            </button>
          </span>
        </figcaption>
      </figure>
    </UiDialog>

    <UiDialog
      v-model="removeOpen"
      :title="`Remove “${removeTarget?.title ?? ''}”?`"
      alert
      width="460px"
    >
      <p>It’s deleted from this campaign’s board for everyone.</p>
      <template #actions>
        <button type="button" class="btn btn--ghost" @click="removeTarget = null">Keep it</button>
        <button type="button" class="btn btn--danger" @click="confirmRemove">Remove</button>
      </template>
    </UiDialog>

    <ReportDialog :target="reportTarget" @close="reportTarget = null" />
  </div>
</template>

<style scoped lang="scss">
.maps {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.maps__bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;

  label.btn {
    position: relative;
    cursor: pointer;
  }
}

.file {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.is-busy {
  opacity: 0.7;
  pointer-events: none;
}

.seg {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: var(--radius-control);
  background: var(--field);
  border: 1px solid var(--line);

  a {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 18px;
    border-radius: min(var(--radius-control), 8px);
    color: var(--page-muted);
    font-size: 15px;
    font-weight: 600;
    text-decoration: none;

    &[aria-current='page'] {
      background: var(--inset);
      color: var(--page-text);
      box-shadow: inset 0 0 0 1px var(--line-strong);
    }
  }
}

.seg__n {
  font-size: 12px;
  color: var(--page-muted);
}

.viewer {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  padding: 16px;
}

.viewer__main {
  flex: 999 1 600px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.viewer__stage {
  position: relative;
  height: min(620px, 70vh);
  border-radius: min(var(--radius-panel), 12px);
  overflow: hidden;
  background: var(--inset);
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
  user-select: none;

  &.is-zoomed {
    cursor: grab;

    &:active {
      cursor: grabbing;
    }
  }

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    transform-origin: center;
    transition: transform 0.05s linear;
    pointer-events: none;
  }
}

.viewer__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 24px;
  color: var(--page-muted);
  text-align: center;

  svg {
    color: var(--accent-text);
  }
}

.viewer__chip {
  position: absolute;
  padding: 6px 12px;
  border-radius: var(--radius-control);
  background: color-mix(in srgb, var(--panel-bg) 88%, transparent);
  border: 1px solid var(--line);
  font-size: 13px;
  font-weight: 700;

  &--hidden {
    top: 12px;
    left: 12px;
    border-style: dashed;
    border-color: var(--danger);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-size: 12px;
  }

  &--count {
    right: 14px;
    bottom: 14px;
  }
}

.viewer__nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--panel-bg) 88%, transparent);
  color: var(--page-text);
  display: flex;
  align-items: center;
  justify-content: center;

  &--prev {
    left: 14px;
  }

  &--next {
    right: 14px;
  }
}

.viewer__zoom {
  position: absolute;
  left: 14px;
  bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;

  button {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 1px solid var(--line);
    background: color-mix(in srgb, var(--panel-bg) 88%, transparent);
    color: var(--page-text);
    font-size: 20px;
    font-weight: 700;

    &:disabled {
      opacity: 0.45;
    }
  }
}

.viewer__foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 0 4px;
}

.viewer__title {
  margin: 0;
  font-family: var(--font-heading);
  font-size: 28px;
  font-weight: 700;

  &--edit {
    width: 100%;
    border: 1px solid transparent;
    border-radius: min(var(--radius-control), 8px);
    background: transparent;
    color: inherit;
    padding: 2px 6px;
    margin-left: -6px;

    &:hover,
    &:focus {
      border-color: var(--line-strong);
      background: var(--field);
    }
  }
}

.viewer__meta {
  font-size: 15px;
  color: var(--page-muted);
}

.viewer__list {
  flex: 1 1 250px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.viewer__count {
  font-family: var(--font-heading);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--page-muted);
  padding: 4px 4px 2px;
}

.pin {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border-radius: min(var(--radius-control), 10px);
  border: 1px solid var(--line);
  background: var(--field);
  color: var(--page-text);
  text-align: left;

  &[aria-selected='true'] {
    box-shadow: inset 0 0 0 2px var(--accent);
  }
}

.pin__thumb {
  flex: 0 0 68px;
  height: 50px;
  border-radius: min(var(--radius-control), 6px);
  background: var(--inset) center / cover no-repeat;
}

.pin__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  strong {
    font-size: 16px;
    line-height: 1.25;
  }

  small {
    font-size: 13px;
    color: var(--page-muted);
  }
}

.images {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.masonry {
  columns: 4 240px;
  column-gap: 16px;
}

.masonry__item {
  display: inline-block;
  width: 100%;
  margin: 0 0 16px;
  padding: 0;
  break-inside: avoid;
  overflow: hidden;
  cursor: zoom-in;
  text-align: left;
}

.masonry__img {
  position: relative;
  display: block;
  min-height: 120px;
  background: var(--inset);

  img {
    display: block;
    width: 100%;
    height: auto;
  }
}

.masonry__cap {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px 12px;

  strong {
    font-size: 16px;
  }

  small {
    font-size: 13px;
    color: var(--page-muted);
  }
}

.lb {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.lb__stage {
  position: relative;
  height: min(70vh, 720px);
  border-radius: min(var(--radius-panel), 10px);
  overflow: hidden;
  background: #0a0806;
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
}

.lb__cap {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
}
</style>
