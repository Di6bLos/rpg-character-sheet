-- The roster shares the names of a hero's abilities so the initiative strip can work out
-- their actions per turn (Windborne, Enduring Rage) with the same TypeScript rule.
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
