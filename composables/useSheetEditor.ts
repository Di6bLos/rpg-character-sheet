import type { InjectionKey, Ref } from 'vue'
import type { Character } from '~/types'
import type { AnySheet } from '~/types/sheets'
import { portraitUrl } from '~/stores/character'

export interface SheetEditor<T extends AnySheet = AnySheet> {
  /** Working copy; mutate freely, it autosaves for the owner. */
  draft: Ref<Character<T>>
  canEdit: Ref<boolean>
  dirty: Ref<boolean>
  saving: Ref<boolean>
  lastRoll: Ref<string>
  campaignName: Ref<string>
  portrait: Ref<string | null>
  uploadingPortrait: Ref<boolean>
  hpPct: Ref<number>
  xpPct: Ref<number>
  xpLabel: Ref<string>
  adjustHp: (delta: number) => void
  say: (message: string) => void
  save: () => Promise<void>
  onPortrait: (event: Event) => Promise<void>
}

export const SHEET_EDITOR: InjectionKey<SheetEditor> = Symbol('sheet-editor')

export function useSheet<T extends AnySheet = AnySheet>(): SheetEditor<T> {
  const editor = inject(SHEET_EDITOR)
  if (!editor) throw new Error('useSheet() must be used inside a character sheet')
  return editor as unknown as SheetEditor<T>
}

const AUTOSAVE_MS = 1500

/** Creates and provides the editing state for one character sheet page. */
export function provideSheetEditor(
  source: Character<AnySheet>,
  options: { canEdit: boolean; campaignName: string },
): SheetEditor {
  const store = useCharacterStore()
  const snackbar = useSnackbarStore()

  const draft = ref(structuredClone(toRaw(source))) as Ref<Character<AnySheet>>
  const canEdit = ref(options.canEdit)
  const dirty = ref(false)
  const saving = ref(false)
  const lastRoll = ref('')
  const campaignName = ref(options.campaignName)
  const uploadingPortrait = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  let pendingSave: Promise<void> | null = null

  /** Saves the draft. A call made while a save is in flight runs after it. */
  async function save(): Promise<void> {
    clearTimeout(timer)
    if (pendingSave) {
      await pendingSave
      return save()
    }
    if (!canEdit.value || !dirty.value) return
    pendingSave = persist()
    try {
      await pendingSave
    } finally {
      pendingSave = null
    }
  }

  async function persist() {
    saving.value = true
    // Cleared up front so edits made while the request is in flight re-mark it.
    dirty.value = false
    try {
      const { name, level, sheet, portrait_path } = draft.value
      await store.save(draft.value.id, {
        name: name.trim() || 'Unnamed',
        level,
        // The sheet is plain JSON (jsonb). A JSON round-trip copies it even when
        // reactive proxies ended up nested inside (e.g. arrays rebuilt with
        // .filter() on the reactive draft), which structuredClone rejects.
        sheet: JSON.parse(JSON.stringify(sheet)) as AnySheet,
        portrait_path,
      })
    } catch (err) {
      dirty.value = true
      snackbar.error(err, 'Could not save the sheet')
      throw err
    } finally {
      saving.value = false
    }
  }

  /** save() for fire-and-forget callers; errors are already shown as a toast. */
  function saveQuietly() {
    save().catch(() => {})
  }

  watch(
    draft,
    () => {
      if (!canEdit.value) return
      dirty.value = true
      clearTimeout(timer)
      timer = setTimeout(saveQuietly, AUTOSAVE_MS)
    },
    { deep: true },
  )

  onBeforeUnmount(saveQuietly)

  function adjustHp(delta: number) {
    if (!canEdit.value) return
    const sheet = draft.value.sheet
    sheet.hp = Math.max(0, Math.min(sheet.hpMax, sheet.hp + delta))
  }

  async function onPortrait(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0] ?? null
    input.value = ''
    if (!file || !canEdit.value) return
    if (!file.type.startsWith('image/')) {
      snackbar.show('Portraits must be an image file', 'error')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      snackbar.show('Portraits can be up to 5 MB', 'error')
      return
    }
    uploadingPortrait.value = true
    const previous = draft.value.portrait_path
    let uploaded: string | null = null
    try {
      uploaded = await store.uploadPortrait(draft.value.id, file)
      draft.value.portrait_path = uploaded
      await save()
      if (previous && previous !== uploaded) await store.removePortrait(previous)
    } catch (err) {
      if (uploaded && draft.value.portrait_path === uploaded) {
        // The new path never reached the database; put the old one back and
        // drop the orphaned upload.
        draft.value.portrait_path = previous
        await store.removePortrait(uploaded)
      }
      snackbar.error(err, 'Could not update the portrait')
    } finally {
      uploadingPortrait.value = false
    }
  }

  const editor: SheetEditor = {
    draft,
    canEdit,
    dirty,
    saving,
    lastRoll,
    campaignName,
    uploadingPortrait,
    portrait: computed(() => portraitUrl(draft.value.portrait_path)),
    hpPct: computed(() => {
      const { hp, hpMax } = draft.value.sheet
      return hpMax > 0 ? Math.round((Math.min(hp, hpMax) / hpMax) * 100) : 0
    }),
    xpPct: computed(() => {
      const { xp, xpNext } = draft.value.sheet
      return xpNext > 0 ? Math.min(100, Math.round((xp / xpNext) * 100)) : 0
    }),
    xpLabel: computed(() => {
      const { xp, xpNext } = draft.value.sheet
      return `${xp.toLocaleString()} / ${xpNext.toLocaleString()} XP`
    }),
    adjustHp,
    say: (message: string) => (lastRoll.value = message),
    save,
    onPortrait,
  }

  provide(SHEET_EDITOR, editor)
  return editor
}
