<script setup lang="ts">
// The PF2e sheet's Skills panel, laid out like Nimble's: "Next check" (Fortune / Normal /
// Misfortune, Player Core p. 400) with a DC for the degree of success (p. 401), then saves and
// Perception and the skills as shared SheetSkillRows: rank, what the skill is for, the value
// with its breakdown (attribute, proficiency, items, bonuses and penalties) and Roll. With
// Manual dice Roll asks for the d20. After a check, a Hero Point can reroll it (p. 413).
import type { Pf2eRank, Pf2eSheet } from '~/types/sheets'
import { sign } from '~/utils/dice'
import { PF2E_RANK_NAME } from '~/utils/heroCardStats'
import {
  type Pf2eFortune,
  type Pf2eStatContext,
  SAVE_ATTR,
  checkBreakdown,
  heroRerollProblem,
  rollPf2eCheck,
  skillUses,
} from '~/utils/pf2ePlay'

const { draft, canEdit, say } = useSheet<Pf2eSheet>()
const { claim, resultIn } = useResultOwner()
const auth = useAuthStore()
const sheet = computed(() => draft.value.sheet)
const level = computed(() => draft.value.level)
const ownDice = computed(() => auth.profile?.own_dice ?? false)

const FORTUNE = [
  { value: 'fortune', label: 'Fortune' },
  { value: 'normal', label: 'Normal' },
  { value: 'misfortune', label: 'Misfortune' },
]
const fortune = ref<string | number>('normal')
/** The DC the next checks are against, for the degree of success; blank rolls without one. */
const dc = ref<number | null>(null)

interface Row {
  name: string
  sub?: string
  rank: Pf2eRank
  bonus: number
  changed: boolean
  lines: string[]
  help: string
}

const saveContext = (label: string): Pf2eStatContext =>
  label === 'Perception'
    ? { kind: 'perception', attr: 'WIS' }
    : { kind: 'save', attr: SAVE_ATTR[label], save: label as 'Fortitude' | 'Reflex' | 'Will' }

const saves = computed<Row[]>(() =>
  sheet.value.saves
    .filter((x) => x.label !== 'Class DC')
    .map((x) => {
      const ctx = saveContext(x.label)
      const b = checkBreakdown(sheet.value, { ...x, attr: ctx.attr }, ctx, level.value)
      return {
        name: x.label,
        rank: x.rank,
        bonus: b.value,
        changed: b.value !== x.value,
        lines: b.lines,
        help: skillUses(x.label),
      }
    }),
)

const skills = computed<Row[]>(() =>
  sheet.value.skills.map((x) => {
    const ctx: Pf2eStatContext = { kind: 'skill', attr: x.attr, skill: x.name }
    const b = checkBreakdown(sheet.value, x, ctx, level.value)
    return {
      name: x.name,
      sub: x.attr,
      rank: x.rank,
      bonus: b.value,
      changed: b.value !== x.value,
      lines: b.lines,
      help: skillUses(x.name),
    }
  }),
)

/** The last check, for the Hero Point reroll; a check waiting for its typed d20. */
const last = ref<{ name: string; bonus: number; fortune: Pf2eFortune } | null>(null)
const pending = ref<{ name: string; bonus: number; reroll: boolean } | null>(null)

function run(name: string, bonus: number, o: { d20?: number; reroll?: boolean } = {}) {
  const mode = (o.reroll ? 'normal' : fortune.value) as Pf2eFortune
  claim(`skills:${name}`, () => {
    const r = rollPf2eCheck(sheet.value, name, bonus, {
      dc: dc.value,
      fortune: mode,
      ...(o.d20 !== undefined ? { d20: o.d20 } : {}),
      ...(o.reroll ? { reroll: true } : {}),
    })
    say(r.line)
  })
  // A Hero Point reroll is a fortune effect and its result stands: no second one (p. 413).
  last.value = o.reroll ? null : { name, bonus, fortune: mode }
  if (!o.reroll) fortune.value = 'normal'
}

function roll(row: Row) {
  if (!canEdit.value) return
  if (ownDice.value) {
    pending.value = { name: row.name, bonus: row.bonus, reroll: false }
    return
  }
  run(row.name, row.bonus)
}

function typed(values: number[]) {
  const p = pending.value
  const d20 = values[0]
  if (!p || d20 === undefined) return
  pending.value = null
  if (p.reroll) sheet.value.heroPoints -= 1
  run(p.name, p.bonus, { d20, reroll: p.reroll })
}

const result = computed(() => resultIn('skills:'))
const rerollWhy = computed(() =>
  last.value ? heroRerollProblem(sheet.value, last.value.fortune) : '',
)

function reroll() {
  const l = last.value
  if (!canEdit.value || !l || rerollWhy.value) return
  if (ownDice.value) {
    pending.value = { name: l.name, bonus: l.bonus, reroll: true }
    return
  }
  sheet.value.heroPoints -= 1
  run(l.name, l.bonus, { reroll: true })
}
</script>

<template>
  <section class="panel stack" style="gap: 6px" aria-labelledby="sk-h">
    <UiFold name="Skills" />
    <div class="title-help" style="margin: 0 0 6px">
      <h2 id="sk-h">Skills</h2>
      <UiHelp
        label="About skills and saves"
        text="A check is d20 + the modifier. Proficiency adds your level + 2 trained (T), 4 expert (E), 6 master (M) or 8 legendary (L); untrained (U) adds nothing (Player Core p. 11). Fortune rolls twice and keeps the higher, misfortune the lower (p. 400). With a DC the result says the degree: 10 or more over is a critical success, a natural 20 or 1 moves it one step (p. 401)."
      />
    </div>
    <SheetNextCheck v-model="fortune" :options="FORTUNE" :disabled="!canEdit">
      <template #extra>
        <label class="dc">
          DC
          <input
            v-model.number="dc"
            class="input"
            type="number"
            inputmode="numeric"
            min="0"
            placeholder="—"
            aria-label="DC for the degree of success"
          />
        </label>
      </template>
    </SheetNextCheck>
    <NimbleDiceEntry
      v-if="pending"
      :label="`d20 you rolled for ${pending.name}${pending.reroll ? ' (Hero Point reroll)' : ''}`"
      action="Roll"
      :disabled="!canEdit"
      @submit="typed"
    />
    <div class="caps group">Saves &amp; Perception</div>
    <SheetSkillRow
      v-for="x in saves"
      :key="x.name"
      :name="x.name"
      :help="x.help"
      :value="sign(x.bonus)"
      :breakdown="x.lines"
      :changed="x.changed"
      :disabled="!canEdit"
      :roll-label="`Roll ${x.name} ${sign(x.bonus)}`"
      @roll="roll(x)"
    >
      <template #marks>
        <span class="rank" :class="`rank--${x.rank}`" aria-hidden="true">{{ x.rank }}</span
        ><span class="sr-only">{{ PF2E_RANK_NAME[x.rank] }}</span>
      </template>
    </SheetSkillRow>
    <div class="caps group">Skills</div>
    <SheetSkillRow
      v-for="x in skills"
      :key="x.name"
      :name="x.name"
      :sub="x.sub"
      :help="x.help"
      :value="sign(x.bonus)"
      :breakdown="x.lines"
      :changed="x.changed"
      :disabled="!canEdit"
      :roll-label="`Roll ${x.name} ${sign(x.bonus)}`"
      @roll="roll(x)"
    >
      <template #marks>
        <span class="rank" :class="`rank--${x.rank}`" aria-hidden="true">{{ x.rank }}</span
        ><span class="sr-only">{{ PF2E_RANK_NAME[x.rank] }}</span>
      </template>
    </SheetSkillRow>
    <div v-if="result" class="result">
      <p class="roll-status" role="status" aria-live="polite">{{ result }}</p>
      <button
        v-if="last"
        type="button"
        class="btn btn--ghost btn--sm"
        :disabled="!canEdit || !!rerollWhy"
        :title="rerollWhy || 'Spend 1 Hero Point to reroll; the new result stands (p. 413)'"
        @click="reroll"
      >
        Reroll (Hero Point)
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.group {
  margin-top: 8px;
  font-size: 11px;
}

.dc {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 6px;
  font-size: 13px;
  font-weight: 600;

  .input {
    width: 72px;
    min-height: 36px;
    padding: 4px 8px;
  }
}

.result {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;

  .roll-status {
    flex: 1 1 200px;
  }
}

.rank {
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
  background: var(--track);
  color: var(--page-muted);
  font-family: Inter, system-ui, sans-serif;

  &--T {
    background: transparent;
    box-shadow: inset 0 0 0 1.5px var(--page-text);
    color: var(--page-text);
  }

  &--E {
    background: var(--secondary);
    color: var(--on-secondary);
  }

  &--M,
  &--L {
    background: var(--accent);
    color: var(--on-accent);
  }
}

@media (pointer: coarse) {
  .dc .input {
    min-height: 44px;
  }
}
</style>
