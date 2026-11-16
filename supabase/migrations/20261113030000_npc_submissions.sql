-- NPC suggestions. Players no longer publish to the shared pool by saving a campaign
-- NPC; they suggest a stat block from Settings, and staff approve it into the pool
-- (or reject it with a note the player sees). Pool writes become staff only.

create table public.npc_submissions (
  id uuid primary key default gen_random_uuid(),
  system public.game_system not null,
  kind text not null default 'monster' check (kind in ('monster', 'humanoid')),
  name text not null check (char_length(name) between 1 and 80),
  level text not null default '',
  stat_block jsonb not null default '{}'::jsonb,
  image_path text,
  note text not null default '' check (char_length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text check (char_length(review_note) <= 1000),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  pool_npc_id uuid references public.npcs (id) on delete set null,
  submitted_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index npc_submissions_status_idx on public.npc_submissions (status, created_at);
create index npc_submissions_mine_idx on public.npc_submissions (submitted_by, created_at);
create index npc_submissions_reviewer_idx on public.npc_submissions (reviewed_by);
create index npc_submissions_pool_idx on public.npc_submissions (pool_npc_id);
alter table public.npc_submissions enable row level security;

create trigger npc_submissions_touch before update on public.npc_submissions
  for each row execute function private.touch_updated_at();

create policy npc_submissions_select on public.npc_submissions for select to authenticated
  using (submitted_by = (select auth.uid()) or (select private.is_staff()));

create policy npc_submissions_insert on public.npc_submissions for insert to authenticated
  with check (
    submitted_by = (select auth.uid())
    and status = 'pending'
    and review_note is null and reviewed_by is null and reviewed_at is null
    and pool_npc_id is null
    and (select private.can('active'))
  );

-- Editing a pending or rejected suggestion (re)sends it for review. Approved ones are
-- frozen; staff decide through the RPCs below, never by writing rows directly.
create policy npc_submissions_update on public.npc_submissions for update to authenticated
  using (submitted_by = (select auth.uid()) and status in ('pending', 'rejected'))
  with check (
    submitted_by = (select auth.uid())
    and status = 'pending'
    and review_note is null and reviewed_by is null and reviewed_at is null
    and pool_npc_id is null
    and (select private.can('active'))
  );

create policy npc_submissions_delete on public.npc_submissions for delete to authenticated
  using (submitted_by = (select auth.uid()) and status <> 'approved');

revoke all on public.npc_submissions from anon;

-- At most 10 suggestions waiting per player, counted on insert and on resubmit.
create function private.enforce_npc_submission_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pending'
     and (tg_op = 'INSERT' or old.status <> 'pending')
     and (select count(*) from public.npc_submissions s
          where s.submitted_by = new.submitted_by and s.status = 'pending' and s.id <> new.id) >= 10
  then
    raise exception 'You have 10 suggestions waiting for review. Wait for a decision before sending more.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger npc_submissions_limit before insert or update of status on public.npc_submissions
  for each row execute function private.enforce_npc_submission_limit();

-- ---------------------------------------------------------------------------
-- Review (staff)
-- ---------------------------------------------------------------------------

-- Approves a pending suggestion into the pool. `p_edits` may override name, kind,
-- level, stat_block and image_path (the reviewer's fixes). The pool entry is credited
-- to the player who suggested it.
create function public.staff_approve_npc_submission(
  p_id uuid,
  p_source text default 'homebrew',
  p_edits jsonb default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  s public.npc_submissions;
  e jsonb := coalesce(p_edits, '{}'::jsonb);
  new_id uuid;
begin
  if not private.is_staff() then
    raise exception 'Only staff can review suggestions';
  end if;
  if p_source not in ('official', 'homebrew') then
    raise exception 'Unknown source %', p_source;
  end if;
  select * into s from public.npc_submissions where id = p_id for update;
  if not found then
    raise exception 'That suggestion no longer exists';
  end if;
  if s.status <> 'pending' then
    raise exception 'That suggestion was already reviewed';
  end if;

  insert into public.npcs (system, kind, name, level, stat_block, image_path, source, ai_generated, created_by)
  values (
    s.system,
    coalesce(e ->> 'kind', s.kind),
    coalesce(nullif(btrim(e ->> 'name'), ''), s.name),
    coalesce(e ->> 'level', s.level),
    coalesce(e -> 'stat_block', s.stat_block),
    case when e ? 'image_path' then e ->> 'image_path' else s.image_path end,
    p_source,
    false,
    s.submitted_by
  )
  returning id into new_id;

  update public.npc_submissions
  set status = 'approved', pool_npc_id = new_id, review_note = null,
      reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_id;

  perform private.log_moderation(
    s.submitted_by, 'NPC suggestion "' || s.name || '" approved as ' || initcap(p_source)
  );
  return new_id;
end $$;

create function public.staff_reject_npc_submission(p_id uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.npc_submissions;
begin
  if not private.is_staff() then
    raise exception 'Only staff can review suggestions';
  end if;
  if nullif(btrim(coalesce(p_note, '')), '') is null then
    raise exception 'Say why, so the player can fix it';
  end if;
  select * into s from public.npc_submissions where id = p_id for update;
  if not found then
    raise exception 'That suggestion no longer exists';
  end if;
  if s.status <> 'pending' then
    raise exception 'That suggestion was already reviewed';
  end if;

  update public.npc_submissions
  set status = 'rejected', review_note = left(btrim(p_note), 1000),
      reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_id;

  perform private.log_moderation(s.submitted_by, 'NPC suggestion "' || s.name || '" not approved');
end $$;

revoke execute on function public.staff_approve_npc_submission(uuid, text, jsonb),
  public.staff_reject_npc_submission(uuid, text) from public, anon;
grant execute on function public.staff_approve_npc_submission(uuid, text, jsonb),
  public.staff_reject_npc_submission(uuid, text) to authenticated;
revoke execute on function private.enforce_npc_submission_limit() from public;

-- ---------------------------------------------------------------------------
-- The pool: only staff write it now (Admin → NPCs and approvals). Authors can still
-- remove their own entries (npcs_delete is unchanged). `npc_pool_publish` stays in
-- site_settings, unused, until no deployed client reads it.
-- ---------------------------------------------------------------------------
drop policy npcs_insert on public.npcs;
drop policy npcs_update on public.npcs;

create policy npcs_insert on public.npcs for insert to authenticated
  with check ((select private.is_staff()) and (select private.can('active')));

create policy npcs_update on public.npcs for update to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));
