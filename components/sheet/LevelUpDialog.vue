<script setup lang="ts">
import type { Dnd5eSheet, NimbleSheet, Pf2eSheet } from '~/types/sheets'
import { abilityMod, rollDie, sign } from '~/utils/dice'
import { LEVEL_UP_RULES, MAX_LEVEL, averageHp, canBump, hpGain, pointsUsed } from '~/utils/levelUp'
import { systemLabel } from '~/utils/systems'

const open = defineModel<boolean>({ required: true })
const { draft, save } = useSheet()
const snackbar = useSnackbarStore()

const system = computed(() => draft.value.system)
const rules = computed(() => LEVEL_UP_RULES[system.value])
const level = computed(() => draft.value.level)

const hpMode = ref<'avg' | 'roll'>('avg')
const hpRoll = ref<number | null>(null)
const bumps = ref<Record<string, number>>({})
const feat1 = ref('')
const feat2 = ref('')
const other = ref('')

watch(open, (isOpen) => {
  if (!isOpen) return
  hpMode.value = 'avg'
  hpRoll.value = null
  bumps.value = {}
  feat1.value = ''
  feat2.value = ''
  other.value = ''
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
const gain = computed(() => hpGain(base.value, statMod.value))
const used = computed(() => pointsUsed(bumps.value))
const left = computed(() => rules.value.points - used.value)
const className = computed(() => draft.value.sheet.class || 'Class')

const hpHint = computed(() =>
  rules.value.roll
    ? `${className.value} hit die · d${die.value}`
    : `${className.value} · ${die.value} HP per level, no roll`,
)
const statSuffix = computed(() => (rules.value.hpStat ? ` + ${rules.value.hpStat}` : ''))

const summary = computed(() => {
  const rows = [
    { label: 'Level', value: `${level.value} → ${level.value + 1}` },
    { label: 'Maximum hit points', value: `+${gain.value}` },
  ]
  if (rules.value.roll)
    rows.push({
      label: 'Hit dice',
      value: `${level.value}d${die.value} → ${level.value + 1}d${die.value}`,
    })
  else rows.push({ label: 'Proficiency (level-based)', value: '+1 to trained checks' })
  rows.push({ label: 'Points assigned', value: `${used.value} / ${rules.value.points}` })
  return rows
})

function rollHp() {
  hpMode.value = 'roll'
  hpRoll.value = rollDie(die.value)
}

function inc(key: string) {
  if (canBump(rules.value, bumps.value, key)) bumps.value[key] = (bumps.value[key] ?? 0) + 1
}

function dec(key: string) {
  bumps.value[key] = Math.max(0, (bumps.value[key] ?? 0) - 1)
}

async function confirm() {
  const next = level.value + 1
  const sheet = draft.value.sheet
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
    names.forEach(([name], i) =>
      s.abilities.push({
        name,
        src: `${i === 0 ? s.class || 'Class' : 'Subclass'} ${next}`,
        desc: '',
      }),
    )
    if (otherText)
      s.abilities.push({ name: `Level ${next} changes`, src: `Level ${next}`, desc: otherText })
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
              :aria-pressed="hpMode === 'avg'"
              @click="hpMode = 'avg'"
            >
              Take average
              <span>{{ avg }}{{ statSuffix }}</span>
            </button>
            <button type="button" class="choice" :aria-pressed="hpMode === 'roll'" @click="rollHp">
              Roll 1d{{ die }}
              <span>{{ hpRoll ? `Rolled ${hpRoll}${statSuffix}` : 'Roll the die' }}</span>
            </button>
          </template>
          <div class="gain" aria-live="polite">
            <strong>+{{ gain }}</strong>
            <span>
              max HP<template v-if="rules.hpStat">
                · incl. {{ rules.hpStat }} {{ sign(statMod) }}</template
              >
            </span>
          </div>
        </div>
      </section>

      <section class="step-block" aria-labelledby="lu-ab">
        <div class="step-head">
          <h3 id="lu-ab">2 · {{ rules.boostTitle }}</h3>
          <span class="small points" :class="{ done: left === 0 }">
            {{ left }} of {{ rules.points }} left to assign
          </span>
        </div>
        <div class="bumps">
          <div v-for="k in rules.keys" :key="k" class="bump" :class="{ on: (bumps[k] ?? 0) > 0 }">
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
                :disabled="!canBump(rules, bumps, k)"
                @click="inc(k)"
              >
                +
              </button>
            </div>
          </div>
        </div>
        <p class="small muted" style="font-size: 13px">{{ rules.boostRule }}</p>
      </section>

      <section class="step-block" aria-labelledby="lu-ft">
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
  gap: 2px;
  padding: 10px 16px;
  border-radius: min(var(--radius-panel), 10px);
  background: var(--ok-bg);
  color: var(--ok-text);
  border: 1px solid color-mix(in srgb, var(--ok-text) 25%, transparent);

  strong {
    font-family: var(--font-heading);
    font-size: 30px;
  }

  span {
    font-size: 12px;
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
