-- The stats dialog for every game system. campaign_hero_card keeps every key it returned
-- (Nimble unchanged), adds `system`, and by the hero's system: 5e ability scores (in place of
-- Nimble's ability list), proficient saves, proficiency, Passive Perception, Hit Die and
-- death saves; PF2e attribute modifiers, saves and skills with ranks (in place of Nimble's
-- skills), hero and focus points, dying, wounded and the shield. Still members-only.
-- campaign_roster's summary also carries PF2e hero and focus points and Wounded, for the GM's
-- party cards and the dialog's live numbers.

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

  -- D&D 5e: ability scores (replacing Nimble's ability list), proficient saves, death saves.
  if c.system = 'dnd5e' then
    card := card || jsonb_build_object(
      'abilities', jsonb_build_object(
        'STR', coalesce((s -> 'abilities' ->> 'STR')::numeric, 10),
        'DEX', coalesce((s -> 'abilities' ->> 'DEX')::numeric, 10),
        'CON', coalesce((s -> 'abilities' ->> 'CON')::numeric, 10),
        'INT', coalesce((s -> 'abilities' ->> 'INT')::numeric, 10),
        'WIS', coalesce((s -> 'abilities' ->> 'WIS')::numeric, 10),
        'CHA', coalesce((s -> 'abilities' ->> 'CHA')::numeric, 10)
      ),
      'saveProfs', case when jsonb_typeof(s -> 'saveProfs') = 'array'
        then s -> 'saveProfs' else '[]'::jsonb end,
      'profBonus', coalesce((s ->> 'profBonus')::numeric, 2),
      'passivePerception', coalesce((s ->> 'passivePerception')::numeric, 10),
      'hitDie', coalesce((s ->> 'hitDie')::numeric, 0),
      'deathSaves', jsonb_build_object(
        'successes', coalesce((s -> 'deathSaves' ->> 'successes')::numeric, 0),
        'failures', coalesce((s -> 'deathSaves' ->> 'failures')::numeric, 0)
      )
    );
  -- Pathfinder 2e: attribute modifiers, saves and skills with ranks (replacing Nimble's
  -- skills), hero and focus points, dying, wounded and the shield.
  elsif c.system = 'pf2e' then
    card := card || jsonb_build_object(
      'attrs', jsonb_build_object(
        'STR', coalesce((s -> 'attrs' ->> 'STR')::numeric, 0),
        'DEX', coalesce((s -> 'attrs' ->> 'DEX')::numeric, 0),
        'CON', coalesce((s -> 'attrs' ->> 'CON')::numeric, 0),
        'INT', coalesce((s -> 'attrs' ->> 'INT')::numeric, 0),
        'WIS', coalesce((s -> 'attrs' ->> 'WIS')::numeric, 0),
        'CHA', coalesce((s -> 'attrs' ->> 'CHA')::numeric, 0)
      ),
      'saves', coalesce((
        select jsonb_agg(jsonb_build_object(
          'label', coalesce(v ->> 'label', ''),
          'rank', coalesce(v ->> 'rank', 'U'),
          'value', coalesce((v ->> 'value')::numeric, 0)))
        from jsonb_array_elements(
          case when jsonb_typeof(s -> 'saves') = 'array' then s -> 'saves' else '[]'::jsonb end
        ) v
      ), '[]'::jsonb),
      'skills', coalesce((
        select jsonb_agg(jsonb_build_object(
          'name', coalesce(k ->> 'name', ''),
          'attr', coalesce(k ->> 'attr', ''),
          'rank', coalesce(k ->> 'rank', 'U'),
          'value', coalesce((k ->> 'value')::numeric, 0)))
        from jsonb_array_elements(
          case when jsonb_typeof(s -> 'skills') = 'array' then s -> 'skills' else '[]'::jsonb end
        ) k
      ), '[]'::jsonb),
      'heroPoints', coalesce((s ->> 'heroPoints')::numeric, 0),
      'focus', jsonb_build_object(
        'current', coalesce((s -> 'focus' ->> 'current')::numeric, 0),
        'max', coalesce((s -> 'focus' ->> 'max')::numeric, 0)
      ),
      'dying', coalesce((s ->> 'dying')::numeric, 0),
      'wounded', coalesce((s ->> 'wounded')::numeric, 0),
      'shield', case when jsonb_typeof(s -> 'shield') = 'object' then jsonb_build_object(
        'name', coalesce(s -> 'shield' ->> 'name', ''),
        'hardness', coalesce((s -> 'shield' ->> 'hardness')::numeric, 0),
        'hp', coalesce((s -> 'shield' ->> 'hp')::numeric, 0),
        'hpMax', coalesce((s -> 'shield' ->> 'hpMax')::numeric, 0),
        'bt', coalesce((s -> 'shield' ->> 'bt')::numeric, 0),
        'raised', coalesce((s -> 'shield' ->> 'raised')::boolean, false)) end
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
      'mana', c.sheet -> 'mana',
      'heroPoints', c.sheet -> 'heroPoints',
      'focus', c.sheet -> 'focus',
      'wounded', c.sheet -> 'wounded',
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
