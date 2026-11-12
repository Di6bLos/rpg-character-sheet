import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '~/lib/supabase'
import type { Combatant, Encounter, InitiativeRow, RosterEntry } from '~/types'
import { rollDie } from '~/utils/dice'
import { hpBand, sortOrder } from '~/utils/initiative'

export type TurnRow = InitiativeRow & { init_mod: number; created_at: string }

function fromCombatant(c: Combatant): TurnRow {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    initiative: c.initiative,
    character_id: c.character_id,
    campaign_npc_id: c.campaign_npc_id,
    portrait_path: c.portrait_path,
    group_label: c.group_label,
    hp: c.hp,
    hp_max: c.hp_max,
    ac: c.ac,
    hp_band: c.kind === 'pc' ? null : hpBand(c.hp, c.hp_max),
    init_mod: c.init_mod,
    created_at: c.created_at,
  }
}

/**
 * The turn order for one campaign, live. The GM reads `combatants` directly
 * (full HP); players read `campaign_initiative()`, which turns enemy HP into
 * a band, and refetch when the `encounters` row is touched.
 */
export function useInitiative(campaignId: Ref<string>, isGm: Ref<boolean>) {
  const snackbar = useSnackbarStore()
  const rows = ref<TurnRow[]>([])
  const encounter = ref<Encounter | null>(null)
  const loading = ref(true)
  let channel: RealtimeChannel | null = null

  const order = computed(() => sortOrder(rows.value))
  const activeId = computed(() => {
    const current = encounter.value?.active_combatant
    return order.value.some((c) => c.id === current) ? current : (order.value[0]?.id ?? null)
  })
  const round = computed(() => encounter.value?.round ?? 1)

  async function loadRows() {
    const id = campaignId.value
    if (isGm.value) {
      const { data, error } = await supabase.from('combatants').select('*').eq('campaign_id', id)
      if (error) throw error
      rows.value = ((data ?? []) as Combatant[]).map(fromCombatant)
    } else {
      const { data, error } = await supabase.rpc('campaign_initiative', { p_campaign: id })
      if (error) throw error
      rows.value = ((data ?? []) as InitiativeRow[]).map((r, i) => ({
        ...r,
        init_mod: 0,
        created_at: String(i).padStart(6, '0'),
      }))
    }
  }

  async function loadEncounter() {
    const { data, error } = await supabase
      .from('encounters')
      .select('campaign_id, round, active_combatant')
      .eq('campaign_id', campaignId.value)
      .maybeSingle()
    if (error) throw error
    encounter.value = (data as Encounter | null) ?? {
      campaign_id: campaignId.value,
      round: 1,
      active_combatant: null,
    }
  }

  async function load() {
    loading.value = true
    try {
      await Promise.all([loadRows(), loadEncounter()])
      subscribe()
    } catch (err) {
      snackbar.error(err, 'Could not load the turn order')
    } finally {
      loading.value = false
    }
  }

  // Each changed combatant fires its own event (and touches the encounter), so
  // adding 20 copies arrives as a burst: refetch once when it settles.
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let refreshRows = false
  function scheduleRefresh(rowsToo: boolean) {
    refreshRows ||= rowsToo
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      const withRows = refreshRows
      refreshRows = false
      const jobs: Promise<unknown>[] = [loadEncounter()]
      if (withRows) jobs.push(loadRows())
      Promise.all(jobs).catch((err) => snackbar.error(err, 'Could not refresh the turn order'))
    }, 150)
  }

  function subscribe() {
    if (channel) void supabase.removeChannel(channel)
    const filter = `campaign_id=eq.${campaignId.value}`
    channel = supabase
      .channel(`initiative-${campaignId.value}-${isGm.value ? 'gm' : 'party'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'encounters', filter }, () =>
        scheduleRefresh(!isGm.value),
      )
    if (isGm.value) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'combatants', filter },
        () => scheduleRefresh(true),
      )
    }
    channel.subscribe()
  }

  onMounted(load)
  watch([campaignId, isGm], load)
  onBeforeUnmount(() => {
    if (refreshTimer) clearTimeout(refreshTimer)
    if (channel) void supabase.removeChannel(channel)
  })

  // --- GM actions ----------------------------------------------------------------
  async function saveEncounter(patch: Partial<Encounter>) {
    if (!encounter.value) return
    Object.assign(encounter.value, patch)
    const { error } = await supabase.from('encounters').upsert({
      campaign_id: campaignId.value,
      round: encounter.value.round,
      active_combatant: encounter.value.active_combatant,
    })
    if (error) snackbar.error(error, 'Could not update the turn order')
  }

  function nextTurn() {
    if (!order.value.length) return
    const idx = order.value.findIndex((c) => c.id === activeId.value)
    if (idx + 1 >= order.value.length) {
      void saveEncounter({ active_combatant: order.value[0]!.id, round: round.value + 1 })
    } else {
      void saveEncounter({ active_combatant: order.value[idx + 1]!.id })
    }
  }

  function prevTurn() {
    if (!order.value.length) return
    const idx = order.value.findIndex((c) => c.id === activeId.value)
    if (idx <= 0) {
      if (round.value <= 1) return
      void saveEncounter({
        active_combatant: order.value[order.value.length - 1]!.id,
        round: round.value - 1,
      })
    } else {
      void saveEncounter({ active_combatant: order.value[idx - 1]!.id })
    }
  }

  async function insert(newRows: Partial<Combatant>[]) {
    const { data, error } = await supabase
      .from('combatants')
      .insert(newRows.map((r) => ({ ...r, campaign_id: campaignId.value })))
      .select()
    if (error) throw error
    // A realtime reload may already have brought these rows in.
    const added = ((data ?? []) as Combatant[]).map(fromCombatant)
    const ids = new Set(added.map((r) => r.id))
    rows.value = [...rows.value.filter((r) => !ids.has(r.id)), ...added]
  }

  /** Seats every character in the roster that isn't in the order yet, rolling initiative. */
  async function addParty(roster: RosterEntry[]) {
    const missing = roster.filter(
      (r) => r.character_id && !rows.value.some((c) => c.character_id === r.character_id),
    )
    if (!missing.length) return 0
    await insert(
      missing.map((r) => {
        const mod = r.summary?.initMod ?? 0
        return {
          name: r.character_name ?? r.display_name,
          kind: 'pc' as const,
          initiative: rollDie(20) + mod,
          init_mod: mod,
          hp: r.summary?.hp ?? 0,
          hp_max: r.summary?.hpMax ?? 0,
          ac: r.summary?.ac ?? 10,
          character_id: r.character_id,
          portrait_path: r.portrait_path,
        }
      }),
    )
    return missing.length
  }

  async function rollForNpcs() {
    const npcs = rows.value.filter((c) => c.kind !== 'pc')
    if (!npcs.length) return
    for (const c of npcs) c.initiative = rollDie(20) + c.init_mod
    const results = await Promise.all(
      npcs.map((c) =>
        supabase.from('combatants').update({ initiative: c.initiative }).eq('id', c.id),
      ),
    )
    const failed = results.find((r) => r.error)
    if (failed?.error) snackbar.error(failed.error, 'Could not save the new initiative')
    await saveEncounter({ active_combatant: order.value[0]?.id ?? null })
  }

  async function setInitiative(c: TurnRow, value: number) {
    c.initiative = value
    const { error } = await supabase.from('combatants').update({ initiative: value }).eq('id', c.id)
    if (error) snackbar.error(error, 'Could not change initiative')
  }

  // HP writes for one combatant go out one at a time, so quick clicks land in order.
  const hpWrites = new Map<string, Promise<void>>()

  function adjustHp(c: TurnRow, delta: number): Promise<void> {
    const max = c.hp_max ?? 0
    const hp = Math.max(0, Math.min(max, (c.hp ?? 0) + delta))
    c.hp = hp
    c.hp_band = c.kind === 'pc' ? null : hpBand(hp, max)
    const write = (hpWrites.get(c.id) ?? Promise.resolve()).then(async () => {
      const { error } = await supabase.from('combatants').update({ hp }).eq('id', c.id)
      if (error) {
        snackbar.error(error, 'Could not update hit points')
        await loadRows().catch(() => undefined)
      }
    })
    hpWrites.set(c.id, write)
    void write.finally(() => {
      if (hpWrites.get(c.id) === write) hpWrites.delete(c.id)
    })
    return write
  }

  async function remove(c: TurnRow) {
    const { error } = await supabase.from('combatants').delete().eq('id', c.id)
    if (error) return snackbar.error(error, 'Could not remove the combatant')
    rows.value = rows.value.filter((x) => x.id !== c.id)
  }

  async function endEncounter() {
    const { error } = await supabase.from('combatants').delete().eq('campaign_id', campaignId.value)
    if (error) return snackbar.error(error, 'Could not clear the encounter')
    rows.value = []
    await saveEncounter({ round: 1, active_combatant: null })
  }

  return {
    rows,
    order,
    activeId,
    round,
    loading,
    reload: loadRows,
    insert,
    nextTurn,
    prevTurn,
    addParty,
    rollForNpcs,
    setInitiative,
    adjustHp,
    remove,
    endEncounter,
  }
}
