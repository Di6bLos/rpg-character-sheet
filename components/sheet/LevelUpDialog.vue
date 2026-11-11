<script setup lang="ts">
import { classBySlug } from '~/data/nimble/classes'
import type { Dnd5eSheet, NimbleSheet, Pf2eSheet } from '~/types/sheets'
import { abilityMod, rollDie, sign } from '~/utils/dice'
import { LEVEL_UP_RULES, MAX_LEVEL, averageHp, canBump, hpGain, pointsUsed } from '~/utils/levelUp'
import { recordLevel } from '~/utils/levelHistory'
import {
  applyNimbleLevel,
  keyStatValue,
  nimbleLevelPlan,
  validatePicks,
  type Picks,
} from '~/utils/nimbleBuild'
import { systemLabel } from '~/utils/systems'

const open = defineModel<boolean>({ required: true })
const { draft, save } = useSheet()
const snackbar = useSnackbarStore()

const system = computed(() => draft.value.system)
const rules = computed(() => LEVEL_UP_RULES[system.value])
const level = computed(() => draft.value.level)

const hpMode = ref<'avg' | 'roll'>('avg')
const hpRoll = ref<number | null>(null)
const hpRolls = ref<number[]>([])
/** Max HP gained as typed by the player (a roll made at the table); null = use the option. */
const hpOverride = ref<number | null>(null)
const bumps = ref<Record<string, number>>({})
const feat1 = ref('')
const feat2 = ref('')
const other = ref('')
// Data-driven Nimble level-up (sheets built from data/nimble).
const subclassPick = ref('')
const picks = ref<Picks>({})
const skillPoint = ref('')
const showErrors = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  hpMode.value = 'avg'
  hpRoll.value = null
  hpRolls.value = []
  hpOverride.value = null
  bumps.value = {}
  feat1.value = ''
  feat2.value = ''
  other.value = ''
  subclassPick.value = ''
  picks.value = {}
  skillPoint.value = ''
  showErrors.value = false
})

const nimbleSheet = computed(() =>
  system.value === 'nimble' ? (draft.value.sheet as NimbleSheet) : null,
)
const nimbleClass = computed(() =>
  nimbleSheet.value ? classBySlug(nimbleSheet.value.classSlug) : undefined,
)
const keyValue = computed(() => (nimbleSheet.value ? keyStatValue(nimbleSheet.value) : null))
/** What the next level grants, from the class tables. Null for hand-made sheets. */
const plan = computed(() => {
  const s = nimbleSheet.value
  if (!s || !nimbleClass.value || level.value >= MAX_LEVEL) return null
  return nimbleLevelPlan(s, level.value + 1, {
    subclassSlug: subclassPick.value || undefined,
    pending: picks.value,
  })
})
const statRule = computed(() => plan.value?.statIncrease ?? null)
const subclassOptions = computed(() => nimbleClass.value?.subclasses ?? [])

// When the subclass changes, choices tied to the old one no longer apply.
watch(subclassPick, () => {
  const keys = new Set(plan.value?.choices.map((c) => c.key))
  picks.value = Object.fromEntries(Object.entries(picks.value).filter(([k]) => keys.has(k)))
})

function canBumpNimble(key: string) {
  const r = statRule.value
  if (!r) return false
  return r.stats.includes(key as never) && used.value < r.count && (bumps.value[key] ?? 0) < 1
}

const nimbleProblems = computed<string[]>(() => {
  const p = plan.value
  if (!p) return []
  const out: string[] = []
  if (!gainValid.value) out.push('Enter the hit points gained (0 or more)')
  if (p.subclassChoice && !subclassPick.value) out.push('Choose a subclass')
  if (statRule.value && used.value < statRule.value.count)
    out.push(`Assign ${statRule.value.count - used.value} more stat point(s)`)
  for (const c of p.choices) {
    const err = validatePicks(c, picks.value[c.key])
    if (err) out.push(`${c.label}: ${err}`)
  }
  return out
})

/** Hit die (5e, Nimble) or fixed HP per level (PF2e). */
const die = computed(() => {
  if (system.value === 'pf2e') return (draft.value.sheet as Pf2eSheet).hpPerLevel
  return (draft.value.sheet as Dnd5eSheet | NimbleSheet).hitDie
})

const statMod = computed(() => {
  if (system.value === 'dnd5e') return abilityMod((draft.value.sheet as Dnd5eSheet).abilities.CON)
  if (system.value === 'pf2e') return (draft.value.sheet as Pf2eSheet).attrs.CON
  return 0
})

const avg = computed(() => averageHp(die.value))
const base = computed(() => {
  if (!rules.value.roll) return die.value
  return hpMode.value === 'roll' && hpRoll.value ? hpRoll.value : avg.value
})
const suggested = computed(() => hpGain(base.value, statMod.value))
const gain = computed(() => hpOverride.value ?? suggested.value)
const gainValid = computed(() => Number.isInteger(gain.value) && gain.value >= 0)

function setGain(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  hpOverride.value = raw === '' ? Number.NaN : Math.trunc(Number(raw))
}

function useAverage() {
  hpMode.value = 'avg'
  hpOverride.value = null
}
const used = computed(() => pointsUsed(bumps.value))
const statPoints = computed(() => (plan.value ? (statRule.value?.count ?? 0) : rules.value.points))
const left = computed(() => statPoints.value - used.value)
const className = computed(() => draft.value.sheet.class || 'Class')

const hpHint = computed(() =>
  rules.value.roll
    ? `${className.value} hit die · d${die.value}${system.value === 'nimble' ? ', rolled with advantage' : ''}`
    : `${className.value} · ${die.value} HP per level, no roll`,
)
const statSuffix = computed(() => (rules.value.hpStat ? ` + ${rules.value.hpStat}` : ''))

const summary = computed(() => {
  const rows = [
    { label: 'Level', value: `${level.value} → ${level.value + 1}` },
    { label: 'Maximum hit points', value: gainValid.value ? `+${gain.value}` : '—' },
  ]
  if (rules.value.roll)
    rows.push({
      label: 'Hit dice',
      value: `${level.value}d${die.value} → ${level.value + 1}d${die.value}`,
    })
  else rows.push({ label: 'Proficiency (level-based)', value: '+1 to trained checks' })
  if (statPoints.value)
    rows.push({ label: 'Points assigned', value: `${used.value} / ${statPoints.value}` })
  if (plan.value?.spellTier)
    rows.push({ label: 'Spell tier', value: `Tier ${plan.value.spellTier}` })
  return rows
})

function rollHp() {
  hpMode.value = 'roll'
  hpOverride.value = null
  // Nimble: roll your Hit Die with advantage when you level up.
  if (system.value === 'nimble') {
    hpRolls.value = [rollDie(die.value), rollDie(die.value)]
    hpRoll.value = Math.max(...hpRolls.value)
  } else {
    hpRolls.value = []
    hpRoll.value = rollDie(die.value)
  }
}

function canInc(key: string) {
  return plan.value ? canBumpNimble(key) : canBump(rules.value, bumps.value, key)
}

function inc(key: string) {
  if (canInc(key)) bumps.value[key] = (bumps.value[key] ?? 0) + 1
}

function dec(key: string) {
  bumps.value[key] = Math.max(0, (bumps.value[key] ?? 0) - 1)
}

async function confirmNimble() {
  showErrors.value = true
  if (nimbleProblems.value.length) return
  const next = level.value + 1
  applyNimbleLevel(draft.value.sheet as NimbleSheet, next, {
    hpGain: gain.value,
    statBumps: bumps.value,
    skillPoint: skillPoint.value || undefined,
    subclassSlug: subclassPick.value || undefined,
    picks: picks.value,
  })
  draft.value.level = next
  open.value = false
  await save()
  snackbar.show(`${draft.value.name} is now level ${next}`)
}

async function confirm() {
  if (plan.value) return confirmNimble()
  showErrors.value = true
  if (!gainValid.value) return
  const next = level.value + 1
  const sheet = draft.value.sheet
  recordLevel(sheet, next)
  sheet.hpMax += gain.value
  sheet.hp += gain.value

  const names = [
    [feat1.value.trim(), rules.value.featLabel],
    [feat2.value.trim(), rules.value.feat2Label],
  ].filter(([name]) => name) as [string, string][]
  const otherText = other.value.trim()

  if (system.value === 'dnd5e') {
    const s = sheet as Dnd5eSheet
    for (const [k, v] of Object.entries(bumps.value))
      s.abilities[k as keyof typeof s.abilities] += v
    s.profBonus = 2 + Math.floor((next - 1) / 4)
    for (const [name, label] of names)
      s.features.push({ name, desc: `${label} · gained at level ${next}` })
    if (otherText) s.features.push({ name: `Level ${next} changes`, desc: otherText })
  } else if (system.value === 'pf2e') {
    const s = sheet as Pf2eSheet
    for (const [k, v] of Object.entries(bumps.value)) s.attrs[k as keyof typeof s.attrs] += v
    names.forEach(([name], i) =>
      s.feats.push({
        type: i === 0 ? 'Class' : 'General',
        level: `Lvl ${next}`,
        action: '',
        name,
        desc: '',
      }),
    )
    if (otherText)
      s.feats.push({
        type: 'Other',
        level: `Lvl ${next}`,
        action: '',
        name: `Level ${next} changes`,
        desc: otherText,
      })
  } else {
    const s = sheet as NimbleSheet
    for (const [k, v] of Object.entries(bumps.value)) s.stats[k as keyof typeof s.stats] += v
    s.hitDice += 1
    // Tagged with the level so lowering it removes them (untagged = written in by hand).
    names.forEach(([name], i) =>
      s.abilities.push({
        name,
        src: `${i === 0 ? s.class || 'Class' : 'Subclass'} ${next}`,
        desc: '',
        level: next,
      }),
    )
    if (otherText)
      s.abilities.push({
        name: `Level ${next} changes`,
        src: `Level ${next}`,
        desc: otherText,
        level: next,
      })
  }

  // Level is committed in the same save as the stat changes, so cancelling
  // can never leave a half-applied level-up behind.
  draft.value.level = next
  open.value = false
  await save()
  snackbar.show(`${draft.value.name} is now level ${next}`)
}
</script>

<template>
  <UiDialog v-model="open" title="Level up" width="760px">
    <template #eyebrow>
      <div class="row" style="gap: 10px; margin-bottom: 8px">
        <span class="badge" :class="`badge--${system}`">{{ systemLabel(system) }}</span>
        <span class="small" style="color: var(--page-soft)">{{ draft.name }}</span>
      </div>
    </template>

    <div v-if="level >= MAX_LEVEL" class="notice">
      <strong>{{ draft.name }} is at the level cap</strong>
      Level {{ MAX_LEVEL }} is as high as a sheet goes.
    </div>

    <template v-else>
      <div class="arrow">
        <span class="muted">Level {{ level }}</span>
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
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
        <strong>Level {{ level + 1 }}</strong>
      </div>

      <section class="step-block" aria-labelledby="lu-hp">
        <div class="step-head">
          <h3 id="lu-hp">1 · Hit points</h3>
          <span class="small muted">{{ hpHint }}</span>
        </div>
        <div class="hp-row">
          <template v-if="rules.roll">
            <button
              type="button"
              class="choice"
              :aria-pressed="hpMode === 'avg' && hpOverride === null"
              @click="useAverage"
            >
              Take average
              <span>{{ avg }}{{ statSuffix }}</span>
            </button>
            <button
              type="button"
              class="choice"
              :aria-pressed="hpMode === 'roll' && hpOverride === null"
              @click="rollHp"
            >
              Roll 1d{{ die }}{{ system === 'nimble' ? ' with advantage' : '' }}
              <span>{{
                hpRoll
                  ? hpRolls.length > 1
                    ? `Rolled ${hpRolls.join(' and ')}, keep ${hpRoll}`
                    : `Rolled ${hpRoll}${statSuffix}`
                  : 'Roll the die'
              }}</span>
            </button>
          </template>
          <div class="gain" :class="{ edited: hpOverride !== null, bad: !gainValid }">
            <label for="lu-hp-gain">Max HP gained</label>
            <div class="gain__input">
              <span aria-hidden="true">+</span>
              <input
                id="lu-hp-gain"
                class="input"
                type="number"
                inputmode="numeric"
                min="0"
                step="1"
                :value="Number.isNaN(gain) ? '' : gain"
                aria-describedby="lu-hp-gain-hint"
                @input="setGain"
              />
            </div>
            <span id="lu-hp-gain-hint">
              <template v-if="hpOverride !== null">Your number</template>
              <template v-else>
                Edit to use your own roll<template v-if="rules.hpStat">
                  · incl. {{ rules.hpStat }} {{ sign(statMod) }}</template
                >
              </template>
            </span>
          </div>
        </div>
        <p v-if="showErrors && !gainValid" class="err" role="alert">
          Enter the hit points gained (0 or more)
        </p>
      </section>

      <section v-if="!plan || statRule" class="step-block" aria-labelledby="lu-ab">
        <div class="step-head">
          <h3 id="lu-ab">2 · {{ rules.boostTitle }}</h3>
          <span class="small points" :class="{ done: left === 0 }">
            {{ left }} of {{ statPoints }} left to assign
          </span>
        </div>
        <div class="bumps">
          <div
            v-for="k in rules.keys"
            :key="k"
            class="bump"
            :class="{
              on: (bumps[k] ?? 0) > 0,
              off: statRule && !statRule.stats.includes(k as never),
            }"
          >
            <div class="caps">{{ k }}</div>
            <div class="bump__v">+{{ bumps[k] ?? 0 }}</div>
            <div class="row" style="gap: 6px; flex-wrap: nowrap">
              <button
                type="button"
                class="step step--sm"
                :aria-label="`Decrease ${k}`"
                :disabled="(bumps[k] ?? 0) <= 0"
                @click="dec(k)"
              >
                −
              </button>
              <button
                type="button"
                class="step step--sm"
                :aria-label="`Increase ${k}`"
                :disabled="!canInc(k)"
                @click="inc(k)"
              >
                +
              </button>
            </div>
          </div>
        </div>
        <p class="small muted" style="font-size: 13px">
          {{
            statRule
              ? statRule.count > 1
                ? `+1 to any ${statRule.count} different stats.`
                : `+1 to ${statRule.stats.join(' or ')}.`
              : rules.boostRule
          }}
        </p>
      </section>

      <template v-if="plan">
        <section class="step-block" aria-labelledby="lu-new">
          <div class="step-head">
            <h3 id="lu-new">{{ statRule ? 3 : 2 }} · New at level {{ level + 1 }}</h3>
            <span class="small muted">{{ nimbleClass?.name }}</span>
          </div>
          <ul v-if="plan.notes.length" class="notes">
            <li v-for="n in plan.notes" :key="n">{{ n }}</li>
          </ul>
          <div v-if="plan.abilities.length" class="gains">
            <div v-for="a in plan.abilities" :key="a.src + a.ability.name" class="gain-card">
              <div class="gain-card__head">
                <strong>{{ a.ability.name }}</strong>
                <small>{{ a.src }}</small>
              </div>
              <p><NimbleRulesText :text="a.ability.desc" :key-value="keyValue" /></p>
            </div>
          </div>
          <p
            v-else-if="!plan.choices.length && !plan.subclassChoice && !plan.notes.length"
            class="small muted"
          >
            No new class features at this level; your subclass or choices may still grow.
          </p>
        </section>

        <section v-if="plan.subclassChoice" class="step-block" aria-labelledby="lu-sub">
          <h3 id="lu-sub">Choose your subclass</h3>
          <div class="subs" role="group" aria-labelledby="lu-sub">
            <button
              v-for="s in subclassOptions"
              :key="s.slug"
              type="button"
              class="choice sub-choice"
              :aria-pressed="subclassPick === s.slug"
              @click="subclassPick = s.slug"
            >
              {{ s.name }}
              <span class="sub-choice__tag">— {{ s.tagline }} —</span>
              <span v-if="s.story">Story subclass · needs your GM’s approval</span>
            </button>
          </div>
          <p v-if="showErrors && !subclassPick" class="err" role="alert">Choose a subclass</p>
        </section>

        <section v-if="plan.choices.length" class="step-block" aria-labelledby="lu-ch">
          <h3 id="lu-ch">Choices</h3>
          <NimbleChoicePicker
            v-for="c in plan.choices"
            :key="c.key"
            v-model="picks[c.key]"
            :choice="c"
            :show-errors="showErrors"
            :key-value="keyValue"
          />
        </section>

        <section class="step-block" aria-labelledby="lu-sk">
          <h3 id="lu-sk">Skill point</h3>
          <div class="field">
            <label for="lu-skill">Gain 1 skill point (optional: max +12 per skill)</label>
            <select id="lu-skill" v-model="skillPoint" class="input">
              <option value="">Decide later</option>
              <option v-for="s in nimbleSheet?.skills ?? []" :key="s.name" :value="s.name">
                {{ s.name }} ({{ s.stat }}) · now
                {{ sign((nimbleSheet?.stats[s.stat] ?? 0) + s.points) }}
              </option>
            </select>
          </div>
        </section>

        <p v-if="showErrors && nimbleProblems.length" class="err" role="alert">
          {{ nimbleProblems[0] }}
        </p>
      </template>

      <section v-else class="step-block" aria-labelledby="lu-ft">
        <h3 id="lu-ft">3 · New features</h3>
        <div class="feats">
          <div class="field">
            <label for="lu-feat">{{ rules.featLabel }}</label>
            <input id="lu-feat" v-model="feat1" class="input" placeholder="Name of the feature" />
          </div>
          <div class="field">
            <label for="lu-feat2">{{ rules.feat2Label }}</label>
            <input id="lu-feat2" v-model="feat2" class="input" placeholder="Optional" />
          </div>
        </div>
        <div class="field">
          <label for="lu-other">Spells, proficiencies &amp; other changes</label>
          <textarea id="lu-other" v-model="other" class="input" rows="2" style="min-height: 0" />
        </div>
      </section>

      <section class="summary" aria-label="Summary">
        <div class="caps" style="margin-bottom: 8px">Updates automatically</div>
        <dl>
          <div v-for="r in summary" :key="r.label">
            <dt>{{ r.label }}</dt>
            <dd>{{ r.value }}</dd>
          </div>
        </dl>
      </section>
    </template>

    <template #actions>
      <button type="button" class="btn btn--ghost" @click="open = false">Cancel</button>
      <button v-if="level < MAX_LEVEL" type="button" class="btn" @click="confirm">
        Confirm level {{ level + 1 }}
      </button>
    </template>
  </UiDialog>
</template>

<style scoped lang="scss">
.arrow {
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: var(--font-heading);
  font-size: 20px;
  margin-top: -8px;

  strong {
    color: var(--accent-text);
  }
}

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

.points {
  font-weight: 600;
  color: var(--accent-text);

  &.done {
    color: var(--secondary);
  }
}

.hp-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: stretch;
}

.choice {
  flex: 1 1 180px;
  min-height: 64px;
  padding: 10px 16px;
  border-radius: min(var(--radius-panel), 10px);
  text-align: left;
  font-weight: 600;
  font-size: 15px;
  background: var(--field);
  color: var(--page-text);
  border: 1px solid var(--line);

  span {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--page-soft);
    margin-top: 2px;
  }

  &[aria-pressed='true'] {
    background: var(--accent-tint);
    border: 1.5px solid var(--accent);
  }
}

.gain {
  flex: 1 1 160px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 4px;
  padding: 10px 16px;
  border-radius: min(var(--radius-panel), 10px);
  background: var(--ok-bg);
  color: var(--ok-text);
  border: 1px solid color-mix(in srgb, var(--ok-text) 25%, transparent);

  label,
  > span {
    font-size: 12px;
    font-weight: 600;
  }

  &.edited {
    border-color: var(--ok-text);
  }

  &.bad {
    background: var(--field);
    color: var(--danger-text);
    border-color: var(--danger-text);
  }
}

.gain__input {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-heading);
  font-size: 26px;
  font-weight: 700;

  .input {
    width: 88px;
    min-height: 44px;
    padding: 4px 8px;
    text-align: center;
    font-family: var(--font-heading);
    font-size: 24px;
    font-weight: 700;
  }
}

.bumps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
  gap: 10px;
}

.bump {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 8px;
  border-radius: min(var(--radius-panel), 10px);
  background: var(--field);
  border: 1px solid var(--line);

  &.on {
    border-color: var(--accent);

    .bump__v {
      color: var(--accent-text);
    }
  }
}

.bump__v {
  font-family: var(--font-heading);
  font-size: 22px;
  font-weight: 700;
  color: var(--page-muted);
}

.step--sm {
  width: 40px;
  height: 40px;
  font-size: 18px;
}

.bump.off {
  opacity: 0.45;
}

.notes {
  margin: 0;
  padding-left: 18px;
  font-size: 14px;
  color: var(--page-soft);
}

.gains {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gain-card {
  padding: 12px 14px;
  border-radius: min(var(--radius-panel), 10px);
  background: var(--field);
  border: 1px solid var(--line);
  border-left: 3px solid var(--accent);

  p {
    margin-top: 4px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--page-soft);
  }
}

.gain-card__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;

  small {
    color: var(--page-muted);
    font-size: 12px;
  }
}

.subs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
  gap: 10px;
}

.sub-choice__tag {
  font-style: italic;
}

.err {
  color: var(--danger-text);
  font-weight: 600;
  font-size: 14px;
}

.feats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.summary {
  padding: 14px 16px;
  border-radius: min(var(--radius-panel), 10px);
  background: var(--field);
  border: 1px solid var(--line);

  dl {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 6px 24px;
  }

  dl > div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 14px;
  }

  dt {
    color: var(--page-soft);
  }

  dd {
    margin: 0;
    font-weight: 700;
  }
}
</style>
