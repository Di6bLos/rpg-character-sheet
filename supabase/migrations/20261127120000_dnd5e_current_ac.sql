-- A 5e hero's AC on the board is its AC now: the sheet saves `currentAc` (acNow in
-- utils/dnd5ePlay.ts, with Shield, Haste, Mage Armor…) beside the base `ac` it was worked out
-- from, and campaign_roster and campaign_hero_card read it while that base still matches `ac`
-- (an AC edited with the sheet closed falls back to `ac`). The functions are otherwise as
-- 20261126120000_dnd5e_board_exhaustion.sql and 20261125130000_pf2e_board_gaps.sql left them.

create or replace function private.dnd5e_ac(s jsonb)
returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when jsonb_typeof(s -> 'currentAc' -> 'value') = 'number'
      and s -> 'currentAc' -> 'base' = s -> 'ac'
    then s -> 'currentAc' -> 'value'
    else s -> 'ac'
  end
$$;

create or replace function public.campaign_hero_card(p_campaign uuid, p_character uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.characters;
  s jsonb;
  card jsonb;
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
  card := jsonb_build_object(
    'system', c.system,
    'name', c.name,
    'level', c.level,
    'portrait_path', c.portrait_path,
    'class', coalesce(s ->> 'class', ''),
    'subclass', coalesce(s ->> 'subclass', ''),
    'lineage', coalesce(s ->> 'lineage', ''),
    'hp', private.jnum(s -> 'hp', 0),
    'hpMax', private.jnum(s -> 'hpMax', 0),
    'tempHp', private.jnum(s -> 'tempHp', 0),
    'wounds', private.jnum(s -> 'wounds', 0),
    'woundsMax', private.jnum(s -> 'woundsMax', 0),
    'ac', private.jnum(s -> 'ac', 0),
    'speed', coalesce(s ->> 'speed', ''),
    'initMod', private.jnum(s -> 'initMod', 0),
    'stats', jsonb_build_object(
      'STR', private.jnum(s -> 'stats' -> 'STR', 0),
      'DEX', private.jnum(s -> 'stats' -> 'DEX', 0),
      'INT', private.jnum(s -> 'stats' -> 'INT', 0),
      'WIL', private.jnum(s -> 'stats' -> 'WIL', 0)
    ),
    'saveAdv', coalesce(s ->> 'saveAdv', ''),
    'saveDis', coalesce(s ->> 'saveDis', ''),
    'skills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', k ->> 'name', 'stat', k ->> 'stat',
        'points', private.jnum(k -> 'points', 0)))
      from jsonb_array_elements(
        case when jsonb_typeof(s -> 'skills') = 'array' then s -> 'skills' else '[]'::jsonb end
      ) k
    ), '[]'::jsonb),
    'mana', case when jsonb_typeof(s -> 'mana') = 'object' then jsonb_build_object(
      'current', private.jnum(s -> 'mana' -> 'current', 0),
      'max', private.jnum(s -> 'mana' -> 'max', 0)) end,
    'resource', case when jsonb_typeof(s -> 'resource') = 'object' then jsonb_build_object(
      'name', coalesce(s -> 'resource' ->> 'name', ''),
      'count', private.jnum(s -> 'resource' -> 'count', 0),
      'dice', private.jnum(s -> 'resource' -> 'dice', 0),
      'die', private.jnum(s -> 'resource' -> 'die', 0)) end,
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
        'hp', private.jnum(m -> 'hp', 0),
        'hpMax', private.jnum(m -> 'hpMax', 0)))
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

  -- D&D 5e: AC now, ability scores (replacing Nimble's ability list), proficient saves, death saves.
  if c.system = 'dnd5e' then
    card := card || jsonb_build_object(
      'ac', private.jnum(private.dnd5e_ac(s), 0),
      'abilities', jsonb_build_object(
        'STR', private.jnum(s -> 'abilities' -> 'STR', 10),
        'DEX', private.jnum(s -> 'abilities' -> 'DEX', 10),
        'CON', private.jnum(s -> 'abilities' -> 'CON', 10),
        'INT', private.jnum(s -> 'abilities' -> 'INT', 10),
        'WIS', private.jnum(s -> 'abilities' -> 'WIS', 10),
        'CHA', private.jnum(s -> 'abilities' -> 'CHA', 10)
      ),
      'saveProfs', case when jsonb_typeof(s -> 'saveProfs') = 'array'
        then s -> 'saveProfs' else '[]'::jsonb end,
      'profBonus', private.jnum(s -> 'profBonus', 2),
      'passivePerception', private.jnum(s -> 'passivePerception', 10),
      'hitDie', private.jnum(s -> 'hitDie', 0),
      'deathSaves', jsonb_build_object(
        'successes', private.jnum(s -> 'deathSaves' -> 'successes', 0),
        'failures', private.jnum(s -> 'deathSaves' -> 'failures', 0)
      ),
      'features', coalesce((
        select jsonb_agg(jsonb_build_object(
          'name', coalesce(f ->> 'name', ''),
          'desc', coalesce(f ->> 'desc', '')))
        from jsonb_array_elements(
          case when jsonb_typeof(s -> 'features') = 'array' then s -> 'features' else '[]'::jsonb end
        ) f
      ), '[]'::jsonb)
    );
  -- Pathfinder 2e: attribute modifiers, saves and skills with ranks (replacing Nimble's
  -- skills), hero and focus points, dying, wounded, doomed, condition values, the shield
  -- with its AC bonus, the AC parts the sheet saves and persistent damage.
  elsif c.system = 'pf2e' then
    card := card || jsonb_build_object(
      'attrs', jsonb_build_object(
        'STR', private.jnum(s -> 'attrs' -> 'STR', 0),
        'DEX', private.jnum(s -> 'attrs' -> 'DEX', 0),
        'CON', private.jnum(s -> 'attrs' -> 'CON', 0),
        'INT', private.jnum(s -> 'attrs' -> 'INT', 0),
        'WIS', private.jnum(s -> 'attrs' -> 'WIS', 0),
        'CHA', private.jnum(s -> 'attrs' -> 'CHA', 0)
      ),
      'saves', coalesce((
        select jsonb_agg(jsonb_build_object(
          'label', coalesce(v ->> 'label', ''),
          'rank', coalesce(v ->> 'rank', 'U'),
          'value', private.jnum(v -> 'value', 0)))
        from jsonb_array_elements(
          case when jsonb_typeof(s -> 'saves') = 'array' then s -> 'saves' else '[]'::jsonb end
        ) v
      ), '[]'::jsonb),
      'skills', coalesce((
        select jsonb_agg(jsonb_build_object(
          'name', coalesce(k ->> 'name', ''),
          'attr', coalesce(k ->> 'attr', ''),
          'rank', coalesce(k ->> 'rank', 'U'),
          'value', private.jnum(k -> 'value', 0)))
        from jsonb_array_elements(
          case when jsonb_typeof(s -> 'skills') = 'array' then s -> 'skills' else '[]'::jsonb end
        ) k
      ), '[]'::jsonb),
      'heroPoints', private.jnum(s -> 'heroPoints', 0),
      'focus', jsonb_build_object(
        'current', private.jnum(s -> 'focus' -> 'current', 0),
        'max', private.jnum(s -> 'focus' -> 'max', 0)
      ),
      'dying', private.jnum(s -> 'dying', 0),
      'wounded', private.jnum(s -> 'wounded', 0),
      'doomed', private.jnum(s -> 'doomed', 0),
      'conditionValues', case when jsonb_typeof(s -> 'conditionValues') = 'object'
        then s -> 'conditionValues' else '{}'::jsonb end,
      'shield', case when jsonb_typeof(s -> 'shield') = 'object' then jsonb_build_object(
        'name', coalesce(s -> 'shield' ->> 'name', ''),
        'ac', private.jnum(s -> 'shield' -> 'ac', 2),
        'hardness', private.jnum(s -> 'shield' -> 'hardness', 0),
        'hp', private.jnum(s -> 'shield' -> 'hp', 0),
        'hpMax', private.jnum(s -> 'shield' -> 'hpMax', 0),
        'bt', private.jnum(s -> 'shield' -> 'bt', 0),
        'raised', case when jsonb_typeof(s -> 'shield' -> 'raised') = 'boolean'
          then (s -> 'shield' ->> 'raised')::boolean else false end) end,
      'acParts', case when jsonb_typeof(s -> 'acParts') = 'object' then s -> 'acParts' end,
      'persistent', case when jsonb_typeof(s -> 'persistent') = 'array'
        then s -> 'persistent' else '[]'::jsonb end,
      'feats', coalesce((
        select jsonb_agg(jsonb_build_object(
          'name', coalesce(f ->> 'name', ''),
          'desc', coalesce(f ->> 'desc', ''),
          'type', coalesce(f ->> 'type', ''),
          'level', coalesce(f ->> 'level', '')))
        from jsonb_array_elements(
          case when jsonb_typeof(s -> 'feats') = 'array' then s -> 'feats' else '[]'::jsonb end
        ) f
      ), '[]'::jsonb)
    );
  end if;
  return card;
end $$;
revoke execute on function public.campaign_hero_card(uuid, uuid) from public, anon;
grant execute on function public.campaign_hero_card(uuid, uuid) to authenticated;

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
      'ac', case when c.system = 'dnd5e' then private.dnd5e_ac(c.sheet) else c.sheet -> 'ac' end,
      'passivePerception', c.sheet -> 'passivePerception',
      'initMod', c.sheet -> 'initMod',
      'classSlug', c.sheet -> 'classSlug',
      'speed', c.sheet -> 'speed',
      'tempHp', c.sheet -> 'tempHp',
      'conditions', c.sheet -> 'conditions',
      'exhaustion', case when c.system = 'dnd5e' and jsonb_typeof(c.sheet -> 'exhaustion') = 'number'
        then c.sheet -> 'exhaustion' end,
      'wounds', c.sheet -> 'wounds',
      'woundsMax', c.sheet -> 'woundsMax',
      'dying', c.sheet -> 'dying',
      'deathSaves', c.sheet -> 'deathSaves',
      'concentration', c.sheet -> 'concentration',
      'actionsSpent', c.sheet -> 'actionsSpent',
      'mana', c.sheet -> 'mana',
      'heroPoints', case when jsonb_typeof(c.sheet -> 'heroPoints') = 'number'
        then c.sheet -> 'heroPoints' end,
      'focus', case when jsonb_typeof(c.sheet -> 'focus') = 'object' then jsonb_build_object(
        'current', private.jnum(c.sheet -> 'focus' -> 'current', 0),
        'max', private.jnum(c.sheet -> 'focus' -> 'max', 0)) end,
      'wounded', case when jsonb_typeof(c.sheet -> 'wounded') = 'number'
        then c.sheet -> 'wounded' end,
      'doomed', case when jsonb_typeof(c.sheet -> 'doomed') = 'number'
        then c.sheet -> 'doomed' end,
      'conditionValues', case when jsonb_typeof(c.sheet -> 'conditionValues') = 'object'
        then c.sheet -> 'conditionValues' end,
      'shield', case when c.system = 'pf2e' and jsonb_typeof(c.sheet -> 'shield') = 'object'
        then jsonb_build_object(
          'name', coalesce(c.sheet -> 'shield' ->> 'name', ''),
          'ac', private.jnum(c.sheet -> 'shield' -> 'ac', 2),
          'hp', private.jnum(c.sheet -> 'shield' -> 'hp', 0),
          'hpMax', private.jnum(c.sheet -> 'shield' -> 'hpMax', 0),
          'bt', private.jnum(c.sheet -> 'shield' -> 'bt', 0),
          'raised', case when jsonb_typeof(c.sheet -> 'shield' -> 'raised') = 'boolean'
            then (c.sheet -> 'shield' ->> 'raised')::boolean else false end)
        end,
      'acParts', case when c.system = 'pf2e' and jsonb_typeof(c.sheet -> 'acParts') = 'object'
        then c.sheet -> 'acParts' end,
      'persistent', case when c.system = 'pf2e' and jsonb_typeof(c.sheet -> 'persistent') = 'array'
        then c.sheet -> 'persistent' end,
      'featNames', case when c.system = 'pf2e' and jsonb_typeof(c.sheet -> 'feats') = 'array'
        then (select coalesce(jsonb_agg(f ->> 'name'), '[]'::jsonb)
              from jsonb_array_elements(c.sheet -> 'feats') f)
        end,
      'summons', c.sheet -> 'summons',
      'abilityNames', case when jsonb_typeof(c.sheet -> 'abilities') = 'array'
        then (select coalesce(jsonb_agg(a ->> 'name'), '[]'::jsonb)
              from jsonb_array_elements(c.sheet -> 'abilities') a)
        end,
      'portraitOverride', c.sheet -> 'portraitOverride',
      'backstory', left(c.sheet ->> 'backstory', 4000)
    )) end
  from public.campaign_members m
  join public.profiles p on p.id = m.user_id
  left join public.characters c on c.id = m.character_id
  where m.campaign_id = p_campaign
    and (private.is_campaign_member(p_campaign) or private.is_staff())
  order by m.role, p.display_name
$$;
