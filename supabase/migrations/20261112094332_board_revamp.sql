-- ---------------------------------------------------------------------------
-- Board revamp: site switches, shared NPC pool, campaign NPCs, a turn order
-- the whole party can see, journal sections, and per-user AI provider keys.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Site settings (one row). Read by everyone signed in; changed by admins only.
-- ---------------------------------------------------------------------------
create table public.site_settings (
  id boolean primary key default true check (id),
  npc_pool_enabled boolean not null default true,
  ai_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
insert into public.site_settings (id) values (true);
alter table public.site_settings enable row level security;
create policy site_settings_select on public.site_settings for select to authenticated using (true);

create function private.npc_pool_enabled() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.npc_pool_enabled from public.site_settings s where s.id), false)
$$;

create function private.ai_enabled() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.ai_enabled from public.site_settings s where s.id), false)
$$;

create function public.admin_set_site_setting(p_key text, p_value boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  label text;
begin
  if not private.is_admin() then
    raise exception 'Only an admin can change site settings';
  end if;
  case p_key
    when 'npc_pool_enabled' then
      update public.site_settings set npc_pool_enabled = p_value where id;
      label := 'Shared NPC pool';
    when 'ai_enabled' then
      update public.site_settings set ai_enabled = p_value where id;
      label := 'AI generator';
    else
      raise exception 'Unknown site setting %', p_key;
  end case;
  update public.site_settings set updated_at = now(), updated_by = auth.uid() where id;
  perform private.log_moderation(
    auth.uid(), label || case when p_value then ' turned on' else ' turned off' end
  );
end $$;

-- ---------------------------------------------------------------------------
-- Shared NPC pool. Every NPC a GM saves lands here (homebrew); official ones
-- are transcribed from open-licensed books and seeded with the service role.
-- ---------------------------------------------------------------------------
create table public.npcs (
  id uuid primary key default gen_random_uuid(),
  system public.game_system not null,
  kind text not null default 'monster' check (kind in ('monster', 'humanoid')),
  name text not null check (char_length(name) between 1 and 80),
  level text not null default '',
  stat_block jsonb not null default '{}'::jsonb,
  image_path text,
  source text not null default 'homebrew' check (source in ('official', 'homebrew')),
  source_ref text,
  slug text unique,
  ai_generated boolean not null default false,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index npcs_system_idx on public.npcs (system, kind, name);
alter table public.npcs enable row level security;

create policy npcs_select on public.npcs for select to authenticated
  using (created_by = (select auth.uid()) or (select private.npc_pool_enabled()));
create policy npcs_insert on public.npcs for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and source = 'homebrew'
    and (select private.npc_pool_enabled())
    and (select private.can('active'))
  );
create policy npcs_update on public.npcs for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()) and source = 'homebrew');
create policy npcs_delete on public.npcs for delete to authenticated
  using (created_by = (select auth.uid()) or (select private.is_staff()));

-- ---------------------------------------------------------------------------
-- A campaign's own NPC index: a full copy, so it keeps working when the pool
-- is off or the original is deleted. GM only; gm_notes never leave it.
-- ---------------------------------------------------------------------------
create table public.campaign_npcs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  pool_npc_id uuid references public.npcs (id) on delete set null,
  system public.game_system not null,
  kind text not null default 'monster' check (kind in ('monster', 'humanoid')),
  name text not null check (char_length(name) between 1 and 80),
  level text not null default '',
  stat_block jsonb not null default '{}'::jsonb,
  image_path text,
  source text not null default 'homebrew' check (source in ('official', 'homebrew')),
  ai_generated boolean not null default false,
  gm_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index campaign_npcs_campaign_idx on public.campaign_npcs (campaign_id, name);
create index campaign_npcs_pool_idx on public.campaign_npcs (pool_npc_id);
alter table public.campaign_npcs enable row level security;
create policy campaign_npcs_gm on public.campaign_npcs for all to authenticated
  using ((select private.is_campaign_gm(campaign_id)))
  with check ((select private.is_campaign_gm(campaign_id)));

-- ---------------------------------------------------------------------------
-- Initiative: link combatants to campaign NPCs and portraits. Players read the
-- order through campaign_initiative() (enemy HP becomes a band) and get live
-- updates from encounters, which every member may now read.
-- ---------------------------------------------------------------------------
alter table public.combatants
  add column campaign_npc_id uuid references public.campaign_npcs (id) on delete set null,
  add column portrait_path text,
  add column group_label text;
create index combatants_npc_idx on public.combatants (campaign_npc_id);

create policy encounters_member_select on public.encounters for select to authenticated
  using ((select private.is_campaign_member(campaign_id)));

-- Any change to the order bumps the encounter row so players' subscriptions fire.
create function private.touch_encounter() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := coalesce(new.campaign_id, old.campaign_id);
begin
  -- Skipped while the campaign itself is being deleted (cascade).
  insert into public.encounters (campaign_id)
  select cid where exists (select 1 from public.campaigns c where c.id = cid)
  on conflict (campaign_id) do update set updated_at = now();
  return null;
end $$;

create trigger combatants_touch_encounter
  after insert or update or delete on public.combatants
  for each row execute function private.touch_encounter();

create function public.campaign_initiative(p_campaign uuid)
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
  order by c.initiative desc, c.created_at;
end $$;

-- ---------------------------------------------------------------------------
-- Journal sections. NPC and bestiary entries can be edited by any member
-- (their own notes in `fields`); only the GM changes the revealed `facts`.
-- ---------------------------------------------------------------------------
alter table public.journal_entries
  add column section text not null default 'log'
    check (section in ('log', 'character', 'npc', 'bestiary')),
  add column image_path text,
  add column campaign_npc_id uuid references public.campaign_npcs (id) on delete set null,
  add column fields jsonb not null default '{}'::jsonb,
  add column edited_at timestamptz;
create unique index journal_entries_npc_uniq
  on public.journal_entries (campaign_id, campaign_npc_id) where campaign_npc_id is not null;
create index journal_entries_section_idx on public.journal_entries (campaign_id, section);

drop policy journal_entries_update on public.journal_entries;
-- Authors edit their own entries; the GM can edit any entry in the campaign;
-- members add their notes to party NPC / bestiary entries.
create policy journal_entries_update on public.journal_entries for update to authenticated
  using (
    author_id = (select auth.uid())
    or (select private.is_campaign_gm(campaign_id))
    or (
      section in ('npc', 'bestiary')
      and visibility = 'party'
      and (select private.is_campaign_member(campaign_id))
    )
  )
  with check (
    author_id = (select auth.uid())
    or (select private.is_campaign_gm(campaign_id))
    or (
      section in ('npc', 'bestiary')
      and visibility = 'party'
      and (select private.is_campaign_member(campaign_id))
    )
  );

create function private.guard_journal_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  gm boolean := private.is_campaign_gm(old.campaign_id);
begin
  -- Server-side updates (service role, migrations, admin scripts) carry no user.
  if auth.uid() is null then
    return new;
  end if;
  if new.campaign_id is distinct from old.campaign_id or new.author_id is distinct from old.author_id then
    raise exception 'A journal entry cannot move campaign or author' using errcode = 'P0001';
  end if;
  if not gm and (new.fields -> 'facts') is distinct from (old.fields -> 'facts') then
    raise exception 'Only the GM can reveal facts' using errcode = 'P0001';
  end if;
  if not gm and old.author_id is distinct from auth.uid() and (
    new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.visibility is distinct from old.visibility
    or new.section is distinct from old.section
    or new.image_path is distinct from old.image_path
    or new.campaign_npc_id is distinct from old.campaign_npc_id
  ) then
    raise exception 'You can only edit the notes on this entry' using errcode = 'P0001';
  end if;
  if new.title is distinct from old.title or new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end $$;

create trigger journal_entries_guard before update on public.journal_entries
  for each row execute function private.guard_journal_update();

-- ---------------------------------------------------------------------------
-- Private messages between any members (the board chat), not just from the GM.
-- Every recipient must belong to the campaign.
-- ---------------------------------------------------------------------------
create function private.all_members(cid uuid, ids uuid[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select cardinality(ids) > 0 and not exists (
    select 1 from unnest(ids) as r(id)
    where not exists (
      select 1 from public.campaign_members m where m.campaign_id = cid and m.user_id = r.id
    )
  )
$$;

drop policy messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select private.is_campaign_member(campaign_id))
    and (select private.can('can_send_messages'))
    and (recipient_ids is null or (select private.all_members(campaign_id, recipient_ids)))
  );
grant execute on function private.all_members(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Roster cards on the board show live play state (temp HP, conditions, wounds,
-- actions, concentration) and use the Nimble class sigil when there's no portrait.
-- ---------------------------------------------------------------------------
create or replace function public.campaign_roster(p_campaign uuid)
returns table (
  user_id uuid,
  display_name text,
  handle text,
  role public.campaign_role,
  character_id uuid,
  character_name text,
  character_level integer,
  character_system public.game_system,
  portrait_path text,
  summary jsonb
)
language sql stable security definer set search_path = '' as $$
  select
    m.user_id, p.display_name, p.handle::text, m.role,
    c.id, c.name, c.level, c.system, c.portrait_path,
    case when c.id is null then null else jsonb_strip_nulls(jsonb_build_object(
      'class', c.sheet -> 'class',
      'lineage', c.sheet -> 'lineage',
      'hp', c.sheet -> 'hp',
      'hpMax', c.sheet -> 'hpMax',
      'ac', c.sheet -> 'ac',
      'passivePerception', c.sheet -> 'passivePerception',
      'initMod', c.sheet -> 'initMod',
      'classSlug', c.sheet -> 'classSlug',
      'speed', c.sheet -> 'speed',
      'tempHp', c.sheet -> 'tempHp',
      'conditions', c.sheet -> 'conditions',
      'wounds', c.sheet -> 'wounds',
      'woundsMax', c.sheet -> 'woundsMax',
      'dying', c.sheet -> 'dying',
      'deathSaves', c.sheet -> 'deathSaves',
      'concentration', c.sheet -> 'concentration',
      'actionsSpent', c.sheet -> 'actionsSpent',
      'backstory', left(c.sheet ->> 'backstory', 4000)
    )) end
  from public.campaign_members m
  join public.profiles p on p.id = m.user_id
  left join public.characters c on c.id = m.character_id
  where m.campaign_id = p_campaign
    and (private.is_campaign_member(p_campaign) or private.is_staff())
  order by m.role, p.display_name
$$;

-- ---------------------------------------------------------------------------
-- AI provider keys, encrypted in Vault. The browser only ever sees the
-- provider and the last 4 characters; the Edge Function reads the key with
-- the service role through ai_key_for().
-- ---------------------------------------------------------------------------
create table public.user_ai_keys (
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'google', 'openai')),
  secret_id uuid not null,
  last4 text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.user_ai_keys enable row level security;
create policy user_ai_keys_select on public.user_ai_keys for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.user_ai_keys from authenticated;
grant select (user_id, provider, last4, is_default, created_at) on public.user_ai_keys to authenticated;

create function public.set_ai_key(p_provider text, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  existing uuid;
  k text := trim(p_key);
begin
  if me is null then raise exception 'Sign in first'; end if;
  if p_provider not in ('anthropic', 'google', 'openai') then
    raise exception 'Unknown provider %', p_provider;
  end if;
  if char_length(k) not between 16 and 400 or k ~ '\s' then
    raise exception 'That does not look like an API key';
  end if;
  select u.secret_id into existing from public.user_ai_keys u
  where u.user_id = me and u.provider = p_provider;
  if existing is null then
    existing := vault.create_secret(k, 'ai_key:' || me::text || ':' || p_provider);
    insert into public.user_ai_keys (user_id, provider, secret_id, last4, is_default)
    values (
      me, p_provider, existing, right(k, 4),
      not exists (select 1 from public.user_ai_keys u where u.user_id = me)
    );
  else
    perform vault.update_secret(existing, k);
    update public.user_ai_keys set last4 = right(k, 4)
    where user_id = me and provider = p_provider;
  end if;
end $$;

create function public.delete_ai_key(p_provider text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  sid uuid;
  was_default boolean;
begin
  delete from public.user_ai_keys u
  where u.user_id = me and u.provider = p_provider
  returning u.secret_id, u.is_default into sid, was_default;
  if sid is null then return; end if;
  delete from vault.secrets where id = sid;
  if was_default then
    update public.user_ai_keys set is_default = true
    where user_id = me and provider = (
      select u.provider from public.user_ai_keys u where u.user_id = me order by u.created_at limit 1
    );
  end if;
end $$;

create function public.set_default_ai_provider(p_provider text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if not exists (select 1 from public.user_ai_keys u where u.user_id = me and u.provider = p_provider) then
    raise exception 'Save a key for that provider first';
  end if;
  update public.user_ai_keys set is_default = (provider = p_provider) where user_id = me;
end $$;

-- Service role only (the generate-npc Edge Function). Null provider = the default.
create function public.ai_key_for(p_user uuid, p_provider text default null)
returns table (provider text, api_key text)
language sql stable security definer set search_path = '' as $$
  select u.provider, d.decrypted_secret
  from public.user_ai_keys u
  join vault.decrypted_secrets d on d.id = u.secret_id
  where u.user_id = p_user
    and (u.provider = p_provider or (p_provider is null and u.is_default))
  limit 1
$$;

-- A user's vault secrets go with the account.
create function private.drop_ai_secret() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets where id = old.secret_id;
  return null;
end $$;
create trigger user_ai_keys_drop_secret after delete on public.user_ai_keys
  for each row execute function private.drop_ai_secret();

-- ---------------------------------------------------------------------------
-- updated_at upkeep (private.touch_updated_at comes from the base schema)
-- ---------------------------------------------------------------------------
create trigger npcs_touch before update on public.npcs
  for each row execute function private.touch_updated_at();
create trigger campaign_npcs_touch before update on public.campaign_npcs
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Storage: NPC images, {user_id}/..., public like portraits.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('npc-images', 'npc-images', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

create policy npc_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'npc-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy npc_images_update on storage.objects for update to authenticated
  using (bucket_id = 'npc-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy npc_images_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'npc-images'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_staff()))
  );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.handle_available(text) to anon;
revoke execute on function public.ai_key_for(uuid, text) from authenticated;
grant execute on function public.ai_key_for(uuid, text) to service_role;
revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;
revoke all on public.site_settings, public.npcs, public.campaign_npcs, public.user_ai_keys from anon;
revoke insert, update, delete on public.site_settings from authenticated;
