import type { InjectionKey, Ref } from 'vue'
import type { Character } from '~/types'
import type { AnySheet, NimbleSheet, Pf2eSheet } from '~/types/sheets'
import { portraitUrl } from '~/stores/character'
import { showOutcome } from '~/utils/dice'
import { applyHpChangeFor } from '~/utils/heroHpChange'
import { beginEncounter, endEncounter, initiativeRoll } from '~/utils/nimblePlay'
import { endPf2eEncounter, inEncounter as pf2eInEncounter, newTurn } from '~/utils/pf2eActions'
import { acParts } from '~/utils/pf2ePlay'
import { seatChange, type Seat } from '~/utils/turnSteps'

export interface SheetEditor<T extends AnySheet = AnySheet> {
  /** Working copy; mutate freely, it autosaves for the owner. */
  draft: Ref<Character<T>>
  canEdit: Ref<boolean>
  dirty: Ref<boolean>
  saving: Ref<boolean>
  held: Ref<boolean>
  lastRoll: Ref<string>
  campaignName: Ref<string>
  campaignId: Ref<string | null>
  /** The hero is seated in the GM's encounter: the tracker runs it, not the player. */
  gmEncounter: Ref<boolean>
  /** Whose turn the GM's tracker is on (a character id; null between turns or for a creature). */
  trackerTurnId: Ref<string | null>
  /** The tracker's round while a turn is running, else null. */
  trackerRound: Ref<number | null>
  portrait: Ref<string | null>
  uploadingPortrait: Ref<boolean>
  hpPct: Ref<number>
  xpPct: Ref<number>
  xpLabel: Ref<string>
  adjustHp: (delta: number) => void
  say: (message: string) => void
  save: () => Promise<void>
  /** Saves right away, even before the change watcher has marked the draft dirty. */
  saveNow: () => Promise<void>
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
  options: { canEdit: boolean; campaignName: string; campaignId?: string | null },
): SheetEditor {
  const store = useCharacterStore()
  const snackbar = useSnackbarStore()

  const draft = ref(structuredClone(toRaw(source))) as Ref<Character<AnySheet>>
  const canEdit = ref(options.canEdit)
  const dirty = ref(false)
  const saving = ref(false)
  const held = ref(false)
  const lastRoll = ref('')
  const campaignName = ref(options.campaignName)
  const campaignId = ref(options.campaignId ?? null)
  const uploadingPortrait = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  let pendingSave: Promise<void> | null = null

  /**
   * Saves the draft. A call made while a save is in flight runs after it. Each save is
   * tracked per character, so a load elsewhere (the board after a layout swap) waits for it.
   */
  function save(): Promise<void> {
    return sheetSaves.track(draft.value.id, saveInOrder())
  }

  async function saveInOrder(): Promise<void> {
    clearTimeout(timer)
    if (pendingSave) {
      await pendingSave
      return saveInOrder()
    }
    if (!canEdit.value || held.value || !dirty.value) return
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

  function saveNow(): Promise<void> {
    dirty.value = true
    return save()
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

  // "Manual dice" is the player's (account menu, `profiles.own_dice`); copy it
  // onto the Nimble sheet they edit, where the rules read `sheet.ownDice`.
  const auth = useAuthStore()
  watch(
    () => auth.profile?.own_dice,
    (on) => {
      if (on === undefined || !canEdit.value || draft.value.system !== 'nimble') return
      const sheet = draft.value.sheet as NimbleSheet
      if (sheet.ownDice !== on) sheet.ownDice = on
    },
    { immediate: true },
  )

  // PF2e: the AC parts the battle board stacks with the roster's conditions and shield
  // (`acParts`), kept in step with the sheet so the party sees the hero's AC as it is.
  watch(
    () =>
      canEdit.value && draft.value.system === 'pf2e'
        ? JSON.stringify(acParts(draft.value.sheet as Pf2eSheet))
        : null,
    (parts) => {
      if (parts === null) return
      const sheet = draft.value.sheet as Pf2eSheet
      if (JSON.stringify(sheet.acParts ?? null) !== parts) sheet.acParts = JSON.parse(parts)
    },
    { immediate: true },
  )

  // The GM's encounter, for a Nimble or PF2e hero the player edits in a campaign: its
  // initiative rules (Nimble: Classic starts heroes with full actions, read as
  // `sheet.classicInitiative`), and whether the hero is seated on the tracker. Being seated
  // joins the encounter (Nimble: New encounter, then Roll Initiative); leaving the tracker
  // ends it, and while seated the Nimble turn steps are only Roll Initiative, Start turn and
  // End turn (`gmEncounter`). PF2e: leaving ends the encounter (endPf2eEncounter: Rage and
  // the encounter's effects end), a new fight clears the last one's turn, and the tracker's
  // Initiative is the sheet's (`turn.initiative`).
  const nimble = computed(() => draft.value.system === 'nimble')
  const tracked = computed(
    () => canEdit.value && (draft.value.system === 'nimble' || draft.value.system === 'pf2e'),
  )
  const encounter = useCampaignEncounter(
    computed(() => (tracked.value ? campaignId.value : null)),
    computed(() => (tracked.value ? draft.value.id : null)),
  )
  watch(
    [encounter.mode, campaignId],
    ([mode, campaign]) => {
      if (!tracked.value || !nimble.value) return
      const sheet = draft.value.sheet as NimbleSheet
      // No campaign: the default Nimble rule. Unknown yet (loading, or a failed load):
      // keep what the sheet has.
      if (!campaign) {
        if (sheet.classicInitiative) sheet.classicInitiative = false
        return
      }
      if (mode === null) return
      const classic = mode === 'classic'
      if ((sheet.classicInitiative ?? false) !== classic) sheet.classicInitiative = classic
    },
    { immediate: true },
  )
  // The seat (combatant id) is saved on the sheet as `gmCombatant`, so a later load can
  // tell the same fight from a new one, or from one the GM ended while the player was away.
  const seat = computed<Seat>(() => {
    const seated = encounter.seated.value
    if (seated === null) return null
    return seated ? (encounter.hero.value?.combatantId ?? null) : false
  })
  watch(
    seat,
    (now, before) => {
      if (!tracked.value) return
      if (!nimble.value) return pf2eSeat(now, before)
      const sheet = draft.value.sheet as NimbleSheet
      const change = seatChange(before, now, sheet)
      if (change === 'begin') lastRoll.value = beginEncounter(sheet)
      else if (change === 'end') lastRoll.value = endEncounter(sheet, draft.value.level)
      if (now === null) return
      const joined = now || undefined
      if (sheet.gmCombatant !== joined) sheet.gmCombatant = joined
    },
    { immediate: true },
  )
  /**
   * PF2e's seat: leaving the GM's tracker ends the encounter; a new fight (another seat than
   * the one saved) first clears the last one. A roll made before the GM seats the hero stays.
   */
  function pf2eSeat(now: Seat, before: Seat | undefined) {
    const sheet = draft.value.sheet as Pf2eSheet
    const state = {
      inEncounter: pf2eInEncounter(sheet),
      awaitingInitiative: sheet.turn?.initiative === undefined && !sheet.turn?.active,
      gmCombatant: sheet.gmCombatant,
    }
    const change = seatChange(before, now, state)
    if (change === 'end') lastRoll.value = endPf2eEncounter(sheet)
    else if (change === 'begin' && state.gmCombatant && state.gmCombatant !== now)
      endPf2eEncounter(sheet)
    if (now === null) return
    const joined = now || undefined
    if (sheet.gmCombatant !== joined) sheet.gmCombatant = joined
  }
  const gmEncounter = computed(() => tracked.value && encounter.seated.value === true)
  // The GM typed this hero's Initiative while the sheet waits for it: take that score
  // (starting actions and "when you roll Initiative" effects) instead of asking for a
  // roll that would overwrite it. Only on the change seen here, so an old score on the
  // tracker is never applied to a new encounter.
  watch(encounter.hero, (now, before) => {
    if (!tracked.value || !now?.rolled) return
    if (!nimble.value) return pf2eTrackerInitiative(now.initiative)
    if (before?.rolled !== false) return
    const sheet = draft.value.sheet as NimbleSheet
    if (!sheet.awaitingInitiative) return
    const { message } = initiativeRoll(sheet, draft.value.level, Math.random, now.initiative)
    lastRoll.value = `GM set your Initiative. ${message}`
  })

  /**
   * PF2e: the tracker's Initiative for the seated hero is the sheet's, rolled there, on the
   * board or typed by the GM, so the sheet won't roll another this encounter.
   */
  function pf2eTrackerInitiative(total: number) {
    const sheet = draft.value.sheet as Pf2eSheet
    const turn = (sheet.turn ??= newTurn())
    if (turn.initiative === total) return
    const was = turn.initiative
    turn.initiative = total
    lastRoll.value =
      was === undefined
        ? `Initiative ${total}, as the GM's tracker has it.`
        : `Initiative ${total}: the GM's tracker changed it from ${was}.`
  }

  /**
   * The sheet's ±1 HP buttons. 5e and PF2e follow the same rules as the GM's changes (temp HP
   * first, death saves / Dying at 0, healing from 0 resets them); Nimble just steps HP.
   */
  function adjustHp(delta: number) {
    if (!canEdit.value || !delta) return
    const { system, sheet, level } = draft.value
    if (system === 'dnd5e' || system === 'pf2e') {
      applyHpChangeFor(system, sheet, level, { id: '', amount: delta, crit: false })
      return
    }
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
      await saveNow()
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
    held,
    lastRoll,
    campaignName,
    campaignId,
    gmEncounter,
    trackerTurnId: encounter.turnCharacterId,
    trackerRound: encounter.round,
    uploadingPortrait,
    portrait: computed(() => {
      const override = (draft.value.sheet as { portraitOverride?: string }).portraitOverride
      return portraitUrl(override || draft.value.portrait_path)
    }),
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
    say: (message: string) => {
      lastRoll.value = message
      // Every result line goes to the dice tray (all systems). It only shows a line while
      // it has dice from the same click to throw, or is still open (see DiceTray's merge).
      showOutcome({ label: '', total: null, detail: message })
    },
    save,
    saveNow,
    onPortrait,
  }

  provide(SHEET_EDITOR, editor)
  return editor
}
