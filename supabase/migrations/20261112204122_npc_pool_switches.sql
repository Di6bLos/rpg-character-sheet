-- Split the single "Shared NPC pool" switch into three, and let staff curate
-- the pool (Official or Homebrew) from the admin area whatever the switches say.
--
--   npc_pool_campaign  GMs browse the pool and pull NPCs into a campaign
--   npc_pool_library   the Library "NPCs & monsters" tab, for every user
--   npc_pool_publish   NPCs GMs save are also published to the pool (homebrew)
--
-- The Library switch is a UI gate: while the GM console pool is on the rows stay
-- readable through the API, since RLS can't tell which screen is asking.

alter table public.site_settings
  add column npc_pool_campaign boolean not null default true,
  add column npc_pool_library boolean not null default true,
  add column npc_pool_publish boolean not null default true;

update public.site_settings
set npc_pool_campaign = npc_pool_enabled,
    npc_pool_library = npc_pool_enabled,
    npc_pool_publish = npc_pool_enabled
where id;

create function private.npc_pool_readable() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select s.npc_pool_campaign or s.npc_pool_library from public.site_settings s where s.id),
    false
  )
$$;

create function private.npc_pool_publish() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.npc_pool_publish from public.site_settings s where s.id), false)
$$;

revoke execute on function private.npc_pool_readable(), private.npc_pool_publish() from public;
grant execute on function private.npc_pool_readable(), private.npc_pool_publish() to authenticated;

-- Pool policies: members as before (gated by the new switches); staff always.
drop policy npcs_select on public.npcs;
drop policy npcs_insert on public.npcs;
drop policy npcs_update on public.npcs;

create policy npcs_select on public.npcs for select to authenticated
  using (
    created_by = (select auth.uid())
    or (select private.npc_pool_readable())
    or (select private.is_staff())
  );

create policy npcs_insert on public.npcs for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.can('active'))
    and (
      (source = 'homebrew' and (select private.npc_pool_publish()))
      or (select private.is_staff())
    )
  );

create policy npcs_update on public.npcs for update to authenticated
  using (created_by = (select auth.uid()) or (select private.is_staff()))
  with check (
    (created_by = (select auth.uid()) and source = 'homebrew')
    or (select private.is_staff())
  );

-- `npc_pool_enabled` stays (deprecated) until every deployed client reads the new
-- columns: it mirrors "any pool switch on", and the old key still sets all three.

create or replace function public.admin_set_site_setting(p_key text, p_value boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  label text;
begin
  if not private.is_admin() then
    raise exception 'Only an admin can change site settings';
  end if;
  case p_key
    when 'npc_pool_enabled' then
      update public.site_settings
      set npc_pool_campaign = p_value, npc_pool_library = p_value, npc_pool_publish = p_value
      where id;
      label := 'Shared NPC pool';
    when 'npc_pool_campaign' then
      update public.site_settings set npc_pool_campaign = p_value where id;
      label := 'NPC pool in the GM console';
    when 'npc_pool_library' then
      update public.site_settings set npc_pool_library = p_value where id;
      label := 'NPCs in the Library';
    when 'npc_pool_publish' then
      update public.site_settings set npc_pool_publish = p_value where id;
      label := 'Publishing GM NPCs to the pool';
    when 'ai_enabled' then
      update public.site_settings set ai_enabled = p_value where id;
      label := 'AI generator';
    else
      raise exception 'Unknown site setting %', p_key;
  end case;
  update public.site_settings
  set npc_pool_enabled = npc_pool_campaign or npc_pool_library or npc_pool_publish,
      updated_at = now(),
      updated_by = auth.uid()
  where id;
  perform private.log_moderation(
    auth.uid(), label || case when p_value then ' turned on' else ' turned off' end
  );
end $$;
