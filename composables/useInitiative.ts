import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '~/lib/supabase'
import type { Combatant, Encounter, InitiativeRow, RosterEntry } from '~/types'
import { rollDie } from '~/utils/dice'
import { hpBand, isSlainSummon, sortOrder, summonOwner, syncSummonRows } from '~/utils/initiative'

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
    summon_key: c.summon_key,
    conditions: c.conditions ?? [],
    actions_max: c.actions_max,
    actions_used: c.actions_used,
  }
}

/**
 * The turn order for one campaign, live. The GM reads `combatants` directly
 * (full HP); players read `campaign_initiative()`, which turns enemy HP into
 * a band, and refetch when the `encounters` row is touched.
 */
/**
 * `channel` names this instance's realtime channel; two instances on one channel
 * would cut each other's updates when either unmounts (supabase-js reuses it).
 */
export function useInitiative(
  campaignId: Ref<string>,
  isGm: Ref<boolean>,
  options: { channel?: string } = {},
) {
  const snackbar = useSnackbarStore()
  const rows = ref<TurnRow[]>([])
  const encounter = ref<Encounter | null>(null)
  const loading = ref(true)
  let channel: RealtimeChannel | null = null

  /** Turn order: summons act on their summoner's turn, so they sit under the hero instead. */
  const order = computed(() => sortOrder(rows.value.filter((r) => r.kind !== 'summon')))

  /** A hero's living summons in initiative, for the dropdown under their portrait. */
  function summonsOf(characterId: string | null): TurnRow[] {
    if (!characterId) return []
    return sortOrder(
      rows.value.filter(
        (r) =>
          r.kind === 'summon' &&
          !!r.summon_key &&
          summonOwner(r.summon_key) === characterId &&
          !isSlainSummon(r),
      ),
    )
  }
  /** The first living combatant after `id` in the full order (slain summons included). */
  function livingAfter(id: string): string | null {
    const all = sortOrder(rows.value)
    const at = all.findIndex((c) => c.id === id)
    if (at < 0) return null
    const live = new Set(order.value.map((c) => c.id))
    return [...all.slice(at + 1), ...all.slice(0, at)].find((c) => live.has(c.id))?.id ?? null
  }

  /** Whose turn it is by the encounter; null while loading or before the GM starts one. */
  const turnId = computed(() => {
    const current = encounter.value?.active_combatant
    if (loading.value || !current) return null
    return order.value.some((c) => c.id === current) ? current : livingAfter(current)
  })
  const activeId = computed(() => turnId.value ?? order.value[0]?.id ?? null)
  const round = computed(() => encounter.value?.round ?? 1)

  // HP writes for one combatant go out one at a time, so quick clicks land in order.
  const hpWrites = new Map<string, Promise<void>>()
  /** HP the GM has set but the server hasn't confirmed yet; reloads keep it. */
  const pendingHp = new Map<string, number>()

  function withPendingHp(row: TurnRow): TurnRow {
    const hp = pendingHp.get(row.id)
    if (hp === undefined) return row
    return { ...row, hp, hp_band: row.kind === 'pc' ? null : hpBand(hp, row.hp_max ?? 0) }
  }

  async function loadRows() {
    const id = campaignId.value
    if (isGm.value) {
      const { data, error } = await supabase.from('combatants').select('*').eq('campaign_id', id)
      if (error) throw error
      rows.value = ((data ?? []) as Combatant[]).map(fromCombatant).map(withPendingHp)
    } else {
      const { data, error } = await supabase.rpc('campaign_initiative', { p_campaign: id })
      if (error) throw error
      rows.value = ((data ?? []) as InitiativeRow[]).map((r, i) => ({
        ...r,
        init_mod: 0,
        created_at: String(i).padStart(6, '0'),
        summon_key: r.summon_key ?? null,
        conditions: r.conditions ?? [],
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
      .channel(`initiative-${campaignId.value}-${options.channel ?? (isGm.value ? 'gm' : 'party')}`)
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
    if (!turnId.value) {
      void saveEncounter({ active_combatant: order.value[0]!.id })
      return
    }
    const idx = order.value.findIndex((c) => c.id === activeId.value)
    if (idx + 1 >= order.value.length) {
      void saveEncounter({ active_combatant: order.value[0]!.id, round: round.value + 1 })
    } else {
      void saveEncounter({ active_combatant: order.value[idx + 1]!.id })
    }
  }

  function prevTurn() {
    if (!order.value.length || !turnId.value) return
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
    const npcs = rows.value.filter((c) => c.kind !== 'pc' && !c.summon_key)
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
    const moved = [
      c,
      ...rows.value.filter(
        (r) => c.kind === 'pc' && !!r.summon_key && summonOwner(r.summon_key) === c.character_id,
      ),
    ]
    for (const r of moved) r.initiative = value
    const ids = moved.map((r) => r.id)
    const { error } = await supabase.from('combatants').update({ initiative: value }).in('id', ids)
    if (error) snackbar.error(error, 'Could not change initiative')
  }

  function adjustHp(c: TurnRow, delta: number): Promise<void> {
    const id = c.id
    const max = c.hp_max ?? 0
    const hp = Math.max(0, Math.min(max, (c.hp ?? 0) + delta))
    c.hp = hp
    c.hp_band = c.kind === 'pc' ? null : hpBand(hp, max)
    pendingHp.set(id, hp)
    const write = (hpWrites.get(id) ?? Promise.resolve()).then(async () => {
      const { error } = await supabase.from('combatants').update({ hp }).eq('id', id)
      const latest = hpWrites.get(id) === write
      if (latest) {
        hpWrites.delete(id)
        pendingHp.delete(id)
      }
      if (error) {
        snackbar.error(error, 'Could not update hit points')
        if (latest) await loadRows().catch(() => undefined)
      }
    })
    hpWrites.set(id, write)
    return write
  }

  async function pruneSummons(roster: RosterEntry[]) {
    const { remove: gone } = syncSummonRows(roster, rows.value)
    if (!gone.length) return
    const active = encounter.value?.active_combatant
    if (active && gone.includes(active)) {
      const next = livingAfter(active)
      if (next) await saveEncounter({ active_combatant: next })
    }
    const { error } = await supabase.from('combatants').delete().in('id', gone)
    if (error) return snackbar.error(error, 'Could not remove slain summons')
    rows.value = rows.value.filter((x) => !gone.includes(x.id))
  }

  async function syncSummons(roster: RosterEntry[]) {
    const { add, remove: gone } = syncSummonRows(roster, rows.value)
    if (gone.length) {
      const { error } = await supabase.from('combatants').delete().in('id', gone)
      if (error) {
        snackbar.error(error, 'Could not remove the dismissed summons')
        return null
      }
      rows.value = rows.value.filter((x) => !gone.includes(x.id))
    }
    if (add.length) {
      try {
        await insert(add)
      } catch (err) {
        snackbar.error(err, 'Could not add the summons')
        return null
      }
    }
    return { added: add.length, removed: gone.length }
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
    summonsOf,
    activeId,
    turnId,
    round,
    loading,
    reload: loadRows,
    insert,
    nextTurn,
    prevTurn,
    addParty,
    pruneSummons,
    syncSummons,
    rollForNpcs,
    setInitiative,
    adjustHp,
    remove,
    endEncounter,
  }
}
