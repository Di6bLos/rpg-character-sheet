-- Fixes from the PR #16 review.

-- ---------------------------------------------------------------------------
-- campaign-files: a member could read any object under the campaign folder,
-- including attachments of GM-only journal entries and hidden maps. Reads now
-- follow the row the file belongs to; the GM (and staff) still read everything.
-- ---------------------------------------------------------------------------
create index if not exists journal_attachments_file_path_idx on public.journal_attachments (file_path);
create index if not exists board_items_file_path_idx on public.board_items (file_path);

create function private.campaign_file_visible(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1
    from public.journal_attachments a
    join public.journal_entries e on e.id = a.entry_id
    where a.file_path = p_name
      and e.visibility = 'gm'
      and e.author_id is distinct from (select auth.uid())
  )
  and not exists (
    select 1 from public.board_items b where b.file_path = p_name and b.hidden
  )
$$;
revoke execute on function private.campaign_file_visible(text) from public, anon;
grant execute on function private.campaign_file_visible(text) to authenticated;

drop policy campaign_files_select on storage.objects;
create policy campaign_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'campaign-files'
    and (
      (select private.is_staff())
      or private.is_campaign_gm(((storage.foldername(name))[1])::uuid)
      or (
        private.is_campaign_member(((storage.foldername(name))[1])::uuid)
        and private.campaign_file_visible(name)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Turn order: copies added together with one shared roll tie on initiative and
-- created_at. Break ties by name, then id, byte-wise, so the GM's view
-- (utils/initiative.ts sortOrder) and the players' view agree.
-- ---------------------------------------------------------------------------
create or replace function public.campaign_initiative(p_campaign uuid)
returns table (
  id uuid,
  name text,
  kind text,
  initiative integer,
  character_id uuid,
  campaign_npc_id uuid,
  portrait_path text,
  group_label text,
  hp integer,
  hp_max integer,
  ac integer,
  hp_band text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  gm boolean := private.is_campaign_gm(p_campaign);
begin
  if not private.is_campaign_member(p_campaign) then
    raise exception 'Not a member of this campaign';
  end if;
  return query
  select
    c.id, c.name, c.kind, c.initiative, c.character_id, c.campaign_npc_id,
    c.portrait_path, c.group_label,
    case when gm then c.hp end,
    case when gm then c.hp_max end,
    case when gm then c.ac end,
    case
      when c.kind = 'pc' or c.hp_max <= 0 then null
      when c.hp <= 0 then 'Down'
      when c.hp * 2 <= c.hp_max then 'Bloodied'
      when c.hp < c.hp_max then 'Hurt'
      else 'Unhurt'
    end
  from public.combatants c
  where c.campaign_id = p_campaign
  order by c.initiative desc, c.created_at, c.name collate "C", c.id::text collate "C";
end $$;

-- ---------------------------------------------------------------------------
-- Journal fields: revealing facts and saving notes used to write the whole
-- `fields` object from the client's copy, so one could overwrite the other.
-- These merge on the server. Security invoker: RLS and the guard trigger apply.
-- ---------------------------------------------------------------------------
create function public.journal_set_facts(p_entry uuid, p_facts jsonb) returns jsonb
language sql security invoker set search_path = '' as $$
  update public.journal_entries
     set fields = jsonb_set(coalesce(fields, '{}'::jsonb), '{facts}', p_facts)
   where id = p_entry and jsonb_typeof(p_facts) = 'array'
  returning fields
$$;

create function public.journal_save_notes(p_entry uuid, p_notes jsonb) returns jsonb
language sql security invoker set search_path = '' as $$
  update public.journal_entries
     set fields = coalesce(fields, '{}'::jsonb) || (p_notes - 'facts')
   where id = p_entry and jsonb_typeof(p_notes) = 'object'
  returning fields
$$;

revoke execute on function public.journal_set_facts(uuid, jsonb) from public, anon;
revoke execute on function public.journal_save_notes(uuid, jsonb) from public, anon;
grant execute on function public.journal_set_facts(uuid, jsonb) to authenticated;
grant execute on function public.journal_save_notes(uuid, jsonb) to authenticated;
