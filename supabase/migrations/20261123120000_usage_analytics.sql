-- ---------------------------------------------------------------------------
-- Usage analytics: which pages (sheet, party, battle…) people play on and which
-- buttons they press. Clients write only through `track_events`; staff read
-- totals through the `staff_analytics_*` RPCs. Nobody reads rows directly.
-- ---------------------------------------------------------------------------

create table public.analytics_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid,
  kind text not null check (kind in ('view', 'click', 'time')),
  surface text not null
    check (surface in ('sheet', 'party', 'battle', 'journal', 'maps', 'npcs', 'other')),
  seat text check (seat in ('gm', 'player')),
  viewport text not null check (viewport in ('phone', 'tablet', 'desktop')),
  area text check (char_length(area) <= 60),
  label text check (char_length(label) <= 80),
  value int not null default 1 check (value between 0 and 120)
);
create index analytics_events_created_idx on public.analytics_events (created_at);
create index analytics_events_surface_idx on public.analytics_events (surface, kind, created_at);
create index analytics_events_user_idx on public.analytics_events (user_id);

-- RLS on with no policies: only the security definer functions below touch it.
alter table public.analytics_events enable row level security;

-- ---------------------------------------------------------------------------
-- Site switch
-- ---------------------------------------------------------------------------
alter table public.site_settings add column analytics_enabled boolean not null default true;

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
      set npc_pool_campaign = p_value, npc_pool_library = p_value
      where id;
      label := 'Shared NPC pool';
    when 'npc_pool_campaign' then
      update public.site_settings set npc_pool_campaign = p_value where id;
      label := 'NPC pool in the GM console';
    when 'npc_pool_library' then
      update public.site_settings set npc_pool_library = p_value where id;
      label := 'NPCs in the Library';
    when 'ai_enabled' then
      update public.site_settings set ai_enabled = p_value where id;
      label := 'AI features';
    when 'free_ai_enabled' then
      update public.site_settings set free_ai_enabled = p_value where id;
      label := 'Free Lore Master';
    when 'analytics_enabled' then
      update public.site_settings set analytics_enabled = p_value where id;
      label := 'Usage analytics';
    else
      raise exception 'Unknown site setting %', p_key;
  end case;
  update public.site_settings
  set npc_pool_enabled = npc_pool_campaign or npc_pool_library,
      updated_at = now(),
      updated_by = auth.uid()
  where id;
  perform private.log_moderation(
    auth.uid(), label || case when p_value then ' turned on' else ' turned off' end
  );
end $$;

-- ---------------------------------------------------------------------------
-- Writing: a batch of up to 50 events from the signed-in user
-- ---------------------------------------------------------------------------
create function public.track_events(p_events jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or jsonb_typeof(p_events) <> 'array' then
    return;
  end if;
  if not coalesce((select s.analytics_enabled from public.site_settings s where s.id), false) then
    return;
  end if;
  insert into public.analytics_events
    (user_id, session_id, kind, surface, seat, viewport, area, label, value)
  select
    uid,
    case when e->>'session' ~* '^[0-9a-f-]{36}$' then (e->>'session')::uuid end,
    e->>'kind',
    e->>'surface',
    case when e->>'seat' in ('gm', 'player') then e->>'seat' end,
    e->>'viewport',
    nullif(left(e->>'area', 60), ''),
    nullif(left(e->>'label', 80), ''),
    least(greatest(coalesce((e->>'value')::numeric, 1)::int, 0), 120)
  from (select value as e from jsonb_array_elements(p_events) limit 50) batch
  where e->>'kind' in ('view', 'click', 'time')
    and e->>'surface' in ('sheet', 'party', 'battle', 'journal', 'maps', 'npcs', 'other')
    and e->>'viewport' in ('phone', 'tablet', 'desktop')
    and coalesce(e->>'value', '1') ~ '^\d{1,6}(\.\d+)?$';
end $$;

revoke execute on function public.track_events(jsonb) from public, anon;
grant execute on function public.track_events(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Reading (staff only). Every report shares one filter: a date range, whether
-- staff accounts count, and optionally only GM or only player visits.
-- ---------------------------------------------------------------------------
create function private.analytics_rows(
  p_from timestamptz, p_to timestamptz, p_include_staff boolean, p_seat text
) returns setof public.analytics_events
language sql stable security definer set search_path = '' as $$
  select e.*
  from public.analytics_events e
  join public.profiles p on p.id = e.user_id
  where e.created_at >= p_from
    and e.created_at < p_to
    and (p_include_staff or p.role not in ('admin', 'moderator'))
    and (p_seat is null or e.seat = p_seat)
$$;

create function private.require_staff() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_staff() then
    raise exception 'Only staff can read analytics';
  end if;
end $$;

-- Per page: visits, distinct people, active seconds, clicks.
create function public.staff_analytics_surfaces(
  p_from timestamptz, p_to timestamptz, p_include_staff boolean default false, p_seat text default null
) returns table (surface text, visits bigint, users bigint, seconds bigint, clicks bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_staff();
  return query
  select r.surface,
         count(*) filter (where r.kind = 'view'),
         count(distinct r.user_id),
         coalesce(sum(r.value) filter (where r.kind = 'time'), 0)::bigint,
         count(*) filter (where r.kind = 'click')
  from private.analytics_rows(p_from, p_to, p_include_staff, p_seat) r
  group by r.surface;
end $$;

-- Per page × GM/player × screen size: visits, people, active seconds.
create function public.staff_analytics_splits(
  p_from timestamptz, p_to timestamptz, p_include_staff boolean default false
) returns table (surface text, seat text, viewport text, visits bigint, users bigint, seconds bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_staff();
  return query
  select r.surface, r.seat, r.viewport,
         count(*) filter (where r.kind = 'view'),
         count(distinct r.user_id),
         coalesce(sum(r.value) filter (where r.kind = 'time'), 0)::bigint
  from private.analytics_rows(p_from, p_to, p_include_staff, null) r
  group by r.surface, r.seat, r.viewport;
end $$;

-- Per UTC day × page: visits, people, active seconds.
create function public.staff_analytics_daily(
  p_from timestamptz, p_to timestamptz, p_include_staff boolean default false, p_seat text default null
) returns table (day date, surface text, visits bigint, users bigint, seconds bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_staff();
  return query
  select (r.created_at at time zone 'utc')::date, r.surface,
         count(*) filter (where r.kind = 'view'),
         count(distinct r.user_id),
         coalesce(sum(r.value) filter (where r.kind = 'time'), 0)::bigint
  from private.analytics_rows(p_from, p_to, p_include_staff, p_seat) r
  group by 1, 2
  order by 1;
end $$;

-- Most-clicked buttons, optionally on one page.
create function public.staff_analytics_buttons(
  p_from timestamptz,
  p_to timestamptz,
  p_include_staff boolean default false,
  p_seat text default null,
  p_surface text default null,
  p_limit int default 50
) returns table (surface text, area text, label text, clicks bigint, users bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_staff();
  return query
  select r.surface, coalesce(r.area, 'page'), coalesce(r.label, '(no label)'),
         count(*), count(distinct r.user_id)
  from private.analytics_rows(p_from, p_to, p_include_staff, p_seat) r
  where r.kind = 'click' and (p_surface is null or r.surface = p_surface)
  group by 1, 2, 3
  order by 4 desc, 5 desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- Drops events older than 180 days; the analytics page calls it on open.
create function public.staff_analytics_prune() returns int
language plpgsql security definer set search_path = '' as $$
declare
  removed int;
begin
  perform private.require_staff();
  delete from public.analytics_events where created_at < now() - interval '180 days';
  get diagnostics removed = row_count;
  return removed;
end $$;

revoke execute on function public.staff_analytics_surfaces(timestamptz, timestamptz, boolean, text) from public, anon;
revoke execute on function public.staff_analytics_splits(timestamptz, timestamptz, boolean) from public, anon;
revoke execute on function public.staff_analytics_daily(timestamptz, timestamptz, boolean, text) from public, anon;
revoke execute on function public.staff_analytics_buttons(timestamptz, timestamptz, boolean, text, text, int) from public, anon;
revoke execute on function public.staff_analytics_prune() from public, anon;
grant execute on function public.staff_analytics_surfaces(timestamptz, timestamptz, boolean, text) to authenticated;
grant execute on function public.staff_analytics_splits(timestamptz, timestamptz, boolean) to authenticated;
grant execute on function public.staff_analytics_daily(timestamptz, timestamptz, boolean, text) to authenticated;
grant execute on function public.staff_analytics_buttons(timestamptz, timestamptz, boolean, text, text, int) to authenticated;
grant execute on function public.staff_analytics_prune() to authenticated;

-- Postgres grants new functions to PUBLIC; the helpers are for the RPCs above only.
revoke execute on function private.analytics_rows(timestamptz, timestamptz, boolean, text) from public, anon, authenticated;
revoke execute on function private.require_staff() from public, anon;
grant execute on function private.require_staff() to authenticated;

-- ---------------------------------------------------------------------------
-- Reset: an admin wipes every event to start a playtest from zero (logged).
-- ---------------------------------------------------------------------------
create function public.admin_reset_analytics() returns int
language plpgsql security definer set search_path = '' as $$
declare
  removed int;
begin
  if not private.is_admin() then
    raise exception 'Only an admin can reset analytics';
  end if;
  delete from public.analytics_events where true;
  get diagnostics removed = row_count;
  perform private.log_moderation(
    auth.uid(), 'Usage analytics reset (' || removed || ' events deleted)'
  );
  return removed;
end $$;

revoke execute on function public.admin_reset_analytics() from public, anon;
grant execute on function public.admin_reset_analytics() to authenticated;
