-- Lantern overhaul: full schema. Replaces the original profiles/characters tables.

create extension if not exists citext with schema extensions;

-- Legacy schema from the first version of the app. The old storage buckets
-- (character-images, documents) and their files are left in place, without policies.
drop policy if exists "Admin delete shared docs" on storage.objects;
drop policy if exists "Admin upload shared docs" on storage.objects;
drop policy if exists "Authenticated read shared docs" on storage.objects;
drop policy if exists "Public read access for character images" on storage.objects;
drop policy if exists "Users can delete own documents" on storage.objects;
drop policy if exists "Users can delete own images" on storage.objects;
drop policy if exists "Users can update own images" on storage.objects;
drop policy if exists "Users can upload own documents" on storage.objects;
drop policy if exists "Users can upload own images" on storage.objects;
drop policy if exists "Users can view own documents" on storage.objects;
drop table if exists public.user_groups cascade;
drop table if exists public.groups cascade;
drop table if exists public.feedback cascade;
drop table if exists public.characters cascade;
drop table if exists public.profiles cascade;
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.update_updated_at() cascade;

create schema if not exists private;
grant usage on schema private to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'moderator', 'member');
create type public.game_system as enum ('dnd5e', 'pf2e', 'nimble');
create type public.campaign_role as enum ('gm', 'player');
create type public.invite_status as enum ('pending', 'accepted', 'declined', 'revoked');

-- ---------------------------------------------------------------------------
-- Profiles and permissions
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle extensions.citext not null unique check (handle::text ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_path text,
  role public.user_role not null default 'member',
  theme text not null default 'classic' check (theme in ('classic', 'gothic', 'eldritch', 'cursed')),
  accent text check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  notify_secret boolean not null default true,
  notify_journal boolean not null default true,
  notify_board boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.user_permissions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  can_create_campaigns boolean not null default true,
  can_upload_documents boolean not null default true,
  can_post_journal boolean not null default true,
  can_send_messages boolean not null default true,
  suspended boolean not null default false,
  restriction_reason text check (
    restriction_reason in ('Explicit content', 'Harassment', 'Spam', 'Other')
  ),
  restricted_at timestamptz
);

create table public.moderation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  created_at timestamptz not null default now()
);
create index moderation_history_user_idx on public.moderation_history (user_id, created_at desc);

-- New auth user -> profile + permissions. Handle comes from signup metadata,
-- falling back to the email prefix; a suffix is added if it is taken.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  base text;
  candidate text;
begin
  base := lower(coalesce(new.raw_user_meta_data ->> 'handle', split_part(new.email, '@', 1)));
  base := regexp_replace(base, '[^a-z0-9_]', '', 'g');
  if char_length(base) < 3 then base := 'player' || base; end if;
  base := left(base, 20);
  candidate := base;
  while exists (select 1 from public.profiles p where p.handle = candidate) loop
    candidate := base || floor(random() * 9000 + 1000)::int::text;
  end loop;

  insert into public.profiles (id, handle, display_name)
  values (
    new.id,
    candidate,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), candidate), 60)
  );
  insert into public.user_permissions (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Accounts that already exist get a profile too.
insert into public.profiles (id, handle, display_name)
select
  u.id,
  b.base || case when row_number() over (partition by b.base order by u.created_at) > 1
    then (row_number() over (partition by b.base order by u.created_at))::text else '' end,
  left(coalesce(nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''), b.base), 60)
from auth.users u
cross join lateral (
  select left(
    case when char_length(c.clean) < 3 then 'player' || c.clean else c.clean end, 20
  ) as base
  from (
    select regexp_replace(
      lower(coalesce(u.raw_user_meta_data ->> 'handle', split_part(u.email, '@', 1))),
      '[^a-z0-9_]', '', 'g'
    ) as clean
  ) c
) b;

insert into public.user_permissions (user_id) select id from public.profiles;

-- ---------------------------------------------------------------------------
-- Helper predicates (security definer so policies don't recurse)
-- ---------------------------------------------------------------------------
create function private.my_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid())
$$;

create function private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.my_role() in ('admin', 'moderator'), false)
$$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.my_role() = 'admin', false)
$$;

-- True when the caller is not suspended and holds the named permission flag.
create function private.can(flag text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (
      select not up.suspended and case flag
        when 'active' then true
        when 'can_create_campaigns' then up.can_create_campaigns
        when 'can_upload_documents' then up.can_upload_documents
        when 'can_post_journal' then up.can_post_journal
        when 'can_send_messages' then up.can_send_messages
        else false
      end
      from public.user_permissions up
      where up.user_id = (select auth.uid())
    ),
    false
  )
$$;

-- ---------------------------------------------------------------------------
-- Characters
-- ---------------------------------------------------------------------------
create table public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  system public.game_system not null,
  level integer not null default 1 check (level between 1 and 20),
  portrait_path text,
  sheet jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index characters_user_idx on public.characters (user_id);

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger characters_touch before update on public.characters
  for each row execute function private.touch_updated_at();

create function private.enforce_character_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.characters c where c.user_id = new.user_id) >= 5 then
    raise exception 'Character limit reached (5 per player)' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger characters_limit before insert on public.characters
  for each row execute function private.enforce_character_limit();

-- ---------------------------------------------------------------------------
-- Campaigns
-- ---------------------------------------------------------------------------
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  system public.game_system not null,
  pitch text,
  cover_path text,
  next_session_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.campaign_members (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.campaign_role not null default 'player',
  character_id uuid references public.characters (id) on delete set null,
  last_read_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
create index campaign_members_user_idx on public.campaign_members (user_id);
create index campaign_members_character_idx on public.campaign_members (character_id);

create table public.campaign_invites (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  invited_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  invitee_id uuid references public.profiles (id) on delete cascade,
  token uuid unique,
  status public.invite_status not null default 'pending',
  created_at timestamptz not null default now(),
  check (invitee_id is not null or token is not null)
);
create index campaign_invites_invitee_idx on public.campaign_invites (invitee_id, status);
create index campaign_invites_campaign_idx on public.campaign_invites (campaign_id);
create unique index campaign_invites_one_pending
  on public.campaign_invites (campaign_id, invitee_id) where status = 'pending';

create function private.is_campaign_member(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.campaign_members m
    where m.campaign_id = cid and m.user_id = (select auth.uid())
  )
$$;

create function private.is_campaign_gm(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.campaign_members m
    where m.campaign_id = cid and m.user_id = (select auth.uid()) and m.role = 'gm'
  )
$$;

create function private.has_pending_invite(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.campaign_invites i
    where i.campaign_id = cid and i.invitee_id = (select auth.uid()) and i.status = 'pending'
  )
$$;

-- GM of any campaign the character is seated in.
create function private.is_gm_of_character(char_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.campaign_members seat
    join public.campaign_members gm
      on gm.campaign_id = seat.campaign_id and gm.role = 'gm'
    where seat.character_id = char_id and gm.user_id = (select auth.uid())
  )
$$;

create function private.add_creator_as_gm() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.campaign_members (campaign_id, user_id, role)
  values (new.id, new.created_by, 'gm');
  insert into public.encounters (campaign_id) values (new.id);
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Campaign content
-- ---------------------------------------------------------------------------
create table public.board_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  kind text not null default 'image' check (kind in ('map', 'image', 'handout')),
  file_path text not null,
  hidden boolean not null default false,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index board_items_campaign_idx on public.board_items (campaign_id, created_at desc);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '',
  visibility text not null default 'party' check (visibility in ('party', 'gm')),
  created_at timestamptz not null default now()
);
create index journal_entries_campaign_idx on public.journal_entries (campaign_id, created_at desc);

create table public.journal_attachments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries (id) on delete cascade,
  file_path text not null,
  name text not null,
  size bigint not null default 0
);
create index journal_attachments_entry_idx on public.journal_attachments (entry_id);

-- recipient_ids null = whole party; otherwise a secret message to those players.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  recipient_ids uuid[],
  created_at timestamptz not null default now()
);
create index messages_campaign_idx on public.messages (campaign_id, created_at desc);

create table public.encounters (
  campaign_id uuid primary key references public.campaigns (id) on delete cascade,
  round integer not null default 1,
  active_combatant uuid,
  updated_at timestamptz not null default now()
);

create table public.combatants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null default 'monster' check (kind in ('pc', 'npc', 'monster')),
  initiative integer not null default 0,
  init_mod integer not null default 0,
  hp integer not null default 0,
  hp_max integer not null default 0,
  ac integer not null default 10,
  character_id uuid references public.characters (id) on delete set null,
  created_at timestamptz not null default now()
);
create index combatants_campaign_idx on public.combatants (campaign_id);

create trigger campaigns_add_gm after insert on public.campaigns
  for each row execute function private.add_creator_as_gm();

-- ---------------------------------------------------------------------------
-- Library and reports
-- ---------------------------------------------------------------------------
create table public.library_documents (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  file_path text not null,
  ext text not null,
  size bigint not null default 0,
  system public.game_system,
  category text not null default 'Reference' check (
    category in ('Rules', 'Reference', 'Guides', 'Homebrew', 'Sheets')
  ),
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('library', 'board', 'journal')),
  target_id uuid not null,
  bucket text not null,
  file_path text not null,
  file_name text not null,
  where_label text not null,
  uploader_id uuid references public.profiles (id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 200),
  status text not null default 'open' check (status in ('open', 'dismissed', 'removed')),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
create index reports_status_idx on public.reports (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_permissions enable row level security;
alter table public.moderation_history enable row level security;
alter table public.characters enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.campaign_invites enable row level security;
alter table public.board_items enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_attachments enable row level security;
alter table public.messages enable row level security;
alter table public.encounters enable row level security;
alter table public.combatants enable row level security;
alter table public.library_documents enable row level security;
alter table public.reports enable row level security;

-- profiles: readable by signed-in users; users edit only cosmetic columns.
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke insert, update, delete on public.profiles from authenticated, anon;
grant update (display_name, avatar_path, theme, accent, notify_secret, notify_journal, notify_board)
  on public.profiles to authenticated;

-- user_permissions / moderation_history: read own (or staff); writes via RPC only.
create policy user_permissions_select on public.user_permissions for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff()));
revoke insert, update, delete on public.user_permissions from authenticated, anon;

create policy moderation_history_select on public.moderation_history for select to authenticated
  using ((select private.is_staff()));
revoke insert, update, delete on public.moderation_history from authenticated, anon;

-- characters
create policy characters_select on public.characters for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_gm_of_character(id))
    or (select private.is_staff())
  );
create policy characters_insert on public.characters for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.can('active')));
create policy characters_update on public.characters for update to authenticated
  using (user_id = (select auth.uid()) and (select private.can('active')))
  with check (user_id = (select auth.uid()));
create policy characters_delete on public.characters for delete to authenticated
  using (user_id = (select auth.uid()));

-- campaigns
create policy campaigns_select on public.campaigns for select to authenticated
  using (
    created_by = (select auth.uid())
    or (select private.is_campaign_member(id))
    or (select private.has_pending_invite(id))
    or (select private.is_staff())
  );
create policy campaigns_insert on public.campaigns for insert to authenticated
  with check (created_by = (select auth.uid()) and (select private.can('can_create_campaigns')));
create policy campaigns_update on public.campaigns for update to authenticated
  using ((select private.is_campaign_gm(id))) with check ((select private.is_campaign_gm(id)));
create policy campaigns_delete on public.campaigns for delete to authenticated
  using ((select private.is_campaign_gm(id)) or (select private.is_admin()));

-- campaign_members: joined through RPCs; a member may seat their own character.
create policy campaign_members_select on public.campaign_members for select to authenticated
  using ((select private.is_campaign_member(campaign_id)) or (select private.is_staff()));
create policy campaign_members_update_own on public.campaign_members for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      character_id is null
      or exists (
        select 1 from public.characters c
        where c.id = character_id and c.user_id = (select auth.uid())
      )
    )
  );
create policy campaign_members_delete on public.campaign_members for delete to authenticated
  using (
    (user_id = (select auth.uid()) and role = 'player')
    or ((select private.is_campaign_gm(campaign_id)) and user_id <> (select auth.uid()))
  );
revoke insert, update on public.campaign_members from authenticated, anon;
grant update (character_id, last_read_at) on public.campaign_members to authenticated;

-- campaign_invites: GM manages; invitee reads their own. Responses go through RPCs.
create policy campaign_invites_select on public.campaign_invites for select to authenticated
  using (invitee_id = (select auth.uid()) or (select private.is_campaign_gm(campaign_id)));
create policy campaign_invites_update on public.campaign_invites for update to authenticated
  using ((select private.is_campaign_gm(campaign_id)))
  with check ((select private.is_campaign_gm(campaign_id)));
create policy campaign_invites_delete on public.campaign_invites for delete to authenticated
  using ((select private.is_campaign_gm(campaign_id)));
revoke insert on public.campaign_invites from authenticated, anon;

-- board_items: hidden items are GM-only.
create policy board_items_select on public.board_items for select to authenticated
  using (
    (select private.is_campaign_member(campaign_id))
    and (not hidden or (select private.is_campaign_gm(campaign_id)))
  );
create policy board_items_insert on public.board_items for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.is_campaign_member(campaign_id))
    and (select private.can('can_upload_documents'))
    and (not hidden or (select private.is_campaign_gm(campaign_id)))
  );
create policy board_items_update on public.board_items for update to authenticated
  using ((select private.is_campaign_gm(campaign_id)))
  with check ((select private.is_campaign_gm(campaign_id)));
create policy board_items_delete on public.board_items for delete to authenticated
  using (
    (select private.is_campaign_gm(campaign_id))
    or created_by = (select auth.uid())
    or (select private.is_staff())
  );

-- journal: 'gm' visibility = author and the GM only.
create policy journal_entries_select on public.journal_entries for select to authenticated
  using (
    (select private.is_campaign_member(campaign_id))
    and (
      visibility = 'party'
      or author_id = (select auth.uid())
      or (select private.is_campaign_gm(campaign_id))
    )
  );
create policy journal_entries_insert on public.journal_entries for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (select private.is_campaign_member(campaign_id))
    and (select private.can('can_post_journal'))
  );
create policy journal_entries_update on public.journal_entries for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy journal_entries_delete on public.journal_entries for delete to authenticated
  using (
    author_id = (select auth.uid())
    or (select private.is_campaign_gm(campaign_id))
    or (select private.is_staff())
  );

create policy journal_attachments_select on public.journal_attachments for select to authenticated
  using (exists (select 1 from public.journal_entries e where e.id = entry_id));
create policy journal_attachments_insert on public.journal_attachments for insert to authenticated
  with check (
    exists (
      select 1 from public.journal_entries e
      where e.id = entry_id and e.author_id = (select auth.uid())
    )
  );
create policy journal_attachments_delete on public.journal_attachments for delete to authenticated
  using (
    (select private.is_staff())
    or exists (
      select 1 from public.journal_entries e
      where e.id = entry_id and e.author_id = (select auth.uid())
    )
  );

-- messages
create policy messages_select on public.messages for select to authenticated
  using (
    (select private.is_campaign_member(campaign_id))
    and (
      recipient_ids is null
      or sender_id = (select auth.uid())
      or (select auth.uid()) = any (recipient_ids)
    )
  );
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select private.is_campaign_member(campaign_id))
    and (select private.can('can_send_messages'))
    and (recipient_ids is null or (select private.is_campaign_gm(campaign_id)))
  );
create policy messages_delete on public.messages for delete to authenticated
  using (sender_id = (select auth.uid()) or (select private.is_campaign_gm(campaign_id)));

-- initiative: GM only.
create policy encounters_gm on public.encounters for all to authenticated
  using ((select private.is_campaign_gm(campaign_id)))
  with check ((select private.is_campaign_gm(campaign_id)));
create policy combatants_gm on public.combatants for all to authenticated
  using ((select private.is_campaign_gm(campaign_id)))
  with check ((select private.is_campaign_gm(campaign_id)));

-- library
create policy library_select on public.library_documents for select to authenticated using (true);
create policy library_insert on public.library_documents for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and (select private.can('can_upload_documents')));
create policy library_delete on public.library_documents for delete to authenticated
  using (uploaded_by = (select auth.uid()) or (select private.is_staff()));

-- reports
create policy reports_select on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_staff()));
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and (select private.can('active')));
revoke update, delete on public.reports from authenticated, anon;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create function public.handle_available(candidate text) returns boolean
language sql stable security definer set search_path = '' as $$
  select candidate ~ '^[a-z0-9_]{3,24}$'
    and not exists (select 1 from public.profiles p where p.handle = candidate)
$$;
grant execute on function public.handle_available(text) to anon, authenticated;

-- Invite an existing account by exact handle or email. Exact match only, so the
-- function can't be used to enumerate accounts.
create function public.invite_to_campaign(p_campaign uuid, p_identifier text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
  ident text := lower(trim(leading '@' from trim(p_identifier)));
  invite_id uuid;
begin
  if not private.is_campaign_gm(p_campaign) then
    raise exception 'Only the Game Master can invite players';
  end if;

  select p.id into target from public.profiles p where p.handle = ident;
  if target is null then
    select u.id into target from auth.users u where lower(u.email) = ident;
  end if;
  if target is null then
    raise exception 'No player found for "%"', p_identifier;
  end if;
  if exists (
    select 1 from public.campaign_members m where m.campaign_id = p_campaign and m.user_id = target
  ) then
    raise exception 'That player is already in this campaign';
  end if;

  insert into public.campaign_invites (campaign_id, invited_by, invitee_id)
  values (p_campaign, auth.uid(), target)
  on conflict (campaign_id, invitee_id) where status = 'pending' do nothing
  returning id into invite_id;

  if invite_id is null then
    raise exception 'That player already has a pending invite';
  end if;
  return invite_id;
end $$;

-- Returns the campaign's reusable invite link token, creating it on first use.
create function public.campaign_invite_link(p_campaign uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  link uuid;
begin
  if not private.is_campaign_gm(p_campaign) then
    raise exception 'Only the Game Master can create an invite link';
  end if;
  select i.token into link from public.campaign_invites i
  where i.campaign_id = p_campaign and i.token is not null and i.status = 'pending'
  limit 1;
  if link is null then
    link := gen_random_uuid();
    insert into public.campaign_invites (campaign_id, invited_by, token)
    values (p_campaign, auth.uid(), link);
  end if;
  return link;
end $$;

create function public.invite_preview(p_token uuid)
returns table (campaign_id uuid, name text, system public.game_system, gm_name text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.system, p.display_name
  from public.campaign_invites i
  join public.campaigns c on c.id = i.campaign_id
  join public.profiles p on p.id = c.created_by
  where i.token = p_token and i.status = 'pending'
$$;

create function public.join_by_token(p_token uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
begin
  if not private.can('active') then
    raise exception 'Your account is suspended';
  end if;
  select i.campaign_id into cid from public.campaign_invites i
  where i.token = p_token and i.status = 'pending';
  if cid is null then
    raise exception 'This invite link is no longer valid';
  end if;
  insert into public.campaign_members (campaign_id, user_id)
  values (cid, auth.uid())
  on conflict do nothing;
  return cid;
end $$;

create function public.respond_invite(p_invite uuid, p_accept boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
begin
  update public.campaign_invites i
  set status = case when p_accept then 'accepted' else 'declined' end::public.invite_status
  where i.id = p_invite and i.invitee_id = auth.uid() and i.status = 'pending'
  returning i.campaign_id into cid;
  if cid is null then
    raise exception 'Invite not found';
  end if;
  if p_accept then
    if not private.can('active') then
      raise exception 'Your account is suspended';
    end if;
    insert into public.campaign_members (campaign_id, user_id)
    values (cid, auth.uid())
    on conflict do nothing;
  end if;
  return cid;
end $$;

create function public.set_member_role(p_campaign uuid, p_user uuid, p_role public.campaign_role)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_campaign_gm(p_campaign) then
    raise exception 'Only the Game Master can change roles';
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot change your own role';
  end if;
  update public.campaign_members m set role = p_role
  where m.campaign_id = p_campaign and m.user_id = p_user;
end $$;

-- Party roster with only the fields the table should share.
create function public.campaign_roster(p_campaign uuid)
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
    case when c.id is null then null else jsonb_build_object(
      'class', c.sheet -> 'class',
      'lineage', c.sheet -> 'lineage',
      'hp', c.sheet -> 'hp',
      'hpMax', c.sheet -> 'hpMax',
      'ac', c.sheet -> 'ac',
      'passivePerception', c.sheet -> 'passivePerception',
      'initMod', c.sheet -> 'initMod'
    ) end
  from public.campaign_members m
  join public.profiles p on p.id = m.user_id
  left join public.characters c on c.id = m.character_id
  where m.campaign_id = p_campaign
    and (private.is_campaign_member(p_campaign) or private.is_staff())
  order by m.role, p.display_name
$$;

-- Staff: permissions, roles, suspension, reports ------------------------------
create function private.assert_can_moderate(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target_role public.user_role;
begin
  if not private.is_staff() then
    raise exception 'Not allowed';
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot moderate your own account';
  end if;
  select role into target_role from public.profiles where id = p_user;
  if target_role is null then
    raise exception 'User not found';
  end if;
  if target_role <> 'member' and not private.is_admin() then
    raise exception 'Only an admin can moderate staff';
  end if;
end $$;

create function private.log_moderation(p_user uuid, p_action text) returns void
language sql security definer set search_path = '' as $$
  insert into public.moderation_history (user_id, actor_id, action)
  values (p_user, auth.uid(), p_action)
$$;

create function public.staff_set_permission(p_user uuid, p_flag text, p_value boolean, p_reason text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  label text;
  actor text;
  still_restricted boolean;
begin
  perform private.assert_can_moderate(p_user);
  label := case p_flag
    when 'can_create_campaigns' then 'Campaign creation'
    when 'can_upload_documents' then 'Uploads'
    when 'can_post_journal' then 'Journal posting'
    when 'can_send_messages' then 'Messaging'
  end;
  if label is null then
    raise exception 'Unknown permission';
  end if;

  execute format('update public.user_permissions set %I = $1 where user_id = $2', p_flag)
    using p_value, p_user;

  select not (up.can_create_campaigns and up.can_upload_documents
              and up.can_post_journal and up.can_send_messages)
  into still_restricted
  from public.user_permissions up where up.user_id = p_user;

  update public.user_permissions up set
    restriction_reason = case
      when not still_restricted then null
      else coalesce(p_reason, up.restriction_reason)
    end,
    restricted_at = case
      when not still_restricted then null
      when not p_value then now()
      else up.restricted_at
    end
  where up.user_id = p_user;

  select display_name into actor from public.profiles where id = auth.uid();
  perform private.log_moderation(
    p_user,
    label || case when p_value then ' turned on by ' else ' turned off by ' end || actor
      || coalesce(' · ' || p_reason, '')
  );
end $$;

create function public.staff_set_reason(p_user uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_can_moderate(p_user);
  update public.user_permissions set restriction_reason = nullif(p_reason, '')
  where user_id = p_user;
  perform private.log_moderation(p_user, 'Restriction reason set to ' || coalesce(nullif(p_reason, ''), 'None'));
end $$;

create function public.admin_set_role(p_user uuid, p_role public.user_role) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Only an admin can change roles';
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot change your own role';
  end if;
  update public.profiles set role = p_role where id = p_user;
  perform private.log_moderation(p_user, 'Role changed to ' || initcap(p_role::text));
end $$;

create function public.admin_set_suspended(p_user uuid, p_suspended boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Only an admin can suspend accounts';
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot suspend your own account';
  end if;
  update public.user_permissions set suspended = p_suspended where user_id = p_user;
  perform private.log_moderation(
    p_user, case when p_suspended then 'Account suspended' else 'Suspension lifted' end
  );
end $$;

create function public.staff_list_users()
returns table (
  id uuid,
  handle text,
  display_name text,
  email text,
  role public.user_role,
  created_at timestamptz,
  can_create_campaigns boolean,
  can_upload_documents boolean,
  can_post_journal boolean,
  can_send_messages boolean,
  suspended boolean,
  restriction_reason text,
  campaigns bigint,
  uploads bigint,
  open_reports bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_staff() then
    raise exception 'Not allowed';
  end if;
  return query
  select
    p.id, p.handle::text, p.display_name, u.email::text, p.role, p.created_at,
    up.can_create_campaigns, up.can_upload_documents, up.can_post_journal, up.can_send_messages,
    up.suspended, up.restriction_reason,
    (select count(*) from public.campaign_members m where m.user_id = p.id),
    (select count(*) from public.library_documents d where d.uploaded_by = p.id)
      + (select count(*) from public.board_items b where b.created_by = p.id),
    (select count(*) from public.reports r where r.uploader_id = p.id and r.status = 'open')
  from public.profiles p
  join public.user_permissions up on up.user_id = p.id
  join auth.users u on u.id = p.id
  order by p.created_at;
end $$;

-- p_action: 'dismiss' | 'remove' | 'remove_restrict'. The caller removes the
-- storage object itself (staff have delete rights on every bucket).
create function public.staff_resolve_report(p_report uuid, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.reports;
begin
  if not private.is_staff() then
    raise exception 'Not allowed';
  end if;
  select * into r from public.reports where id = p_report and status = 'open';
  if r.id is null then
    raise exception 'Report not found';
  end if;

  if p_action = 'dismiss' then
    update public.reports set status = 'dismissed', resolved_by = auth.uid(), resolved_at = now()
    where id = p_report;
    return;
  end if;
  if p_action not in ('remove', 'remove_restrict') then
    raise exception 'Unknown action';
  end if;

  if r.target_type = 'library' then
    delete from public.library_documents where id = r.target_id;
  elsif r.target_type = 'board' then
    delete from public.board_items where id = r.target_id;
  else
    delete from public.journal_attachments where id = r.target_id;
  end if;

  update public.reports set status = 'removed', resolved_by = auth.uid(), resolved_at = now()
  where target_type = r.target_type and target_id = r.target_id and status = 'open';

  if r.uploader_id is not null then
    perform private.log_moderation(
      r.uploader_id, 'Removed “' || r.file_name || '” from ' || lower(r.where_label)
    );
    if p_action = 'remove_restrict' and r.uploader_id <> auth.uid() then
      perform public.staff_set_permission(r.uploader_id, 'can_upload_documents', false, 'Explicit content');
    end if;
  end if;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.handle_available(text) to anon;
revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('portraits', 'portraits', true, 5242880),
  ('campaign-files', 'campaign-files', false, 26214400),
  ('library', 'library', false, 52428800)
on conflict (id) do nothing;

-- portraits: {user_id}/...
create policy portraits_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'portraits' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy portraits_update on storage.objects for update to authenticated
  using (bucket_id = 'portraits' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy portraits_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'portraits'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_staff()))
  );

-- campaign-files: {campaign_id}/...
create policy campaign_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'campaign-files'
    and (
      (select private.is_staff())
      or private.is_campaign_member(((storage.foldername(name))[1])::uuid)
    )
  );
create policy campaign_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'campaign-files'
    and private.is_campaign_member(((storage.foldername(name))[1])::uuid)
    and (select private.can('can_upload_documents'))
  );
create policy campaign_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'campaign-files'
    and (
      owner = (select auth.uid())
      or (select private.is_staff())
      or private.is_campaign_gm(((storage.foldername(name))[1])::uuid)
    )
  );

-- library: {user_id}/...
create policy library_files_select on storage.objects for select to authenticated
  using (bucket_id = 'library');
create policy library_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'library'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.can('can_upload_documents'))
  );
create policy library_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'library'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_staff()))
  );

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.messages,
  public.board_items,
  public.journal_entries,
  public.campaign_invites,
  public.campaign_members,
  public.encounters,
  public.combatants;
