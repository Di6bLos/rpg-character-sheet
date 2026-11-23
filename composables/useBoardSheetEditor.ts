import type { Ref } from 'vue'
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
