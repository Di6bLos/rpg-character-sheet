<script setup lang="ts">
// Staff: which play page people use (Battle, Party, Character sheet) and which buttons
// they press, from `plugins/usage-analytics.client.ts`. Totals only, never one person's clicks.
import type { AnalyticsFilter, SurfaceStat } from '~/stores/analytics'
import { PLAY_SURFACES, SURFACE_LABELS } from '~/utils/analytics'
import type { PageSeat, Surface, Viewport } from '~/utils/analytics'

definePageMeta({ layout: 'admin', middleware: 'staff' })
useHead({ title: 'Analytics · Lantern admin' })

const store = useAnalyticsStore()
const site = useSiteStore()
const snackbar = useSnackbarStore()
const auth = useAuthStore()

const RANGES = [7, 30, 90] as const
const filter = reactive<AnalyticsFilter>({ days: 30, includeStaff: false, seat: null })
const buttonSurface = ref<Surface | null>('battle')
const buttonsLoading = ref(false)

async function load() {
  try {
    await store.load(filter)
  } catch (err) {
    snackbar.error(err, 'Could not load analytics')
  }
}

async function loadButtons() {
  buttonsLoading.value = true
  try {
    await store.loadButtons(filter, buttonSurface.value)
  } catch (err) {
    snackbar.error(err, 'Could not load the button counts')
  } finally {
    buttonsLoading.value = false
  }
}

onMounted(() => {
  site.fetch(true).catch(() => undefined)
  store.prune().catch(() => undefined)
  void load()
  void loadButtons()
})
watch(filter, () => {
  void load()
  void loadButtons()
})
watch(buttonSurface, () => void loadButtons())

const empty: Omit<SurfaceStat, 'surface'> = { visits: 0, users: 0, seconds: 0, clicks: 0 }
function stat(surface: Surface) {
  return store.surfaces.find((s) => s.surface === surface) ?? { surface, ...empty }
}

const playSeconds = computed(() => PLAY_SURFACES.reduce((n, s) => n + stat(s).seconds, 0))
function share(surface: Surface) {
  return playSeconds.value ? Math.round((stat(surface).seconds / playSeconds.value) * 100) : 0
}

const others = computed(() =>
  store.surfaces
    .filter((s) => !(PLAY_SURFACES as readonly string[]).includes(s.surface))
    .sort((a, b) => b.seconds - a.seconds),
)

function minutes(seconds: number) {
  const m = Math.round(seconds / 60)
  if (m === 0 && seconds > 0) return '<1 min'
  return m >= 120 ? `${Math.round(m / 6) / 10} h` : `${m} min`
}

const SEATS: { key: PageSeat | null; label: string }[] = [
  { key: null, label: 'Everyone' },
  { key: 'player', label: 'Players' },
  { key: 'gm', label: 'GMs' },
]
const VIEWPORTS: { key: Viewport; label: string }[] = [
  { key: 'phone', label: 'Phone' },
  { key: 'tablet', label: 'Tablet' },
  { key: 'desktop', label: 'Desktop' },
]

/** Active time per play page split by seat and screen size. */
function split(surface: Surface, seat: PageSeat | null, viewport?: Viewport) {
  return store.splits
    .filter(
      (r) =>
        r.surface === surface &&
        (seat === null || r.seat === seat) &&
        (viewport === undefined || r.viewport === viewport),
    )
    .reduce((n, r) => n + r.seconds, 0)
}

const BUTTON_TABS: { key: Surface | null; label: string }[] = [
  ...PLAY_SURFACES.map((s) => ({ key: s, label: SURFACE_LABELS[s] })),
  { key: null, label: 'All pages' },
]

const confirmReset = ref(false)
const resetting = ref(false)

async function reset() {
  resetting.value = true
  try {
    const removed = await store.reset()
    confirmReset.value = false
    snackbar.show(removed ? `Analytics reset: ${removed} events deleted` : 'Analytics reset')
    void load()
    void loadButtons()
  } catch (err) {
    snackbar.error(err, 'Could not reset analytics')
  } finally {
    resetting.value = false
  }
}

const hasData = computed(() => store.surfaces.length > 0)
</script>

<template>
  <div class="page analytics" style="max-width: 1100px; gap: 24px">
    <header class="page-head">
      <div>
        <h1>Analytics</h1>
        <p>
          Which page people play on and which buttons they press. Totals only; events older than 180
          days are removed.
        </p>
      </div>
      <button
        v-if="auth.isAdmin"
        type="button"
        class="btn btn--ghost btn--sm"
        data-track="off"
        @click="confirmReset = true"
      >
        Reset analytics
      </button>
    </header>

    <p v-if="!site.settings.analytics_enabled" class="notice">
      Collection is off. Nothing new is recorded until an admin turns on Usage analytics in
      <NuxtLink to="/admin">Site features</NuxtLink>.
    </p>

    <div class="analytics__filters" data-track="off">
      <div class="analytics__seg" role="group" aria-label="Date range">
        <button
          v-for="d in RANGES"
          :key="d"
          type="button"
          class="btn btn--sm"
          :class="filter.days === d ? '' : 'btn--ghost'"
          :aria-pressed="filter.days === d"
          @click="filter.days = d"
        >
          {{ d }} days
        </button>
      </div>
      <div class="analytics__seg" role="group" aria-label="Who">
        <button
          v-for="s in SEATS"
          :key="String(s.key)"
          type="button"
          class="btn btn--sm"
          :class="filter.seat === s.key ? '' : 'btn--ghost'"
          :aria-pressed="filter.seat === s.key"
          @click="filter.seat = s.key"
        >
          {{ s.label }}
        </button>
      </div>
      <UiSwitch v-model="filter.includeStaff" label="Include staff accounts" small />
    </div>

    <div
      v-if="store.loading && !hasData"
      class="spinner"
      role="status"
      aria-label="Loading analytics"
    />

    <template v-else>
      <section class="analytics__tiles" aria-label="Play pages">
        <article v-for="s in PLAY_SURFACES" :key="s" class="panel analytics__surface">
          <div class="analytics__surface-head">
            <span class="analytics__dot" :class="`is-${s}`" aria-hidden="true" />
            <h2>{{ SURFACE_LABELS[s] }}</h2>
            <span class="badge">{{ share(s) }}% of play time</span>
          </div>
          <dl class="analytics__nums">
            <div class="tile">
              <dt class="tile__label">Active time</dt>
              <dd class="tile__value">{{ minutes(stat(s).seconds) }}</dd>
            </div>
            <div class="tile">
              <dt class="tile__label">People</dt>
              <dd class="tile__value">{{ stat(s).users }}</dd>
            </div>
            <div class="tile">
              <dt class="tile__label">Visits</dt>
              <dd class="tile__value">{{ stat(s).visits }}</dd>
            </div>
            <div class="tile">
              <dt class="tile__label">Clicks</dt>
              <dd class="tile__value">{{ stat(s).clicks }}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section class="panel" aria-labelledby="daily-h">
        <div class="panel-title">
          <h2 id="daily-h">Active time per day</h2>
          <span class="small muted">minutes, UTC days</span>
        </div>
        <AdminUsageChart :rows="store.daily" :days="filter.days" />
      </section>

      <section class="panel panel--flush" aria-labelledby="split-h">
        <div class="panel-title analytics__pad">
          <h2 id="split-h">Who plays where</h2>
          <span class="small muted">active time; Battle needs a desktop-width window</span>
        </div>
        <div
          class="table-wrap"
          tabindex="0"
          role="region"
          aria-label="Active time by seat and screen"
        >
          <table class="table" style="min-width: 640px; font-size: 14px">
            <thead>
              <tr>
                <th scope="col" class="analytics__first">Page</th>
                <th scope="col">Players</th>
                <th scope="col">GMs</th>
                <th v-for="v in VIEWPORTS" :key="v.key" scope="col">{{ v.label }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in PLAY_SURFACES" :key="s">
                <td class="analytics__first">
                  <strong>{{ SURFACE_LABELS[s] }}</strong>
                </td>
                <td>{{ minutes(split(s, 'player')) }}</td>
                <td>{{ minutes(split(s, 'gm')) }}</td>
                <td v-for="v in VIEWPORTS" :key="v.key">{{ minutes(split(s, null, v.key)) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel panel--flush" aria-labelledby="buttons-h">
        <div class="panel-title analytics__pad">
          <h2 id="buttons-h">Most used buttons</h2>
          <span class="small muted">numbers in labels show as #</span>
        </div>
        <div class="tabs analytics__pad" role="tablist" aria-label="Page" data-track="off">
          <button
            v-for="t in BUTTON_TABS"
            :key="String(t.key)"
            type="button"
            role="tab"
            :aria-selected="buttonSurface === t.key"
            @click="buttonSurface = t.key"
          >
            {{ t.label }}
          </button>
        </div>
        <div
          v-if="buttonsLoading && !store.buttons.length"
          class="spinner"
          role="status"
          aria-label="Loading buttons"
        />
        <div v-else class="table-wrap" tabindex="0" role="region" aria-label="Most used buttons">
          <table class="table" style="min-width: 560px; font-size: 14px">
            <thead>
              <tr>
                <th scope="col" class="analytics__first">Button</th>
                <th scope="col">Where</th>
                <th v-if="buttonSurface === null" scope="col">Page</th>
                <th scope="col" class="analytics__num">Clicks</th>
                <th scope="col" class="analytics__num">People</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in store.buttons" :key="`${b.surface}|${b.area}|${b.label}`">
                <td class="analytics__first">
                  <strong>{{ b.label }}</strong>
                </td>
                <td class="muted">{{ b.area }}</td>
                <td v-if="buttonSurface === null">{{ SURFACE_LABELS[b.surface] ?? b.surface }}</td>
                <td class="analytics__num">{{ b.clicks }}</td>
                <td class="analytics__num">{{ b.users }}</td>
              </tr>
              <tr v-if="!store.buttons.length">
                <td colspan="5" class="muted" style="padding: 24px 20px">
                  No clicks recorded here yet.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="others.length" class="panel panel--flush" aria-labelledby="other-h">
        <div class="panel-title analytics__pad">
          <h2 id="other-h">Other pages</h2>
        </div>
        <div class="table-wrap" tabindex="0" role="region" aria-label="Other pages">
          <table class="table" style="min-width: 480px; font-size: 14px">
            <thead>
              <tr>
                <th scope="col" class="analytics__first">Page</th>
                <th scope="col" class="analytics__num">Active time</th>
                <th scope="col" class="analytics__num">People</th>
                <th scope="col" class="analytics__num">Visits</th>
                <th scope="col" class="analytics__num">Clicks</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in others" :key="o.surface">
                <td class="analytics__first">
                  <strong>
                    {{ SURFACE_LABELS[o.surface] ?? o.surface }}
                  </strong>
                </td>
                <td class="analytics__num">{{ minutes(o.seconds) }}</td>
                <td class="analytics__num">{{ o.users }}</td>
                <td class="analytics__num">{{ o.visits }}</td>
                <td class="analytics__num">{{ o.clicks }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
    <UiDialog v-model="confirmReset" title="Reset analytics?" alert width="460px">
      <p>
        Every recorded visit, active minute and click is deleted for all pages, so the next playtest
        starts from zero. This can’t be undone.
      </p>
      <template #actions>
        <button type="button" class="btn btn--ghost" @click="confirmReset = false">
          Keep data
        </button>
        <button type="button" class="btn btn--danger" :disabled="resetting" @click="reset">
          Delete all events
        </button>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped lang="scss">
// One colour per play page (validated categorical slots 1–3), read by the dots here and
// by AdminUsageChart's bars and legend.
.analytics {
  --series-battle: #3987e5;
  --series-party: #d95926;
  --series-sheet: #199e70;
}

// Cursed's parchment panels are light: the light steps of the same hues.
[data-theme='cursed'] .analytics {
  --series-battle: #2a78d6;
  --series-party: #eb6834;
  --series-sheet: #1baf7a;
}

.analytics__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 24px;
}

.analytics__seg {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.analytics__tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
  gap: 16px;
}

.analytics__surface {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.analytics__surface-head {
  display: flex;
  align-items: center;
  gap: 8px;

  h2 {
    margin: 0;
    font-size: 18px;
    flex: 1;
  }
}

.analytics__dot {
  width: 12px;
  height: 12px;
  border-radius: 4px;

  &.is-battle {
    background: var(--series-battle);
  }
  &.is-party {
    background: var(--series-party);
  }
  &.is-sheet {
    background: var(--series-sheet);
  }
}

.analytics__nums {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  dd {
    margin: 0;
  }
}

.analytics__pad {
  padding: 16px 20px 0;
}

.analytics__first {
  padding-left: 20px;
  text-align: left;
}

.analytics__num {
  text-align: right;
  padding-right: 20px;
  font-variant-numeric: tabular-nums;
}
</style>
