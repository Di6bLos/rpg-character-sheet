-- Conditions the GM adds to or removes from a seated hero from the battle board's
-- stats modal. gm_set_hero_condition (below) writes the saved sheet at once, so the
-- change holds while the player is away, and leaves a row here for a sheet that is open
-- now: sheets don't reload while open, so that client applies it with the sheet's own
-- rules (addCondition / removeCondition) and deletes the row, as with hero_hp_changes.
create table public.hero_condition_changes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  condition text not null check (char_length(condition) between 1 and 40),
  -- True adds the condition, false removes it.
  add boolean not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index hero_condition_changes_character_idx
  on public.hero_condition_changes (character_id);
alter table public.hero_condition_changes enable row level security;

-- Only the campaign's GM, and only for a hero seated in that campaign.
create policy hero_condition_changes_insert on public.hero_condition_changes
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.is_campaign_gm(campaign_id))
    and exists (
      select 1 from public.campaign_members m
      where m.campaign_id = hero_condition_changes.campaign_id
        and m.character_id = hero_condition_changes.character_id
    )
  );
-- Only the hero's owner sees and clears them.
create policy hero_condition_changes_select on public.hero_condition_changes
  for select to authenticated
  using (
    exists (
      select 1 from public.characters c
      where c.id = hero_condition_changes.character_id and c.user_id = (select auth.uid())
    )
  );
create policy hero_condition_changes_delete on public.hero_condition_changes
  for delete to authenticated
  using (
    exists (
      select 1 from public.characters c
      where c.id = hero_condition_changes.character_id and c.user_id = (select auth.uid())
    )
  );

alter publication supabase_realtime add table public.hero_condition_changes;

-- The GM's way in: writes the condition onto the hero's saved sheet at once (so it holds
-- while the player is away; their sheet loads with it) and leaves the change above for a
-- sheet that is open now, which applies it live (a no-op when it already matches) and
-- autosaves. `p_end` is the condition's usual end (CONDITION_ENDS), set with it.
create or replace function public.gm_set_hero_condition(
  p_campaign uuid,
  p_character uuid,
  p_condition text,
  p_add boolean,
  p_end text default null
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cond text := btrim(p_condition);
  result jsonb;
begin
  if not (select private.is_campaign_gm(p_campaign)) then
    raise exception 'Only the GM can change a hero''s conditions';
  end if;
  if not exists (
    select 1 from public.campaign_members m
    where m.campaign_id = p_campaign and m.character_id = p_character
  ) then
    raise exception 'That hero is not seated in this campaign';
  end if;
  if char_length(cond) not between 1 and 40 then
    raise exception 'Condition name must be 1 to 40 characters';
  end if;
  if p_end is not null and p_end not in ('turnStart', 'turnEnd', 'round', 'encounter') then
    raise exception 'Unknown condition end';
  end if;

  update public.characters c
  set sheet = case
    when p_add then
      jsonb_set(
        jsonb_set(
          c.sheet,
          '{conditions}',
          case
            when coalesce(c.sheet -> 'conditions', '[]'::jsonb) ? cond
              then c.sheet -> 'conditions'
            else coalesce(c.sheet -> 'conditions', '[]'::jsonb) || to_jsonb(cond)
          end
        ),
        '{conditionEnds}',
        case
          when p_end is null then coalesce(c.sheet -> 'conditionEnds', '{}'::jsonb)
          else coalesce(c.sheet -> 'conditionEnds', '{}'::jsonb) || jsonb_build_object(cond, p_end)
        end
      )
    else
      jsonb_set(
        jsonb_set(
          c.sheet,
          '{conditions}',
          coalesce(
            (
              select jsonb_agg(x)
              from jsonb_array_elements(coalesce(c.sheet -> 'conditions', '[]'::jsonb)) x
              where x <> to_jsonb(cond)
            ),
            '[]'::jsonb
          )
        ),
        '{conditionEnds}',
        coalesce(c.sheet -> 'conditionEnds', '{}'::jsonb) - cond
      )
  end
  where c.id = p_character and c.system = 'nimble'
  returning c.sheet -> 'conditions' into result;

  insert into public.hero_condition_changes (campaign_id, character_id, condition, add)
  values (p_campaign, p_character, cond, p_add);

  return coalesce(result, '[]'::jsonb);
end $$;
revoke execute on function public.gm_set_hero_condition(uuid, uuid, text, boolean, text)
  from public, anon;
grant execute on function public.gm_set_hero_condition(uuid, uuid, text, boolean, text)
  to authenticated;
