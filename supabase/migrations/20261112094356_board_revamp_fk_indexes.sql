-- Covering indexes for foreign keys added in board_revamp (performance advisor).
create index journal_entries_campaign_npc_idx on public.journal_entries (campaign_npc_id);
create index npcs_created_by_idx on public.npcs (created_by);
