<script setup lang="ts">
// Reconfigure: go back to an earlier level, undoing what the levels above it
// granted, then level back up one level at a time, starting from the old picks.
import type { AnySheet, NimbleLevelInput, NimbleSheet } from '~/types/sheets'
import { canRestore, restoreLevel } from '~/utils/levelHistory'
import { syncCompanions } from '~/utils/nimbleBuild'

const open = defineModel<boolean>({ required: true })
const { draft, saveNow } = useSheet()
const snackbar = useSnackbarStore()

const targets = computed(() =>
  Array.from({ length: Math.max(0, draft.value.level - 1) }, (_, i) => i + 1).filter((l) =>
    canRestore(draft.value.sheet, l),
  ),
)
const target = ref(1)
watch(open, (isOpen) => {
  if (isOpen) target.value = targets.value.at(-1) ?? 1
})

const goal = ref(0)
const original = ref<{ level: number; sheet: AnySheet } | null>(null)
const previous = ref<Record<number, NimbleLevelInput>>({})
const levelUpOpen = ref(false)
const openedAt = ref(0)

const next = computed(() => draft.value.level + 1)
const progress = computed(() => `Reconfiguring · ${next.value} of ${goal.value}`)

async function start() {
  const level = draft.value.level
  const sheet = draft.value.sheet
  original.value = { level, sheet: JSON.parse(JSON.stringify(sheet)) as AnySheet }
  previous.value = Object.fromEntries(
    (sheet.levelHistory ?? [])
      .filter((e) => e.level > target.value && e.nimble)
      .map((e) => [e.level, e.nimble!]),
  )
  goal.value = level
  restoreLevel(sheet, target.value)
  if (draft.value.system === 'nimble') syncCompanions(sheet as NimbleSheet)
  draft.value.level = target.value
  open.value = false
  await saveNow()
  openedAt.value = target.value
  levelUpOpen.value = true
}

async function stepClosed() {
  const saved = original.value
  if (!goal.value || !saved) return
  if (draft.value.level >= goal.value) {
    snackbar.show(`${draft.value.name} is reconfigured at level ${goal.value}`)
  } else if (draft.value.level > openedAt.value) {
    openedAt.value = draft.value.level
    await nextTick()
    levelUpOpen.value = true
    return
  } else {
    draft.value.sheet = saved.sheet
    draft.value.level = saved.level
    await saveNow()
    snackbar.show(`Reconfigure cancelled: ${draft.value.name} is back as before`)
  }
  goal.value = 0
  original.value = null
}

watch(levelUpOpen, (isOpen) => {
  if (!isOpen) void stepClosed()
})
</script>

<template>
  <UiDialog v-model="open" :title="`Reconfigure ${draft.name}`" width="500px">
    <p>
      Go back to an earlier level and pick again: everything gained above it is undone, then you
      level back up to {{ draft.level }} one level at a time, starting from your previous choices.
    </p>
    <div class="field">
      <label for="rc-level">Go back to level</label>
      <select id="rc-level" v-model.number="target" class="input">
        <option v-for="l in targets" :key="l" :value="l">{{ l }}</option>
      </select>
    </div>
    <p class="small muted">
      Inventory, notes, wounds and current HP stay. Cancelling a level-up on the way puts the hero
      back exactly as they are now.
    </p>
    <template #actions>
      <button type="button" class="btn btn--ghost" @click="open = false">Cancel</button>
      <button type="button" class="btn" :disabled="!targets.length" @click="start">
        Reconfigure from level {{ target + 1 }}
      </button>
    </template>
  </UiDialog>

  <SheetLevelUpDialog v-model="levelUpOpen" :previous="previous[next]" :progress="progress" />
</template>
