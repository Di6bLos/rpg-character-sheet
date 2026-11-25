<script setup lang="ts">
// Reconfigure: go back to an earlier level, undoing what the levels above it
// granted, then level back up one level at a time, starting from the old picks.
// Nimble heroes built from class data can also redo their level 1 choices; PF2e heroes replay
// their recorded level-up picks the same way.
import { STARTING_SKILL_POINTS, STAT_ARRAYS } from '~/data/nimble/core'
import type {
  AnySheet,
  NimbleLevelInput,
  NimbleSheet,
  NimbleStat,
  Pf2eLevelInput,
} from '~/types/sheets'
import { canRestore, restoreBuild, restoreLevel } from '~/utils/levelHistory'
import {
  buildNimbleSheet,
  creationChoices,
  creationInput,
  syncCompanions,
  validatePicks,
  type Picks,
} from '~/utils/nimbleBuild'

const open = defineModel<boolean>({ required: true })
const { draft, saveNow } = useSheet()
const snackbar = useSnackbarStore()

const creation = computed(() =>
  draft.value.system === 'nimble'
    ? creationInput(draft.value.sheet as NimbleSheet, draft.value.level)
    : null,
)
const targets = computed(() => [
  ...(creation.value ? [0] : []),
  ...Array.from({ length: Math.max(0, draft.value.level - 1) }, (_, i) => i + 1).filter((l) =>
    canRestore(draft.value.sheet, l),
  ),
])
const target = ref(1)
const phase = ref<'pick' | 'level1'>('pick')
watch(open, (isOpen) => {
  if (!isOpen) return
  target.value = targets.value.at(-1) ?? 0
  phase.value = 'pick'
})

const arrayId = ref('standard')
const stats = ref<Record<NimbleStat, number>>({ STR: 0, DEX: 0, INT: 0, WIL: 0 })
const skillPoints = ref<Record<string, number>>({})
const picks = ref<Picks>({})
const showErrors = ref(false)

const cls = computed(() => creation.value?.cls)
const background = computed(() => creation.value?.background)
const keyValue = computed(() => {
  const c = cls.value
  if (!c) return null
  const [a, b] = c.keyStats
  return { value: Math.max(stats.value[a], stats.value[b]), stats: [a, b] }
})
const choices = computed(() =>
  cls.value ? creationChoices(cls.value, background.value, picks.value) : [],
)
const problems = computed(() => {
  const out: string[] = []
  const left = STARTING_SKILL_POINTS - Object.values(skillPoints.value).reduce((a, b) => a + b, 0)
  if (left) out.push(`Place ${left} more skill point${left === 1 ? '' : 's'}`)
  const req = background.value?.requires
  if (req && stats.value[req.stat] > req.max)
    out.push(`${background.value!.name} needs ${req.stat} of ${req.max} or less`)
  for (const c of choices.value) {
    const err = validatePicks(c, picks.value[c.key])
    if (err) out.push(`${c.label}: ${err}`)
  }
  return out
})

function startLevelOne() {
  const was = creation.value!
  const sorted = Object.values(was.stats).sort((a, b) => b - a)
  arrayId.value =
    STAT_ARRAYS.find((a) => [...a.values].sort((x, y) => y - x).join() === sorted.join())?.id ??
    'standard'
  stats.value = { ...was.stats }
  skillPoints.value = { ...was.skillPoints }
  picks.value = JSON.parse(JSON.stringify(was.picks)) as Picks
  showErrors.value = false
  phase.value = 'level1'
}

const goal = ref(0)
const original = ref<{ level: number; sheet: AnySheet } | null>(null)
const previous = ref<Record<number, NimbleLevelInput | Pf2eLevelInput>>({})
const levelUpOpen = ref(false)
const openedAt = ref(0)

const next = computed(() => draft.value.level + 1)
const progress = computed(() => `Reconfiguring · ${next.value} of ${goal.value}`)

function begin(from: number) {
  const sheet = draft.value.sheet
  original.value = {
    level: draft.value.level,
    sheet: JSON.parse(JSON.stringify(sheet)) as AnySheet,
  }
  previous.value = Object.fromEntries(
    (sheet.levelHistory ?? [])
      .filter((e) => e.level > from && (e.nimble || e.pf2e))
      .map((e) => [e.level, (e.nimble ?? e.pf2e)!]),
  )
  goal.value = draft.value.level
}

async function climb(from: number) {
  if (draft.value.system === 'nimble') syncCompanions(draft.value.sheet as NimbleSheet)
  draft.value.level = from
  open.value = false
  await saveNow()
  if (from >= goal.value) return finish()
  openedAt.value = from
  levelUpOpen.value = true
}

async function start() {
  if (target.value === 0) return startLevelOne()
  begin(target.value)
  restoreLevel(draft.value.sheet, target.value)
  await climb(target.value)
}

async function rebuildLevelOne() {
  showErrors.value = true
  const was = creation.value
  if (problems.value.length || !was) return
  begin(1)
  restoreBuild(
    draft.value.sheet,
    buildNimbleSheet({
      ...was,
      stats: stats.value,
      skillPoints: skillPoints.value,
      picks: picks.value,
    }),
  )
  await climb(1)
}

function finish() {
  snackbar.show(`${draft.value.name} is reconfigured at level ${goal.value}`)
  goal.value = 0
  original.value = null
}

async function stepClosed() {
  const saved = original.value
  if (!goal.value || !saved) return
  if (draft.value.level >= goal.value) return finish()
  if (draft.value.level > openedAt.value) {
    openedAt.value = draft.value.level
    await nextTick()
    levelUpOpen.value = true
    return
  }
  draft.value.sheet = saved.sheet
  draft.value.level = saved.level
  goal.value = 0
  original.value = null
  await saveNow()
  snackbar.show(`Reconfigure cancelled: ${draft.value.name} is back as before`)
}

watch(levelUpOpen, (isOpen) => {
  if (!isOpen) void stepClosed()
})
</script>

<template>
  <UiDialog
    v-model="open"
    :title="`Reconfigure ${draft.name}`"
    :width="phase === 'level1' ? '760px' : '500px'"
  >
    <template v-if="phase === 'pick'">
      <p>
        Go back to an earlier level and pick again: everything gained above it is undone, then you
        level back up to {{ draft.level }} one level at a time, starting from your previous choices.
      </p>
      <div class="field">
        <label for="rc-level">Redo from</label>
        <select id="rc-level" v-model.number="target" class="input">
          <option v-for="l in targets" :key="l" :value="l">
            {{ l === 0 ? 'Level 1: stats, skills and starting picks' : `Level ${l + 1}` }}
          </option>
        </select>
      </div>
      <p class="small muted">
        Inventory, notes, wounds and current HP stay. Cancelling a level-up on the way puts the hero
        back exactly as they are now.
      </p>
    </template>

    <div v-else class="stack">
      <p class="small muted">
        {{ cls?.name }} · {{ creation?.ancestry.name }} · {{ background?.name }}. Your class,
        ancestry and background stay; your previous choices are filled in.
      </p>
      <NimbleStatsSkills
        v-model:array-id="arrayId"
        v-model:stats="stats"
        v-model:skill-points="skillPoints"
        :cls="cls"
        :ancestry="creation?.ancestry"
      />
      <div v-if="choices.length" class="panel stack">
        <NimbleChoicePicker
          v-for="c in choices"
          :key="c.key"
          v-model="picks[c.key]"
          :choice="c"
          :show-errors="showErrors"
          :key-value="keyValue"
        />
      </div>
      <p v-if="showErrors && problems.length" class="small error" role="alert">
        {{ problems.join(' · ') }}
      </p>
    </div>

    <template #actions>
      <button type="button" class="btn btn--ghost" @click="open = false">Cancel</button>
      <button
        v-if="phase === 'pick'"
        type="button"
        class="btn"
        :disabled="!targets.length"
        @click="start"
      >
        {{ target === 0 ? 'Redo level 1 choices' : `Reconfigure from level ${target + 1}` }}
      </button>
      <button v-else type="button" class="btn" @click="rebuildLevelOne">
        {{ draft.level > 1 ? 'Rebuild level 1 and continue' : 'Rebuild level 1' }}
      </button>
    </template>
  </UiDialog>

  <SheetLevelUpDialog v-model="levelUpOpen" :previous="previous[next]" :progress="progress" />
</template>

<style scoped lang="scss">
.error {
  margin: 0;
  color: var(--danger-text);
}
</style>
