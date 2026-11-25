<script setup lang="ts">
// Pathfinder 2e hero builder, in Player Core's order (pp. 22–27): ancestry → background →
// class → attributes → skills & feats → gear → review. The rules data is fetched on open
// (`loadPf2e`); `utils/pf2eBuild.ts` checks each step and builds the level 1 sheet.
import type { Pf2eOption } from '~/components/pf2e/OptionCards.vue'
import { type Pf2eData, loadPf2e } from '~/data/pf2e'
import type { Pf2eFeatDef, Pf2eRecord } from '~/data/pf2e/types'
import { MAX_CHARACTERS } from '~/stores/character'
import type { Pf2eAttr, Pf2eCreation } from '~/types/sheets'
import { sign } from '~/utils/dice'
import {
  PF2E_ATTRS,
  PF2E_SKILL_NAMES,
  STARTING_CP,
  type Pf2eBuildData,
  type Pf2eFeatSlot,
  actionGlyph,
  ancestryBoostPlan,
  armorRank,
  attributeMods,
  backgroundBoostSlots,
  buildPf2eSheet,
  classFeatTrait,
  creationProblems,
  deityOptions,
  emptyCreation,
  featOptions,
  featSlots,
  gearCost,
  gearOptions,
  isAmmunition,
  keyAttributeOptions,
  levelOneFeatures,
  needsDeity,
  resolve,
  setSlotBoost,
  skillPlan,
  slotTaken,
  subclassChoices,
  untrainedGear,
  weaponRank,
} from '~/utils/pf2eBuild'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'New Pathfinder 2e hero · Lantern' })

const auth = useAuthStore()
const store = useCharacterStore()
const snackbar = useSnackbarStore()

const STEPS = [
  'Ancestry',
  'Background',
  'Class',
  'Attributes',
  'Skills & feats',
  'Gear',
  'Review',
] as const
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
] as const
const FEAT_LABEL: Record<Pf2eFeatSlot, string> = {
  ancestry: 'Ancestry feat',
  class: 'Class feat',
  skill: 'Skill feat',
}

const data = shallowRef<Pf2eBuildData | null>(null)
const loadError = ref('')
const step = ref(0)
const showErrors = ref(false)
const showVersatile = ref(false)
const name = ref('')
const creating = ref(false)
const c = ref<Pf2eCreation>(emptyCreation())

const atCap = computed(() => store.loaded && store.characters.length >= MAX_CHARACTERS)

onMounted(async () => {
  store.fetchMine().catch((err) => snackbar.error(err, 'Could not load your characters'))
  try {
    const sets = await Promise.all(SETS.map((s) => loadPf2e(s)))
    data.value = Object.fromEntries(SETS.map((s, i) => [s, sets[i]])) as Pick<
      Pf2eData,
      (typeof SETS)[number]
    >
  } catch (err) {
    loadError.value = 'The Pathfinder rules could not be loaded. Check your connection and reload.'
    snackbar.error(err, 'Could not load the Pathfinder rules')
  }
})

const picked = computed(() => (data.value ? resolve(c.value, data.value) : null))
const ancestry = computed(() => picked.value?.ancestry)
const background = computed(() => picked.value?.background)
const cls = computed(() => picked.value?.cls)
const deity = computed(() => picked.value?.deity)
const subclassPicks = computed(() => picked.value?.subclassPicks ?? [])

/** A single pick as the `string[]` the option cards take. */
function single(key: 'ancestry' | 'heritage' | 'background' | 'class') {
  return computed({
    get: () => (c.value[key] ? [c.value[key]] : []),
    set: (v: string[]) => (c.value[key] = v[0] ?? ''),
  })
}
function optional(key: 'deity' | 'armor' | 'shield') {
  return computed({
    get: () => (c.value[key] ? [c.value[key]!] : []),
    set: (v: string[]) => (c.value[key] = v[0]),
  })
}
const ancestryPick = single('ancestry')
const heritagePick = single('heritage')
const backgroundPick = single('background')
const classPick = single('class')
const deityPick = optional('deity')
const armorPick = optional('armor')
const shieldPick = optional('shield')

// A change upstream clears the picks that depended on it.
watch(
  () => c.value.ancestry,
  () => {
    c.value.heritage = ''
    c.value.ancestryBoosts = []
    delete c.value.feats.ancestry
  },
)
watch(
  () => c.value.heritage,
  () => delete c.value.feats.ancestry,
)
watch(
  () => c.value.freeAncestryBoosts,
  () => (c.value.ancestryBoosts = []),
)
watch(
  () => c.value.background,
  () => {
    c.value.backgroundBoosts = []
    c.value.lores = []
  },
)
watch(
  () => c.value.class,
  () => {
    c.value.keyAttribute = cls.value?.keyAttributes[0] ?? 'STR'
    c.value.subclasses = {}
    c.value.deity = undefined
    c.value.skills = []
    delete c.value.feats.class
    delete c.value.feats.skill
  },
)
// A subclass can add a key attribute (a ruffian's Strength) or settle it (a psychic's mind).
const keyOptions = computed(() =>
  cls.value ? keyAttributeOptions(cls.value, subclassPicks.value) : [],
)
watch(keyOptions, (keys) => {
  if (keys.length && !keys.includes(c.value.keyAttribute)) c.value.keyAttribute = keys[0]!
})
const wantsDeity = computed(() => !!cls.value && needsDeity(cls.value, subclassPicks.value))
watch(wantsDeity, (want) => {
  if (!want) c.value.deity = undefined
})
// Gear the new class or deity isn't trained in comes off; other changes show as a problem.
watch(
  () => [c.value.class, c.value.deity],
  () => {
    if (!data.value) return
    const untrained = untrainedGear(c.value, data.value).map((g) => g.id)
    if (c.value.armor && untrained.includes(c.value.armor)) c.value.armor = undefined
    c.value.weapons = c.value.weapons.filter((id) => !untrained.includes(id))
  },
)

const price = (cp: number) =>
  cp % 100 === 0 ? `${cp / 100} gp` : cp % 10 === 0 ? `${cp / 10} sp` : `${cp} cp`
const listOr = (xs: string[]) => xs.join(' or ')
const opt = (r: Pf2eRecord, meta?: string): Pf2eOption => ({
  id: r.id,
  name: r.name,
  meta,
  text: r.text,
  rarity: r.rarity,
  gap: r.gap,
})

// --- Ancestry ---------------------------------------------------------------
const ancestryOptions = computed(() =>
  (data.value?.ancestries ?? []).map((a) =>
    opt(
      a,
      [
        a.hp ? `HP ${a.hp}` : '',
        a.size.join('/'),
        a.speed ? `Speed ${a.speed} ft` : '',
        boostLine(ancestryBoostPlan(a, false)),
      ]
        .filter(Boolean)
        .join(' · '),
    ),
  ),
)
/** "+CON +WIS +1 free · −CHA". */
function boostLine(plan: ReturnType<typeof ancestryBoostPlan>) {
  const boosts = [...plan.fixed.map((a) => `+${a}`), plan.free ? `+${plan.free} free` : '']
  return [boosts.filter(Boolean).join(' '), plan.flaws.map((a) => `−${a}`).join(' ')]
    .filter(Boolean)
    .join(' · ')
}
const heritageOptions = computed(() => {
  const all = data.value?.heritages ?? []
  const own = all.filter((h) => h.ancestry && h.ancestry === ancestry.value?.slug)
  // A picked versatile heritage stays in view with the switch off.
  const versatile = all.filter(
    (h) => h.versatile && (showVersatile.value || h.id === c.value.heritage),
  )
  return [...own, ...versatile].map((h) => opt(h, h.versatile ? 'Versatile heritage' : undefined))
})
const boostPlan = computed(() =>
  ancestry.value ? ancestryBoostPlan(ancestry.value, c.value.freeAncestryBoosts) : null,
)
const boostSummary = computed(() => {
  const plan = boostPlan.value
  if (!plan || !ancestry.value || c.value.freeAncestryBoosts) return ''
  const parts = [
    ...plan.fixed.map((a) => `+1 ${a}`),
    ...plan.flaws.map((a) => `−1 ${a}`),
    `${plan.free} free boost${plan.free === 1 ? '' : 's'}`,
  ]
  return `${ancestry.value.name}: ${parts.join(', ')}.`
})

// --- Background -------------------------------------------------------------
const backgroundOptions = computed(() =>
  (data.value?.backgrounds ?? []).map((b) =>
    opt(
      b,
      [listOr(b.boosts), b.skills.join(', '), b.feats.join(', '), b.source.book]
        .filter(Boolean)
        .join(' · '),
    ),
  ),
)
const bgSlots = computed(() =>
  background.value ? backgroundBoostSlots(background.value, deity.value) : [],
)
const bgSlotPick = (i: number) => {
  const a = c.value.backgroundBoosts[i]
  return a ? [a] : []
}
function setBgSlot(i: number, v: Pf2eAttr[]) {
  c.value.backgroundBoosts = setSlotBoost(c.value.backgroundBoosts, bgSlots.value, i, v[0])
}

// --- Class ------------------------------------------------------------------
const RANK: Record<string, string> = {
  U: 'Untrained',
  T: 'Trained',
  E: 'Expert',
  M: 'Master',
  L: 'Legendary',
}
const classOptions = computed(() =>
  (data.value?.classes ?? []).map((k) =>
    opt(k, `Key ${listOr(k.keyAttributes)} · HP ${k.hp} + CON · ${k.source.book}`),
  ),
)
const keyPick = computed({
  get: () => [c.value.keyAttribute],
  set: (v: Pf2eAttr[]) => v[0] && (c.value.keyAttribute = v[0]),
})
const choices = computed(() => (cls.value ? subclassChoices(cls.value) : []))
const classDetail = ref<HTMLElement | null>(null)
// The class details sit below the cards: bring them into view on a pick.
watch(
  () => c.value.class,
  (id) => {
    if (id)
      void nextTick(() => classDetail.value?.scrollIntoView({ behavior: motion(), block: 'start' }))
  },
)
const deityCards = computed(() =>
  data.value
    ? deityOptions(data.value).map((d) => ({
        ...opt(
          d,
          [
            `Font ${listOr(d.divineFont)}`,
            `Skill ${d.skill.join(', ')}`,
            d.favoredWeapons.length ? `Weapon ${d.favoredWeapons.join(', ')}` : '',
            d.sanctification ? `Sanctification ${d.sanctification}` : '',
          ]
            .filter(Boolean)
            .join(' · '),
        ),
        text: `**Edicts** ${d.edicts}\n\n**Anathema** ${d.anathema}\n\n**Domains** ${d.domains.join(', ')}\n\n${d.text}`,
      }))
    : [],
)
function setSubclass(key: string, ids: string[]) {
  c.value.subclasses = { ...c.value.subclasses, [key]: ids }
}

// --- Attributes -------------------------------------------------------------
const mods = computed(() => (data.value ? attributeMods(c.value, data.value) : null))
/** Where each attribute's boosts and flaws come from, for the breakdown table. */
const breakdown = computed(() =>
  PF2E_ATTRS.map((a) => {
    const plan = boostPlan.value
    const anc =
      (plan ? [...plan.fixed, ...c.value.ancestryBoosts].filter((x) => x === a).length : 0) -
      (plan?.flaws.includes(a) ? 1 : 0)
    return {
      a,
      ancestry: anc,
      background: c.value.backgroundBoosts.filter((x) => x === a).length,
      cls: cls.value && c.value.keyAttribute === a ? 1 : 0,
      free: c.value.freeBoosts.includes(a) ? 1 : 0,
      total: mods.value?.[a] ?? 0,
    }
  }),
)
/** "Anc +1 · Bg +1 · Class +1 · Free +1", the phone's one-line breakdown. */
const sourceLine = (r: (typeof breakdown.value)[number]) =>
  [
    r.ancestry ? `Anc ${sign(r.ancestry)}` : '',
    r.background ? `Bg ${sign(r.background)}` : '',
    r.cls ? 'Class +1' : '',
    r.free ? 'Free +1' : '',
  ]
    .filter(Boolean)
    .join(' · ')

// --- Skills & feats ---------------------------------------------------------
const plan = computed(() => (data.value && cls.value ? skillPlan(c.value, data.value) : null))
const groupPicks = computed(() =>
  (plan.value?.groups ?? []).flatMap((g) =>
    c.value.skills.filter((s) => g.options.includes(s)).slice(0, g.count),
  ),
)
const freePicks = computed(() =>
  c.value.skills.filter((s) => !plan.value?.fixed.includes(s) && !groupPicks.value.includes(s)),
)
/** Picks a skill for an "either…or" choice, replacing only that choice's earlier pick. */
function pickGroup(options: string[], skill: string) {
  const before = groupPicks.value.find((s) => options.includes(s))
  c.value.skills = [...c.value.skills.filter((s) => s !== before && s !== skill), skill]
}
function toggleFree(skill: string) {
  if (c.value.skills.includes(skill)) c.value.skills = c.value.skills.filter((s) => s !== skill)
  else if (freePicks.value.length < (plan.value?.free ?? 0))
    c.value.skills = [...c.value.skills, skill]
}
const slots = computed(() => featSlots(cls.value))
const featLabel = (s: Pf2eFeatSlot) => {
  const trait = s === 'class' ? classFeatTrait(cls.value) : undefined
  return trait ? `${FEAT_LABEL[s]} (${trait.toLowerCase()})` : FEAT_LABEL[s]
}
/** Why a skill in the grid is already ticked: "background", "class choice"… */
function skillSource(s: string) {
  if (plan.value?.fixed.includes(s)) return 'already trained'
  if (groupPicks.value.includes(s)) return 'from a choice above'
  return ''
}
function setLore(i: number, value: string) {
  const lores = [...(c.value.lores ?? [])]
  lores[i] = value
  c.value.lores = Array.from(lores, (x) => x ?? '')
}
const ACTION_NAME: Record<string, string> = {
  '◆': '1 action',
  '◆◆': '2 actions',
  '◆◆◆': '3 actions',
  '↺': 'reaction',
  '◇': 'free action',
}
/** Glyphs back to words, part by part: "◇ or ◆" → "free action or 1 action". */
const glyphWords = (g: string) =>
  g
    .split(/ (to|or) /)
    .map((p) => ACTION_NAME[p] ?? p)
    .join(' ')
const featMeta = (f: Pf2eFeatDef) =>
  [
    glyphWords(actionGlyph(f.actions)),
    f.traits.join(', '),
    f.prerequisites ? `Needs ${f.prerequisites}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
const featCards = computed(
  () =>
    Object.fromEntries(
      slots.value.map((s) => [
        s,
        data.value ? featOptions(s, c.value, data.value).map((f) => opt(f, featMeta(f))) : [],
      ]),
    ) as Record<Pf2eFeatSlot, Pf2eOption[]>,
)
const featPick = (slot: Pf2eFeatSlot) => (c.value.feats[slot] ? [c.value.feats[slot]!] : [])
function setFeat(slot: Pf2eFeatSlot, ids: string[]) {
  const feats = { ...c.value.feats }
  if (ids[0]) feats[slot] = ids[0]
  else delete feats[slot]
  c.value.feats = feats
}

// --- Gear -------------------------------------------------------------------
const spent = computed(() => (data.value ? gearCost(c.value, data.value) : 0))
const gear = computed(() => (data.value ? gearOptions(data.value) : null))
const armorCards = computed(() =>
  gear.value && cls.value
    ? gear.value.armor.map((a) => ({
        ...opt(
          a,
          [
            a.category,
            `AC +${a.ac}`,
            a.dexCap !== undefined ? `Dex cap +${a.dexCap}` : '',
            a.strength ? `Str +${a.strength}` : '',
            a.checkPenalty ? `Check ${a.checkPenalty}` : '',
            a.speedPenalty ? `Speed ${a.speedPenalty} ft` : '',
            price(a.price),
          ]
            .filter(Boolean)
            .join(' · '),
        ),
        disabled:
          armorRank(cls.value!, a.category, subclassPicks.value) === 'U'
            ? `Not trained in ${a.category.toLowerCase()} armor`
            : undefined,
      }))
    : [],
)
const shieldCards = computed(() =>
  (gear.value?.shields ?? []).map((s) =>
    opt(
      s,
      [
        `AC +${s.ac}`,
        `Hardness ${s.hardness}`,
        `HP ${s.hp}`,
        s.speedPenalty ? `Speed ${s.speedPenalty} ft` : '',
        price(s.price),
      ]
        .filter(Boolean)
        .join(' · '),
    ),
  ),
)
const weaponCards = computed(() =>
  gear.value && cls.value
    ? gear.value.weapons.map((w) => ({
        ...opt(
          w,
          isAmmunition(w)
            ? `Ammunition · ${price(w.price)}`
            : `${w.category} ${w.type.toLowerCase()} · ${w.damage} ${w.damageTypes.join('/').toLowerCase()} · ${price(w.price)}`,
        ),
        disabled:
          !isAmmunition(w) && weaponRank(w, cls.value!, deity.value, subclassPicks.value) === 'U'
            ? 'Not trained'
            : undefined,
      }))
    : [],
)
const weaponPick = computed({
  get: () => c.value.weapons,
  set: (v: string[]) => (c.value.weapons = v),
})

// --- Steps, review and create -----------------------------------------------
const problems = computed(() => (data.value ? creationProblems(c.value, data.value) : null))
const stepErrors = computed<string[]>(() => {
  const p = problems.value
  if (!p) return STEPS.map(() => 'Loading the rules…')
  return [
    p.ancestry[0] ??
      (boostPlan.value && c.value.ancestryBoosts.length !== boostPlan.value.free
        ? 'Choose your free ancestry boosts'
        : ''),
    p.background[0] ?? '',
    p.class[0] ?? '',
    p.attributes[0] ?? '',
    p.skills[0] ?? '',
    p.gear[0] ?? '',
    name.value.trim() ? '' : 'Give your hero a name',
  ].map((e) => e ?? '')
})
const actionError = computed(() => (showErrors.value ? stepErrors.value[step.value] : ''))
const selectionSummary = computed(() =>
  [ancestry.value?.name, background.value?.name, cls.value?.name].filter(Boolean).join(' · '),
)

const built = computed(() => {
  if (!data.value || stepErrors.value.slice(0, 6).some(Boolean)) return null
  return buildPf2eSheet(c.value, data.value)
})

/** Smooth scrolling unless the reader asked for reduced motion. */
const motion = (): ScrollBehavior =>
  import.meta.client && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'

function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: motion(), block: 'start' })
}

/** To the top of the step, where its error shows. */
const toTop = () => import.meta.client && window.scrollTo({ top: 0, behavior: motion() })

function go(to: number) {
  for (let i = 0; i < to; i++)
    if (stepErrors.value[i]) {
      step.value = i
      showErrors.value = true
      toTop()
      return
    }
  showErrors.value = false
  step.value = to
  toTop()
}

async function create() {
  showErrors.value = true
  if (stepErrors.value.some(Boolean) || !built.value) {
    const first = stepErrors.value.findIndex(Boolean)
    if (first >= 0 && first < STEPS.length - 1) step.value = first
    toTop()
    return
  }
  creating.value = true
  try {
    const created = await store.create('pf2e', name.value.trim(), built.value)
    snackbar.show(`${created.name} is ready for adventure`)
    await navigateTo(`/character/${created.id}`)
  } catch (err) {
    snackbar.error(err, 'Could not create the character')
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <NuxtLink to="/characters" class="back small">← Characters</NuxtLink>
        <h1>New Pathfinder 2e hero</h1>
        <p>Build a level 1 hero step by step from the Player Core rules.</p>
      </div>
      <span class="badge badge--pf2e">Pathfinder 2e</span>
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
    <p v-else-if="!data" class="muted" aria-live="polite">Loading the Pathfinder rules…</p>

    <template v-else>
      <nav aria-label="Hero builder steps">
        <ol class="steps">
          <li v-for="(s, i) in STEPS" :key="s">
            <button
              type="button"
              :aria-current="i === step ? 'step' : undefined"
              :class="{ done: i < step && !stepErrors[i] }"
              :aria-label="`Step ${i + 1} of ${STEPS.length}: ${s}${i < step && !stepErrors[i] ? ', done' : ''}`"
              @click="go(i)"
            >
              <span class="steps__n">{{ i + 1 }}</span>
              <span class="steps__label">{{ s }}</span>
            </button>
          </li>
        </ol>
      </nav>
      <p v-if="actionError" class="step-error" role="alert">{{ actionError }}</p>

      <!-- 1 · Ancestry -------------------------------------------------- -->
      <section v-if="step === 0" class="section stack" aria-labelledby="anc-h">
        <div class="section-head">
          <h2 id="anc-h">Choose your ancestry</h2>
        </div>
        <p v-if="ancestry" class="small muted">
          {{ ancestry.name }} picked: its boosts and heritage are
          <button type="button" class="jump" @click="jumpTo('anc-more')">below the list ↓</button>
        </p>
        <Pf2eOptionCards v-model="ancestryPick" :options="ancestryOptions" label="Ancestries" />
        <template v-if="ancestry">
          <div id="anc-more" class="panel stack">
            <h3>Ancestry boosts</h3>
            <UiSwitch
              v-model="c.freeAncestryBoosts"
              label="Take two free boosts instead of the listed boosts and flaw"
            />
            <p v-if="boostSummary" class="small muted">{{ boostSummary }}</p>
            <Pf2eBoostPicker
              v-if="boostPlan && boostPlan.free"
              v-model="c.ancestryBoosts"
              label="Free ancestry boosts"
              :count="boostPlan.free"
              :locked="boostPlan.fixed"
              locked-label="from ancestry"
            />
          </div>
          <div class="section-head">
            <h3>{{ ancestry.name }} heritage</h3>
            <UiSwitch v-model="showVersatile" label="Show versatile heritages" />
          </div>
          <Pf2eOptionCards v-model="heritagePick" :options="heritageOptions" label="Heritages" />
        </template>
      </section>

      <!-- 2 · Background ------------------------------------------------ -->
      <section v-else-if="step === 1" class="section stack" aria-labelledby="bg-h">
        <div class="section-head">
          <h2 id="bg-h">Choose your background</h2>
        </div>
        <p v-if="!background" class="panel small muted">
          Pick a background below, then choose its two attribute boosts here.
        </p>
        <div v-else class="panel stack">
          <h3>{{ background.name }} boosts</h3>
          <template v-for="(slot, i) in bgSlots" :key="i">
            <Pf2eBoostPicker
              :model-value="bgSlotPick(i)"
              :label="slot.label"
              :count="1"
              :allowed="i <= c.backgroundBoosts.length ? slot.allowed : []"
              :taken="slotTaken(c.backgroundBoosts, bgSlots, i)"
              @update:model-value="setBgSlot(i, $event)"
            />
            <p v-if="slot.note" class="small muted">{{ slot.note }}</p>
          </template>
        </div>
        <Pf2eOptionCards
          v-model="backgroundPick"
          :options="backgroundOptions"
          label="Backgrounds"
        />
      </section>

      <!-- 3 · Class ---------------------------------------------------- -->
      <section v-else-if="step === 2" class="section stack" aria-labelledby="cls-h">
        <div class="section-head">
          <h2 id="cls-h">Choose your class</h2>
        </div>
        <Pf2eOptionCards
          v-model="classPick"
          :options="classOptions"
          label="Classes"
          :search="false"
        />
        <template v-if="cls">
          <article ref="classDetail" class="panel stack">
            <h3>{{ cls.name }}</h3>
            <dl class="facts">
              <div>
                <dt>Hit Points</dt>
                <dd>{{ cls.hp }} + CON a level</dd>
              </div>
              <div>
                <dt>Perception</dt>
                <dd>{{ RANK[cls.perception] }}</dd>
              </div>
              <div>
                <dt>Fortitude · Reflex · Will</dt>
                <dd>
                  {{ RANK[cls.saves.fortitude] }} · {{ RANK[cls.saves.reflex] }} ·
                  {{ RANK[cls.saves.will] }}
                </dd>
              </div>
              <div v-if="cls.traditions.length">
                <dt>Spells</dt>
                <dd>{{ cls.traditions.join(', ') }}</dd>
              </div>
            </dl>
            <Pf2eBoostPicker
              v-if="keyOptions.length > 1"
              v-model="keyPick"
              label="Key attribute"
              :count="1"
              :allowed="keyOptions"
            />
            <p v-else class="small">
              Key attribute: <strong>{{ keyOptions[0] }}</strong> (+1)
            </p>
            <p class="small muted">Level 1: {{ levelOneFeatures(cls).join(', ') }}</p>
          </article>

          <template v-for="ch in choices" :key="ch.key">
            <div class="section-head">
              <h3>
                {{ ch.label }}
                <span class="small muted">
                  · choose
                  {{
                    ch.count.min === ch.count.max ? ch.count.min : `${ch.count.min}–${ch.count.max}`
                  }}
                </span>
              </h3>
            </div>
            <p v-if="ch.note" class="small muted">{{ ch.note }}</p>
            <Pf2eOptionCards
              :model-value="c.subclasses[ch.key] ?? []"
              :options="
                ch.options.map((o) =>
                  opt(
                    o,
                    [
                      o.skills.length ? `Trained in ${o.skills.join(', ')}` : '',
                      o.level ? `Level ${o.level}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · '),
                  ),
                )
              "
              :label="ch.label"
              :multiple="ch.count.max > 1"
              :max="ch.count.max"
              @update:model-value="setSubclass(ch.key, $event)"
            />
          </template>

          <template v-if="wantsDeity">
            <div class="section-head"><h3>Deity</h3></div>
            <Pf2eOptionCards v-model="deityPick" :options="deityCards" label="Deities" />
            <p class="small muted cup">
              Deities use trademarks and/or copyrights owned by Paizo Inc., used under Paizo's
              Community Use Policy (paizo.com/licenses/communityuse). We are expressly prohibited
              from charging you to use or access this content. Lantern is not published, endorsed,
              or specifically approved by Paizo.
            </p>
          </template>
        </template>
      </section>

      <!-- 4 · Attributes ------------------------------------------------ -->
      <section v-else-if="step === 3" class="section stack" aria-labelledby="attr-h">
        <div class="section-head">
          <h2 id="attr-h">Attribute modifiers</h2>
        </div>
        <p class="small muted">
          Each boost adds 1, each flaw takes 1 away. Your four free boosts must go to four different
          attributes, and nothing can be higher than +4 at 1st level.
        </p>
        <div class="panel stack">
          <Pf2eBoostPicker v-model="c.freeBoosts" label="Four free boosts" :count="4" />
          <div class="attrs-scroll">
            <table class="table attrs">
              <thead>
                <tr>
                  <th scope="col">Attribute</th>
                  <th scope="col">Modifier</th>
                  <th scope="col" class="attrs__src">Ancestry</th>
                  <th scope="col" class="attrs__src">Background</th>
                  <th scope="col" class="attrs__src">Class</th>
                  <th scope="col" class="attrs__src">Free</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in breakdown" :key="r.a">
                  <th scope="row">
                    {{ r.a }}
                    <!-- Phones show the sources as one line under the attribute. -->
                    <span v-if="sourceLine(r)" class="attrs__line">{{ sourceLine(r) }}</span>
                  </th>
                  <td>
                    <strong>{{ sign(r.total) }}</strong>
                  </td>
                  <td class="attrs__src">{{ r.ancestry ? sign(r.ancestry) : '' }}</td>
                  <td class="attrs__src">{{ r.background ? sign(r.background) : '' }}</td>
                  <td class="attrs__src">{{ r.cls ? '+1' : '' }}</td>
                  <td class="attrs__src">{{ r.free ? '+1' : '' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- 5 · Skills & feats -------------------------------------------- -->
      <section v-else-if="step === 4" class="section stack" aria-labelledby="sk-h">
        <div class="section-head">
          <h2 id="sk-h">Skills &amp; feats</h2>
        </div>
        <div v-if="plan" class="panel stack">
          <h3>Trained skills</h3>
          <p class="small">
            <span class="muted">From your background, class and choices:</span>
            {{ plan.fixed.join(', ') }}
          </p>
          <fieldset v-for="(g, gi) in plan.groups" :key="gi" class="skill-group">
            <legend class="small">Choose one: {{ listOr(g.options) }}</legend>
            <button
              v-for="o in g.options"
              :key="o"
              type="button"
              class="chip"
              :class="{ 'chip--on': groupPicks.includes(o) }"
              :aria-pressed="groupPicks.includes(o)"
              :disabled="plan.fixed.includes(o)"
              @click="pickGroup(g.options, o)"
            >
              {{ o }}
            </button>
          </fieldset>
          <div v-for="(l, li) in plan.lores" :key="`lore-${li}`" class="field lore-name">
            <label :for="`lore-${li}`">Name your background’s Lore skill</label>
            <p :id="`lore-hint-${li}`" class="small muted">{{ l.hint }}</p>
            <div class="lore-name__row">
              <input
                :id="`lore-${li}`"
                class="input"
                maxlength="40"
                placeholder="e.g. Desert"
                :aria-describedby="`lore-hint-${li}`"
                :value="c.lores?.[li] ?? ''"
                @input="setLore(li, ($event.target as HTMLInputElement).value)"
              />
              <span>Lore</span>
            </div>
          </div>
          <p class="small">
            <strong>Free skills</strong>: {{ freePicks.length }} of {{ plan.free }} chosen
          </p>
          <div class="skill-grid" role="group" aria-label="Free trained skills">
            <label v-for="s in PF2E_SKILL_NAMES" :key="s" class="skill-pick">
              <input
                type="checkbox"
                :checked="plan.fixed.includes(s) || c.skills.includes(s)"
                :disabled="
                  plan.fixed.includes(s) ||
                  groupPicks.includes(s) ||
                  (!c.skills.includes(s) && freePicks.length >= plan.free)
                "
                @change="toggleFree(s)"
              />
              <span>
                {{ s }}
                <span v-if="skillSource(s)" class="skill-pick__from">{{ skillSource(s) }}</span>
              </span>
            </label>
          </div>
        </div>
        <template v-for="s in slots" :key="s">
          <div class="section-head">
            <h3>{{ featLabel(s) }}</h3>
          </div>
          <Pf2eOptionCards
            :model-value="featPick(s)"
            :options="featCards[s]"
            :label="`${FEAT_LABEL[s]}s`"
            @update:model-value="setFeat(s, $event)"
          />
        </template>
      </section>

      <!-- 6 · Gear ------------------------------------------------------ -->
      <section v-else-if="step === 5" class="section stack" aria-labelledby="gear-h">
        <div class="section-head">
          <h2 id="gear-h">Gear</h2>
          <span class="small" :class="{ over: spent > STARTING_CP }" aria-live="polite">
            {{ price(Math.max(0, STARTING_CP - spent)) }} left of 15 gp
          </span>
        </div>
        <p class="small muted">
          Pick armor, a shield and weapons with your starting 15 gp; the rest of your gear can be
          added on the sheet.
        </p>
        <h3>Armor</h3>
        <Pf2eOptionCards v-model="armorPick" :options="armorCards" label="Armor" />
        <h3>Shield</h3>
        <Pf2eOptionCards
          v-model="shieldPick"
          :options="shieldCards"
          label="Shields"
          :search="false"
        />
        <h3>Weapons</h3>
        <Pf2eOptionCards
          v-model="weaponPick"
          :options="weaponCards"
          label="Weapons"
          multiple
          :max="4"
        />
      </section>

      <!-- 7 · Review ---------------------------------------------------- -->
      <section v-else class="section stack" aria-labelledby="rev-h">
        <div class="section-head">
          <h2 id="rev-h">Name &amp; review</h2>
        </div>
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
              Level 1 {{ built.heritage }} {{ built.class }} · {{ built.background
              }}{{ built.subclass ? ` · ${built.subclass}` : ''
              }}{{ built.deity ? ` · ${built.deity}` : '' }}
            </p>
          </div>
          <div class="tiles">
            <div v-for="a in PF2E_ATTRS" :key="a" class="tile">
              <span class="tile__label">{{ a }}{{ built.keyAttr === a ? ' ★' : '' }}</span>
              <span class="tile__value">{{ sign(built.attrs[a]) }}</span>
            </div>
            <div class="tile">
              <span class="tile__label">HP</span><span class="tile__value">{{ built.hpMax }}</span>
            </div>
            <div class="tile">
              <span class="tile__label">AC</span><span class="tile__value">{{ built.ac }}</span>
            </div>
            <div v-for="s in built.saves" :key="s.label" class="tile">
              <span class="tile__label">{{ s.label }}</span>
              <span class="tile__value">{{
                s.label === 'Class DC' ? s.value : sign(s.value)
              }}</span>
            </div>
            <div class="tile">
              <span class="tile__label">Speed</span
              ><span class="tile__value">{{ built.speed }}</span>
            </div>
          </div>
          <div class="cols">
            <div class="stack" style="gap: 8px">
              <h4 class="caps">Strikes</h4>
              <p v-for="(s, i) in built.strikes" :key="i" class="small">
                <strong>{{ s.name }}</strong> {{ sign(s.bonus) }} · {{ s.dmg }}
                {{ s.type.toLowerCase() }}
              </p>
              <h4 class="caps">Trained skills</h4>
              <p class="small">
                {{
                  built.skills
                    .filter((s) => s.rank !== 'U')
                    .map((s) => `${s.name} ${sign(s.value)}`)
                    .join(', ')
                }}
              </p>
              <h4 class="caps">Gear</h4>
              <p class="small">
                {{ built.inventory.map((i) => i.name).join(', ') || 'None yet' }} ·
                {{ built.coins.gp }} gp {{ built.coins.sp }} sp {{ built.coins.cp }} cp left
              </p>
              <p v-for="(n, i) in built.notes.split('\n')" :key="i" class="small">{{ n }}</p>
            </div>
            <div class="stack" style="gap: 8px">
              <h4 class="caps">Feats &amp; features</h4>
              <p v-for="(f, i) in built.feats" :key="i" class="small">
                <strong>{{ f.name }}</strong>
                <template v-if="f.action">
                  <span aria-hidden="true">{{ ` ${f.action}` }}</span>
                  <span class="sr-only">({{ glyphWords(f.action) }})</span>
                </template>
                <span class="muted">{{ ` · ${f.type}` }}</span>
              </p>
            </div>
          </div>
          <p class="small muted">
            Spells, focus spells and extra languages aren’t chosen here yet: add them on the sheet.
          </p>
        </article>
      </section>

      <div class="actions">
        <button v-if="step > 0" type="button" class="btn btn--ghost" @click="go(step - 1)">
          Back
        </button>
        <div class="grow actions__status" aria-live="polite">
          <span v-if="actionError" class="actions__error">{{ actionError }}</span>
          <span v-else-if="selectionSummary" class="actions__summary">{{ selectionSummary }}</span>
        </div>
        <button v-if="step < STEPS.length - 1" type="button" class="btn" @click="go(step + 1)">
          Next: {{ STEPS[step + 1] }}
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
  // Number chips (two rows on a phone: seven steps don't fit one); only the current step
  // shows its label.
  .steps {
    gap: 6px;

    button {
      min-width: 44px;
      justify-content: center;
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

.cup {
  max-width: 70ch;
}

.attrs-scroll {
  overflow-x: auto;
}

.attrs {
  td,
  th {
    text-align: center;
  }

  th[scope='row'] {
    text-align: left;
  }
}

.attrs__line {
  display: none;
}

@media (max-width: 720px) {
  // Attribute and Modifier only; where the boosts come from is one small line per row.
  .attrs__src {
    display: none;
  }

  .attrs__line {
    display: block;
    font-size: 12px;
    font-weight: 400;
    color: var(--panel-soft);
  }
}

.jump {
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent-text);
  font: inherit;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}

.lore-name__row {
  display: flex;
  align-items: center;
  gap: 8px;

  .input {
    max-width: 260px;
  }
}

.skill-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;

  legend {
    float: left;
    margin-right: 6px;
    font-weight: 700;
  }

  .chip--on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--page-text);
  }
}

.skill-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr));
  gap: 4px 12px;
}

.skill-pick {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  font-size: 14px;

  @media (pointer: coarse) {
    min-height: 44px;
  }

  input {
    accent-color: var(--accent);
    width: 18px;
    height: 18px;
  }
}

.skill-pick__from {
  display: block;
  font-size: 11px;
  color: var(--panel-soft);
}

.over {
  color: var(--danger-text);
  font-weight: 700;
}

.hero-name {
  font-family: var(--font-heading);
  font-size: 22px !important;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100px, 100%), 1fr));
  gap: 10px;
}

.cols {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
  gap: 20px 28px;

  h4:not(:first-child) {
    margin-top: 10px;
  }
}

.actions {
  position: sticky;
  bottom: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 12px;
  // Solid, full-bleed bar so content never shows through behind the buttons.
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
  white-space: normal;
}

.step-error {
  margin: 0;
  padding: 10px 14px;
  border-radius: min(var(--radius-panel), 10px);
  border: 1px solid var(--danger-text);
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
