import type { InjectionKey, Ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '~/lib/supabase'
import type { useInitiative } from '~/composables/useInitiative'
import type { GmUndo } from '~/composables/useGmUndo'
import type { SheetEditor } from '~/composables/useSheetEditor'
import type { NimbleSheet } from '~/types/sheets'
import { actionsLeft } from '~/utils/nimblePlay'
import { plural } from '~/utils/format'
import { syncSummonRows } from '~/utils/initiative'

/** How long the player has to keep their turn once they're out of actions. */
export const AUTO_END_MS = 4000
/** Hero pings that land this close together reload the roster once. */
const RELOAD_MS = 400

export interface BattleLive {
  /** The player's hero was saved: everyone reloads the roster (action pips, summons). */
  heroChanged: (characterId: string) => void
  /** The player's hero is out of actions on its turn: the GM's board passes the turn. */
  turnDone: (characterId: string) => void
}

const KEY: InjectionKey<BattleLive> = Symbol('battle-live')

/**
 * The battle board's live link between screens, on the campaign's broadcast channel
 * (`battle-live-<campaign>`). The messages only say that something happened; each screen
 * reads the facts from the database (RLS) or its own tracker, so a forged message can't
 * change anything by itself.
 *
 * - `hero`: a player's hero was saved. Every board reloads the roster, so party cards show
 *   each hero's actions left at once instead of at the next turn or 30-second refresh.
 * - `turn-done`: a player's hero is out of actions on its turn. A GM board whose tracker
 *   still has that hero acting passes the turn (`advanceFrom`, which lands only once).
 *
 * The GM's board also syncs summons into initiative whenever the roster changes while the
 * encounter has heroes seated (adds new ones, removes dismissed and slain ones), in place
 * of the Sync summons button. Call once per battle board (View).
 */
export function provideBattleLive(
  init: ReturnType<typeof useInitiative>,
  /** The top bar's Undo, which also takes back a turn passed this way. */
  gmUndo?: GmUndo,
): BattleLive {
  const { campaignId, gmControls, roster, reloadRoster } = useCampaignBoard()
  const features = useBattleFeatures()
  const snackbar = useSnackbarStore()
  let channel: RealtimeChannel | null = null

  let reloadTimer: ReturnType<typeof setTimeout> | undefined
  function scheduleReload() {
    clearTimeout(reloadTimer)
    reloadTimer = setTimeout(() => reloadRoster().catch(() => undefined), RELOAD_MS)
  }

  async function onTurnDone(characterId: unknown) {
    if (!gmControls.value || typeof characterId !== 'string') return
    const row = init.rows.value.find((r) => r.kind === 'pc' && r.character_id === characterId)
    if (!row || init.turnId.value !== row.id) return
    const undo = await init.advanceFrom(row.id)
    if (undo) gmUndo?.set(`${row.name}'s turn pass`, undo)
    if (undo)
      snackbar.show(`${row.name} is out of actions: next turn`, 'info', 6000, {
        label: 'Undo',
        run: undo,
      })
  }

  function subscribe() {
    if (channel) void supabase.removeChannel(channel)
    channel = supabase
      .channel(`battle-live-${campaignId.value}`)
      .on('broadcast', { event: 'hero' }, scheduleReload)
      .on(
        'broadcast',
        { event: 'turn-done' },
        ({ payload }) => void onTurnDone(payload?.characterId),
      )
      .subscribe()
  }

  // --- GM: summons follow the roster ----------------------------------------------------
  let syncing = false
  let again = false
  async function syncSummons() {
    if (!gmControls.value || !features.value.summons || init.loading.value) return
    if (!init.rows.value.some((r) => r.kind === 'pc')) return
    if (syncing) {
      again = true
      return
    }
    const { add, remove } = syncSummonRows(roster.value, init.rows.value)
    if (!add.length && !remove.length) return
    syncing = true
    try {
      const result = await init.syncSummons(roster.value)
      if (result?.added)
        snackbar.show(`${plural(result.added, 'summon')} joined initiative`, 'info')
    } finally {
      syncing = false
      if (again) {
        again = false
        void syncSummons()
      }
    }
  }
  watch([roster, () => init.rows.value.length, () => init.loading.value], () => void syncSummons())

  onMounted(subscribe)
  watch(campaignId, subscribe)
  onBeforeUnmount(() => {
    clearTimeout(reloadTimer)
    if (channel) void supabase.removeChannel(channel)
    channel = null
  })

  const send = (event: string, characterId: string) =>
    void channel?.send({ type: 'broadcast', event, payload: { characterId } })

  const live: BattleLive = {
    heroChanged: (id) => {
      send('hero', id)
      // This screen's own party cards too.
      scheduleReload()
    },
    turnDone: (id) => {
      send('turn-done', id)
      // A GM playing a hero at their own table: their own board passes it.
      void onTurnDone(id)
    },
  }
  provide(KEY, live)
  return live
}

export function useBattleLive(): BattleLive | null {
  return inject(KEY, null)
}

/**
 * The player's side of the live link, on the board's sheet editor (HeroEditor): tells the
 * table each time the hero is saved, and once the hero is out of actions on its turn
 * (the tracker says it's acting, Start turn ran), counts down AUTO_END_MS with a "Keep my
 * turn" button on the toast, then asks the GM's board to pass the turn. Gaining an action
 * back (Undo included), ending the turn by hand or the tracker moving on stops the countdown; keeping the
 * turn holds until the next turn.
 */
export function useBattleLiveHero(
  editor: SheetEditor,
  props: { characterId: string; turnCharacterId: Ref<string | null>; round: Ref<number | null> },
) {
  const live = useBattleLive()
  if (!live) return
  const snackbar = useSnackbarStore()

  watch(editor.saving, (now, before) => {
    if (before && !now) live.heroChanged(props.characterId)
  })

  const sheet = () => editor.draft.value.sheet as NimbleSheet
  const spent = computed(() => {
    const s = sheet()
    return (
      editor.canEdit.value &&
      props.turnCharacterId.value === props.characterId &&
      !!s.inEncounter &&
      !!s.turnActive &&
      actionsLeft(s) === 0
    )
  })

  let kept = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = () => {
    clearTimeout(timer)
    timer = undefined
  }
  watch([props.turnCharacterId, props.round], () => {
    kept = false
    stop()
  })
  watch(spent, (out) => {
    // An action came back (Undo, a refund) while counting down: the toast goes too.
    if (!out && timer) snackbar.visible = false
    stop()
    if (!out || kept) return
    snackbar.show('Out of actions: your turn ends in a moment', 'info', AUTO_END_MS, {
      label: 'Keep my turn',
      run: () => {
        kept = true
        stop()
      },
    })
    timer = setTimeout(() => {
      timer = undefined
      if (spent.value && !kept) live.turnDone(props.characterId)
    }, AUTO_END_MS)
  })
  onBeforeUnmount(stop)
}
