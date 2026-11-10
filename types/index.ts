import type { ThemeId } from '~/utils/themes'

export type UserRole = 'admin' | 'moderator' | 'member'
export type GameSystem = 'dnd5e' | 'pf2e' | 'nimble'
export type CampaignRole = 'gm' | 'player'
export type RestrictionReason = 'Explicit content' | 'Harassment' | 'Spam' | 'Other'
export type PermissionFlag =
  | 'can_create_campaigns'
  | 'can_upload_documents'
  | 'can_post_journal'
  | 'can_send_messages'

export interface Profile {
  id: string
  handle: string
  display_name: string
  avatar_path: string | null
  role: UserRole
  theme: ThemeId
  accent: string | null
  notify_secret: boolean
  notify_journal: boolean
  notify_board: boolean
  created_at: string
}

export interface UserPermissions {
  user_id: string
  can_create_campaigns: boolean
  can_upload_documents: boolean
  can_post_journal: boolean
  can_send_messages: boolean
  suspended: boolean
  restriction_reason: RestrictionReason | null
  restricted_at: string | null
}

export interface Character<TSheet = Record<string, unknown>> {
  id: string
  user_id: string
  name: string
  system: GameSystem
  level: number
  portrait_path: string | null
  sheet: TSheet
  created_at: string
  updated_at: string
}

export interface Campaign {
  id: string
  name: string
  system: GameSystem
  pitch: string | null
  cover_path: string | null
  next_session_at: string | null
  created_by: string
  created_at: string
}

export interface CampaignMember {
  campaign_id: string
  user_id: string
  role: CampaignRole
  character_id: string | null
  last_read_at: string
  joined_at: string
}

/** A campaign the signed-in user belongs to, with table-level context. */
export interface MyCampaign extends Campaign {
  myRole: CampaignRole
  myCharacterId: string | null
  lastReadAt: string
  gmName: string
  playerCount: number
  pendingInvites: number
}

export interface CampaignInvite {
  id: string
  campaign_id: string
  invited_by: string
  invitee_id: string | null
  token: string | null
  status: 'pending' | 'accepted' | 'declined' | 'revoked'
  created_at: string
}

export interface PendingInvite extends CampaignInvite {
  campaign: Pick<Campaign, 'name' | 'system' | 'next_session_at'>
  inviterName: string
}

export interface RosterEntry {
  user_id: string
  display_name: string
  handle: string
  role: CampaignRole
  character_id: string | null
  character_name: string | null
  character_level: number | null
  character_system: GameSystem | null
  portrait_path: string | null
  summary: {
    class?: string
    lineage?: string
    hp?: number
    hpMax?: number
    ac?: number
    passivePerception?: number
    initMod?: number
  } | null
}

export interface BoardItem {
  id: string
  campaign_id: string
  title: string
  kind: 'map' | 'image' | 'handout'
  file_path: string
  hidden: boolean
  created_by: string
  created_at: string
}

export interface JournalAttachment {
  id: string
  entry_id: string
  file_path: string
  name: string
  size: number
}

export interface JournalEntry {
  id: string
  campaign_id: string
  author_id: string
  title: string
  body: string
  visibility: 'party' | 'gm'
  created_at: string
  author: Pick<Profile, 'display_name'> | null
  journal_attachments: JournalAttachment[]
}

export interface Message {
  id: string
  campaign_id: string
  sender_id: string
  body: string
  recipient_ids: string[] | null
  created_at: string
}

export interface Encounter {
  campaign_id: string
  round: number
  active_combatant: string | null
}

export interface Combatant {
  id: string
  campaign_id: string
  name: string
  kind: 'pc' | 'npc' | 'monster'
  initiative: number
  init_mod: number
  hp: number
  hp_max: number
  ac: number
  character_id: string | null
  created_at: string
}

export type LibraryCategory = 'Rules' | 'Reference' | 'Guides' | 'Homebrew' | 'Sheets'

export interface LibraryDocument {
  id: string
  uploaded_by: string
  name: string
  file_path: string
  ext: string
  size: number
  system: GameSystem | null
  category: LibraryCategory
  created_at: string
  uploader: Pick<Profile, 'display_name' | 'handle'> | null
}

export interface Report {
  id: string
  reporter_id: string
  target_type: 'library' | 'board' | 'journal'
  target_id: string
  bucket: string
  file_path: string
  file_name: string
  where_label: string
  uploader_id: string | null
  reason: string
  status: 'open' | 'dismissed' | 'removed'
  created_at: string
}

export interface StaffUser {
  id: string
  handle: string
  display_name: string
  email: string
  role: UserRole
  created_at: string
  can_create_campaigns: boolean
  can_upload_documents: boolean
  can_post_journal: boolean
  can_send_messages: boolean
  suspended: boolean
  restriction_reason: RestrictionReason | null
  campaigns: number
  uploads: number
  open_reports: number
}

export interface ModerationEvent {
  id: string
  user_id: string
  actor_id: string | null
  action: string
  created_at: string
}
