import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '~/lib/supabase'
import type {
  Campaign,
  CampaignMember,
  GameSystem,
  MyCampaign,
  PendingInvite,
  RosterEntry,
} from '~/types'
import { safeFileName } from '~/utils/format'

type CampaignRow = Campaign & {
  campaign_members: (Pick<CampaignMember, 'user_id' | 'role' | 'character_id' | 'last_read_at'> & {
    profiles: { display_name: string } | null
  })[]
  campaign_invites: { id: string; status: string; invitee_id: string | null }[]
}

export const MAX_CAMPAIGNS = 3

export const useCampaignStore = defineStore('campaign', () => {
  const campaigns = ref<MyCampaign[]>([])
  const invites = ref<PendingInvite[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  /** Campaigns the signed-in user created (what the limit counts), even if they've left or been demoted. */
  const ownedCount = ref(0)

  /** The campaign with the soonest upcoming session, else the most recently created. */
  const current = computed<MyCampaign | null>(() => {
    const now = Date.now()
    const upcoming = campaigns.value
      .filter((c) => c.next_session_at && new Date(c.next_session_at).getTime() >= now)
      .sort((a, b) => a.next_session_at!.localeCompare(b.next_session_at!))
    return upcoming[0] ?? campaigns.value[0] ?? null
  })

  function byId(id: string) {
    return campaigns.value.find((c) => c.id === id) ?? null
  }

  async function fetchMine(force = false) {
    const auth = useAuthStore()
    const me = auth.userId
    if (!me || (loaded.value && !force)) return
    loading.value = true
    try {
      const [campaignRes, inviteRes] = await Promise.all([
        supabase
          .from('campaigns')
          .select(
            '*, campaign_members(user_id, role, character_id, last_read_at, profiles(display_name)), campaign_invites(id, status, invitee_id)',
          )
          .order('created_at', { ascending: false }),
        supabase
          .from('campaign_invites')
          .select(
            '*, campaign:campaigns(name, system, next_session_at), inviter:profiles!campaign_invites_invited_by_fkey(display_name)',
          )
          .eq('invitee_id', me)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
      ])
      if (campaignRes.error) throw campaignRes.error
      if (inviteRes.error) throw inviteRes.error

      const rows = campaignRes.data as unknown as CampaignRow[]
      ownedCount.value = rows.filter((row) => row.created_by === me).length
      campaigns.value = rows.flatMap((row) => {
        const mine = row.campaign_members.find((m) => m.user_id === me)
        // Staff and invitees can read campaigns they haven't joined; skip those here.
        if (!mine) return []
        const gm = row.campaign_members.find((m) => m.role === 'gm')
        const { campaign_members, campaign_invites, ...campaign } = row
        return [
          {
            ...campaign,
            myRole: mine.role,
            myCharacterId: mine.character_id,
            lastReadAt: mine.last_read_at,
            gmName: gm?.profiles?.display_name ?? 'Unknown',
            playerCount: campaign_members.filter((m) => m.role === 'player').length,
            pendingInvites: campaign_invites.filter((i) => i.status === 'pending' && i.invitee_id)
              .length,
          },
        ]
      })

      invites.value = (
        inviteRes.data as unknown as (PendingInvite & {
          inviter: { display_name: string } | null
        })[]
      )
        .filter((row) => row.campaign)
        .map(({ inviter, ...row }) => ({ ...row, inviterName: inviter?.display_name ?? 'A GM' }))
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  /** Creates a campaign (the creator becomes GM) and sends its invites. Returns failures by identifier. */
  async function create(input: {
    name: string
    system: GameSystem
    pitch: string
    cover: File | null
    invitees: string[]
  }) {
    const { data, error } = await supabase
      .from('campaigns')
      .insert({ name: input.name, system: input.system, pitch: input.pitch || null })
      .select()
      .single()
    if (error) throw error
    const campaign = data as Campaign

    let coverFailed = false
    if (input.cover) {
      const path = `${campaign.id}/cover-${Date.now()}-${safeFileName(input.cover.name)}`
      const upload = await supabase.storage
        .from('campaign-files')
        .upload(path, input.cover, { contentType: input.cover.type })
      const saved = upload.error
        ? upload
        : await supabase.from('campaigns').update({ cover_path: path }).eq('id', campaign.id)
      coverFailed = Boolean(saved.error)
    }

    const failed: { who: string; reason: string }[] = []
    for (const who of input.invitees) {
      const res = await supabase.rpc('invite_to_campaign', {
        p_campaign: campaign.id,
        p_identifier: who,
      })
      if (res.error) failed.push({ who, reason: res.error.message })
    }

    await fetchMine(true)
    return { campaign, failed, coverFailed }
  }

  async function invite(campaignId: string, identifier: string) {
    const { error } = await supabase.rpc('invite_to_campaign', {
      p_campaign: campaignId,
      p_identifier: identifier,
    })
    if (error) throw error
    await fetchMine(true)
  }

  async function inviteLink(campaignId: string): Promise<string> {
    const { data, error } = await supabase.rpc('campaign_invite_link', { p_campaign: campaignId })
    if (error) throw error
    return `${window.location.origin}/join/${data as string}`
  }

  async function respond(inviteId: string, accept: boolean) {
    const { error } = await supabase.rpc('respond_invite', { p_invite: inviteId, p_accept: accept })
    if (error) throw error
    await fetchMine(true)
  }

  async function roster(campaignId: string): Promise<RosterEntry[]> {
    const { data, error } = await supabase.rpc('campaign_roster', { p_campaign: campaignId })
    if (error) throw error
    return (data ?? []) as RosterEntry[]
  }

  async function seatCharacter(campaignId: string, characterId: string | null) {
    const auth = useAuthStore()
    const { error } = await supabase
      .from('campaign_members')
      .update({ character_id: characterId })
      .eq('campaign_id', campaignId)
      .eq('user_id', auth.userId!)
    if (error) throw error
    const mine = byId(campaignId)
    if (mine) mine.myCharacterId = characterId
  }

  async function markRead(campaignId: string) {
    const auth = useAuthStore()
    const now = new Date().toISOString()
    await supabase
      .from('campaign_members')
      .update({ last_read_at: now })
      .eq('campaign_id', campaignId)
      .eq('user_id', auth.userId!)
    const mine = byId(campaignId)
    if (mine) mine.lastReadAt = now
  }

  async function update(
    campaignId: string,
    patch: Partial<Pick<Campaign, 'name' | 'pitch' | 'next_session_at'>>,
  ) {
    const { error } = await supabase.from('campaigns').update(patch).eq('id', campaignId)
    if (error) throw error
    const mine = byId(campaignId)
    if (mine) Object.assign(mine, patch)
  }

  async function removeMember(campaignId: string, userId: string) {
    const { error } = await supabase
      .from('campaign_members')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('user_id', userId)
    if (error) throw error
    await fetchMine(true)
  }

  /** Every stored file under a campaign's folder (board images, journal attachments, cover). */
  async function listCampaignFiles(prefix: string): Promise<string[]> {
    const { data, error } = await supabase.storage
      .from('campaign-files')
      .list(prefix, { limit: 1000 })
    if (error) throw error
    const paths: string[] = []
    for (const item of data ?? []) {
      const path = `${prefix}/${item.name}`
      // Folders come back without an id.
      if (item.id === null) paths.push(...(await listCampaignFiles(path)))
      else paths.push(path)
    }
    return paths
  }

  /**
   * Deletes a campaign with its board, journal, messages, invites and initiative
   * (the database cascades those), plus its uploaded files. Files go first: once
   * the campaign row is gone, nobody passes the storage policy for its folder.
   * Allowed for the campaign's GM and for staff.
   */
  async function removeCampaign(campaignId: string) {
    const files = await listCampaignFiles(campaignId)
    for (let i = 0; i < files.length; i += 100) {
      const { error } = await supabase.storage
        .from('campaign-files')
        .remove(files.slice(i, i + 100))
      if (error) throw error
    }
    const { data, error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', campaignId)
      .select('id')
    if (error) throw error
    if (!data?.length) throw new Error('Only the Game Master or an admin can delete this campaign')
    campaigns.value = campaigns.value.filter((c) => c.id !== campaignId)
  }

  function reset() {
    campaigns.value = []
    invites.value = []
    ownedCount.value = 0
    loaded.value = false
  }

  return {
    campaigns,
    ownedCount,
    invites,
    loaded,
    loading,
    current,
    byId,
    fetchMine,
    create,
    invite,
    inviteLink,
    respond,
    roster,
    seatCharacter,
    markRead,
    update,
    removeMember,
    removeCampaign,
    reset,
  }
})
