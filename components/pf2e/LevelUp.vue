<script setup lang="ts">
// The data-driven PF2e level-up inside `SheetLevelUpDialog`, for heroes made in the builder
// (Player Core p. 29): what the level grants (HP, class features, proficiency increases, spell
// slots), then the picks it asks for (boosts, feature choices, feats, skill increases, spells),
// each with the builder's pieces. `previous` fills in a level's recorded picks (Reconfigure).
import { type Pf2eData, loadPf2e } from '~/data/pf2e'
import type { Pf2eFeatDef, Pf2eSpellDef } from '~/data/pf2e/types'
import type { Pf2eAttr, Pf2eLevelInput, Pf2eRank, Pf2eSheet } from '~/types/sheets'
import { loreHtml } from '~/utils/loreText'
import { PF2E_ATTRS, type Pf2eBuildData, actionGlyph } from '~/utils/pf2eBuild'
import {
  RANK_NAME,
  applyPf2eLevel,
  emptyLevelInput,
  featPrerequisites,
  levelFeatOptions,
  levelSpellOptions,
  pf2eLevelPlan,
  pf2eLevelProblems,
} from '~/utils/pf2eLevelUp'
import type { Pf2eOption } from '~/components/pf2e/OptionCards.vue'

const props = defineProps<{ previous?: Pf2eLevelInput; showErrors: boolean }>()
const { draft } = useSheet()
const snackbar = useSnackbarStore()

const SETS = [
  'classes',
  'ancestries',
  'heritages',
  'backgrounds',
  'feats',
  'deities',
  'weapons',
  'armor',
  'shields',
  'spells',
] as const
const data = shallowRef<Pf2eBuildData | null>(null)
const loadError = ref('')
onMounted(async () => {
  try {
    const sets = await Promise.all(SETS.map((s) => loadPf2e(s)))
    data.value = Object.fromEntries(SETS.map((s, i) => [s, sets[i]])) as Pick<
      Pf2eData,
      (typeof SETS)[number]
    >
  } catch (err) {
    loadError.value = 'The Pathfinder rules could not be loaded. Check your connection and retry.'
    snackbar.error(err, 'Could not load the Pathfinder rules')
  }
})

const sheet = computed(() => draft.value.sheet as Pf2eSheet)
const level = computed(() => draft.value.level + 1)
const picks = ref<Pf2eLevelInput>(
  props.previous
    ? { ...emptyLevelInput(), ...(JSON.parse(JSON.stringify(props.previous)) as Pf2eLevelInput) }
    : emptyLevelInput(),
)

const plan = computed(() =>
  data.value ? pf2eLevelPlan(sheet.value, level.value, data.value, picks.value) : null,
)
const problems = computed(() =>
  plan.value ? pf2eLevelProblems(plan.value, picks.value, sheet.value) : ['Loading the rules'],
)

/** The sheet after this level's boosts and skill increases, for feat prerequisites. */
const projected = computed(() => {
  if (!data.value) return sheet.value
  const copy = JSON.parse(JSON.stringify(sheet.value)) as Pf2eSheet
  applyPf2eLevel(copy, level.value, { ...picks.value, feats: {} }, data.value)
  return copy
})

const sign = (n: number) => (n >= 0 ? `+${n}` : String(n))
const option = (
  r: { id: string; name: string; text?: string; rarity?: string },
  meta?: string,
  disabled?: string,
): Pf2eOption => ({
  id: r.id,
  name: r.name,
  ...(meta ? { meta } : {}),
  ...(r.text ? { text: r.text } : {}),
  ...(r.rarity ? { rarity: r.rarity } : {}),
  ...(disabled ? { disabled } : {}),
})

// --- Feats ------------------------------------------------------------------------
const featMeta = (f: Pf2eFeatDef) =>
  [
    `Level ${f.level}`,
    actionGlyph(f.actions),
    f.traits.join(', '),
    f.prerequisites ? `Needs ${f.prerequisites}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
const featCards = computed(() => {
  const d = data.value
  const p = plan.value
  if (!d || !p) return {}
  return Object.fromEntries(
    p.feats.map((slot) => {
      const others = Object.entries(picks.value.feats)
        .filter(([k]) => k !== slot.key)
        .map(([, id]) => id)
      const cards = levelFeatOptions(slot.kind, sheet.value, level.value, d).map((f) => {
        const { unmet } = featPrerequisites(f, projected.value, d)
        const why = others.includes(f.id)
          ? 'Picked for another slot'
          : unmet.length
            ? `Needs ${unmet.join('; ')}`
            : undefined
        return option(f, featMeta(f), why)
      })
      // Feats the hero can take first, the newest first.
      const lvl = (o: Pf2eOption) => Number(/^Level (\d+)/.exec(o.meta ?? '')?.[1] ?? 0)
      cards.sort((a, b) => Number(!!a.disabled) - Number(!!b.disabled) || lvl(b) - lvl(a))
      return [slot.key, cards]
    }),
  ) as Record<string, Pf2eOption[]>
})
const featPick = (key: string) => (picks.value.feats[key] ? [picks.value.feats[key]!] : [])
function setFeat(key: string, ids: string[]) {
  const feats = { ...picks.value.feats }
  if (ids[0]) feats[key] = ids[0]
  else delete feats[key]
  picks.value.feats = feats
}

// --- Choices and spells -------------------------------------------------------------
const listPick = (where: 'choices' | 'spells', key: string) => picks.value[where][key] ?? []
function setList(where: 'choices' | 'spells', key: string, ids: string[]) {
  picks.value[where] = { ...picks.value[where], [key]: ids }
}
const spellMeta = (s: Pf2eSpellDef) =>
  [`Rank ${s.rank}`, actionGlyph(s.actions), s.traits.join(', ')].filter(Boolean).join(' · ')
const spellCards = computed(() => {
  const d = data.value
  if (!d || !plan.value) return {}
  return Object.fromEntries(
    plan.value.spells.map((p) => {
      const elsewhere = Object.entries(picks.value.spells)
        .filter(([k]) => k !== p.key)
        .flatMap(([, ids]) => ids)
      return [
        p.key,
        levelSpellOptions(p, sheet.value, d).map((s) =>
          option(s, spellMeta(s), elsewhere.includes(s.id) ? 'Picked above' : undefined),
        ),
      ]
    }),
  ) as Record<string, Pf2eOption[]>
})

// Choices that no longer apply (a different boost changed the plan) are dropped.
watch(
  () => plan.value?.choices.map((c) => c.key).join(),
  () => {
    const keys = new Set(plan.value?.choices.map((c) => c.key))
    if (!plan.value) return
    picks.value.choices = Object.fromEntries(
      Object.entries(picks.value.choices).filter(([k]) => keys.has(k)),
    )
  },
)

// --- Boosts -------------------------------------------------------------------------
const boosts = computed({
  get: () => picks.value.boosts,
  set: (v: Pf2eAttr[]) => (picks.value.boosts = v),
})
const partialNow = computed(() => sheet.value.partialBoosts ?? [])
const boostNotes = computed(() =>
  picks.value.boosts
    .filter((a) => sheet.value.attrs[a] >= 4)
    .map((a) =>
      partialNow.value.includes(a)
        ? `${a} completes its partial boost: +${sheet.value.attrs[a]} → +${sheet.value.attrs[a] + 1}`
        : `${a} is +${sheet.value.attrs[a]}: this is a partial boost (a second one at a later level raises it)`,
    ),
)

// --- Skills -------------------------------------------------------------------------
const RANKS: Pf2eRank[] = ['U', 'T', 'E', 'M', 'L']
/** Skill ranks after the increases before index `i`. */
function ranksBefore(i: number) {
  const out = Object.fromEntries(sheet.value.skills.map((s) => [s.name, s.rank])) as Record<
    string,
    Pf2eRank
  >
  for (const s of picks.value.skills.slice(0, i).filter(Boolean))
    out[s] = RANKS[Math.min(4, RANKS.indexOf(out[s] ?? 'U') + 1)]!
  return out
}
function increaseOptions(i: number) {
  const ranks = ranksBefore(i)
  const max = plan.value?.skillMax ?? 'E'
  return sheet.value.skills
    .filter((s) => s.name !== 'Lore')
    .map((s) => {
      const now = ranks[s.name] ?? 'U'
      const next = RANKS[RANKS.indexOf(now) + 1]
      const ok = !!next && RANKS.indexOf(next) <= RANKS.indexOf(max)
      return {
        name: s.name,
        label: ok
          ? `${s.name}: ${RANK_NAME[now]} → ${RANK_NAME[next!]}`
          : `${s.name}: ${RANK_NAME[now]}`,
        ok,
      }
    })
}
function setSkill(i: number, value: string) {
  const n = plan.value?.skillIncreases ?? 0
  picks.value.skills = Array.from({ length: n }, (_, j) =>
    j === i ? value : (picks.value.skills[j] ?? ''),
  )
}
const untrained = computed(() => {
  const ranks = ranksBefore(picks.value.skills.length)

  return sheet.value.skills.filter((s) => s.name !== 'Lore' && (ranks[s.name] ?? 'U') === 'U')
})
function setTrained(value: string) {
  picks.value.trained = value ? [value] : []
}

const rankWord = (r: Pf2eRank) => RANK_NAME[r]

/** Writes the level onto the sheet; the dialog saves it. */
function commit() {
  if (!data.value) return false
  applyPf2eLevel(sheet.value, level.value, picks.value, data.value)
  return true
}

defineExpose({ problems, commit })
const attrs = PF2E_ATTRS
</script>

<template>
  <p v-if="loadError" class="err" role="alert">{{ loadError }}</p>
  <p v-else-if="!plan" class="small muted" aria-live="polite">Loading the Pathfinder rules…</p>
  <template v-else>
    <section class="step-block" aria-labelledby="pf-grants">
      <div class="step-head">
        <h3 id="pf-grants">New at level {{ level }}</h3>
        <span class="small muted">{{ sheet.class }}</span>
      </div>
      <dl class="facts">
        <div>
          <dt>Max HP</dt>
          <dd>
            <strong>+{{ plan.hp.total }}</strong>
            <span class="small muted">
              {{ sheet.class }} {{ plan.hp.cls }} + CON {{ sign(plan.hp.con) }}
              <template v-if="plan.hp.retro">
                + {{ plan.hp.retro }} for earlier levels (CON went up)</template
              >
              <template v-if="plan.hp.feats"> + {{ plan.hp.feats }} from feats</template>
            </span>
          </dd>
        </div>
        <div>
          <dt>Proficiency</dt>
          <dd>+1 to everything you're trained in (your level)</dd>
        </div>
        <div v-for="p in plan.proficiencies" :key="p.label">
          <dt>{{ p.label }}</dt>
          <dd>
            {{ rankWord(p.from) }} → <strong>{{ rankWord(p.to) }}</strong>
          </dd>
        </div>
        <div v-for="s in plan.slots" :key="`slot-${s.rank}`">
          <dt>Rank {{ s.rank }} slots</dt>
          <dd>
            {{ s.from }} → <strong>{{ s.to }}</strong>
          </dd>
        </div>
        <div v-if="plan.font">
          <dt>Divine font</dt>
          <dd>
            {{ plan.font.from }} → <strong>{{ plan.font.to }}</strong>
          </dd>
        </div>
        <div v-if="plan.granted.length">
          <dt>Spells added</dt>
          <dd>{{ plan.granted.map((s) => `${s.name} (rank ${s.rank})`).join(', ') }}</dd>
        </div>
        <div v-if="plan.focus.length">
          <dt>Focus spells</dt>
          <dd>{{ plan.focus.map((s) => s.name).join(', ') }}</dd>
        </div>
      </dl>
      <div v-if="plan.features.length" class="gains">
        <details v-for="f in plan.features" :key="f.from + f.name" class="gain-card">
          <summary>
            <strong>{{ f.name }}</strong>
            <small>{{ f.from }}</small>
          </summary>
          <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
          <div class="gain-card__body" v-html="loreHtml(f.text)" />
        </details>
      </div>
      <ul v-if="plan.notes.length" class="notes">
        <li v-for="n in plan.notes" :key="n">{{ n }}</li>
      </ul>
    </section>

    <section v-if="plan.boosts" class="step-block" aria-labelledby="pf-boosts">
      <div class="step-head">
        <h3 id="pf-boosts">Attribute boosts</h3>
        <span class="small muted">
          Now
          <template v-for="(a, i) in attrs" :key="a"
            >{{ i ? ' · ' : '' }}{{ a }} {{ sign(sheet.attrs[a])
            }}{{ partialNow.includes(a) ? ' (partial)' : '' }}</template
          >
        </span>
      </div>
      <Pf2eBoostPicker v-model="boosts" label="Four boosts" :count="plan.boosts" />
      <ul v-if="boostNotes.length" class="notes">
        <li v-for="n in boostNotes" :key="n">{{ n }}</li>
      </ul>
    </section>

    <section v-for="c in plan.choices" :key="c.key" class="step-block" :aria-label="c.label">
      <div class="step-head">
        <h3>{{ c.label }}</h3>
        <span class="small muted">{{ c.count > 1 ? `Choose ${c.count}` : 'Choose one' }}</span>
      </div>
      <Pf2eOptionCards
        :model-value="listPick('choices', c.key)"
        :options="c.options.map((o) => option(o))"
        :label="c.label"
        @update:model-value="setList('choices', c.key, $event)"
        :multiple="c.count > 1"
        :max="c.count"
      />
    </section>

    <section v-for="slot in plan.feats" :key="slot.key" class="step-block" :aria-label="slot.label">
      <div class="step-head">
        <h3>{{ slot.label }}</h3>
        <span class="small muted">Level {{ level }} or lower</span>
      </div>
      <Pf2eOptionCards
        :model-value="featPick(slot.key)"
        :options="featCards[slot.key] ?? []"
        :label="`${slot.label}s`"
        @update:model-value="setFeat(slot.key, $event)"
      />
    </section>

    <section
      v-if="plan.skillIncreases || plan.trained"
      class="step-block"
      aria-labelledby="pf-skills"
    >
      <div class="step-head">
        <h3 id="pf-skills">Skills</h3>
        <span class="small muted"
          >Up to {{ rankWord(plan.skillMax).toLowerCase() }} at this level</span
        >
      </div>
      <div class="skill-picks">
        <div v-for="i in plan.skillIncreases" :key="`inc-${i}`" class="field">
          <label :for="`pf-inc-${i}`"
            >Skill increase{{ plan.skillIncreases > 1 ? ` ${i}` : '' }}</label
          >
          <select
            :id="`pf-inc-${i}`"
            class="input"
            :value="picks.skills[i - 1] ?? ''"
            @change="setSkill(i - 1, ($event.target as HTMLSelectElement).value)"
          >
            <option value="" disabled>Choose a skill</option>
            <option
              v-for="o in increaseOptions(i - 1)"
              :key="o.name"
              :value="o.name"
              :disabled="!o.ok"
            >
              {{ o.label }}
            </option>
          </select>
        </div>
        <div v-if="plan.trained" class="field">
          <label for="pf-trained">Trained skill (Intelligence went up)</label>
          <select
            id="pf-trained"
            class="input"
            :value="picks.trained?.[0] ?? ''"
            @change="setTrained(($event.target as HTMLSelectElement).value)"
          >
            <option value="" disabled>Choose a skill</option>
            <option v-for="s in untrained" :key="s.name" :value="s.name">{{ s.name }}</option>
          </select>
        </div>
      </div>
    </section>

    <section v-for="sp in plan.spells" :key="sp.key" class="step-block" :aria-label="sp.label">
      <div class="step-head">
        <h3>{{ sp.label }}</h3>
        <span class="small muted">
          {{ (picks.spells[sp.key] ?? []).length }} / {{ sp.count
          }}{{ sp.optional ? ' · optional: you prepare from your whole list' : '' }}
        </span>
      </div>
      <Pf2eOptionCards
        :model-value="listPick('spells', sp.key)"
        :options="spellCards[sp.key] ?? []"
        :label="sp.label"
        @update:model-value="setList('spells', sp.key, $event)"
        :multiple="sp.count > 1"
        :max="sp.count"
      />
    </section>

    <p v-if="problems.length" class="todo" :class="{ err: showErrors }" aria-live="polite">
      Still to choose: {{ problems.join(' · ') }}
    </p>
  </template>
</template>

<style scoped lang="scss">
.step-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;

  h3 {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent-text);
  }
}

.step-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
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
}

.notes {
  margin: 0;
  padding-left: 18px;
  font-size: 14px;
  color: var(--page-soft);
}

.skill-picks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
  gap: 12px;
}

.todo {
  font-size: 14px;
  color: var(--page-soft);
}

.err {
  color: var(--danger-text);
  font-weight: 600;
  font-size: 14px;
}
</style>
