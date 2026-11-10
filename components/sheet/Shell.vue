<script setup lang="ts">
// Wraps a loaded character with the editing state, the action bar, the
// system-specific layout, the editor form and the level-up dialog.
import type { Character } from '~/types'
import type { AnySheet } from '~/types/sheets'

const props = defineProps<{
  character: Character<AnySheet>
  canEdit: boolean
  campaignName: string
}>()

const emit = defineEmits<{ deleted: [] }>()

const store = useCharacterStore()
const snackbar = useSnackbarStore()
const { theme } = useTheme()

const { draft, dirty, saving, save, canEdit } = provideSheetEditor(props.character, {
  canEdit: props.canEdit,
  campaignName: props.campaignName,
})

const editing = ref(false)
const levelUpOpen = ref(false)
const deleteOpen = ref(false)
const deleting = ref(false)

// The dark-fantasy 5e layouts carry their own Level up button.
const layoutHasLevelUp = computed(() => draft.value.system === 'dnd5e' && theme.value !== 'classic')

const saveLabel = computed(() =>
  saving.value ? 'Saving…' : dirty.value ? 'Save changes' : 'Saved',
)

async function confirmDelete() {
  deleting.value = true
  try {
    canEdit.value = false
    await store.remove(draft.value.id)
    snackbar.show(`${draft.value.name} was deleted`)
    emit('deleted')
  } catch (err) {
    canEdit.value = props.canEdit
    snackbar.error(err, 'Could not delete the character')
  } finally {
    deleting.value = false
    deleteOpen.value = false
  }
}

useHead({ title: () => `${draft.value.name} · Lantern` })
</script>

<template>
  <div class="sheet" :class="`sheet--${draft.system}`">
    <div class="sheet__bar">
      <NuxtLink to="/characters" class="back">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M15 6l-6 6 6 6" />
        </svg>
        All characters
      </NuxtLink>
      <div v-if="canEdit" class="row" style="gap: 10px">
        <button
          type="button"
          class="btn btn--ghost"
          :aria-pressed="editing"
          @click="editing = !editing"
        >
          {{ editing ? 'Done editing' : 'Edit sheet' }}
        </button>
        <button type="button" class="btn btn--ghost" :disabled="saving || !dirty" @click="save">
          {{ saveLabel }}
        </button>
        <button
          v-if="!layoutHasLevelUp || editing"
          type="button"
          class="btn"
          @click="levelUpOpen = true"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
          Level up
        </button>
      </div>
      <span v-else class="badge badge--outline">Read-only · GM view</span>
    </div>

    <template v-if="editing">
      <SheetEditor />
      <div class="panel danger-zone">
        <div>
          <h2>Delete this character</h2>
          <p class="small muted">
            Removes the sheet and its portrait for good. This can’t be undone.
          </p>
        </div>
        <button type="button" class="btn btn--danger" @click="deleteOpen = true">
          Delete character
        </button>
      </div>
    </template>
    <template v-else>
      <SheetDnd5eSheet v-if="draft.system === 'dnd5e'" @level-up="levelUpOpen = true" />
      <SheetPf2eSheet v-else-if="draft.system === 'pf2e'" />
      <SheetNimbleSheet v-else />
    </template>

    <SheetLevelUpDialog v-model="levelUpOpen" />

    <UiDialog v-model="deleteOpen" :title="`Delete ${draft.name}?`" alert width="460px">
      <p>The sheet and its portrait will be removed permanently.</p>
      <template #actions>
        <button type="button" class="btn btn--ghost" @click="deleteOpen = false">
          Keep character
        </button>
        <button type="button" class="btn btn--danger" :disabled="deleting" @click="confirmDelete">
          {{ deleting ? 'Deleting…' : 'Delete for good' }}
        </button>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped lang="scss">
.sheet {
  width: 100%;
  max-width: 1240px;
  margin: 0 auto;
  padding: 32px clamp(16px, 4vw, 48px) 64px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.sheet__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  color: var(--page-soft);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;

  &:hover {
    color: var(--page-text);
  }
}

.danger-zone {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
</style>
