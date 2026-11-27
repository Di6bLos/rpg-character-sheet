-- The 5e battle board: campaign_roster's summary carries a 5e hero's Exhaustion level
-- (`sheet.exhaustion`), so the party cards, initiative tooltips, encounter cards and the GM's
-- hero vitals read "Exhaustion 2" (stores/campaign.ts puts it in `conditionValues`). The
-- function is otherwise as 20261125130000_pf2e_board_gaps.sql left it.

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
