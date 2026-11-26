import type { InjectionKey, Ref, ShallowRef } from 'vue'
import type { SheetEditor } from '~/composables/useSheetEditor'

/**
 * Undo for the player's last button on the battle board (an action tile or a turn step):
 * the hero's sheet as it was before the click, put back on Undo. Only what the click did
 * to the hero's own sheet comes back (actions, mana, uses, summons, conditions); the dice
 * are rolled and what reached others stays (a Help sent to an ally, a chat line), so Undo
 * posts "undid Staff" to party chat. The Undo is gone once anything else changes the sheet
 * (a later click, the GM's HP change, the tracker's turn steps), so it never overwrites
 * those.
 */
export interface ActionUndo {
  /** What Undo would take back ("Staff", "End turn"); empty when there is nothing. */
  label: Readonly<Ref<string>>
  /** Runs a click, keeping the sheet from before it when the click changed the sheet. */
  run: <T>(label: string, use: () => T) => T
  undo: () => void
  clear: () => void
}

const KEY: InjectionKey<ActionUndo> = Symbol('action-undo')

const json = (editor: SheetEditor) => JSON.stringify(editor.draft.value.sheet)

/** Created once by HeroScope, beside the battle result, for the board's hero editor. */
export function provideActionUndo(
  current: ShallowRef<SheetEditor | null>,
  onUndo: (label: string) => void,
): ActionUndo {
  const label = ref('')
  let before: string | null = null
  let after: string | null = null
  let running = false

  function clear() {
    label.value = ''
    before = after = null
  }

  function run<T>(name: string, use: () => T): T {
    const editor = current.value
    if (running || !editor?.canEdit.value) return use()
    const start = json(editor)
    running = true
    try {
      return use()
    } finally {
      running = false
      const end = json(editor)
      if (end !== start) {
        before = start
        after = end
        label.value = name
      }
    }
  }

  function undo() {
    const editor = current.value
    if (!editor || before === null || !label.value) return
    const name = label.value
    editor.draft.value.sheet = JSON.parse(before)
    clear()
    onUndo(name)
  }

  // Anything else that changes the sheet ends the Undo: it would put that back too.
  watch(
    () => current.value?.draft.value.sheet,
    () => {
      const editor = current.value
      if (!editor || after === null || running) return
      if (json(editor) !== after) clear()
    },
    { deep: true },
  )
  watch(current, clear)

  const api: ActionUndo = { label: readonly(label), run, undo, clear }
  provide(KEY, api)
  return api
}

/** The board's undo; null outside the battle board's hero scope (the full sheet). */
export function useActionUndo(): ActionUndo | null {
  return inject(KEY, null)
}
