<script setup lang="ts">
// The data-driven PF2e level-up inside `SheetLevelUpDialog`, for heroes made in the builder
// (Player Core p. 29): what the level grants (HP, class features, proficiency increases, spell
// slots), then the picks it asks for (boosts, feature choices, feats, skill increases, spells),
// each with the builder's pieces. `previous` fills in a level's recorded picks (Reconfigure).
import { type Pf2eData, loadPf2e } from '~/data/pf2e'
import type { Pf2eActionCost, Pf2eSpellDef } from '~/data/pf2e/types'
import type { Pf2eAttr, Pf2eLevelInput, Pf2eRank, Pf2eSheet } from '~/types/sheets'
import { loreHtml } from '~/utils/loreText'
import { PF2E_ATTRS, type Pf2eBuildData, actionGlyph, actionWords } from '~/utils/pf2eBuild'
import {
  RANK_NAME,
  type Pf2eLevelProblem,
  type Pf2eSpellPick,
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
const problems = computed<Pf2eLevelProblem[]>(() =>
  plan.value
    ? pf2eLevelProblems(plan.value, picks.value, sheet.value)
    : [{ section: '', text: 'Loading the rules' }],
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
  r: { id: string; name: string; text?: string; rarity?: string; actions?: Pf2eActionCost },
  meta?: string,
  disabled?: string,
): Pf2eOption => ({
  id: r.id,
  name: r.name,
  ...(meta ? { meta } : {}),
  ...(r.text ? { text: r.text } : {}),
  ...(r.rarity ? { rarity: r.rarity } : {}),
  ...(r.actions !== undefined
    ? { actions: actionGlyph(r.actions), actionsLabel: actionWords(r.actions) }
    : {}),
  ...(disabled ? { disabled } : {}),
})

// --- Sections ----------------------------------------------------------------------
/** Each pick section's element id, from its problem key ("feat:class" → "pf-sec-feat-class"). */
const sectionId = (key: string) => `pf-sec-${key.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
const sections = computed(() => {
  const p = plan.value
  if (!p) return []
  return [
    ...(p.boosts ? [{ key: 'boosts', title: 'Attribute boosts' }] : []),
    ...p.choices.map((c) => ({ key: `choice:${c.key}`, title: c.label })),
    ...p.feats.map((f) => ({ key: `feat:${f.key}`, title: f.label })),
    ...(p.skillIncreases || p.trained ? [{ key: 'skills', title: 'Skills' }] : []),
    ...p.spells.map((sp) => ({ key: `spells:${sp.key}`, title: sp.label })),
  ].map((x) => ({
    ...x,
    id: sectionId(x.key),
    done: !problems.value.some((q) => q.section === x.key),
  }))
})
const progress = computed(() => ({
  done: sections.value.filter((x) => x.done).length,
  total: sections.value.length,
}))
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
/** Scrolls to a pick section and moves focus to its heading. */
function jump(key: string) {
  const id = sectionId(key)
  document.getElementById(id)?.scrollIntoView({
    block: 'start',
    behavior: reduceMotion() ? 'auto' : 'smooth',
  })
  document.getElementById(`${id}-h`)?.focus({ preventScroll: true })
}

/** Features shown with their choice ("Fighter Weapon Mastery" above the weapon groups). */
const choiceFeatures = computed(
  () => new Set((plan.value?.choices ?? []).flatMap((c) => (c.feature ? [c.feature.name] : []))),
)
const gains = computed(() =>
  (plan.value?.features ?? []).filter(
    (f) => f.from !== sheet.value.class || !choiceFeatures.value.has(f.name),
  ),
)

// --- Feats ------------------------------------------------------------------------
const featCards = computed(() => {
  const d = data.value
  const p = plan.value
  if (!d || !p) return {}
  return Object.fromEntries(
    p.feats.map((slot) => {
      const others = Object.entries(picks.value.feats)
        .filter(([k]) => k !== slot.key)
        .map(([, id]) => id)
      const cards = levelFeatOptions(slot, sheet.value, level.value, d).map((f) => {
        const { unmet, unknown } = featPrerequisites(f, projected.value, d, others)
        const why = others.includes(f.id)
          ? 'Picked for another slot'
          : unmet.length
            ? `Needs ${unmet.join('; ')}`
            : undefined
        const meta = [
          `Level ${f.level}`,
          f.traits.join(', '),
          unknown.length ? `Ask your GM: ${unknown.join('; ')}` : '',
        ]
          .filter(Boolean)
          .join(' · ')
        return { card: option(f, meta, why), level: f.level }
      })
      // Feats the hero can take first, the newest first.
      cards.sort(
        (a, b) => Number(!!a.card.disabled) - Number(!!b.card.disabled) || b.level - a.level,
      )
      return [slot.key, cards.map((c) => c.card)]
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
const FEAT_HELP: Record<string, (lvl: number) => string> = {
  class: (lvl) =>
    `Any ${sheet.value.class.toLowerCase()} feat of level ${lvl} or lower, or an archetype's dedication or feats.`,
  ancestry: (lvl) =>
    `Any ${sheet.value.lineage.toLowerCase()} or heritage feat of level ${lvl} or lower.`,
  skill: (lvl) =>
    `Any skill feat of level ${lvl} or lower; you need the rank its prerequisites name.`,
  general: (lvl) => `Any general feat, skill feats included, of level ${lvl} or lower.`,
}

/** The free archetype variant (GM Core p. 84), kept on the hero from the level it's changed. */
const freeArchetype = computed({
  get: () => picks.value.freeArchetype ?? !!sheet.value.creation?.freeArchetype,
  set: (on: boolean) => (picks.value.freeArchetype = on),
})
// Feats picked for slots the level no longer has (the free archetype turned off) are dropped.
watch(
  () => plan.value?.feats.map((f) => f.key).join(),
  () => {
    if (!plan.value) return
    const keys = new Set(plan.value.feats.map((f) => f.key))
    picks.value.feats = Object.fromEntries(
      Object.entries(picks.value.feats).filter(([k]) => keys.has(k)),
    )
  },
)

// --- Choices and spells -------------------------------------------------------------
const listPick = (where: 'choices' | 'spells', key: string) => picks.value[where][key] ?? []
function setList(where: 'choices' | 'spells', key: string, ids: string[]) {
  picks.value[where] = { ...picks.value[where], [key]: ids }
}
const spellMeta = (s: Pf2eSpellDef) => [`Rank ${s.rank}`, s.traits.join(', ')].join(' · ')
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
          option(s, spellMeta(s), elsewhere.includes(s.id) ? 'Picked for another rank' : undefined),
        ),
      ]
    }),
  ) as Record<string, Pf2eOption[]>
})
function spellHelp(sp: Pf2eSpellPick) {
  if (sp.cantrip) return `Add ${sp.count} cantrip${sp.count === 1 ? '' : 's'}.`
  if (sp.optional)
    return `Optional: you prepare from your whole list. These are the spells the sheet offers for your rank ${sp.rank} slots.`
  if (sp.learnAt)
    return `Add ${sp.count} to your repertoire at rank ${sp.rank}: a rank ${sp.rank} spell, or a lower-rank one to cast heightened.`
  return `Add ${sp.count} spells of rank ${sp.rank} or lower.`
}

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
const listAnd = (xs: string[]) =>
  xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : (xs[0] ?? '')
/** What a boost does to each attribute: +1, a partial boost at +4 or more, or completing one. */
const boostHelp = computed(() => {
  const high = PF2E_ATTRS.filter(
    (a) => sheet.value.attrs[a] >= 4 && !partialNow.value.includes(a),
  ).map((a) => `${a} (${sign(sheet.value.attrs[a])})`)
  const completes = partialNow.value.map((a) => `${a}`)
  return [
    'Pick four different attributes; each goes up by 1.',
    high.length
      ? `${listAnd(high)} ${high.length === 1 ? 'is' : 'are'} at +4 or more: a boost there is only a partial boost, and a second one at a later level raises it.`
      : '',
    completes.length
      ? `${listAnd(completes)} already ${completes.length === 1 ? 'has' : 'have'} a partial boost: boosting it now raises it by 1.`
      : '',
  ]
    .filter(Boolean)
    .join(' ')
})

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
const skillHelp = computed(() => {
  const steps = ['untrained', 'trained', 'expert']
  if (level.value >= 7) steps.push('master')
  if (level.value >= 15) steps.push('legendary')
  return `Each increase raises one skill a step: ${steps.join(' → ')}.`
})

const rankWord = (r: Pf2eRank) => RANK_NAME[r]

/** Writes the level onto the sheet; the dialog saves it. */
function commit() {
  if (!data.value) return false
  applyPf2eLevel(sheet.value, level.value, picks.value, data.value)
  return true
}

defineExpose({ problems, progress, commit, jump })
</script>

<template>
  <p v-if="loadError" class="err" role="alert">{{ loadError }}</p>
  <p v-else-if="!plan" class="small muted" aria-live="polite">Loading the Pathfinder rules…</p>
  <template v-else>
    <section class="step-block" aria-labelledby="pf-grants">
      <div class="step-head">
        <h3 id="pf-grants">New at level {{ level }}</h3>
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
        <div v-for="s in plan.slots" :key="`slot-${s.archetype ?? ''}${s.rank}`">
          <dt>Rank {{ s.rank }} slots{{ s.archetype ? ` (${s.archetype} archetype)` : '' }}</dt>
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
      <div v-if="gains.length" class="gains">
        <details v-for="f in gains" :key="f.from + f.name" class="gain-card">
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

    <UiSwitch
      v-model="freeArchetype"
      small
      label="Free archetype: an archetype feat at every even level (GM Core p. 84)"
    />

    <nav v-if="sections.length > 1" class="jumps" aria-label="Choices at this level">
      <button
        v-for="x in sections"
        :key="x.key"
        type="button"
        class="chip jump"
        :class="{ 'is-done': x.done }"
        @click="jump(x.key)"
      >
        <span v-if="x.done" aria-hidden="true">✓</span>{{ x.title
        }}<span class="sr-only">{{ x.done ? ', chosen' : ', still to choose' }}</span>
      </button>
    </nav>

    <section
      v-if="plan.boosts"
      :id="sectionId('boosts')"
      class="step-block"
      :aria-labelledby="`${sectionId('boosts')}-h`"
    >
      <h3 :id="`${sectionId('boosts')}-h`" tabindex="-1">Attribute boosts</h3>
      <p class="help">{{ boostHelp }}</p>
      <Pf2eBoostPicker
        v-model="boosts"
        label="Four boosts"
        :count="plan.boosts"
        :values="sheet.attrs"
        :partial="partialNow"
      />
    </section>

    <section
      v-for="c in plan.choices"
      :id="sectionId(`choice:${c.key}`)"
      :key="c.key"
      class="step-block"
      :aria-labelledby="`${sectionId(`choice:${c.key}`)}-h`"
    >
      <h3 :id="`${sectionId(`choice:${c.key}`)}-h`" tabindex="-1">{{ c.label }}</h3>
      <p class="help">
        {{ c.count > 1 ? `Choose ${c.count}.` : 'Choose one.' }}
        <template v-if="c.feature">From {{ c.feature.name }}, new at this level.</template>
      </p>
      <details v-if="c.feature" class="gain-card" open>
        <summary>
          <strong>{{ c.feature.name }}</strong>
          <small>{{ c.feature.from ?? sheet.class }}</small>
        </summary>
        <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
        <div class="gain-card__body" v-html="loreHtml(c.feature.text)" />
      </details>
      <Pf2eOptionCards
        :model-value="listPick('choices', c.key)"
        :options="c.options.map((o) => option(o))"
        :label="c.label"
        :multiple="c.count > 1"
        :max="c.count"
        :compact="c.options.length > 12"
        @update:model-value="setList('choices', c.key, $event)"
      />
    </section>

    <section
      v-for="slot in plan.feats"
      :id="sectionId(`feat:${slot.key}`)"
      :key="slot.key"
      class="step-block"
      :aria-labelledby="`${sectionId(`feat:${slot.key}`)}-h`"
    >
      <h3 :id="`${sectionId(`feat:${slot.key}`)}-h`" tabindex="-1">{{ slot.label }}</h3>
      <p class="help">{{ slot.help ?? FEAT_HELP[slot.kind]?.(level) }}</p>
      <Pf2eOptionCards
        :model-value="featPick(slot.key)"
        :options="featCards[slot.key] ?? []"
        :label="`${slot.label}s`"
        compact
        hide-unavailable
        @update:model-value="setFeat(slot.key, $event)"
      />
    </section>

    <section
      v-if="plan.skillIncreases || plan.trained"
      :id="sectionId('skills')"
      class="step-block"
      :aria-labelledby="`${sectionId('skills')}-h`"
    >
      <h3 :id="`${sectionId('skills')}-h`" tabindex="-1">Skills</h3>
      <p class="help">{{ skillHelp }}</p>
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

    <section
      v-for="sp in plan.spells"
      :id="sectionId(`spells:${sp.key}`)"
      :key="sp.key"
      class="step-block"
      :aria-labelledby="`${sectionId(`spells:${sp.key}`)}-h`"
    >
      <h3 :id="`${sectionId(`spells:${sp.key}`)}-h`" tabindex="-1">
        {{ sp.label }}
        <span class="count">{{ (picks.spells[sp.key] ?? []).length }} / {{ sp.count }}</span>
      </h3>
      <p class="help">{{ spellHelp(sp) }}</p>
      <Pf2eOptionCards
        :model-value="listPick('spells', sp.key)"
        :options="spellCards[sp.key] ?? []"
        :label="sp.label"
        :multiple="sp.count > 1"
        :max="sp.count"
        compact
        hide-unavailable
        @update:model-value="setList('spells', sp.key, $event)"
      />
    </section>
  </template>
</template>

<style scoped lang="scss">
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
  margin: -4px 0 0;
  font-size: 14px;
  line-height: 1.45;
  color: var(--page-soft);
}

.count {
  margin-left: 6px;
  letter-spacing: 0;
  color: var(--page-soft);
}

.jumps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.jump {
  min-height: 36px;
  gap: 6px;
  cursor: pointer;

  &.is-done {
    border-color: var(--accent);
  }

  @media (pointer: coarse) {
    min-height: 44px;
  }
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

.err {
  color: var(--danger-text);
  font-weight: 600;
  font-size: 14px;
}
</style>
