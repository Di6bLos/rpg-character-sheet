-- Review fixes for NPC suggestions (PR #24):
--   * a suggestion may only point at an image in its author's own npc-images folder
--   * stat blocks are capped at 64 KB
--   * approving refuses a name the pool already has for that system unless the
--     reviewer confirms it's a different creature, and checks the reviewer's edits
--   * the retired "publish GM NPCs" switch is turned off and no longer feeds the
--     deprecated npc_pool_enabled mirror

alter table public.npc_submissions
  add constraint npc_submissions_image_own
    check (image_path is null or starts_with(image_path, submitted_by::text || '/')),
  add constraint npc_submissions_stat_block_size
    check (pg_column_size(stat_block) < 65536),
  add constraint npc_submissions_level_len
    check (char_length(level) <= 40);

drop function public.staff_approve_npc_submission(uuid, text, jsonb);

-- Approves a pending suggestion into the pool. `p_edits` may override name, kind,
-- level, stat_block and image_path (the reviewer's fixes). A name the pool already
-- has in that system is refused (23505) unless `p_allow_duplicate`. The pool entry
-- is credited to the player who suggested it.
create function public.staff_approve_npc_submission(
  p_id uuid,
  p_source text default 'homebrew',
  p_edits jsonb default null,
  p_allow_duplicate boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  s public.npc_submissions;
  e jsonb := coalesce(p_edits, '{}'::jsonb);
  v_name text;
  v_kind text;
  v_level text;
  v_block jsonb;
  v_image text;
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

  v_name := coalesce(nullif(btrim(e ->> 'name'), ''), s.name);
  v_kind := coalesce(e ->> 'kind', s.kind);
  v_level := coalesce(e ->> 'level', s.level);
  v_block := coalesce(e -> 'stat_block', s.stat_block);
  v_image := case when e ? 'image_path' then e ->> 'image_path' else s.image_path end;

  if char_length(v_name) > 80 then
    raise exception 'Names can be at most 80 characters';
  end if;
  if v_kind not in ('monster', 'humanoid') then
    raise exception 'Unknown kind %', v_kind;
  end if;
  if jsonb_typeof(v_block) <> 'object' or pg_column_size(v_block) >= 65536 then
    raise exception 'That stat block is not valid or is too large';
  end if;
  -- The player's image, or one the reviewer uploaded to their own folder.
  if v_image is not null
     and not starts_with(v_image, s.submitted_by::text || '/')
     and not starts_with(v_image, auth.uid()::text || '/') then
    raise exception 'That image doesn''t belong to this suggestion';
  end if;
  if not p_allow_duplicate and exists (
    select 1 from public.npcs n where n.system = s.system and lower(n.name) = lower(v_name)
  ) then
    raise exception 'The pool already has "%" for this system', v_name using errcode = 'unique_violation';
  end if;

  insert into public.npcs (system, kind, name, level, stat_block, image_path, source, ai_generated, created_by)
  values (s.system, v_kind, v_name, v_level, v_block, v_image, p_source, false, s.submitted_by)
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

revoke execute on function public.staff_approve_npc_submission(uuid, text, jsonb, boolean) from public, anon;
grant execute on function public.staff_approve_npc_submission(uuid, text, jsonb, boolean) to authenticated;

-- The publish switch is retired: off, and out of the deprecated mirror.
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
      label := 'AI generator';
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

update public.site_settings
set npc_pool_publish = false,
    npc_pool_enabled = npc_pool_campaign or npc_pool_library
where id;
