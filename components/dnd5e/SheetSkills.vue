<script setup lang="ts">
// The 5e sheet's Skills panel, laid out like Nimble's: "Next check" (Normal / Advantage /
// Disadvantage, which cancel each other, SRD 5.2.1 p. 6), then the six saving throws as a compact
// grid of tiles (ability, mark, value with its breakdown, Roll) and the skills as shared
// SheetSkillRows: the proficiency mark (○ none, ½ Jack of All Trades, ● proficient,
// ◆ Expertise; a hand-made sheet taps it to change), what the skill is for, the value with its
// breakdown (ability, proficiency, Exhaustion, conditions, Bless…) and Roll. With Manual dice
// Roll asks for the d20. Under the result, what can still change it (Dnd5eAfterRoll: Heroic
// Inspiration, Indomitable, Portent…); above, a Luck Point for Advantage on the next one.
import type { Dnd5eSheet } from '~/types/sheets'
import { showOutcome, sign } from '~/utils/dice'
import { isBuiltDnd5e } from '~/utils/dnd5eLevelUp'
import {
  type D20Mode,
  DND5E_SKILL_USES,
  type Dnd5eSkillRow,
  d20Mode,
  rollTest,
  saveRows,
  skillRows,
} from '~/utils/dnd5ePlay'

const { draft, canEdit, say } = useSheet<Dnd5eSheet>()
const { claim, resultIn } = useResultOwner()
const { lastRoll } = useDnd5eSheet()
const sheet = computed(() => draft.value.sheet)
const level = computed(() => draft.value.level)
const ownDice = computed(() => !!sheet.value.ownDice)

const MODES = [
  { value: 'normal', label: 'Normal' },
  { value: 'adv', label: 'Advantage' },
  { value: 'dis', label: 'Disadvantage' },
]
const mode = ref<string | number>('normal')

const saves = computed(() => saveRows(sheet.value, level.value))
const skills = computed(() => skillRows(sheet.value, level.value))
const MARK = { 0: '○', 0.5: '½', 1: '●', 2: '◆' } as const
const MARK_NAME = {
  0: 'Not proficient',
  0.5: 'Jack of All Trades',
  1: 'Proficient',
  2: 'Expertise',
} as const

const lines = (r: Dnd5eSkillRow) => [
  ...r.test.lines,
  ...r.test.dice.map((d) => `${d.label} ${d.dice}`),
  ...r.test.adv.map((a) => `Advantage: ${a}`),
  ...r.test.dis.map((d) => `Disadvantage: ${d}`),
  ...(r.test.fail ? [`Fails: ${r.test.fail}`] : []),
  ...(r.test.reliable ? ['Reliable Talent: 9 or lower counts as 10'] : []),
]
const sub = (r: Dnd5eSkillRow) => {
  const m = d20Mode(r.test)
  return `${r.ability}${m === 'adv' ? ' · adv.' : m === 'dis' ? ' · dis.' : ''}`
}

const hasJack = computed(() => skills.value.some((r) => r.prof === 0.5))

const pending = ref<Dnd5eSkillRow | null>(null)

function roll(r: Dnd5eSkillRow, values?: number[]) {
  if (!canEdit.value) return
  if (ownDice.value && !values) {
    pending.value = r
    return
  }
  pending.value = null
  const m = mode.value as D20Mode
  claim(`skills:${r.name}`, () => {
    const out = rollTest(sheet.value, r.test, { mode: m, ...(values ? { d20: values } : {}) })
    lastRoll.value = { key: `skills:${r.name}`, test: r.test, result: out, mode: m }
    say(out.line)
    showOutcome({ label: r.name, total: out.failed ? null : out.total, detail: out.line })
  })
  mode.value = 'normal'
}

/** Hand-made sheets set their own proficiencies: none → proficient → Expertise. */
const editable = computed(() => canEdit.value && !isBuiltDnd5e(sheet.value))

function cycle(r: Dnd5eSkillRow) {
  if (!editable.value) return
  const p = (sheet.value.proficiencies ??= {
    skills: [],
    expertise: [],
    tools: [],
    languages: [],
    weapons: [],
    armor: [],
  })
  const has = p.skills.includes(r.name)
  const exp = p.expertise.includes(r.name)
  if (!has) p.skills = [...p.skills, r.name]
  else if (!exp) p.expertise = [...p.expertise, r.name]
  else {
    p.skills = p.skills.filter((x) => x !== r.name)
    p.expertise = p.expertise.filter((x) => x !== r.name)
  }
}
</script>

<template>
  <section class="panel stack" style="gap: 6px" aria-labelledby="sk-h">
    <UiFold name="Skills" />
    <div class="title-help" style="margin: 0 0 6px">
      <h2 id="sk-h">Skills</h2>
      <UiHelp
        label="About skills and saves"
        text="A check is d20 + the ability modifier, plus your Proficiency Bonus when proficient (●) and twice it with Expertise (◆); Jack of All Trades adds half (½) to the rest (SRD 5.2.1 p. 8). Advantage rolls two d20s and keeps the higher, Disadvantage the lower; one of each cancels (p. 6). Exhaustion takes 2 per level off every roll."
      />
    </div>
    <SheetNextCheck v-model="mode" :options="MODES" :disabled="!canEdit" />
    <Dnd5eAfterRoll pre />
    <NimbleDiceEntry
      v-if="pending"
      :label="`d20 you rolled for ${pending.name}${d20Mode(pending.test, mode as D20Mode) !== 'normal' ? ' (both dice)' : ''}`"
      action="Roll"
      :disabled="!canEdit"
      @submit="(v) => pending && roll(pending, v)"
    />
    <p class="legend" aria-hidden="true">
      <span>○ not proficient</span> · <span>● proficient</span> · <span>◆ Expertise</span
      ><template v-if="hasJack"> · <span>½ Jack of All Trades</span></template>
    </p>
    <div class="caps group">Saving throws</div>
    <div class="saves">
      <div v-for="r in saves" :key="r.name" class="tile save">
        <span class="save__head">
          <span class="save__name">{{ r.ability }}</span>
          <span class="mark" :class="`mark--${r.prof * 2}`" :title="MARK_NAME[r.prof]"
            >{{ MARK[r.prof] }}<span class="sr-only">{{ MARK_NAME[r.prof] }}</span></span
          >
          <UiTooltip
            v-if="lines(r).length"
            :title="`${r.name} ${r.test.fail ? 'fails' : sign(r.test.bonus)}`"
            :text="lines(r).join('\n')"
          >
            <strong
              class="save__value"
              :class="{ 'is-changed': !!r.test.adv.length || !!r.test.dis.length || !!r.test.fail }"
              tabindex="0"
              >{{ r.test.fail ? 'fails' : sign(r.test.bonus) }}</strong
            >
          </UiTooltip>
          <strong v-else class="save__value">{{
            r.test.fail ? 'fails' : sign(r.test.bonus)
          }}</strong>
        </span>
        <button
          type="button"
          class="btn btn--ghost btn--sm save__roll"
          :disabled="!canEdit"
          :aria-label="`Roll ${r.name} ${sign(r.test.bonus)}`"
          @click="roll(r)"
        >
          Roll
        </button>
      </div>
    </div>
    <div class="caps group">Skills</div>
    <SheetSkillRow
      v-for="r in skills"
      :key="r.name"
      :name="r.name"
      :sub="sub(r)"
      :help="DND5E_SKILL_USES[r.name]"
      :value="sign(r.test.bonus)"
      :breakdown="lines(r)"
      :changed="!!r.test.adv.length || !!r.test.dis.length"
      :disabled="!canEdit"
      :roll-label="`Roll ${r.name} ${sign(r.test.bonus)}`"
      @roll="roll(r)"
    >
      <template #marks>
        <button
          v-if="editable"
          type="button"
          class="mark mark--btn"
          :class="`mark--${r.prof * 2}`"
          :aria-label="`${r.name}: ${MARK_NAME[r.prof]}. Change it`"
          @click="cycle(r)"
        >
          {{ MARK[r.prof] }}
        </button>
        <span v-else class="mark" :class="`mark--${r.prof * 2}`" :title="MARK_NAME[r.prof]"
          >{{ MARK[r.prof] }}<span class="sr-only">{{ MARK_NAME[r.prof] }}</span></span
        >
      </template>
    </SheetSkillRow>
    <p v-if="resultIn('skills:')" class="roll-status" role="status" aria-live="polite">
      {{ resultIn('skills:') }}
    </p>
    <Dnd5eAfterRoll scope="skills:" />
  </section>
</template>

<style scoped lang="scss">
.group {
  margin-top: 8px;
  font-size: 11px;
}

.saves {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.save {
  gap: 6px;
  padding: 8px 10px;
}

.save__head {
  display: flex;
  align-items: center;
  gap: 4px;
}

.save__name {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.save__value {
  margin-left: auto;
  font-size: 16px;
  font-variant-numeric: tabular-nums;

  &[tabindex] {
    cursor: help;
    border-bottom: 1px dotted var(--line-strong);
  }

  &.is-changed {
    color: var(--warn-text);
  }
}

.save__roll {
  min-height: 30px;
  padding: 2px 10px;

  @media (pointer: coarse) {
    min-height: 44px;
  }
}

.legend {
  margin: 0;
  font-size: 12px;
  color: var(--page-muted);

  span {
    white-space: nowrap;
  }
}

.mark {
  flex: none;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  color: var(--page-muted);

  &--2,
  &--4 {
    color: var(--accent-text);
  }

  &--4 {
    color: var(--secondary);
    font-size: 19px;
  }
}

.mark--btn {
  padding: 0;
  border: 1px dashed var(--line-strong);
  border-radius: 5px;
  background: none;
  cursor: pointer;
}

@media (pointer: coarse) {
  .mark--btn {
    width: 44px;
    height: 44px;
  }
}
</style>
