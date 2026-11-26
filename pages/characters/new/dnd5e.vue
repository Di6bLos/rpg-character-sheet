<script setup lang="ts">
// 5e (2024) hero builder (SRD 5.2.1 pp. 19–23), class first like the Nimble and PF2e builders:
// class → species → background → abilities → skills & choices → equipment → spells → review.
// The rules data is fetched on open (`loadDnd5e`); `utils/dnd5eBuild.ts` asks the picks, checks
// each step and builds the level 1 sheet. A subclass step shows only when level 1 offers one (in
// the 2024 rules every class picks at level 3, but some World of Warcraft subclasses start at
// level 1; theirs comes after Species, whose picks it joins). The Sources menu hides the books
// the player turns off from every picker.
import { dnd5eSource, loadDnd5e } from '~/data/dnd5e'
import type { Dnd5eSourceBook } from '~/data/dnd5e'
import type { Dnd5eClassDef, Dnd5eFeature } from '~/data/dnd5e/types'
import { MAX_CHARACTERS } from '~/stores/character'
import type { Dnd5eAbility, Dnd5eCreation } from '~/types/sheets'
import { abilityMod, rollDie, sign } from '~/utils/dice'
import {
  DND5E_ABILITIES,
  DND5E_ABILITY_NAME,
  DND5E_BUILD_SETS,
  type Dnd5eBuildData,
  type Dnd5ePick,
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  STANDARD_ARRAY,
  SUGGESTED_ARRAY,
  CUSTOM_BACKGROUND,
  CUSTOM_GEAR_CP,
  DND5E_FEAT_CATEGORY_NAME,
  bonusProblem,
  customBackground,
  customGearOptions,
  customProblem,
  buildDnd5eSheet,
  clashPicks,
  creationPicks,
  earlySubclasses,
  emptyCreation,
  parseEquipment,
  pickElementId,
  pickProblem,
  pickStep,
  pointsSpent,
  scoresProblem,
  startingAbilities,
} from '~/utils/dnd5eBuild'
import { loreHtml } from '~/utils/loreText'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'New 5e hero · Lantern' })

const auth = useAuthStore()
const store = useCharacterStore()
const snackbar = useSnackbarStore()

const data = shallowRef<Dnd5eBuildData | null>(null)
const loadError = ref('')
const c = ref<Dnd5eCreation>(emptyCreation())
const choices = ref<Record<string, string[]>>({})
const name = ref('')
const step = ref(0)
const showErrors = ref(false)
const creating = ref(false)

const atCap = computed(() => store.loaded && store.characters.length >= MAX_CHARACTERS)

onMounted(async () => {
  store.fetchMine().catch((err) => snackbar.error(err, 'Could not load your characters'))
  try {
    const sets = await Promise.all(DND5E_BUILD_SETS.map((s) => loadDnd5e(s)))
    data.value = Object.fromEntries(DND5E_BUILD_SETS.map((s, i) => [s, sets[i]])) as Dnd5eBuildData
  } catch (err) {
    loadError.value = 'The 5e rules could not be loaded. Check your connection and reload.'
    snackbar.error(err, 'Could not load the 5e rules')
  }
})

const cls = computed(() => data.value?.classes.find((x) => x.slug === c.value.classSlug))
const species = computed(() => data.value?.species.find((x) => x.slug === c.value.speciesSlug))
const background = computed(() =>
  !data.value
    ? undefined
    : c.value.backgroundSlug === CUSTOM_BACKGROUND
      ? customBackground(c.value, data.value)
      : data.value.backgrounds.find((x) => x.slug === c.value.backgroundSlug),
)

// --- Picks ---------------------------------------------------------------------------
// The species' picks show before a background is chosen; the background's join them after.
const picks = computed<Dnd5ePick[]>(() =>
  data.value && cls.value && species.value ? creationPicks(c.value, choices.value, data.value) : [],
)
const subclassPicks = computed(() => picks.value.filter((p) => pickStep(p) === 'subclass'))
const speciesPicks = computed(() => picks.value.filter((p) => pickStep(p) === 'species'))
const backgroundPicks = computed(() => picks.value.filter((p) => pickStep(p) === 'background'))
const spellPicks = computed(() => picks.value.filter((p) => pickStep(p) === 'spells'))
const otherPicks = computed(() => picks.value.filter((p) => pickStep(p) === 'choices'))
const firstProblem = (list: Dnd5ePick[]) => {
  for (const p of list) {
    const e = pickProblem(p, choices.value[p.key])
    if (e) return `${p.label}: ${e}`
  }
  return ''
}

// --- Steps ---------------------------------------------------------------------------
type StepId =
  | 'class'
  | 'subclass'
  | 'species'
  | 'background'
  | 'abilities'
  | 'choices'
  | 'equipment'
  | 'spells'
  | 'review'
const STEP_LABEL: Record<StepId, string> = {
  class: 'Class',
  subclass: 'Subclass',
  species: 'Species',
  background: 'Background',
  abilities: 'Abilities',
  choices: 'Skills & choices',
  equipment: 'Equipment',
  spells: 'Spells',
  review: 'Review',
}
/** A subclass that starts before the class's subclass level can be taken now, after Species. */
const earlySubclass = computed(
  () =>
    !!cls.value &&
    !!data.value &&
    cls.value.subclassLevel > 1 &&
    earlySubclasses(cls.value, data.value).length > 0,
)
const steps = computed<StepId[]>(() => [
  'class',
  ...(cls.value?.subclassLevel === 1 ? (['subclass'] as const) : []),
  'species',
  ...(earlySubclass.value ? (['subclass'] as const) : []),
  'background',
  'abilities',
  'choices',
  'equipment',
  ...(cls.value?.spellcasting || spellPicks.value.length ? (['spells'] as const) : []),
  'review',
])
const stepId = computed<StepId>(() => steps.value[step.value] ?? 'class')
/** Earlier steps' picks this step's choices broke: asked here, so no step sends the player back. */
const clashes = computed(() =>
  clashPicks(picks.value, choices.value, (s) => steps.value.indexOf(s), step.value),
)
const clashKeys = computed(() => new Set(clashes.value.map((p) => p.key)))
const settled = (list: Dnd5ePick[]) => list.filter((p) => !clashKeys.value.has(p.key))
/** The clashes shown on this step, kept once answered so the pick doesn't vanish under the click. */
const clashSeen = ref<{ at: number; keys: string[] }>({ at: -1, keys: [] })
watch(
  [step, clashes],
  ([at, list]) => {
    const kept = clashSeen.value.at === at ? clashSeen.value.keys : []
    clashSeen.value = { at, keys: [...new Set([...kept, ...list.map((p) => p.key)])] }
  },
  { immediate: true },
)
const clashShown = computed(() =>
  clashSeen.value.at === step.value
    ? picks.value.filter((p) => clashSeen.value.keys.includes(p.key))
    : [],
)

const stepErrors = computed<Record<StepId, string>>(() => ({
  class: cls.value ? '' : 'Choose a class',
  subclass: firstProblem(settled(subclassPicks.value)),
  species: species.value ? firstProblem(settled(speciesPicks.value)) : 'Choose a species',
  background: background.value
    ? ((data.value && customProblem(c.value, data.value)) ??
      firstProblem(settled(backgroundPicks.value)))
    : 'Choose a background',
  abilities: scoresProblem(c.value) ?? bonusProblem(c.value, background.value) ?? '',
  choices: firstProblem(settled(otherPicks.value)),
  equipment: '',
  spells: firstProblem(settled(spellPicks.value)),
  review: name.value.trim() ? '' : 'Give your hero a name',
}))
const errorAt = (i: number) =>
  (i === step.value ? firstProblem(clashes.value) : '') || (stepErrors.value[steps.value[i]!] ?? '')
const actionError = computed(() => (showErrors.value ? errorAt(step.value) : ''))

const motion = (): ScrollBehavior =>
  import.meta.client && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
const toTop = () => import.meta.client && window.scrollTo({ top: 0, behavior: motion() })

function go(to: number) {
  for (let i = 0; i < to; i++)
    if (errorAt(i)) {
      step.value = i
      showErrors.value = true
      toTop()
      return
    }
  showErrors.value = false
  step.value = to
  toTop()
}

const selectionSummary = computed(() =>
  [species.value?.name, background.value?.name, cls.value?.name].filter(Boolean).join(' · '),
)

// --- Class ---------------------------------------------------------------------------
const detailEl = ref<HTMLElement | null>(null)
function chooseClass(slug: string) {
  if (slug !== c.value.classSlug) {
    c.value.classSlug = slug
    c.value.method = 'standard'
    c.value.base = { ...(SUGGESTED_ARRAY[slug] ?? c.value.base) }
    c.value.equipment.class = 'A'
    choices.value = {}
    suggestBonus()
  }
  void nextTick(() => detailEl.value?.scrollIntoView({ behavior: motion(), block: 'start' }))
}
const tagline = (k: Dnd5eClassDef) =>
  `${k.primaryAbility.abilities.join(k.primaryAbility.all ? ' & ' : ' or ')} · d${k.hitDie}${k.spellcasting ? ' · spells' : ''}`
const castingWord = {
  full: 'Full caster',
  half: 'Half caster',
  third: 'Third caster',
  pact: 'Pact Magic',
}
const levelOne = computed(() => (cls.value?.features ?? []).filter((f) => f.level === 1))
const sources = useDnd5eSourceFilter()
/** Records the source filter shows, plus the one already chosen. */
const shown = <T extends { slug: string; source: Dnd5eSourceBook }>(list: T[], chosen?: string) =>
  list.filter((r) => sources.shows(r.source) || r.slug === chosen)
const classCards = computed(() => shown(data.value?.classes ?? [], c.value.classSlug))
const subclasses = computed(() =>
  shown((data.value?.subclasses ?? []).filter((s) => s.class === c.value.classSlug)),
)
const earlyNames = computed(() =>
  subclasses.value
    .filter((s) => cls.value && s.features.some((f) => f.level < cls.value!.subclassLevel))
    .map((s) => s.name),
)
const prose = (r: { text?: string; summary?: string }) => r.text ?? r.summary ?? ''
const sourceNote = (r: { srd: boolean; source: Dnd5eSourceBook }) =>
  r.srd ? 'SRD 5.2.1' : (dnd5eSource(r.source)?.short ?? r.source)
function featureMeta(f: Dnd5eFeature) {
  const bits = [
    f.activation
      ? {
          action: 'Action',
          bonus: 'Bonus Action',
          reaction: 'Reaction',
          free: 'Free',
          magic: 'Magic action',
          special: 'Special',
        }[f.activation]
      : '',
    f.uses
      ? `uses: ${String(f.uses.count).replace('column:', '')} per ${f.uses.recharge === 'short' ? 'Short Rest' : f.uses.recharge === 'long' ? 'Long Rest' : f.uses.recharge}`
      : '',
    f.dice && !f.dice.startsWith('column:') ? f.dice : '',
  ]
  return bits.filter(Boolean).join(' · ')
}

// --- Species and background ----------------------------------------------------------
const speciesCards = computed(() =>
  shown(data.value?.species ?? [], c.value.speciesSlug).map((s) => ({
    id: s.slug,
    name: s.name,
    meta: [s.sizes.join(' or '), `Speed ${s.speed} ft`, sourceNote(s)].join(' · '),
    text: prose(s) || s.traits.map((t) => `**${t.name}.** ${prose(t)}`).join('\n\n'),
  })),
)
const speciesPick = computed({
  get: () => (c.value.speciesSlug ? [c.value.speciesSlug] : []),
  set: (v: string[]) => {
    c.value.speciesSlug = v[0] ?? ''
    choices.value = Object.fromEntries(
      Object.entries(choices.value).filter(([k]) => !k.startsWith('L1:species')),
    )
  },
})
const featName = (slug: string) => data.value?.feats.find((f) => f.slug === slug)?.name ?? slug
/** "Magic Initiate (Cleric)", "Survivor or a Dark Gift feat". */
const backgroundFeat = (b: {
  feat: { slug: string; option?: string }
  featChoice?: { category?: string[] }
}) =>
  [
    `${featName(b.feat.slug)}${b.feat.option ? ` (${b.feat.option})` : ''}`,
    ...(b.featChoice?.category ?? []).map(
      (k) => `a ${DND5E_FEAT_CATEGORY_NAME[k as keyof typeof DND5E_FEAT_CATEGORY_NAME]} feat`,
    ),
  ].join(' or ')
const backgroundCards = computed(() =>
  shown(data.value?.backgrounds ?? [], c.value.backgroundSlug)
    .map((b) => ({
      id: b.slug,
      name: b.name,
      meta: [
        b.abilities.join(', '),
        backgroundFeat(b),
        b.skills.join(', '),
        b.tool ?? b.toolChoice?.from?.join(' or ') ?? '',
        sourceNote(b),
      ]
        .filter(Boolean)
        .join(' · '),
      text: prose(b),
    }))
    .concat(
      !sources.shows('SRD 5.2.1') && c.value.backgroundSlug !== CUSTOM_BACKGROUND
        ? []
        : [
            {
              id: CUSTOM_BACKGROUND,
              name: 'Custom background',
              meta: 'Your own: three abilities, an Origin feat, two skills, a tool, 50 GP of gear · SRD 5.2.1',
              text: 'Make your own background (SRD 5.2.1 p. 193): name it, choose the three abilities it raises, one Origin feat, two skills and one tool, and spend 50 GP on equipment (no Martial weapons or armor), or keep the gold.',
            },
          ],
    ),
)

// --- Custom background (SRD 5.2.1 p. 193) ----------------------------------------------
const NO_CUSTOM = { name: '', abilities: [] as Dnd5eAbility[], gear: [] as string[] }
/** The custom background being made; the Background step creates it when it's picked. */
const custom = computed(() => c.value.custom ?? NO_CUSTOM)
function toggleCustomAbility(a: Dnd5eAbility) {
  const list = custom.value.abilities
  custom.value.abilities = list.includes(a)
    ? list.filter((x) => x !== a)
    : list.length < 3
      ? [...list, a]
      : list
  if (custom.value.abilities.length === 3) suggestBonus()
  else c.value.bonus = {}
}
const shop = computed(() => (data.value ? customGearOptions(data.value) : []))
const gearSpent = computed(() =>
  custom.value.gear.reduce(
    (n, slug) => n + (shop.value.find((g) => g.slug === slug)?.cost ?? 0),
    0,
  ),
)
const money = (cp: number) =>
  cp >= 100 && cp % 100 === 0
    ? `${cp / 100} gp`
    : cp >= 10 && cp % 10 === 0
      ? `${cp / 10} sp`
      : `${cp} cp`
const gearCards = computed(() =>
  shop.value.map((g) => ({
    id: g.slug,
    name: g.name,
    meta: `${money(g.cost)} · ${g.kind === 'weapon' ? 'Simple weapon' : g.kind}`,
    ...(!custom.value.gear.includes(g.slug) && gearSpent.value + g.cost > CUSTOM_GEAR_CP
      ? { disabled: 'Over 50 GP' }
      : {}),
  })),
)
const backgroundPick = computed({
  get: () => (c.value.backgroundSlug ? [c.value.backgroundSlug] : []),
  set: (v: string[]) => {
    c.value.backgroundSlug = v[0] ?? ''
    c.value.equipment.background = 'A'
    choices.value = Object.fromEntries(
      Object.entries(choices.value).filter(([k]) => !k.startsWith('L1:background')),
    )
    if (c.value.backgroundSlug === CUSTOM_BACKGROUND) {
      c.value.custom ??= { name: '', abilities: [], gear: [] }
      c.value.bonus = {}
    } else suggestBonus()
    dropClashes()
  },
})

/**
 * Earlier picks a new background makes impossible (a species skill the background now gives)
 * are taken off, so the Background step asks them again instead of carrying a pick that can't
 * stand.
 */
function dropClashes() {
  if (!data.value || !cls.value || !species.value) return
  const next = { ...choices.value }
  for (const p of creationPicks(c.value, next, data.value)) {
    const values = next[p.key]
    if (!values?.length || p.key.startsWith('L1:background')) continue
    const ok = values.filter((v) => !p.options.find((o) => o.id === v)?.disabled)
    if (ok.length !== values.length) next[p.key] = ok
  }
  choices.value = next
}

// --- Abilities -----------------------------------------------------------------------
/** +2 and +1 to the background's abilities that matter most to the class. */
function suggestBonus() {
  const bg = background.value
  if (!bg) return (c.value.bonus = {})
  const order = [...(cls.value?.primaryAbility.abilities ?? []), 'CON', 'DEX', 'WIS']
  const rank = (a: string) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a))
  const [a, b] = [...bg.abilities].sort((x, y) => rank(x) - rank(y))
  c.value.bonus = { [a!]: 2, [b!]: 1 }
}
const bonusMode = computed({
  get: () => (Object.values(c.value.bonus).filter(Boolean).length === 3 ? 'even' : 'split'),
  set: (mode: 'even' | 'split') => {
    const bg = background.value
    if (!bg) return
    if (mode === 'even') c.value.bonus = Object.fromEntries(bg.abilities.map((a) => [a, 1]))
    else suggestBonus()
  },
})
const BONUS_STEPS = [2, 1] as const
const bonusAt = (n: 1 | 2) =>
  (Object.entries(c.value.bonus).find(([, v]) => v === n)?.[0] ?? '') as Dnd5eAbility | ''
function setBonus(n: 1 | 2, a: string) {
  const other = bonusAt(n === 2 ? 1 : 2)
  const next: Partial<Record<Dnd5eAbility, number>> = { [a]: n }
  if (other && other !== a) next[other] = n === 2 ? 1 : 2
  c.value.bonus = next
}
function setMethod(m: Dnd5eCreation['method']) {
  if (m === c.value.method) return
  c.value.method = m
  if (m === 'standard') c.value.base = { ...(SUGGESTED_ARRAY[c.value.classSlug] ?? c.value.base) }
  if (m === 'pointBuy') c.value.base = { STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 }
}
/** Standard Array: picking a score another ability holds swaps the two. */
function setStandard(a: Dnd5eAbility, value: number) {
  const holder = DND5E_ABILITIES.find((x) => x !== a && c.value.base[x] === value)
  if (holder) c.value.base[holder] = c.value.base[a]
  c.value.base[a] = value
}
function stepPoint(a: Dnd5eAbility, by: 1 | -1) {
  const next = c.value.base[a] + by
  if (next < 8 || next > 15) return
  const cost = (POINT_BUY_COST[next] ?? 0) - (POINT_BUY_COST[c.value.base[a]] ?? 0)
  if (by === 1 && pointsSpent(c.value) + cost > POINT_BUY_BUDGET) return
  c.value.base[a] = next
}
/** Random Generation: 4d6, the highest three, six times, in ability order. */
function rollScores() {
  for (const a of DND5E_ABILITIES) {
    const dice = [1, 2, 3, 4].map(() => rollDie(6)).sort((x, y) => y - x)
    c.value.base[a] = dice[0]! + dice[1]! + dice[2]!
  }
}
function setManual(a: Dnd5eAbility, event: Event) {
  c.value.base[a] = Math.trunc(Number((event.target as HTMLInputElement).value) || 0)
}
const finalScores = computed(() => startingAbilities(c.value))

// --- Equipment -----------------------------------------------------------------------
const toolPick = (k: string) => choices.value[k]?.[0]
const classGear = computed(() =>
  (cls.value?.equipment ?? []).map((e) => ({
    ...e,
    preview: data.value
      ? parseEquipment(e.items, data.value, { cls: toolPick('L1:class:tool') })
      : null,
  })),
)
const backgroundGear = computed(() =>
  (background.value?.equipment ?? []).map((e) => ({
    ...e,
    preview: data.value
      ? parseEquipment(e.items, data.value, { background: toolPick('L1:background:tool') })
      : null,
  })),
)

// --- Review and create ---------------------------------------------------------------
const built = computed(() => {
  if (!data.value || clashes.value.length || steps.value.slice(0, -1).some((_, i) => errorAt(i)))
    return null
  try {
    return buildDnd5eSheet(c.value, choices.value, data.value)
  } catch {
    return null
  }
})

async function create() {
  showErrors.value = true
  const first = steps.value.findIndex((_, i) => errorAt(i))
  if (first >= 0 || !built.value) {
    if (first >= 0) step.value = first
    toTop()
    return
  }
  creating.value = true
  try {
    const created = await store.create('dnd5e', name.value.trim(), built.value)
    snackbar.show(`${created.name} is ready for adventure`)
    await navigateTo(`/character/${created.id}`)
  } catch (err) {
    snackbar.error(err, 'Could not create the character')
  } finally {
    creating.value = false
  }
}

function jumpToProblem() {
  const list =
    stepId.value === 'species'
      ? speciesPicks.value
      : stepId.value === 'background'
        ? backgroundPicks.value
        : stepId.value === 'spells'
          ? spellPicks.value
          : stepId.value === 'choices'
            ? otherPicks.value
            : []
  const p = [...clashes.value, ...list].find((x) => pickProblem(x, choices.value[x.key]))
  if (!p) return
  const id = pickElementId(p.key)
  document.getElementById(id)?.scrollIntoView({ behavior: motion(), block: 'start' })
  document.getElementById(`${id}-h`)?.focus({ preventScroll: true })
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <NuxtLink to="/characters" class="back small">← Characters</NuxtLink>
        <h1>New 5e hero</h1>
        <p>
          Build a level 1 hero step by step from the 2024 rules, or
          <NuxtLink to="/characters?blank=dnd5e">start a blank sheet</NuxtLink> you fill in
          yourself.
        </p>
      </div>
      <span class="badge badge--dnd5e">5e (2024)</span>
    </header>

    <div v-if="auth.isSuspended" class="notice">
      <strong>Your account is suspended</strong>
      You can’t create characters right now.
    </div>
    <div v-else-if="atCap" class="notice">
      <strong>All {{ MAX_CHARACTERS }} slots are in use</strong>
      Delete a character to make room for a new hero.
    </div>
    <div v-else-if="loadError" class="notice notice--error" role="alert">{{ loadError }}</div>
    <p v-else-if="!data" class="muted" aria-live="polite">Loading the 5e rules…</p>

    <template v-else>
      <nav aria-label="Hero builder steps">
        <ol class="steps">
          <li v-for="(s, i) in steps" :key="s">
            <button
              type="button"
              :aria-current="i === step ? 'step' : undefined"
              :class="{ done: i < step && !errorAt(i) }"
              :aria-label="`Step ${i + 1} of ${steps.length}: ${STEP_LABEL[s]}${i < step && !errorAt(i) ? ', done' : ''}`"
              @click="go(i)"
            >
              <span class="steps__n">{{ i < step && !errorAt(i) ? '✓' : i + 1 }}</span>
              <span class="steps__label">{{ STEP_LABEL[s] }}</span>
            </button>
          </li>
        </ol>
      </nav>
      <div class="source-bar"><Dnd5eSourceFilter /></div>
      <p v-if="actionError" class="step-error" role="alert">
        <button type="button" class="jump" @click="jumpToProblem">{{ actionError }}</button>
      </p>

      <!-- Class -------------------------------------------------------------- -->
      <section v-if="stepId === 'class'" class="section stack" aria-labelledby="cls-h">
        <div class="section-head">
          <h2 id="cls-h">Choose your class</h2>
          <span class="small muted">Primary ability · Hit Die</span>
        </div>
        <div class="heroes">
          <NimbleHeroCard
            v-for="k in classCards"
            :key="k.slug"
            :slug="k.slug"
            :name="k.name"
            :tagline="tagline(k)"
            :badge="k.srd ? undefined : sourceNote(k)"
            :selected="k.slug === c.classSlug"
            @select="chooseClass(k.slug)"
          >
            <template #art><Dnd5eSigil :slug="k.slug" :size="76" /></template>
          </NimbleHeroCard>
        </div>

        <article v-if="cls" ref="detailEl" class="panel detail" aria-live="polite">
          <div class="detail__head">
            <div class="detail__sigil"><Dnd5eSigil :slug="cls.slug" :size="52" /></div>
            <div>
              <h3 class="detail__name">{{ cls.name }}</h3>
              <p class="small muted">{{ sourceNote(cls) }}</p>
            </div>
          </div>
          <dl class="facts">
            <div>
              <dt>Hit Die</dt>
              <dd>d{{ cls.hitDie }} · {{ cls.hitDie }} + CON at level 1</dd>
            </div>
            <div>
              <dt>Primary ability</dt>
              <dd>
                {{ cls.primaryAbility.abilities.join(cls.primaryAbility.all ? ' and ' : ' or ') }}
              </dd>
            </div>
            <div>
              <dt>Saving throws</dt>
              <dd>{{ cls.saves.join(', ') }}</dd>
            </div>
            <div>
              <dt>Skills</dt>
              <dd>Choose {{ cls.skills.count }}</dd>
            </div>
            <div>
              <dt>Armor</dt>
              <dd>{{ cls.armor.join(', ') || 'None' }}</dd>
            </div>
            <div>
              <dt>Weapons</dt>
              <dd>{{ cls.weapons.join(', ') }}</dd>
            </div>
            <div v-if="cls.spellcasting">
              <dt>Spellcasting</dt>
              <dd>{{ castingWord[cls.spellcasting.kind] }} · {{ cls.spellcasting.ability }}</dd>
            </div>
            <div>
              <dt>Subclass</dt>
              <dd>At level {{ cls.subclassLevel }}</dd>
            </div>
          </dl>
          <div class="detail__cols">
            <div class="stack" style="gap: 8px">
              <h4 class="caps">Level 1</h4>
              <details v-for="f in levelOne" :key="f.name" class="gain">
                <summary>
                  <strong>{{ f.name }}</strong>
                  <span v-if="featureMeta(f)" class="small muted"> · {{ featureMeta(f) }}</span>
                </summary>
                <!-- eslint-disable-next-line vue/no-v-html -- loreHtml escapes everything first -->
                <div class="gain__body" v-html="loreHtml(prose(f))" />
              </details>
            </div>
            <div class="stack" style="gap: 8px">
              <h4 class="caps">Subclasses · chosen at level {{ cls.subclassLevel }}</h4>
              <p v-if="earlyNames.length" class="small muted">
                {{ earlyNames.join(', ') }} can be chosen at level 1 instead, after Species.
              </p>
              <details v-for="s in subclasses" :key="s.slug" class="gain">
                <summary>
                  <strong>{{ s.name }}</strong>
                  <span class="small muted"> · {{ sourceNote(s) }}</span>
                </summary>
                <p class="small">{{ s.summary ?? s.features.map((f) => f.name).join(', ') }}</p>
              </details>
            </div>
          </div>
        </article>
      </section>

      <!-- Subclass (only when level 1 offers one) ------------------------------ -->
      <section v-else-if="stepId === 'subclass'" class="section stack" aria-labelledby="sub-h">
        <div class="section-head"><h2 id="sub-h">Choose your subclass</h2></div>
        <p v-if="cls && cls.subclassLevel > 1" class="small muted">
          Optional: most {{ cls.name }} subclasses are chosen at level {{ cls.subclassLevel }}.
        </p>
        <Dnd5ePickField
          v-for="p in subclassPicks"
          :key="p.key"
          v-model="choices[p.key]"
          :pick="p"
          :show-errors="showErrors"
        />
      </section>

      <!-- Species ------------------------------------------------------------ -->
      <section v-else-if="stepId === 'species'" class="section stack" aria-labelledby="sp-h">
        <div class="section-head"><h2 id="sp-h">Choose your species</h2></div>
        <Pf2eOptionCards v-model="speciesPick" :options="speciesCards" label="Species" />
        <div v-if="species && speciesPicks.length" class="panel stack">
          <h3>{{ species.name }} choices</h3>
          <Dnd5ePickField
            v-for="p in speciesPicks"
            :key="p.key"
            v-model="choices[p.key]"
            :pick="p"
            :show-errors="showErrors"
          />
        </div>
      </section>

      <!-- Background --------------------------------------------------------- -->
      <section v-else-if="stepId === 'background'" class="section stack" aria-labelledby="bg-h">
        <div class="section-head"><h2 id="bg-h">Choose your background</h2></div>
        <p class="small muted">
          A background gives +2/+1 or +1/+1/+1 among its three abilities (set on the next step), an
          Origin feat, two skills, a tool and starting equipment.
        </p>
        <Pf2eOptionCards v-model="backgroundPick" :options="backgroundCards" label="Backgrounds" />
        <div v-if="c.backgroundSlug === CUSTOM_BACKGROUND" class="panel stack">
          <h3>Your background</h3>
          <div class="field">
            <label for="bg-custom-name">Background name</label>
            <input
              id="bg-custom-name"
              v-model="custom.name"
              class="input"
              maxlength="60"
              placeholder="e.g. Lighthouse Keeper"
            />
          </div>
          <div class="stack" style="gap: 8px">
            <span class="small"
              ><strong>Three abilities</strong> it raises (+2/+1 or +1/+1/+1 on the next step)</span
            >
            <div class="chips" role="group" aria-label="Background abilities">
              <button
                v-for="a in DND5E_ABILITIES"
                :key="a"
                type="button"
                class="chip"
                :aria-pressed="custom.abilities.includes(a)"
                :aria-disabled="!custom.abilities.includes(a) && custom.abilities.length >= 3"
                @click="toggleCustomAbility(a)"
              >
                {{ DND5E_ABILITY_NAME[a] }}
              </button>
            </div>
          </div>
          <div class="stack" style="gap: 8px">
            <span class="small" aria-live="polite">
              <strong>Equipment</strong>: {{ money(gearSpent) }} spent,
              {{ Math.floor((CUSTOM_GEAR_CP - gearSpent) / 100) }} gp left as gold (option A on the
              Equipment step; option B keeps all 50 GP)
            </span>
            <Pf2eOptionCards
              v-model="custom.gear"
              :options="gearCards"
              label="Background equipment"
              multiple
              compact
            />
          </div>
        </div>
        <div v-if="background && backgroundPicks.length" class="panel stack">
          <h3>{{ background.name }} choices</h3>
          <Dnd5ePickField
            v-for="p in backgroundPicks"
            :key="p.key"
            v-model="choices[p.key]"
            :pick="p"
            :show-errors="showErrors"
          />
        </div>
      </section>

      <!-- Abilities ---------------------------------------------------------- -->
      <section v-else-if="stepId === 'abilities'" class="section stack" aria-labelledby="ab-h">
        <div class="section-head"><h2 id="ab-h">Ability scores</h2></div>
        <div class="panel stack">
          <div class="chips" role="group" aria-label="How to make the scores">
            <button
              type="button"
              class="chip"
              :aria-pressed="c.method === 'standard'"
              @click="setMethod('standard')"
            >
              Standard Array
            </button>
            <button
              type="button"
              class="chip"
              :aria-pressed="c.method === 'pointBuy'"
              @click="setMethod('pointBuy')"
            >
              Point Cost
            </button>
            <button
              type="button"
              class="chip"
              :aria-pressed="c.method === 'manual'"
              @click="setMethod('manual')"
            >
              Rolled or typed
            </button>
          </div>
          <p v-if="c.method === 'standard'" class="small muted">
            Assign 15, 14, 13, 12, 10 and 8, one each. They start as the {{ cls?.name }}’s suggested
            assignment.
          </p>
          <p v-else-if="c.method === 'pointBuy'" class="small" aria-live="polite">
            <strong>{{ POINT_BUY_BUDGET - pointsSpent(c) }}</strong> of
            {{ POINT_BUY_BUDGET }} points left · scores 8–15
          </p>
          <div v-else class="row" style="gap: 10px">
            <button type="button" class="btn btn--ghost btn--sm" @click="rollScores">
              Roll 4d6 for each (drop the lowest)
            </button>
            <span class="small muted">Or type the scores you rolled at the table (3–18).</span>
          </div>
          <div class="abilities">
            <div v-for="a in DND5E_ABILITIES" :key="a" class="ability-cell">
              <label :for="`ab-${a}`" class="caps">{{ DND5E_ABILITY_NAME[a] }}</label>
              <select
                v-if="c.method === 'standard'"
                :id="`ab-${a}`"
                class="input"
                :value="c.base[a]"
                @change="setStandard(a, Number(($event.target as HTMLSelectElement).value))"
              >
                <option v-for="v in STANDARD_ARRAY" :key="v" :value="v">{{ v }}</option>
              </select>
              <div
                v-else-if="c.method === 'pointBuy'"
                class="row"
                style="gap: 6px; flex-wrap: nowrap"
              >
                <button
                  type="button"
                  class="step step--sm"
                  :aria-label="`Lower ${DND5E_ABILITY_NAME[a]}`"
                  :disabled="c.base[a] <= 8"
                  @click="stepPoint(a, -1)"
                >
                  −
                </button>
                <strong :id="`ab-${a}`" aria-live="polite">{{ c.base[a] }}</strong>
                <button
                  type="button"
                  class="step step--sm"
                  :aria-label="`Raise ${DND5E_ABILITY_NAME[a]}`"
                  :disabled="c.base[a] >= 15"
                  @click="stepPoint(a, 1)"
                >
                  +
                </button>
              </div>
              <input
                v-else
                :id="`ab-${a}`"
                class="input"
                type="number"
                inputmode="numeric"
                min="3"
                max="18"
                :value="c.base[a]"
                @input="setManual(a, $event)"
              />
              <span class="small muted">
                {{ finalScores[a] }} ({{ sign(abilityMod(finalScores[a])) }})<template
                  v-if="c.bonus[a]"
                >
                  · +{{ c.bonus[a] }} background</template
                >
              </span>
            </div>
          </div>
        </div>
        <div v-if="background" class="panel stack">
          <h3>{{ background.name }} increases</h3>
          <p class="small muted">
            Increase {{ background.abilities.join(', ') }}: one by 2 and another by 1, or all three
            by 1. None can go above 20.
          </p>
          <div class="chips" role="group" aria-label="Background increases">
            <button
              type="button"
              class="chip"
              :aria-pressed="bonusMode === 'split'"
              @click="bonusMode = 'split'"
            >
              +2 / +1
            </button>
            <button
              type="button"
              class="chip"
              :aria-pressed="bonusMode === 'even'"
              @click="bonusMode = 'even'"
            >
              +1 / +1 / +1
            </button>
          </div>
          <div v-if="bonusMode === 'split'" class="row" style="gap: 16px">
            <div v-for="n in BONUS_STEPS" :key="n" class="field">
              <label :for="`bonus-${n}`">+{{ n }}</label>
              <select
                :id="`bonus-${n}`"
                class="input"
                :value="bonusAt(n)"
                @change="setBonus(n, ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="a in background.abilities" :key="a" :value="a">
                  {{ DND5E_ABILITY_NAME[a] }}
                </option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <!-- Skills & choices --------------------------------------------------- -->
      <section v-else-if="stepId === 'choices'" class="section stack" aria-labelledby="ch-h">
        <div class="section-head"><h2 id="ch-h">Skills &amp; choices</h2></div>
        <p class="small muted">
          A skill or tool you already have from your background or species can’t be picked again;
          where a feature would give it twice, you pick another.
        </p>
        <div class="panel stack">
          <Dnd5ePickField
            v-for="p in otherPicks"
            :key="p.key"
            v-model="choices[p.key]"
            :pick="p"
            :show-errors="showErrors"
          />
        </div>
      </section>

      <!-- Equipment ---------------------------------------------------------- -->
      <section v-else-if="stepId === 'equipment'" class="section stack" aria-labelledby="eq-h">
        <div class="section-head"><h2 id="eq-h">Starting equipment</h2></div>
        <fieldset class="panel stack gear">
          <legend class="caps">{{ cls?.name }}</legend>
          <label v-for="e in classGear" :key="e.option" class="gear__opt">
            <input v-model="c.equipment.class" type="radio" name="gear-class" :value="e.option" />
            <span>
              <strong>Option {{ e.option }}</strong>
              <span class="small">{{ e.items }}</span>
            </span>
          </label>
        </fieldset>
        <fieldset v-if="background" class="panel stack gear">
          <legend class="caps">{{ background.name }}</legend>
          <label v-for="e in backgroundGear" :key="e.option" class="gear__opt">
            <input
              v-model="c.equipment.background"
              type="radio"
              name="gear-background"
              :value="e.option"
            />
            <span>
              <strong>Option {{ e.option }}</strong>
              <span class="small">{{ e.items }}</span>
            </span>
          </label>
        </fieldset>
        <p class="small muted">
          Armor and a shield you’re trained in are worn and set your AC; buy anything else on the
          sheet with the gold.
        </p>
      </section>

      <!-- Spells ------------------------------------------------------------- -->
      <section v-else-if="stepId === 'spells'" class="section stack" aria-labelledby="sps-h">
        <div class="section-head"><h2 id="sps-h">Spells</h2></div>
        <p v-if="!spellPicks.length" class="small muted">No spells to pick at level 1.</p>
        <div v-else class="panel stack">
          <Dnd5ePickField
            v-for="p in spellPicks"
            :key="p.key"
            v-model="choices[p.key]"
            :pick="p"
            :show-errors="showErrors"
          />
        </div>
      </section>

      <!-- Review ------------------------------------------------------------- -->
      <section v-else class="section stack" aria-labelledby="rev-h">
        <div class="section-head"><h2 id="rev-h">Name &amp; review</h2></div>
        <div class="panel field">
          <label for="hero-name">Hero name</label>
          <input
            id="hero-name"
            v-model="name"
            class="input"
            maxlength="80"
            required
            aria-required="true"
            placeholder="Required, e.g. Kessa Ironvale"
          />
        </div>
        <article v-if="built" class="panel stack">
          <div>
            <h3 class="hero-name">{{ name || 'Your hero' }}</h3>
            <p class="small muted">
              Level 1 {{ built.lineage }} {{ built.class }} · {{ built.background }}
            </p>
          </div>
          <div class="tiles">
            <div v-for="a in DND5E_ABILITIES" :key="a" class="tile">
              <span class="tile__label">{{ a }}</span>
              <span class="tile__value">{{ sign(abilityMod(built.abilities[a])) }}</span>
              <span class="small muted">{{ built.abilities[a] }}</span>
            </div>
            <div class="tile">
              <span class="tile__label">HP</span><span class="tile__value">{{ built.hpMax }}</span>
            </div>
            <div class="tile">
              <span class="tile__label">AC</span><span class="tile__value">{{ built.ac }}</span>
            </div>
            <div class="tile">
              <span class="tile__label">Initiative</span
              ><span class="tile__value">{{ sign(built.initMod) }}</span>
            </div>
            <div class="tile">
              <span class="tile__label">Speed</span
              ><span class="tile__value">{{ built.speed }}</span>
            </div>
            <div class="tile">
              <span class="tile__label">Passive Perception</span
              ><span class="tile__value">{{ built.passivePerception }}</span>
            </div>
          </div>
          <div class="cols">
            <div class="stack" style="gap: 8px">
              <template
                v-for="f in built.features.filter((x) => x.from === 'Summary')"
                :key="f.name"
              >
                <h4 class="caps">{{ f.name }}</h4>
                <p class="small pre">{{ f.desc }}</p>
              </template>
              <h4 class="caps">Gear</h4>
              <p class="small">
                {{
                  built.inventory
                    .map(
                      (i) =>
                        (i.qty !== '1' ? `${i.qty} × ${i.name}` : i.name) +
                        (i.worn ? ' (worn)' : ''),
                    )
                    .join(', ') || 'None'
                }}
                · {{ built.coins?.gp ?? 0 }} gp
              </p>
            </div>
            <div class="stack" style="gap: 8px">
              <h4 class="caps">Features &amp; feats</h4>
              <p
                v-for="f in built.features.filter((x) => x.from && x.from !== 'Summary')"
                :key="`${f.from}${f.name}`"
                class="small"
              >
                <strong>{{ f.name }}</strong
                ><span class="muted"> · {{ f.from }}</span>
              </p>
            </div>
          </div>
        </article>
      </section>

      <section v-if="clashShown.length" class="panel stack" aria-labelledby="clash-h">
        <h3 id="clash-h">Choose again</h3>
        <p class="small muted">
          Your choices here give something an earlier pick already took, so that pick asks again.
        </p>
        <Dnd5ePickField
          v-for="p in clashShown"
          :key="p.key"
          v-model="choices[p.key]"
          :pick="p"
          :show-errors="showErrors"
        />
      </section>

      <div class="actions">
        <button v-if="step > 0" type="button" class="btn btn--ghost" @click="go(step - 1)">
          Back
        </button>
        <div class="grow actions__status" aria-live="polite">
          <span v-if="actionError" class="actions__error">{{ actionError }}</span>
          <span v-else-if="selectionSummary" class="actions__summary">{{ selectionSummary }}</span>
        </div>
        <button v-if="step < steps.length - 1" type="button" class="btn" @click="go(step + 1)">
          Next: {{ STEP_LABEL[steps[step + 1]!] }}
        </button>
        <button v-else type="button" class="btn" :disabled="creating" @click="create">
          {{ creating ? 'Creating…' : 'Create hero' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.back {
  display: inline-block;
  margin-bottom: 8px;
  color: var(--accent-text);
  text-decoration: none;
  font-weight: 600;
}

.source-bar {
  display: flex;
  justify-content: flex-end;
}

.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  button {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 14px 0 6px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: transparent;
    color: var(--page-soft);
    font-weight: 600;
    font-size: 14px;

    &[aria-current='step'] {
      border-color: var(--accent);
      color: var(--page-text);
      background: var(--accent-tint);

      .steps__n {
        background: var(--accent);
        color: var(--on-accent);
        border-color: var(--accent);
      }
    }

    &.done .steps__n {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent) 22%, transparent);
      color: var(--accent-text);
    }
  }
}

.steps__n {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line-strong);
  font-size: 13px;
}

@media (max-width: 720px) {
  // Number chips only; the current step shows its label.
  .steps {
    gap: 6px;

    button {
      padding: 0 6px;
    }

    button[aria-current='step'] {
      padding-right: 12px;
    }
  }

  .steps__label {
    display: none;
  }

  .steps button[aria-current='step'] .steps__label {
    display: inline;
  }
}

.step-error {
  margin: 0;

  .jump {
    border: 0;
    background: none;
    padding: 0;
    color: var(--danger-text);
    font: inherit;
    font-weight: 600;
    text-align: left;
    text-decoration: underline;
    cursor: pointer;
  }
}

.heroes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(190px, 100%), 1fr));
  gap: 14px;

  @media (max-width: 560px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
}

.detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail__head {
  display: flex;
  align-items: center;
  gap: 14px;
}

.detail__sigil {
  flex: none;
  width: 76px;
  height: 76px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
}

.detail__name {
  font-family: var(--font-heading);
  font-size: 24px !important;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.facts {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(170px, 100%), 1fr));
  gap: 10px;

  div {
    padding: 10px 12px;
    border-radius: min(var(--radius-panel), 10px);
    background: var(--field);
    border: 1px solid var(--line);
  }

  dt {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--page-muted);
  }

  dd {
    margin: 2px 0 0;
    font-weight: 600;
    font-size: 14px;
  }
}

.detail__cols,
.cols {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
  gap: 20px 28px;
}

.gain {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 14px;

  summary {
    cursor: pointer;
    min-height: 28px;
  }
}

.gain__body {
  margin-top: 8px;
  color: var(--page-soft);
  line-height: 1.5;

  :deep(p) {
    margin: 0 0 8px;
  }
}

.abilities {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr));
  gap: 12px;
}

.ability-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;

  label {
    font-size: 12px;
  }
}

.gear {
  border: 1px solid var(--panel-line);
  margin: 0;

  legend {
    padding: 0 6px;
  }
}

.gear__opt {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-height: 44px;
  cursor: pointer;

  input {
    margin-top: 4px;
    width: 18px;
    height: 18px;
    flex: none;
  }

  > span {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(110px, 100%), 1fr));
  gap: 10px;
}

.hero-name {
  font-family: var(--font-heading);
}

.pre {
  white-space: pre-line;
}

.actions {
  position: sticky;
  bottom: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 calc(-1 * clamp(16px, 4vw, 48px));
  padding: 12px clamp(16px, 4vw, 48px) calc(12px + env(safe-area-inset-bottom));
  background: var(--page-base);
  border-top: 1px solid var(--line);
}

.actions__status {
  min-width: 0;
  font-size: 14px;
}

.actions__error {
  color: var(--danger-text);
  font-weight: 600;
}

.actions__summary {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--page-soft);
}
</style>
