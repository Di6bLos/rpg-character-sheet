<script setup lang="ts">
// The data-driven 5e level-up inside `SheetLevelUpDialog`, for heroes made in the builder
// (SRD 5.2.1 p. 23): Hit Points (the fixed value, a roll or the player's own roll), what the
// level grants (Proficiency Bonus, features, slots, resources), then the picks it asks for
// (subclass, feats, invocations, spells, Expertise…) and the optional swaps. `previous` fills in
// a level's recorded picks (Reconfigure); picks that no longer fit show as problems. The Sources
// menu is the builder's, shared per browser.
import { loadDnd5e } from '~/data/dnd5e'
import type { Dnd5eLevelInput, Dnd5eSheet } from '~/types/sheets'
import { rollDie, sign } from '~/utils/dice'
import {
  DND5E_ABILITY_NAME,
  DND5E_BUILD_SETS,
  type Dnd5eBuildData,
  pickElementId,
} from '~/utils/dnd5eBuild'
import {
  applyDnd5eLevel,
  dnd5eLevelPlan,
  dnd5eLevelProblems,
  levelHpGain,
} from '~/utils/dnd5eLevelUp'
import { loreHtml } from '~/utils/loreText'

const props = defineProps<{ previous?: Dnd5eLevelInput; showErrors: boolean }>()
const { draft } = useSheet()
const snackbar = useSnackbarStore()

const data = shallowRef<Dnd5eBuildData | null>(null)
const loadError = ref('')
onMounted(async () => {
  try {
    const sets = await Promise.all(DND5E_BUILD_SETS.map((s) => loadDnd5e(s)))
    data.value = Object.fromEntries(DND5E_BUILD_SETS.map((s, i) => [s, sets[i]])) as Dnd5eBuildData
  } catch (err) {
    loadError.value = 'The 5e rules could not be loaded. Check your connection and retry.'
    snackbar.error(err, 'Could not load the 5e rules')
  }
})

const sheet = computed(() => draft.value.sheet as Dnd5eSheet)
const level = computed(() => draft.value.level + 1)
const picks = ref<Record<string, string[]>>(
  props.previous
    ? (JSON.parse(JSON.stringify(props.previous.picks)) as Record<string, string[]>)
    : {},
)
const hpMode = ref<'fixed' | 'roll' | 'own'>(props.previous ? 'own' : 'fixed')
const hpTyped = ref<number>(props.previous?.hpRoll ?? 0)
const hpRolled = ref<number | null>(null)

const plan = computed(() =>
  data.value ? dnd5eLevelPlan(sheet.value, level.value, data.value, picks.value) : null,
)
/** The class isn't in the rules data (or the sheet lost its build): level up by hand. */
const unknownClass = computed(() => !!data.value && !plan.value)

const hpRoll = computed(() => {
  if (!plan.value) return 0
  if (hpMode.value === 'fixed') return plan.value.hp.fixed
  if (hpMode.value === 'roll') return hpRolled.value ?? 0
  return hpTyped.value
})
function roll() {
  if (!plan.value) return
  hpMode.value = 'roll'
  hpRolled.value = rollDie(plan.value.hp.die)
}
function setTyped(event: Event) {
  hpMode.value = 'own'
  hpTyped.value = Math.trunc(Number((event.target as HTMLInputElement).value) || 0)
}
const gain = computed(() =>
  plan.value && hpRoll.value ? levelHpGain(plan.value, hpRoll.value) : 0,
)

const input = computed<Dnd5eLevelInput>(() => ({ hpRoll: hpRoll.value, picks: picks.value }))
const problems = computed(() =>
  plan.value
    ? dnd5eLevelProblems(plan.value, input.value).map((p) => ({ section: p.key, text: p.text }))
    : [{ section: '', text: 'Loading the rules' }],
)

const mainPicks = computed(() =>
  (plan.value?.picks ?? []).filter((p) => !p.optional && !p.key.includes(':swap:')),
)
const swapPicks = computed(() =>
  (plan.value?.picks ?? []).filter((p) => p.optional || p.key.includes(':swap:')),
)
/** The swaps start open when one is under way (a replayed level, or a jump to a problem). */
const swapsOpen = computed(() => swapPicks.value.some((p) => picks.value[p.key]?.length))
const progress = computed(() => {
  const list = mainPicks.value
  return {
    done: list.filter((p) => !problems.value.some((q) => q.section === p.key)).length,
    total: list.length,
  }
})

// Picks the plan no longer asks (another feat chosen) are dropped.
watch(
  () => plan.value?.picks.map((p) => p.key).join(),
  () => {
    if (!plan.value) return
    const keys = new Set(plan.value.picks.map((p) => p.key))
    const kept = Object.fromEntries(Object.entries(picks.value).filter(([k]) => keys.has(k)))
    if (Object.keys(kept).length !== Object.keys(picks.value).length) picks.value = kept
  },
)

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
/** Scrolls to a pick (or the Hit Points) and moves focus to its heading. */
function jump(key: string) {
  const id = key === 'hp' ? 'd5-hp' : pickElementId(key)
  document.getElementById(id)?.scrollIntoView({
    block: 'start',
    behavior: reduceMotion() ? 'auto' : 'smooth',
  })
  document.getElementById(`${id}-h`)?.focus({ preventScroll: true })
}

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']
const increases = computed(() =>
  Object.entries(plan.value?.increases ?? {})
    .filter(([, v]) => v)
    .map(([a, v]) => `${DND5E_ABILITY_NAME[a as keyof typeof DND5E_ABILITY_NAME]} +${v}`)
    .join(', '),
)

/** Writes the level onto the sheet; the dialog saves it. */
function commit() {
  if (!data.value || !plan.value) return false
  applyDnd5eLevel(sheet.value, level.value, input.value, data.value)
  return true
}

defineExpose({ problems, progress, commit, jump })
</script>

<template>
  <p v-if="loadError" class="err" role="alert">{{ loadError }}</p>
  <p v-else-if="unknownClass" class="err" role="alert">
    This hero's class isn't in the 5e rules data: level up by hand from Edit sheet.
  </p>
  <p v-else-if="!plan" class="small muted" aria-live="polite">Loading the 5e rules…</p>
  <template v-else>
    <section class="step-block" aria-labelledby="d5-grants">
      <div class="step-head">
        <h3 id="d5-grants">New at level {{ level }}</h3>
      </div>
      <dl class="facts">
        <div>
          <dt>Max HP</dt>
          <dd>
            <strong>{{ gain ? `+${gain}` : '—' }}</strong>
            <span class="small muted">
              d{{ plan.hp.die }} {{ hpRoll || '?' }} + CON {{ sign(plan.hp.con) }}
              <template v-if="plan.hp.perLevel"> + {{ plan.hp.perLevel }} per level</template>
              <template v-if="plan.hp.retro">
                {{ sign(plan.hp.retro) }} for earlier levels</template
              >
            </span>
          </dd>
        </div>
        <div>
          <dt>Proficiency Bonus</dt>
          <dd>
            <template v-if="plan.profBonus.from !== plan.profBonus.to">
              {{ sign(plan.profBonus.from) }} → <strong>{{ sign(plan.profBonus.to) }}</strong>
            </template>
            <template v-else>{{ sign(plan.profBonus.to) }}</template>
          </dd>
        </div>
        <div v-for="s in plan.slots" :key="`slot-${s.level}`">
          <dt>{{ ORDINAL[s.level - 1] }}-level slots</dt>
          <dd>
            {{ s.from }} → <strong>{{ s.to }}</strong>
          </dd>
        </div>
        <div v-if="plan.pact">
          <dt>Pact Magic slots</dt>
          <dd>
            {{ plan.pact.from }} → <strong>{{ plan.pact.to }}</strong>
          </dd>
        </div>
        <div v-for="r in plan.resources" :key="`res-${r.name}`">
          <dt>{{ r.name }}</dt>
          <dd>
            {{ r.from }} → <strong>{{ r.to }}</strong>
          </dd>
        </div>
        <div v-if="increases">
          <dt>Ability scores</dt>
          <dd>
            <strong>{{ increases }}</strong>
          </dd>
        </div>
      </dl>
      <div v-if="plan.features.length" class="gains">
        <details v-for="f in plan.features" :key="`${f.from}${f.name}`" class="gain-card">
          <summary>
            <strong>{{ f.name }}</strong>
            <small>{{ f.from }}</small>
          </summary>
          <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
          <div class="gain-card__body" v-html="loreHtml(f.desc)" />
        </details>
      </div>
      <p v-else class="small muted">No new features at this level.</p>
    </section>

    <section id="d5-hp" class="step-block" aria-labelledby="d5-hp-h">
      <h3 id="d5-hp-h" tabindex="-1">Hit points</h3>
      <div class="hp-row">
        <button
          type="button"
          class="chip"
          :aria-pressed="hpMode === 'fixed'"
          @click="hpMode = 'fixed'"
        >
          Fixed value · {{ plan.hp.fixed }}
        </button>
        <button type="button" class="chip" :aria-pressed="hpMode === 'roll'" @click="roll">
          {{
            hpMode === 'roll' && hpRolled
              ? `Rolled ${hpRolled} · roll again`
              : `Roll 1d${plan.hp.die}`
          }}
        </button>
        <div class="field hp-own">
          <label for="d5-hp-own">Your own roll</label>
          <input
            id="d5-hp-own"
            class="input"
            type="number"
            inputmode="numeric"
            min="1"
            :max="plan.hp.die"
            :value="hpMode === 'own' ? hpTyped || '' : ''"
            :placeholder="`1–${plan.hp.die}`"
            @input="setTyped"
          />
        </div>
      </div>
    </section>

    <div v-if="mainPicks.length || swapPicks.length" class="source-bar">
      <Dnd5eSourceFilter />
    </div>

    <section v-for="p in mainPicks" :key="p.key" class="step-block">
      <Dnd5ePickField v-model="picks[p.key]" :pick="p" :show-errors="showErrors" />
    </section>

    <details v-if="swapPicks.length" class="step-block swaps" :open="swapsOpen">
      <summary><h3>Swaps (optional)</h3></summary>
      <p class="help">
        A level-up may replace one cantrip, one prepared spell, one invocation, maneuver, metamagic
        option or plan, and one weapon mastery.
      </p>
      <Dnd5ePickField
        v-for="p in swapPicks"
        :key="p.key"
        v-model="picks[p.key]"
        :pick="p"
        :show-errors="showErrors"
      />
    </details>
  </template>
</template>

<style scoped lang="scss">
.source-bar {
  display: flex;
  justify-content: flex-end;
}

.step-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
  scroll-margin-top: 8px;

  h3 {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent-text);
    margin: 0;

    &:focus {
      outline: none;
    }

    &:focus-visible {
      outline: 3px solid var(--accent);
      outline-offset: 2px;
    }
  }
}

.step-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.help {
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  color: var(--page-soft);
}

.facts {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
  gap: 6px 24px;
  padding: 12px 14px;
  border-radius: min(var(--radius-panel), 10px);
  background: var(--field);
  border: 1px solid var(--line);

  > div {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    font-size: 14px;
  }

  dt {
    color: var(--page-soft);
  }

  dd {
    margin: 0;
    text-align: right;

    .small {
      display: block;
    }
  }
}

.gains {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gain-card {
  padding: 10px 14px;
  border-radius: min(var(--radius-panel), 10px);
  background: var(--field);
  border: 1px solid var(--line);
  border-left: 3px solid var(--accent);

  summary {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    min-height: 32px;
    cursor: pointer;

    small {
      color: var(--page-muted);
      font-size: 12px;
    }
  }
}

.gain-card__body {
  margin-top: 6px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--page-soft);
  white-space: pre-line;
}

.hp-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
}

.hp-own {
  width: 140px;
}

.swaps summary {
  cursor: pointer;
  min-height: 32px;
  display: flex;
  align-items: center;
}

.swaps summary h3 {
  display: inline;
}

.err {
  color: var(--danger-text);
  font-weight: 600;
  font-size: 14px;
}
</style>
