import type { InjectionKey, Ref, ShallowRef } from 'vue'
import { SHEET_EDITOR, type SheetEditor } from '~/composables/useSheetEditor'
import type { Character } from '~/types'
import type { AnySheet } from '~/types/sheets'

/**
 * The sheet editor a board panel gives the player's seated hero (the quick-action
 * panel, the battle board's hero scope): an autosaving working copy that follows
 * `canEdit`, and a roster refresh once a save lands so the party sees the change.
 */
export function provideBoardSheetEditor(
  character: Character<AnySheet>,
  options: { canEdit: Ref<boolean>; campaignName: string },
) {
  const { reloadRoster, campaignId } = useCampaignBoard()
  const editor = provideSheetEditor(character, {
    canEdit: options.canEdit.value,
    campaignName: options.campaignName,
    campaignId: campaignId.value,
  })
  watch(options.canEdit, (on) => (editor.canEdit.value = on))
  watch(editor.saving, (now, before) => {
    if (before && !now && !editor.dirty.value) reloadRoster().catch(() => undefined)
  })
  return editor
}

/** The battle board's current hero editor, set by HeroEditor and read through HeroScope. */
export const BOARD_HERO: InjectionKey<ShallowRef<SheetEditor | null>> = Symbol('board-hero')

/**
 * HeroScope's stable provider: the hero's sheet editor lives in HeroEditor, a sibling of
 * the board frame, so the frame never remounts when the hero loads or changes. Descendants
 * read the current editor through one forwarding object; HeroScope mounts them (its
 * `hero` slot prop) only while an editor is set, and unmounts them across a change of
 * hero, so each sees one editor for its whole life.
 */
export function provideBoardHero(): ShallowRef<SheetEditor | null> {
  const current = shallowRef<SheetEditor | null>(null)
  provide(BOARD_HERO, current)
  provide(
    SHEET_EDITOR,
    new Proxy({} as SheetEditor, {
      get: (_target, key) => {
        if (current.value) return Reflect.get(current.value, key)
        // Vue and devtools probe objects for their own markers; let those read undefined.
        if (typeof key !== 'string' || key.startsWith('__v') || key === 'then') return undefined
        // A part that reads the sheet must sit behind HeroScope's `hero` slot prop.
        throw new Error(`useSheet(): no hero editor yet (read "${key}" outside \`v-if="hero"\`)`)
      },
    }),
  )
  return current
}
