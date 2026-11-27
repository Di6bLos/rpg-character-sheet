import type { Dnd5eSheet } from '~/types/sheets'
import { takeCoreAction } from '~/utils/dnd5eFeatures'

/**
 * The 5e Actions for the hero in the current sheet editor: the features, feats and options it
 * uses by cost (not reactions, attacks or on-a-hit riders), Help to an ally, and the core
 * actions (SRD 5.2.1 pp. 9–11). Shared by the sheet's Actions panel and the battle board's
 * action tiles.
 */
export function useDnd5eActions() {
  const { draft, canEdit, say } = useSheet<Dnd5eSheet>()
  const { claim, resultFor } = useResultOwner()
  const { entries } = useDnd5eSheet()
  const sheet = computed(() => draft.value.sheet)

  const usable = computed(() =>
    entries.value.filter(
      (e) =>
        !e.passive &&
        !e.attack &&
        !e.rule?.skip &&
        e.cost !== 'reaction' &&
        !(e.kind === 'option' && e.resource && e.cost === 'special'),
    ),
  )
  const sections = computed(() =>
    [
      {
        id: 'action',
        label: 'Actions',
        entries: usable.value.filter((e) => e.cost === 'action' || e.cost === 'magic'),
      },
      {
        id: 'bonus',
        label: 'Bonus Actions',
        entries: usable.value.filter((e) => e.cost === 'bonus'),
      },
      {
        id: 'other',
        label: 'Free and limited uses',
        entries: usable.value.filter((e) => !['action', 'magic', 'bonus'].includes(e.cost ?? '')),
      },
    ].filter((s) => s.entries.length),
  )

  const helping = useDnd5eHelp()
  const ally = ref('')

  async function helpAlly() {
    if (!ally.value) return
    const line = await helping.help(ally.value)
    if (line) claim('core:help', () => say(line))
  }

  function core(id: string) {
    if (canEdit.value)
      claim(`core:${id}`, () => say(takeCoreAction(sheet.value, draft.value.level, id)))
  }

  return {
    draft,
    canEdit,
    say,
    claim,
    resultFor,
    entries,
    sheet,
    usable,
    sections,
    helping,
    ally,
    helpAlly,
    core,
  }
}
