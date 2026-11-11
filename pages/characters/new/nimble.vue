<script setup lang="ts">
// Nimble hero builder: class → ancestry → stats & skills → background → review.
// Builds a complete level 1 sheet from data/nimble before creating the character.
import { ANCESTRIES } from '~/data/nimble/ancestries'
import { BACKGROUNDS } from '~/data/nimble/backgrounds'
import { NIMBLE_CLASSES, classBySlug } from '~/data/nimble/classes'
import { STARTING_SKILL_POINTS, STAT_ARRAYS } from '~/data/nimble/core'
import { SCHOOL_LABELS } from '~/data/nimble/spells'
import type { SpellSchool } from '~/data/nimble/types'
import { MAX_CHARACTERS } from '~/stores/character'
import type { NimbleStat } from '~/types/sheets'
import { sign } from '~/utils/dice'
import {
  buildNimbleSheet,
  creationChoices,
  knownSpells,
  recommendedStats,
  validatePicks,
  type Picks,
} from '~/utils/nimbleBuild'
import { defaultSheet } from '~/utils/sheetDefaults'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'New Nimble hero · Lantern' })

const auth = useAuthStore()
const store = useCharacterStore()
const snackbar = useSnackbarStore()

const STEPS = ['Hero', 'Ancestry', 'Stats', 'Background', 'Review'] as const
const STATS: NimbleStat[] = ['STR', 'DEX', 'INT', 'WIL']
/** Skill that gets the default points for each key stat. */
const KEY_SKILL: Record<NimbleStat, string> = {
  STR: 'Might',
  DEX: 'Stealth',
  INT: 'Arcana',
  WIL: 'Perception',
}
const SKILLS = defaultSheet('nimble').skills

const step = ref(0)
const showErrors = ref(false)
const classSlug = ref('')
const ancestrySlug = ref('')
const backgroundSlug = ref('')
const showExotic = ref(false)
const arrayId = ref('standard')
const stats = ref<Record<NimbleStat, number>>({ STR: 0, DEX: 0, INT: 0, WIL: 0 })
const skillPoints = ref<Record<string, number>>({})
const picks = ref<Picks>({})
const name = ref('')
const creating = ref(false)

const cls = computed(() => classBySlug(classSlug.value))
/** KEY in rules text: the higher of the class's Key Stats with the stats as placed. */
const keyValue = computed(() => {
  const c = cls.value
  if (!c) return null
  const [a, b] = c.keyStats
  return { value: Math.max(stats.value[a], stats.value[b]), stats: [a, b] }
})
const ancestry = computed(() => ANCESTRIES.find((a) => a.slug === ancestrySlug.value))
const background = computed(() => BACKGROUNDS.find((b) => b.slug === backgroundSlug.value))
const statArray = computed(() => STAT_ARRAYS.find((a) => a.id === arrayId.value) ?? STAT_ARRAYS[0]!)
const ancestries = computed(() => ANCESTRIES.filter((a) => showExotic.value || !a.exotic))

const atCap = computed(() => store.loaded && store.characters.length >= MAX_CHARACTERS)

onMounted(() =>
  store.fetchMine().catch((err) => snackbar.error(err, 'Could not load your characters')),
)

// Choosing a class resets stats and skills to its recommended setup.
function chooseClass(slug: string) {
  if (slug !== classSlug.value) {
    classSlug.value = slug
    picks.value = {}
    applyRecommended()
  }
  // The detail panel sits below the grid: bring it into view.
  void nextTick(() => detailEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

const detailEl = ref<HTMLElement | null>(null)

/** Unicode minus, as on the sheet. */
const fmt = (n: number) => sign(n).replace('-', '−')

/** The current step's problem, shown next to Next once the player tried to continue. */
const actionError = computed(() => (showErrors.value ? stepErrors.value[step.value] : ''))
const selectionSummary = computed(() =>
  [cls.value?.name, ancestry.value?.name, background.value?.name].filter(Boolean).join(' · '),
)

function pickBackground(b: (typeof BACKGROUNDS)[number]) {
  if (!backgroundLocked(b)) backgroundSlug.value = b.slug
}

function applyRecommended() {
  const c = cls.value
  if (!c) return
  stats.value = recommendedStats(c, statArray.value.values)
  const [a, b] = c.keyStats
  skillPoints.value = { [KEY_SKILL[a]]: 2, [KEY_SKILL[b]]: 2 }
}

watch(arrayId, () => {
  if (cls.value) stats.value = recommendedStats(cls.value, statArray.value.values)
})

/** Setting a stat swaps values with whichever stat held the new value. */
function setStat(stat: NimbleStat, value: number) {
  const old = stats.value[stat]
  const other = STATS.find((s) => s !== stat && stats.value[s] === value)
  const next = { ...stats.value, [stat]: value }
  if (other) next[other] = old
  stats.value = next
}

const arrayOptions = computed(() => [...new Set(statArray.value.values)].sort((a, b) => b - a))

const pointsUsed = computed(() => Object.values(skillPoints.value).reduce((a, b) => a + b, 0))
const pointsLeft = computed(() => STARTING_SKILL_POINTS - pointsUsed.value)

function skillBonus(skillName: string, stat: NimbleStat) {
  const a = ancestry.value
  return (
    stats.value[stat] +
    (skillPoints.value[skillName] ?? 0) +
    (a?.skills?.all ?? 0) +
    (a?.skills?.named?.[skillName] ?? 0)
  )
}

function bumpSkill(skillName: string, delta: number) {
  const cur = skillPoints.value[skillName] ?? 0
  if (delta > 0 && pointsLeft.value <= 0) return
  const next = Math.max(0, cur + delta)
  skillPoints.value = { ...skillPoints.value, [skillName]: next }
}

function backgroundLocked(b: (typeof BACKGROUNDS)[number]) {
  return !!b.requires && stats.value[b.requires.stat] > b.requires.max
}

// A background whose stat requirement no longer holds is dropped.
watch(stats, () => {
  if (background.value && backgroundLocked(background.value)) backgroundSlug.value = ''
})

const choices = computed(() =>
  cls.value ? creationChoices(cls.value, background.value, picks.value) : [],
)

const stepErrors = computed<string[]>(() => [
  cls.value ? '' : 'Choose a hero class',
  ancestry.value ? '' : 'Choose an ancestry',
  pointsLeft.value === 0
    ? ''
    : `Place ${pointsLeft.value} more skill point${pointsLeft.value === 1 ? '' : 's'}`,
  background.value ? '' : 'Choose a background',
  !name.value.trim()
    ? 'Give your hero a name'
    : choices.value.some((c) => validatePicks(c, picks.value[c.key]))
      ? 'Finish the choices above'
      : '',
])

const built = computed(() => {
  if (!cls.value || !ancestry.value || !background.value) return null
  return buildNimbleSheet({
    cls: cls.value,
    ancestry: ancestry.value,
    background: background.value,
    stats: stats.value,
    skillPoints: skillPoints.value,
    picks: picks.value,
  })
})

const spells = computed(() => (built.value ? knownSpells(built.value) : []))

function go(to: number) {
  // Only move forward past steps that are complete.
  for (let i = 0; i < to; i++)
    if (stepErrors.value[i]) {
      step.value = i
      showErrors.value = true
      return
    }
  showErrors.value = false
  step.value = to
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function create() {
  showErrors.value = true
  if (stepErrors.value.some(Boolean) || !built.value) {
    const first = stepErrors.value.findIndex(Boolean)
    if (first >= 0 && first < STEPS.length - 1) step.value = first
    return
  }
  creating.value = true
  try {
    const created = await store.create('nimble', name.value.trim(), built.value)
    snackbar.show(`${created.name} is ready for adventure`)
    await navigateTo(`/character/${created.id}`)
  } catch (err) {
    snackbar.error(err, 'Could not create the character')
  } finally {
    creating.value = false
  }
}

const schoolNames = (schools: string[]) =>
  schools.map((s) => SCHOOL_LABELS[s as SpellSchool] ?? s).join(', ')
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <NuxtLink to="/characters" class="back small">← Characters</NuxtLink>
        <h1>New Nimble hero</h1>
        <p>Pick a class, ancestry and background. Your level 1 sheet is filled in for you.</p>
      </div>
      <span class="badge badge--nimble">Nimble</span>
    </header>

    <div v-if="auth.isSuspended" class="notice">
      <strong>Your account is suspended</strong>
      You can’t create characters right now.
    </div>
    <div v-else-if="atCap" class="notice">
      <strong>All {{ MAX_CHARACTERS }} slots are in use</strong>
      Delete a character to make room for a new hero.
    </div>

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
              <span class="steps__n">{{ i < step && !stepErrors[i] ? '✓' : i + 1 }}</span>
              <span class="steps__label">{{ s }}</span>
            </button>
          </li>
        </ol>
      </nav>

      <!-- 1 · Hero -------------------------------------------------------- -->
      <section v-if="step === 0" class="section" aria-labelledby="hero-h">
        <div class="section-head">
          <h2 id="hero-h">Choose your hero</h2>
          <span class="small muted">Complexity: ◆ simple to ◆◆◆ advanced</span>
        </div>
        <div class="heroes">
          <NimbleHeroCard
            v-for="c in NIMBLE_CLASSES"
            :key="c.slug"
            :slug="c.slug"
            :name="c.name"
            :tagline="c.tagline"
            :complexity="c.complexity"
            :selected="c.slug === classSlug"
            @select="chooseClass(c.slug)"
          />
        </div>

        <article v-if="cls" ref="detailEl" class="panel detail" aria-live="polite">
          <div class="detail__head">
            <div class="detail__sigil"><NimbleSigil :slug="cls.slug" :size="70" /></div>
            <div>
              <h3 class="detail__name">{{ cls.name }}</h3>
              <p class="small muted">{{ cls.tagline }}</p>
            </div>
          </div>
          <p>{{ cls.description }}</p>
          <ul class="detail__highlights">
            <li v-for="h in cls.highlights" :key="h">{{ h }}</li>
          </ul>
          <dl class="facts">
            <div>
              <dt>Key stats</dt>
              <dd>{{ cls.keyStats.join(', ') }}</dd>
            </div>
            <div>
              <dt>Hit die</dt>
              <dd>d{{ cls.hitDie }}</dd>
            </div>
            <div>
              <dt>Starting HP</dt>
              <dd>{{ cls.startingHp }}</dd>
            </div>
            <div>
              <dt>Saves</dt>
              <dd>{{ cls.saveAdv }}+ · {{ cls.saveDis }}–</dd>
            </div>
            <div>
              <dt>Armor</dt>
              <dd>{{ cls.armor }}</dd>
            </div>
            <div>
              <dt>Weapons</dt>
              <dd>{{ cls.weapons }}</dd>
            </div>
          </dl>
          <div class="detail__cols">
            <div class="stack" style="gap: 10px">
              <h4 class="caps">Level 1</h4>
              <div v-for="a in cls.levels[1]?.abilities ?? []" :key="a.name" class="ability">
                <strong>{{ a.name }}</strong>
                <NimbleRulesText :text="a.desc" :key-value="keyValue" />
              </div>
              <h4 class="caps">Starting gear</h4>
              <p class="small">
                {{
                  cls.startingGear
                    .map((g) => (g.qty !== '1' ? `${g.name} (${g.qty})` : g.name))
                    .join(', ')
                }}
              </p>
            </div>
            <div class="stack" style="gap: 10px">
              <h4 class="caps">Subclasses · chosen at level 3</h4>
              <div v-for="s in cls.subclasses" :key="s.slug" class="sub">
                <strong>{{ s.name }}</strong>
                <span class="sub__tag">— {{ s.tagline }} —</span>
                <span v-if="s.story" class="small muted">
                  Story subclass: taken later with your GM’s approval, replacing your subclass.
                </span>
              </div>
            </div>
          </div>
        </article>
      </section>

      <!-- 2 · Ancestry ---------------------------------------------------- -->
      <section v-else-if="step === 1" class="section" aria-labelledby="anc-h">
        <div class="section-head">
          <h2 id="anc-h">Choose your ancestry</h2>
          <UiSwitch v-model="showExotic" label="Show exotic ancestries (check with your GM)" />
        </div>
        <div class="cards" role="radiogroup" aria-labelledby="anc-h">
          <button
            v-for="a in ancestries"
            :key="a.slug"
            type="button"
            role="radio"
            class="card"
            :aria-checked="a.slug === ancestrySlug"
            @click="ancestrySlug = a.slug"
          >
            <span class="card__head">
              <strong>{{ a.name }}</strong>
              <span class="small muted">{{ a.size }}</span>
            </span>
            <span class="card__desc">{{ a.description }}</span>
            <span class="card__trait"
              ><b>{{ a.trait.name }}.</b>{{ ' '
              }}<NimbleRulesText :text="a.trait.desc" :key-value="keyValue"
            /></span>
          </button>
        </div>
      </section>

      <!-- 3 · Stats & skills --------------------------------------------- -->
      <section v-else-if="step === 2" class="section" aria-labelledby="stats-h">
        <div class="section-head">
          <h2 id="stats-h">Stats &amp; skills</h2>
          <button type="button" class="btn btn--ghost btn--sm" @click="applyRecommended">
            Use recommended
          </button>
        </div>
        <div class="panel stack">
          <div class="field">
            <span class="label">Stat array</span>
            <div class="chips" role="radiogroup" aria-label="Stat array">
              <button
                v-for="a in STAT_ARRAYS"
                :key="a.id"
                type="button"
                role="radio"
                class="chip"
                :class="{ 'is-active': a.id === arrayId }"
                :aria-checked="a.id === arrayId"
                @click="arrayId = a.id"
              >
                {{ a.name }} · {{ a.values.map(fmt).join(', ') }}
              </button>
            </div>
            <span class="hint small muted">
              Recommended: the highest numbers in {{ cls?.name }}’s key stats ({{
                cls?.keyStats.join(' and ')
              }}). Changing a stat swaps it with the one that had that value.
            </span>
          </div>
          <div class="stat-grid">
            <div
              v-for="s in STATS"
              :key="s"
              class="tile stat"
              :class="{ key: cls?.keyStats.includes(s) }"
            >
              <label class="tile__label" :for="`stat-${s}`">{{ s }}</label>
              <select
                :id="`stat-${s}`"
                class="input"
                :value="stats[s]"
                @change="setStat(s, Number(($event.target as HTMLSelectElement).value))"
              >
                <option v-for="v in arrayOptions" :key="v" :value="v">{{ fmt(v) }}</option>
              </select>
              <span class="small muted stat__notes">
                <span v-if="cls?.keyStats.includes(s)">Key stat</span>
                <span v-if="cls?.saveAdv === s" class="save save--adv">Save · advantage</span>
                <span v-if="!ancestry?.clearSaveDis && cls?.saveDis === s" class="save save--dis"
                  >Save · disadvantage</span
                >
              </span>
            </div>
          </div>
        </div>

        <div class="panel stack">
          <div class="panel-title" style="margin: 0">
            <h3>Skills</h3>
            <span class="small points" :class="{ done: pointsLeft === 0 }">
              {{ pointsLeft }} of {{ STARTING_SKILL_POINTS }} points left
            </span>
          </div>
          <p class="small muted">
            Each skill starts at its stat. Place 4 extra points wherever you like.
          </p>
          <div class="skills">
            <div v-for="sk in SKILLS" :key="sk.name" class="skill">
              <span class="grow"
                >{{ sk.name }} <small>{{ sk.stat }}</small></span
              >
              <button
                type="button"
                class="step step--sm"
                :aria-label="`Remove a point from ${sk.name}`"
                :disabled="!(skillPoints[sk.name] ?? 0)"
                @click="bumpSkill(sk.name, -1)"
              >
                −
              </button>
              <strong class="skill__v">{{ fmt(skillBonus(sk.name, sk.stat)) }}</strong>
              <button
                type="button"
                class="step step--sm"
                :aria-label="`Add a point to ${sk.name}`"
                :disabled="pointsLeft <= 0"
                @click="bumpSkill(sk.name, 1)"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- 4 · Background -------------------------------------------------- -->
      <section v-else-if="step === 3" class="section" aria-labelledby="bg-h">
        <div class="section-head">
          <h2 id="bg-h">Choose your background</h2>
        </div>
        <div class="cards" role="radiogroup" aria-labelledby="bg-h">
          <button
            v-for="b in BACKGROUNDS"
            :key="b.slug"
            type="button"
            role="radio"
            class="card"
            :aria-checked="b.slug === backgroundSlug"
            :aria-disabled="backgroundLocked(b)"
            :class="{ locked: backgroundLocked(b) }"
            @click="pickBackground(b)"
          >
            <span class="card__head">
              <strong>{{ b.name }}</strong>
              <span
                v-if="b.requires"
                class="small"
                :class="backgroundLocked(b) ? 'req--locked' : 'muted'"
              >
                {{ backgroundLocked(b) ? '🔒 ' : '' }}Needs {{ b.requires.stat }} ≤ 0 (yours
                {{ fmt(stats[b.requires.stat]) }})
              </span>
            </span>
            <span class="card__desc">{{ b.desc }}</span>
          </button>
        </div>
      </section>

      <!-- 5 · Review ------------------------------------------------------ -->
      <section v-else class="section" aria-labelledby="rev-h">
        <div class="section-head">
          <h2 id="rev-h">Name &amp; review</h2>
        </div>

        <div class="panel stack">
          <div class="field">
            <label for="hero-name">Hero name</label>
            <input
              id="hero-name"
              v-model="name"
              class="input"
              maxlength="80"
              required
              aria-required="true"
              placeholder="Required, e.g. Brannoc Stonevow"
            />
          </div>
          <NimbleChoicePicker
            v-for="c in choices"
            :key="c.key"
            v-model="picks[c.key]"
            :choice="c"
            :show-errors="showErrors"
            :key-value="keyValue"
          />
        </div>

        <article v-if="built && cls" class="panel preview">
          <div class="detail__head">
            <div class="detail__sigil"><NimbleSigil :slug="cls.slug" :size="70" /></div>
            <div>
              <h3 class="detail__name">{{ name || 'Your hero' }}</h3>
              <p class="small muted">
                Level 1 {{ built.lineage }} {{ built.class }} · {{ built.background }}
              </p>
            </div>
          </div>
          <div class="preview__tiles">
            <div v-for="s in STATS" :key="s" class="tile">
              <span class="tile__label"
                >{{ s }}{{ built.saveAdv === s ? ' ▲' : built.saveDis === s ? ' ▼' : '' }}</span
              >
              <span class="tile__value">{{ sign(built.stats[s]) }}</span>
            </div>
            <div class="tile">
              <span class="tile__label">HP</span><span class="tile__value">{{ built.hpMax }}</span>
            </div>
            <div class="tile">
              <span class="tile__label">Armor</span><span class="tile__value">{{ built.ac }}</span>
            </div>
            <div class="tile">
              <span class="tile__label">Speed</span
              ><span class="tile__value">{{ built.speed }}</span>
            </div>
            <div class="tile">
              <span class="tile__label">Initiative</span
              ><span class="tile__value">{{ sign(built.initMod) }}</span>
            </div>
            <div class="tile">
              <span class="tile__label">Hit dice</span
              ><span class="tile__value">{{ built.hitDice }}d{{ built.hitDie }}</span>
            </div>
            <div class="tile">
              <span class="tile__label">Wounds</span
              ><span class="tile__value">{{ built.woundsMax }}</span>
            </div>
          </div>
          <div class="detail__cols">
            <div class="stack" style="gap: 10px">
              <h4 class="caps">Abilities</h4>
              <div v-for="a in built.abilities" :key="a.name" class="ability">
                <strong
                  >{{ a.name }} <small>{{ a.src }}</small></strong
                >
                <NimbleRulesText :text="a.desc" :key-value="keyValue" />
              </div>
            </div>
            <div class="stack" style="gap: 10px">
              <h4 class="caps">Attacks</h4>
              <p v-for="a in built.attacks" :key="a.name" class="small">
                <strong>{{ a.name }}</strong> · {{ a.dmg }} · {{ a.props }}
              </p>
              <h4 class="caps">Inventory</h4>
              <p class="small">
                {{
                  built.inventory
                    .map((g) => (g.qty !== '1' ? `${g.name} (${g.qty})` : g.name))
                    .join(', ')
                }}
              </p>
              <template v-if="spells.length">
                <h4 class="caps">Spells · {{ schoolNames(built.spells.schools) || 'Pact' }}</h4>
                <p class="small">{{ spells.map((s) => s.name).join(', ') }}</p>
              </template>
              <template v-if="built.spells.utility.length">
                <h4 class="caps">Utility spells</h4>
                <p class="small">{{ built.spells.utility.join(', ') }}</p>
              </template>
            </div>
          </div>
        </article>
      </section>

      <div class="actions">
        <button v-if="step > 0" type="button" class="btn btn--ghost" @click="go(step - 1)">
          Back
        </button>
        <div class="grow actions__status" aria-live="polite">
          <span v-if="actionError" class="actions__error" role="alert">{{ actionError }}</span>
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

@media (max-width: 560px) {
  // One row of number chips; only the current step shows its label.
  .steps {
    flex-wrap: nowrap;
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

.heroes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(190px, 100%), 1fr));
  gap: 14px;

  // Two heroes per row on phones instead of eleven tall cards.
  @media (max-width: 560px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
}

.detail,
.preview {
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
  color: var(--accent-ink);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
}

.detail__name {
  font-family: var(--font-heading);
  font-size: 24px !important;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.detail__highlights {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--page-soft);
  font-size: 14px;
}

.facts {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr));
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

.detail__cols {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
  gap: 20px 28px;
}

.ability,
.sub {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 14px;

  span {
    color: var(--page-soft);
    line-height: 1.45;
    white-space: pre-line;
  }

  small {
    font-weight: 500;
    color: var(--page-muted);
  }
}

.sub__tag {
  font-style: italic;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
  gap: 12px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
  padding: 14px 16px;
  background: var(--panel-bg);
  color: var(--panel-text);
  border: 1px solid var(--panel-line);
  border-radius: min(var(--radius-panel), 12px);

  &:hover:not(.locked) {
    border-color: var(--accent);
  }

  &[aria-checked='true'] {
    border: 2px solid var(--accent);
    padding: 13px 15px;
    // Tint layered over the panel surface: --panel-bg is a gradient on Cursed.
    background:
      linear-gradient(color-mix(in srgb, var(--accent) 10%, transparent) 0 0), var(--panel-bg);
  }

  // Locked backgrounds stay readable and focusable; only the frame dims.
  &.locked {
    cursor: not-allowed;
    border-style: dashed;
    background: transparent;
  }

  &:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
}

.card__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;

  strong {
    font-size: 16px;
  }
}

.card__desc {
  font-size: 13px;
  color: var(--panel-soft);
}

.card__trait {
  font-size: 13px;
  line-height: 1.45;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(130px, 100%), 1fr));
  gap: 10px;
}

.stat.key {
  border-color: var(--accent);
}

.points {
  font-weight: 600;
  color: var(--accent-text);

  &.done {
    color: var(--page-muted);
  }
}

.skills {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr));
  gap: 8px 24px;
}

.skill {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;

  small {
    color: var(--page-muted);
    font-size: 11px;
  }
}

.skill__v {
  width: 36px;
  text-align: center;
}

.step--sm {
  width: 44px;
  height: 44px;
  font-size: 18px;
}

.preview__tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(110px, 100%), 1fr));
  gap: 10px;
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
}

.actions__summary {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--page-soft);
}

.stat__notes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  min-height: 20px;
}

.save {
  font-weight: 600;

  &--adv {
    color: var(--accent-text);
  }
}

.req--locked {
  color: var(--danger-text);
  font-weight: 600;
}
</style>
