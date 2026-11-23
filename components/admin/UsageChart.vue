<script setup lang="ts">
// Admin analytics: active minutes per day, stacked by play page (Battle, Party, Sheet).
// Hand-drawn SVG; series colours are fixed per page (validated categorical slots 1–3).
import type { DailyStat } from '~/stores/analytics'
import { PLAY_SURFACES, SURFACE_LABELS } from '~/utils/analytics'

const props = defineProps<{ rows: DailyStat[]; days: number }>()

type Play = (typeof PLAY_SURFACES)[number]

const W = 720
const H = 220
const PAD = { top: 12, right: 8, bottom: 26, left: 40 }

/** One column per day in the range, oldest first, minutes per page. */
const columns = computed(() => {
  const out: { day: string; label: string; minutes: Record<Play, number>; total: number }[] = []
  const today = new Date()
  for (let i = props.days - 1; i >= 0; i--) {
    const d = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i),
    )
    const day = d.toISOString().slice(0, 10)
    const minutes = { battle: 0, party: 0, sheet: 0 } as Record<Play, number>
    for (const r of props.rows) {
      if (r.day === day && (PLAY_SURFACES as readonly string[]).includes(r.surface)) {
        minutes[r.surface as Play] += Math.round(r.seconds / 60)
      }
    }
    const total = PLAY_SURFACES.reduce((n, s) => n + minutes[s], 0)
    const label = d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    })
    out.push({ day, label, minutes, total })
  }
  return out
})

/** A round axis top: 1, 2, 5 × 10ⁿ above the busiest day. */
const max = computed(() => {
  const top = Math.max(1, ...columns.value.map((c) => c.total))
  const p = 10 ** Math.floor(Math.log10(top))
  return [1, 2, 5, 10].map((m) => m * p).find((v) => v >= top) ?? top
})

const plotW = W - PAD.left - PAD.right
const plotH = H - PAD.top - PAD.bottom
const step = computed(() => plotW / columns.value.length)
const barW = computed(() => Math.max(2, Math.min(28, step.value - 2)))
const y = (v: number) => PAD.top + plotH - (v / max.value) * plotH

const ticks = computed(() =>
  Number.isInteger(max.value / 2) ? [0, max.value / 2, max.value] : [0, max.value],
)
/** Day labels: about six, evenly spread. */
const labelEvery = computed(() => Math.max(1, Math.ceil(columns.value.length / 6)))

/** Stacked segments with a 2px gap between them. */
function segments(c: (typeof columns.value)[number]) {
  const out: { surface: Play; y: number; h: number }[] = []
  let base = 0
  for (const s of PLAY_SURFACES) {
    const v = c.minutes[s]
    if (v <= 0) continue
    const top = y(base + v)
    const bottom = y(base)
    out.push({ surface: s, y: top, h: Math.max(1, bottom - top - (base > 0 ? 2 : 0)) })
    base += v
  }
  return out
}

const hover = ref<number | null>(null)
const tip = computed(() => (hover.value === null ? null : (columns.value[hover.value] ?? null)))
const showTable = ref(false)
</script>

<template>
  <div class="usage">
    <ul class="usage__legend" aria-label="Legend">
      <li v-for="s in PLAY_SURFACES" :key="s">
        <span class="usage__swatch" :class="`is-${s}`" aria-hidden="true" />
        {{ SURFACE_LABELS[s] }}
      </li>
    </ul>
    <div class="usage__plot" @mouseleave="hover = null">
      <svg
        :viewBox="`0 0 ${W} ${H}`"
        role="img"
        :aria-label="`Active minutes per day on Battle, Party and Character sheet over the last ${days} days`"
      >
        <g class="usage__grid">
          <g v-for="t in ticks" :key="t">
            <line :x1="PAD.left" :x2="W - PAD.right" :y1="y(t)" :y2="y(t)" />
            <text :x="PAD.left - 6" :y="y(t) + 4" text-anchor="end">{{ t }}</text>
          </g>
        </g>
        <g v-for="(c, i) in columns" :key="c.day">
          <rect
            v-for="seg in segments(c)"
            :key="seg.surface"
            :class="`is-${seg.surface}`"
            :x="PAD.left + i * step + (step - barW) / 2"
            :y="seg.y"
            :width="barW"
            :height="seg.h"
            rx="2"
          />
          <text
            v-if="i % labelEvery === 0"
            class="usage__day"
            :x="PAD.left + i * step + step / 2"
            :y="H - 8"
            text-anchor="middle"
          >
            {{ c.label }}
          </text>
          <rect
            class="usage__hit"
            :x="PAD.left + i * step"
            :y="PAD.top"
            :width="step"
            :height="plotH"
            @mouseenter="hover = i"
          />
        </g>
      </svg>
      <div
        v-if="tip && hover !== null"
        class="usage__tip"
        :style="{ left: `${((PAD.left + (hover + 0.5) * step) / W) * 100}%` }"
        role="status"
      >
        <strong>{{ tip.label }}</strong>
        <span v-for="s in PLAY_SURFACES" :key="s">
          <span class="usage__swatch" :class="`is-${s}`" aria-hidden="true" />
          {{ SURFACE_LABELS[s] }}: {{ tip.minutes[s] }} min
        </span>
      </div>
    </div>
    <button
      type="button"
      class="btn btn--quiet btn--sm usage__toggle"
      @click="showTable = !showTable"
    >
      {{ showTable ? 'Hide table' : 'Show as table' }}
    </button>
    <div
      v-if="showTable"
      class="table-wrap"
      tabindex="0"
      role="region"
      aria-label="Active minutes per day"
    >
      <table class="table" style="font-size: 14px">
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th v-for="s in PLAY_SURFACES" :key="s" scope="col">{{ SURFACE_LABELS[s] }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in columns" :key="c.day">
            <td>
              <strong>{{ c.label }}</strong>
            </td>
            <td v-for="s in PLAY_SURFACES" :key="s">{{ c.minutes[s] }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped lang="scss">
.usage {
  // --series-battle / --series-party / --series-sheet come from pages/admin/analytics.vue,
  // so the bars and the page's per-page dots share one palette (with its Cursed variant).
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.usage__legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  font-size: 13px;
  color: var(--page-soft);

  li {
    display: flex;
    align-items: center;
    gap: 6px;
  }
}

.usage__swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.is-battle {
  background: var(--series-battle);
  fill: var(--series-battle);
}
.is-party {
  background: var(--series-party);
  fill: var(--series-party);
}
.is-sheet {
  background: var(--series-sheet);
  fill: var(--series-sheet);
}

.usage__plot {
  position: relative;

  svg {
    display: block;
    width: 100%;
    height: auto;
  }
}

.usage__grid {
  line {
    stroke: var(--line);
    stroke-width: 1;
  }

  text {
    fill: var(--page-muted);
    font-size: 11px;
  }
}

.usage__day {
  fill: var(--page-muted);
  font-size: 11px;
}

.usage__hit {
  fill: transparent;
}

.usage__tip {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--panel-bg);
  border: 1px solid var(--line);
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.3);

  span {
    display: flex;
    align-items: center;
    gap: 6px;
  }
}

.usage__toggle {
  align-self: flex-start;
}
</style>
