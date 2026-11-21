-- Initiative mode, per campaign (on its one encounters row, which every member
-- reads live):
--   nimble  — heroes always act first; the Initiative roll sets their starting actions.
--   classic — the roll sets the turn order; heroes start with full actions.
alter table public.encounters
  add column initiative_mode text not null default 'nimble'
    check (initiative_mode in ('nimble', 'classic'));

-- A hero seated by the GM waits at the top of the order until their Initiative
-- arrives (the player rolls it, or the GM types it).
alter table public.combatants
  add column initiative_rolled boolean not null default true;

create or replace function public.set_my_initiative(
  p_campaign uuid,
  p_character uuid,
  p_initiative integer
)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  moved integer;
begin
  if not exists (
    select 1
    from public.campaign_members m
    join public.characters c on c.id = m.character_id
    where m.campaign_id = p_campaign
      and m.user_id = (select auth.uid())
      and m.character_id = p_character
      and c.user_id = (select auth.uid())
  ) then
    raise exception 'Not your hero in this campaign';
  end if;
  update public.combatants
  set initiative = p_initiative, initiative_rolled = true
  where campaign_id = p_campaign
    and (
      (kind = 'pc' and character_id = p_character)
      or (kind = 'summon' and summon_key like p_character::text || ':%')
    );
  get diagnostics moved = row_count;
  return moved;
end $$;
revoke execute on function public.set_my_initiative(uuid, uuid, integer) from public, anon;
grant execute on function public.set_my_initiative(uuid, uuid, integer) to authenticated;

drop function public.campaign_initiative(uuid);
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
  hp_band text,
  summon_key text,
  conditions text[],
  actions_max smallint,
  actions_used smallint,
  initiative_rolled boolean
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
    end,
    c.summon_key,
    c.conditions,
    case when gm then c.actions_max end,
    case when gm then c.actions_used end,
    c.initiative_rolled
  from public.combatants c
  where c.campaign_id = p_campaign
  -- The client sorts by the campaign's mode (`sortOrder`); this is the tiebreak it keeps.
  order by c.initiative desc, c.created_at, c.name collate "C", c.id::text collate "C";
end $$;
revoke execute on function public.campaign_initiative(uuid) from public, anon;
grant execute on function public.campaign_initiative(uuid) to authenticated;
