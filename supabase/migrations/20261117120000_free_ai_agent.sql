-- A free Lore Master for users without their own AI key: the lore-master Edge
-- Function falls back to the site's Gemini key (the FREE_AI_GEMINI_KEY secret),
-- with a per-user daily allowance admins set. A user's own key always wins.

alter table public.site_settings
  add column free_ai_enabled boolean not null default false,
  add column free_ai_daily_limit int not null default 25
    constraint site_settings_free_ai_limit check (free_ai_daily_limit between 0 and 500);

-- ---------------------------------------------------------------------------
-- Usage: one row per user per UTC day. Users read their own count (to show
-- what's left); only the service role writes, through the functions below.
-- ---------------------------------------------------------------------------
create table public.ai_free_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_free_usage enable row level security;
create policy ai_free_usage_select on public.ai_free_usage for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.ai_free_usage from anon;
revoke insert, update, delete, truncate on public.ai_free_usage from authenticated;

-- Takes one free question. Returns how many are left today, or -1 when the
-- allowance is used up (or the free agent is off). One statement, so two
-- requests at once can't both take the last question.
create function public.use_free_ai(p_user uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  cap int;
  used int;
  today date := (now() at time zone 'utc')::date;
begin
  select s.free_ai_daily_limit into cap
  from public.site_settings s
  where s.id and s.ai_enabled and s.free_ai_enabled;
  if coalesce(cap, 0) <= 0 then
    return -1;
  end if;
  insert into public.ai_free_usage as u (user_id, day, count)
  values (p_user, today, 1)
  on conflict (user_id, day) do update set count = u.count + 1 where u.count < cap
  returning u.count into used;
  if used is null then
    return -1;
  end if;
  return cap - used;
end $$;

-- Gives a question back when the provider call failed.
create function public.refund_free_ai(p_user uuid) returns void
language sql security definer set search_path = '' as $$
  update public.ai_free_usage
  set count = greatest(count - 1, 0)
  where user_id = p_user and day = (now() at time zone 'utc')::date
$$;

revoke execute on function public.use_free_ai(uuid) from public, anon, authenticated;
revoke execute on function public.refund_free_ai(uuid) from public, anon, authenticated;
grant execute on function public.use_free_ai(uuid) to service_role;
grant execute on function public.refund_free_ai(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Admin switches
-- ---------------------------------------------------------------------------
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

create function public.admin_set_free_ai_limit(p_limit int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Only an admin can change site settings';
  end if;
  if p_limit is null or p_limit < 0 or p_limit > 500 then
    raise exception 'Pick a daily limit between 0 and 500';
  end if;
  update public.site_settings
  set free_ai_daily_limit = p_limit, updated_at = now(), updated_by = auth.uid()
  where id;
  perform private.log_moderation(
    auth.uid(), 'Free Lore Master limit set to ' || p_limit || ' questions a day'
  );
end $$;

revoke execute on function public.admin_set_free_ai_limit(int) from public, anon;
grant execute on function public.admin_set_free_ai_limit(int) to authenticated;
