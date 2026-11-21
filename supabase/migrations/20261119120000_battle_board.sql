alter table public.combatants
  add column conditions text[] not null default '{}',
  add column actions_max smallint not null default 1 check (actions_max between 0 and 9),
  add column actions_used smallint not null default 0 check (actions_used >= 0);

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
  actions_used smallint
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
    case when gm then c.actions_used end
  from public.combatants c
  where c.campaign_id = p_campaign
  order by c.initiative desc, c.created_at, c.name collate "C", c.id::text collate "C";
end $$;
revoke execute on function public.campaign_initiative(uuid) from public, anon;
grant execute on function public.campaign_initiative(uuid) to authenticated;

-- The public part of a seated hero for the stats modal: no notes, coins,
-- inventory or backstory.
create function public.campaign_hero_card(p_campaign uuid, p_character uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.characters;
  s jsonb;
begin
  if not private.is_campaign_member(p_campaign) then
    raise exception 'Not a member of this campaign';
  end if;
  if not exists (
    select 1 from public.campaign_members m
    where m.campaign_id = p_campaign and m.character_id = p_character
  ) then
    raise exception 'That hero is not seated in this campaign';
  end if;
  select * into c from public.characters where id = p_character;
  s := coalesce(c.sheet, '{}'::jsonb);
  return jsonb_build_object(
    'name', c.name,
    'level', c.level,
    'portrait_path', c.portrait_path,
    'class', coalesce(s ->> 'class', ''),
    'subclass', coalesce(s ->> 'subclass', ''),
    'lineage', coalesce(s ->> 'lineage', ''),
    'hp', coalesce((s ->> 'hp')::numeric, 0),
    'hpMax', coalesce((s ->> 'hpMax')::numeric, 0),
    'tempHp', coalesce((s ->> 'tempHp')::numeric, 0),
    'wounds', coalesce((s ->> 'wounds')::numeric, 0),
    'woundsMax', coalesce((s ->> 'woundsMax')::numeric, 0),
    'ac', coalesce((s ->> 'ac')::numeric, 0),
    'speed', coalesce(s ->> 'speed', ''),
    'initMod', coalesce((s ->> 'initMod')::numeric, 0),
    'stats', jsonb_build_object(
      'STR', coalesce((s -> 'stats' ->> 'STR')::numeric, 0),
      'DEX', coalesce((s -> 'stats' ->> 'DEX')::numeric, 0),
      'INT', coalesce((s -> 'stats' ->> 'INT')::numeric, 0),
      'WIL', coalesce((s -> 'stats' ->> 'WIL')::numeric, 0)
    ),
    'saveAdv', coalesce(s ->> 'saveAdv', ''),
    'saveDis', coalesce(s ->> 'saveDis', ''),
    'skills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', k ->> 'name', 'stat', k ->> 'stat',
        'points', coalesce((k ->> 'points')::numeric, 0)))
      from jsonb_array_elements(
        case when jsonb_typeof(s -> 'skills') = 'array' then s -> 'skills' else '[]'::jsonb end
      ) k
    ), '[]'::jsonb),
    'mana', case when jsonb_typeof(s -> 'mana') = 'object' then jsonb_build_object(
      'current', coalesce((s -> 'mana' ->> 'current')::numeric, 0),
      'max', coalesce((s -> 'mana' ->> 'max')::numeric, 0)) end,
    'resource', case when jsonb_typeof(s -> 'resource') = 'object' then jsonb_build_object(
      'name', coalesce(s -> 'resource' ->> 'name', ''),
      'count', coalesce((s -> 'resource' ->> 'count')::numeric, 0),
      'dice', coalesce((s -> 'resource' ->> 'dice')::numeric, 0),
      'die', coalesce((s -> 'resource' ->> 'die')::numeric, 0)) end,
    'conditions', coalesce((
      select jsonb_agg(distinct x) from (
        select jsonb_array_elements_text(
          case when jsonb_typeof(s -> 'conditions') = 'array' then s -> 'conditions' else '[]'::jsonb end
        ) as x
        union
        select e ->> 'condition' from jsonb_array_elements(
          case when jsonb_typeof(s -> 'effects') = 'array' then s -> 'effects' else '[]'::jsonb end
        ) e
      ) q where x is not null and x <> ''
    ), '[]'::jsonb),
    'summons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', m ->> 'name',
        'hp', coalesce((m ->> 'hp')::numeric, 0),
        'hpMax', coalesce((m ->> 'hpMax')::numeric, 0)))
      from jsonb_array_elements(
        case when jsonb_typeof(s -> 'summons') = 'array' then s -> 'summons' else '[]'::jsonb end
      ) m
    ), '[]'::jsonb),
    'abilities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', coalesce(a ->> 'name', ''),
        'desc', coalesce(a ->> 'desc', ''),
        'src', coalesce(a ->> 'src', '')))
      from jsonb_array_elements(
        case when jsonb_typeof(s -> 'abilities') = 'array' then s -> 'abilities' else '[]'::jsonb end
      ) a
    ), '[]'::jsonb)
  );
end $$;
revoke execute on function public.campaign_hero_card(uuid, uuid) from public, anon;
grant execute on function public.campaign_hero_card(uuid, uuid) to authenticated;
