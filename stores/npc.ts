import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '~/lib/supabase'
import type { CampaignNpc, GameSystem, NpcKind, NpcSource, PoolNpc, StatBlock } from '~/types'
import { safeFileName } from '~/utils/format'
import { buildCopies, combatantName } from '~/utils/initiative'
import { journalStub } from '~/utils/npcJournal'

export const NPC_IMAGE_MAX = 5 * 1024 * 1024

export interface NpcDraft {
  system: GameSystem
  kind: NpcKind
  name: string
  level: string
  stat_block: StatBlock
  image_path: string | null
  gm_notes: string
  ai_generated?: boolean
}

export interface PoolFilter {
  system?: GameSystem | null
  kind?: NpcKind | null
  source?: NpcSource | null
  q?: string
  /** Only NPCs this user made. */
  mine?: boolean
}

/**
 * NPCs: a campaign's own index (`campaign_npcs`, GM only) and the shared pool
 * (`npcs`). Every NPC a GM saves is also published to the pool while the
 * admins have it switched on; the campaign keeps its own copy either way.
 */
export const useNpcStore = defineStore('npc', () => {
  const campaignNpcs = ref<CampaignNpc[]>([])
  const campaignId = ref<string | null>(null)
  const loading = ref(false)
  /** Bumped on reset so a fetch started by the previous account can't refill the store. */
  let generation = 0

  async function fetchCampaign(id: string) {
    const gen = generation
    loading.value = true
    try {
      const { data, error } = await supabase
        .from('campaign_npcs')
        .select('*')
        .eq('campaign_id', id)
        .order('name')
      if (error) throw error
      if (gen !== generation) return
      campaignNpcs.value = (data ?? []) as CampaignNpc[]
      campaignId.value = id
    } finally {
      if (gen === generation) loading.value = false
    }
  }

  /** Forget everything on sign-out or account change (stat blocks and GM notes are private). */
  function reset() {
    generation++
    campaignNpcs.value = []
    campaignId.value = null
    loading.value = false
  }

  async function searchPool(filter: PoolFilter, limit = 60): Promise<PoolNpc[]> {
    const auth = useAuthStore()
    let query = supabase.from('npcs').select('*').order('name').limit(limit)
    if (filter.system) query = query.eq('system', filter.system)
    if (filter.kind) query = query.eq('kind', filter.kind)
    if (filter.source) query = query.eq('source', filter.source)
    if (filter.mine && auth.userId) query = query.eq('created_by', auth.userId)
    const q = filter.q?.trim()
    if (q) query = query.ilike('name', `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as PoolNpc[]
  }

  async function uploadImage(file: File): Promise<string> {
    const auth = useAuthStore()
    if (!file.type.startsWith('image/')) throw new Error(`${file.name} isn’t an image`)
    if (file.size > NPC_IMAGE_MAX) throw new Error(`${file.name} is over 5 MB`)
    const path = `${auth.userId}/${crypto.randomUUID()}-${safeFileName(file.name)}`
    const { error } = await supabase.storage
      .from('npc-images')
      .upload(path, file, { contentType: file.type })
    if (error) throw error
    return path
  }

  /**
   * Publishes to the pool (or updates the user's own pool entry). Returns the
   * pool id: the one passed in when the pool is off, null when a new entry fails.
   */
  async function publish(draft: NpcDraft, poolId: string | null): Promise<string | null> {
    const site = useSiteStore()
    const auth = useAuthStore()
    if (!site.settings.npc_pool_enabled) return poolId
    const row = {
      system: draft.system,
      kind: draft.kind,
      name: draft.name,
      level: draft.level,
      stat_block: draft.stat_block,
      image_path: draft.image_path,
      ai_generated: draft.ai_generated ?? false,
    }
    if (poolId) {
      // Only the author's own entry changes; for official or other GMs' entries
      // the update matches no rows and the campaign copy simply diverges.
      await supabase.from('npcs').update(row).eq('id', poolId).eq('created_by', auth.userId!)
      return poolId
    }
    const { data, error } = await supabase.from('npcs').insert(row).select('id').single()
    if (error) {
      console.warn('Could not publish the NPC to the pool', error)
      return null
    }
    return (data as { id: string }).id
  }

  /**
   * Creates or updates a campaign NPC, then keeps the pool in step. The
   * campaign copy is saved first, so a failed save never publishes anything;
   * `published` is false when the pool is on but publishing failed.
   */
  async function save(
    cid: string,
    draft: NpcDraft,
    id?: string | null,
  ): Promise<{ saved: CampaignNpc; published: boolean }> {
    const existing = id ? campaignNpcs.value.find((n) => n.id === id) : undefined
    const row = {
      campaign_id: cid,
      pool_npc_id: existing?.pool_npc_id ?? null,
      system: draft.system,
      kind: draft.kind,
      name: draft.name,
      level: draft.level,
      stat_block: draft.stat_block,
      image_path: draft.image_path,
      gm_notes: draft.gm_notes,
      ai_generated: draft.ai_generated ?? false,
      source: existing?.source ?? ('homebrew' as const),
    }
    const res = existing
      ? await supabase.from('campaign_npcs').update(row).eq('id', existing.id).select().single()
      : await supabase.from('campaign_npcs').insert(row).select().single()
    if (res.error) throw res.error
    let saved = res.data as CampaignNpc
    const site = useSiteStore()
    const poolId = await publish(draft, saved.pool_npc_id)
    const published = !site.settings.npc_pool_enabled || poolId !== null
    if (poolId && poolId !== saved.pool_npc_id) {
      const link = await supabase
        .from('campaign_npcs')
        .update({ pool_npc_id: poolId })
        .eq('id', saved.id)
        .select()
        .single()
      if (!link.error) saved = link.data as CampaignNpc
    }
    if (campaignId.value === cid) {
      const i = campaignNpcs.value.findIndex((n) => n.id === saved.id)
      if (i >= 0) campaignNpcs.value[i] = saved
      else
        campaignNpcs.value = [...campaignNpcs.value, saved].sort((a, b) =>
          a.name.localeCompare(b.name),
        )
    }
    return { saved, published }
  }

  /** Copies a pool NPC into a campaign's index (once; returns the existing copy if there is one). */
  async function pull(cid: string, npc: PoolNpc): Promise<CampaignNpc> {
    const { data: found } = await supabase
      .from('campaign_npcs')
      .select('*')
      .eq('campaign_id', cid)
      .eq('pool_npc_id', npc.id)
      .maybeSingle()
    if (found) return found as CampaignNpc
    const { data, error } = await supabase
      .from('campaign_npcs')
      .insert({
        campaign_id: cid,
        pool_npc_id: npc.id,
        system: npc.system,
        kind: npc.kind,
        name: npc.name,
        level: npc.level,
        stat_block: npc.stat_block,
        image_path: npc.image_path,
        source: npc.source,
        ai_generated: npc.ai_generated,
      })
      .select()
      .single()
    if (error) throw error
    const saved = data as CampaignNpc
    if (campaignId.value === cid) {
      campaignNpcs.value = [...campaignNpcs.value, saved].sort((a, b) =>
        a.name.localeCompare(b.name),
      )
    }
    return saved
  }

  async function remove(npc: CampaignNpc) {
    const { error } = await supabase.from('campaign_npcs').delete().eq('id', npc.id)
    if (error) throw error
    campaignNpcs.value = campaignNpcs.value.filter((n) => n.id !== npc.id)
  }

  /** Adds the party's journal entry for an NPC (name and image only). Returns true when new. */
  async function addToJournal(npc: CampaignNpc) {
    return ensureNpcEntry(journalStub(npc))
  }

  /**
   * Puts `count` copies into initiative ("Goblin A…E", continuing after any
   * already there) and gives the party one journal entry for the creature.
   */
  async function addToInitiative(npc: CampaignNpc, count: number, sharedRoll = false) {
    const { data: present, error: findError } = await supabase
      .from('combatants')
      .select('group_label')
      .eq('campaign_id', npc.campaign_id)
      .eq('campaign_npc_id', npc.id)
    if (findError) throw findError
    const rows = buildCopies(npc, {
      count,
      sharedRoll,
      existingLabels: (present ?? []).map(
        (r) => (r as { group_label: string | null }).group_label ?? 'A',
      ),
    })
    // A lone copy already on the board without a letter becomes "A" so the new ones read B, C…
    if (present?.length === 1 && !(present[0] as { group_label: string | null }).group_label) {
      await supabase
        .from('combatants')
        .update({ group_label: 'A', name: combatantName(npc.name, 'A') })
        .eq('campaign_id', npc.campaign_id)
        .eq('campaign_npc_id', npc.id)
        .is('group_label', null)
    }
    const { error } = await supabase.from('combatants').insert(rows)
    if (error) throw error
    // The combatants are in; a journal failure is reported on its own so a retry
    // doesn't add the group twice.
    try {
      const journaled = await addToJournal(npc)
      return { added: rows.length, journaled, journalError: null }
    } catch (journalError) {
      return { added: rows.length, journaled: false, journalError }
    }
  }

  return {
    campaignNpcs,
    campaignId,
    loading,
    reset,
    fetchCampaign,
    searchPool,
    uploadImage,
    save,
    pull,
    remove,
    addToJournal,
    addToInitiative,
  }
})
