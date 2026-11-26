import type { Ref } from 'vue'
import type { InitiativeMode, RosterEntry } from '~/types'
import type { useInitiative } from '~/composables/useInitiative'
import { plural } from '~/utils/format'

/** The initiative rules the GM can pick, with a line on what each does. */
export const INITIATIVE_MODES: { mode: InitiativeMode; label: string; note: string }[] = [
  {
    mode: 'nimble',
    label: 'Nimble',
    note: 'Heroes go first; the roll sets their starting actions',
  },
  {
    mode: 'classic',
    label: 'Classic',
    note: 'The roll sets the turn order; heroes start with full actions',
  },
]

/**
 * The GM's encounter tools behind the battle board's ⋯ menus (the desktop turn bar's and
 * the phone bar's): Add the party, Sync summons, Reroll NPC initiative and the initiative
 * rules. `onRun` runs as each one starts (the caller closes its menu).
 */
export function useGmEncounterTools(
  init: ReturnType<typeof useInitiative>,
  roster: Ref<RosterEntry[]>,
  onRun?: () => void,
) {
  const snackbar = useSnackbarStore()
  const board = useCampaignBoard()
  const busy = ref(false)

  const partyMissing = computed(
    () =>
      roster.value.filter(
        (r) => r.character_id && !init.rows.value.some((c) => c.character_id === r.character_id),
      ).length,
  )

  /** Out of an encounter (no one acting yet) with heroes not seated: offer Add party. */
  const offerParty = computed(() => !init.turnId.value && partyMissing.value > 0)

  async function run(job: () => Promise<void>) {
    onRun?.()
    busy.value = true
    try {
      await job()
    } finally {
      busy.value = false
    }
  }

  const addParty = () =>
    run(async () => {
      try {
        const n = await init.addParty(roster.value)
        snackbar.show(n ? `${plural(n, 'character')} added to initiative` : 'The party is seated')
      } catch (err) {
        snackbar.error(err, 'Could not add the party')
      }
    })

  const syncSummons = () =>
    run(async () => {
      try {
        await board.reloadRoster()
        const result = await init.syncSummons(board.roster.value)
        if (!result) return
        const parts: string[] = []
        if (result.added) parts.push(`${plural(result.added, 'summon')} added`)
        if (result.removed)
          parts.push(
            result.added
              ? `${result.removed} removed`
              : `${plural(result.removed, 'summon')} removed`,
          )
        snackbar.show(parts.length ? parts.join(', ') : 'Summons are up to date')
      } catch (err) {
        snackbar.error(err, 'Could not sync the summons')
      }
    })

  const reroll = () => run(() => init.rollForNpcs())

  const setMode = (mode: InitiativeMode) => run(() => init.setMode(mode))

  return { busy, partyMissing, offerParty, addParty, syncSummons, reroll, setMode }
}

/**
 * New round from the GM's turn bars, with an Undo on the toast: a mis-tap beside Next would
 * otherwise skip the rest of the round, and Previous turn can't bring that turn back.
 */
export function useNewRound(init: ReturnType<typeof useInitiative>) {
  const snackbar = useSnackbarStore()
  const gmUndo = useGmUndo()
  return async () => {
    const undo = await init.newRound()
    if (!undo) return
    gmUndo?.set('New round', undo)
    snackbar.show(`Round ${init.round.value}`, 'success', 6000, { label: 'Undo', run: undo })
  }
}

/**
 * Next turn from the GM's bars, with an Undo on the toast naming who acts now: a mis-tap
 * would otherwise refill the ended turn's summons, which Previous turn doesn't put back.
 */
export function useNextTurn(init: ReturnType<typeof useInitiative>) {
  const snackbar = useSnackbarStore()
  const gmUndo = useGmUndo()
  return async () => {
    const undo = await init.nextTurn()
    if (!undo) return
    gmUndo?.set('Next turn', undo)
    const now = init.order.value.find((c) => c.id === init.turnId.value)?.name
    snackbar.show(now ? `${now}'s turn` : 'Next turn', 'info', 5000, { label: 'Undo', run: undo })
  }
}
