import type { ThemeId } from '~/utils/themes'
import type { NimbleSummon } from '~/types/sheets'

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
  /** 3D dice colour in the dice tray; null follows the accent. */
  dice_color: string | null
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
    classSlug?: string
    speed?: string | number
    tempHp?: number
    conditions?: string[]
    wounds?: number
    woundsMax?: number
    dying?: boolean | number
    deathSaves?: { successes: number; failures: number }
    concentration?: string
    actionsSpent?: number
    /** Nimble mana pool. */
    mana?: { current: number; max: number; temp: number }
    summons?: NimbleSummon[]
    portraitOverride?: string
    backstory?: string
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
  section: JournalSection
  image_path: string | null
  campaign_npc_id: string | null
  fields: JournalFields
  /** Set when the title or text was changed after posting. */
  edited_at: string | null
  created_at: string
  author: Pick<Profile, 'display_name'> | null
  journal_attachments: JournalAttachment[]
}

export type JournalSection = 'log' | 'character' | 'npc' | 'bestiary'

/** A stat-block fact the GM has revealed to the party (hidden facts are never stored here). */
export interface JournalFact {
  k: string
  v: string
}

/** Player-written notes on NPC and bestiary entries, plus the GM's revealed facts. */
export interface JournalFields {
  role?: string
  attitude?: string
  notes?: string
  met?: string
  facts?: JournalFact[]
  /** Character a 'character' section note is about (GM secrets, hooks). */
  character_id?: string
}

export interface Message {
  id: string
  campaign_id: string
  sender_id: string
  body: string
  recipient_ids: string[] | null
  /** 'action': a game-generated line (a roll or cast from the quick-action panel). */
  kind: MessageKind
  created_at: string
}

export type MessageKind = 'chat' | 'action'

export interface Encounter {
  campaign_id: string
  round: number
  active_combatant: string | null
}

export interface Combatant {
  id: string
  campaign_id: string
  name: string
  kind: 'pc' | 'npc' | 'monster' | 'summon'
  initiative: number
  init_mod: number
  hp: number
  hp_max: number
  ac: number
  character_id: string | null
  campaign_npc_id: string | null
  portrait_path: string | null
  group_label: string | null
  summon_key: string | null
  conditions: string[]
  actions_max: number
  actions_used: number
  created_at: string
}

/** A row of `campaign_initiative()`: what every member sees; hp/ac are null for players. */
export interface InitiativeRow {
  id: string
  name: string
  kind: Combatant['kind']
  initiative: number
  character_id: string | null
  campaign_npc_id: string | null
  portrait_path: string | null
  group_label: string | null
  hp: number | null
  hp_max: number | null
  ac: number | null
  hp_band: HpBand | null
  summon_key: string | null
  conditions: string[]
  /** GM only; null for players. */
  actions_max: number | null
  actions_used: number | null
}

/** What `campaign_hero_card()` returns: the public part of a seated hero. */
export interface HeroCard {
  name: string
  level: number
  portrait_path: string | null
  class: string
  subclass: string
  lineage: string
  hp: number
  hpMax: number
  tempHp: number
  wounds: number
  woundsMax: number
  ac: number
  speed: string
  initMod: number
  stats: Record<'STR' | 'DEX' | 'INT' | 'WIL', number>
  saveAdv: string
  saveDis: string
  skills: { name: string; stat: string; points: number }[]
  mana: { current: number; max: number } | null
  resource: { name: string; count: number; dice: number; die: number } | null
  conditions: string[]
  summons: { name: string; hp: number; hpMax: number }[]
  abilities: { name: string; desc: string; src: string }[]
}

export type HpBand = 'Unhurt' | 'Hurt' | 'Bloodied' | 'Down'

export type NpcKind = 'monster' | 'humanoid'
export type NpcSource = 'official' | 'homebrew'
/** Source filter in the NPC lists: a stored source, or AI drafts (any source). */
export type NpcSourceFilter = NpcSource | 'ai'
/** Broad creature type every NPC list can filter by (list in `utils/creatureTypes.ts`). */
export type CreatureType =
  | 'Aberration'
  | 'Beast'
  | 'Celestial'
  | 'Construct'
  | 'Dragon'
  | 'Elemental'
  | 'Fey'
  | 'Fiend'
  | 'Giant'
  | 'Humanoid'
  | 'Monstrosity'
  | 'Ooze'
  | 'Plant'
  | 'Undead'

/** One named entry in a stat block (trait, action, reaction…). */
export interface StatEntry {
  n: string
  t: string
}

/**
 * System-agnostic stat block. `top` holds the headline lines (AC, HP, speed…),
 * `stats` the ability row, `lines` the secondary lines, `sections` the named groups.
 */
export interface StatBlock {
  /** Broad type the lists filter by; `type` stays free text ("Owlbear", "Humanoid (any)"). */
  creatureType?: CreatureType
  type?: string
  size?: string
  alignment?: string
  top?: [string, string][]
  stats?: [string, string][]
  lines?: [string, string][]
  sections?: { title: string; items: StatEntry[] }[]
  /** Numbers the initiative tracker reads. */
  hp?: number
  ac?: number
  initMod?: number
}

export interface PoolNpc {
  id: string
  system: GameSystem
  kind: NpcKind
  name: string
  level: string
  stat_block: StatBlock
  image_path: string | null
  source: NpcSource
  source_ref: string | null
  ai_generated: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CampaignNpc {
  id: string
  campaign_id: string
  pool_npc_id: string | null
  system: GameSystem
  kind: NpcKind
  name: string
  level: string
  stat_block: StatBlock
  image_path: string | null
  source: NpcSource
  ai_generated: boolean
  gm_notes: string
  created_at: string
  updated_at: string
}

export type NpcSubmissionStatus = 'pending' | 'approved' | 'rejected'

/** A player's suggested stat block for the shared pool, waiting for staff review. */
export interface NpcSubmission {
  id: string
  system: GameSystem
  kind: NpcKind
  name: string
  level: string
  stat_block: StatBlock
  image_path: string | null
  /** The player's note to the reviewers. */
  note: string
  status: NpcSubmissionStatus
  /** Why it wasn't approved (shown to the player). */
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  pool_npc_id: string | null
  submitted_by: string
  created_at: string
  updated_at: string
  /** Joined for the review queue. */
  submitter?: { handle: string; display_name: string } | null
}

export interface SiteSettings {
  /** GMs browse the pool and pull NPCs into a campaign. */
  npc_pool_campaign: boolean
  /** The Library "NPCs & monsters" tab. */
  npc_pool_library: boolean
  ai_enabled: boolean
  /** Users without their own key get the Lore Master on the site's Gemini key. */
  free_ai_enabled: boolean
  /** Free Lore Master questions per user per UTC day. */
  free_ai_daily_limit: number
}

/** The SiteSettings switches `admin_set_site_setting` flips. */
export type SiteSwitch = {
  [K in keyof SiteSettings]: SiteSettings[K] extends boolean ? K : never
}[keyof SiteSettings]

export type AiProvider = 'anthropic' | 'google' | 'openai'

export interface AiKeyInfo {
  provider: AiProvider
  last4: string
  is_default: boolean
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
