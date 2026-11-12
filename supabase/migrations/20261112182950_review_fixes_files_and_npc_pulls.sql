-- Second round of PR #16 review fixes.

-- ---------------------------------------------------------------------------
-- campaign-files: members now need a positive reason to read a file instead of
-- "nothing says it's private". Journal files live under {campaign}/journal/{entry}/,
-- so they follow that entry's visibility even before the attachment row exists
-- or after it's gone. Board files need a visible board item. Anything else under
-- the campaign folder (the cover) stays readable by members. Uploaders can
-- always read their own objects, so an upload can finish before its row lands.
-- ---------------------------------------------------------------------------
create or replace function private.campaign_file_visible(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case split_part(p_name, '/', 2)
    when 'journal' then exists (
      select 1
      from public.journal_entries e
      where e.id::text = split_part(p_name, '/', 3)
        and e.campaign_id::text = split_part(p_name, '/', 1)
        and (e.visibility = 'party' or e.author_id = (select auth.uid()))
    )
    when 'board' then exists (
      select 1 from public.board_items b where b.file_path = p_name and not b.hidden
    )
    else true
  end
$$;

drop policy campaign_files_select on storage.objects;
create policy campaign_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'campaign-files'
    and (
      (select private.is_staff())
      or owner_id = (select auth.uid())::text
      or private.is_campaign_gm(((storage.foldername(name))[1])::uuid)
      or (
        private.is_campaign_member(((storage.foldername(name))[1])::uuid)
        and private.campaign_file_visible(name)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- A pool NPC is pulled into a campaign at most once (two tabs could both insert).
-- ---------------------------------------------------------------------------
create unique index if not exists campaign_npcs_pool_once
  on public.campaign_npcs (campaign_id, pool_npc_id)
  where pool_npc_id is not null;
