-- Third round of PR review fixes: hidden board files can't be reached through an alias.
--
-- A member who may upload could insert a visible board_items row (in this campaign
-- or another one) whose file_path names a hidden map's object, and the "a visible
-- row exists" check then granted the file. Now a board file is readable only through
-- a visible row of the campaign its path belongs to, and never while that campaign
-- has a hidden row for it. New rows must also point inside their own campaign's
-- board folder, as the app's uploads always do.

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
      select 1
      from public.board_items b
      where b.file_path = p_name
        and b.campaign_id::text = split_part(p_name, '/', 1)
        and not b.hidden
    ) and not exists (
      select 1
      from public.board_items b
      where b.file_path = p_name
        and b.campaign_id::text = split_part(p_name, '/', 1)
        and b.hidden
    )
    else true
  end
$$;

drop policy board_items_insert on public.board_items;
create policy board_items_insert on public.board_items for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.is_campaign_member(campaign_id))
    and (select private.can('can_upload_documents'))
    and (not hidden or (select private.is_campaign_gm(campaign_id)))
    and split_part(file_path, '/', 1) = campaign_id::text
    and split_part(file_path, '/', 2) = 'board'
  );
