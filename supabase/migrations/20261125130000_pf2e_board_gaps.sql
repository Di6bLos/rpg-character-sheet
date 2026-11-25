-- Closing the PF2e battle board's gaps.
-- - hero_hp_changes carries the GM's damage type, whether a spell dealt it and Shield Block,
--   so the hero's sheet applies resistances, weaknesses and Shield Block (takeDamage in
--   utils/pf2ePlay.ts). Null for healing and for Nimble and 5e, which ignore them.
-- - hero_condition_changes carries persistent damage (`persistent_type`, `persistent_dice`;
--   null dice ends it), written by the new gm_set_hero_persistent.
-- - campaign_roster's summary carries a PF2e hero's shield, the AC parts the sheet saves
--   (`acParts`) and persistent damage; campaign_hero_card the AC parts and persistent
--   damage. The board stacks them into the hero's AC now (acFromParts).
-- - gm_set_hero_condition: setting a PF2e hero unconscious ends Rage on the saved sheet.

alter table public.hero_hp_changes
  add column damage_type text check (char_length(damage_type) between 1 and 40),
  add column spell boolean,
  add column shield_block boolean;

alter table public.hero_condition_changes
  add column persistent_type text check (char_length(persistent_type) between 1 and 40),
  add column persistent_dice text check (char_length(persistent_dice) between 1 and 20);

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

  -- D&D 5e: ability scores (replacing Nimble's ability list), proficient saves, death saves.
  if c.system = 'dnd5e' then
    card := card || jsonb_build_object(
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
  effects jsonb;
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
      case
        -- Already there: only its end changes, as before.
        when coalesce(c.sheet -> 'conditions', '[]'::jsonb) ? cond then
          case
            when p_end is null then c.sheet
            else jsonb_set(
              c.sheet,
              '{conditionEnds}',
              coalesce(c.sheet -> 'conditionEnds', '{}'::jsonb) || jsonb_build_object(cond, p_end)
            )
          end
        else
          jsonb_set(
            jsonb_set(
              jsonb_set(
                c.sheet,
                '{conditions}',
                coalesce(c.sheet -> 'conditions', '[]'::jsonb) || to_jsonb(cond)
              ),
              '{conditionEnds}',
              case
                when p_end is null then coalesce(c.sheet -> 'conditionEnds', '{}'::jsonb)
                else coalesce(c.sheet -> 'conditionEnds', '{}'::jsonb)
                  || jsonb_build_object(cond, p_end)
              end
            ),
            '{conditionHold}',
            coalesce(
              (
                select jsonb_agg(x)
                from jsonb_array_elements(coalesce(c.sheet -> 'conditionHold', '[]'::jsonb)) x
                where x <> to_jsonb(cond)
              ),
              '[]'::jsonb
            )
            || case
              when p_end = 'turnEnd' and coalesce((c.sheet ->> 'turnActive')::boolean, false)
                then jsonb_build_array(cond)
              else '[]'::jsonb
            end
          )
      end
    else
      jsonb_set(
        jsonb_set(
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
          ),
          '{conditionHold}',
          coalesce(
            (
              select jsonb_agg(x)
              from jsonb_array_elements(coalesce(c.sheet -> 'conditionHold', '[]'::jsonb)) x
              where x <> to_jsonb(cond)
            ),
            '[]'::jsonb
          )
        ),
        '{effects}',
        coalesce(
          (
            select jsonb_agg(e)
            from jsonb_array_elements(coalesce(c.sheet -> 'effects', '[]'::jsonb)) e
            where e ->> 'condition' is distinct from cond
          ),
          '[]'::jsonb
        )
      )
  end
  where c.id = p_character and c.system = 'nimble'
  returning c.sheet -> 'conditions' into result;

  -- D&D 5e and Pathfinder 2e: a plain add or remove on the condition names (no ends,
  -- holds or statuses), as utils/heroConditionChange.ts applyPlainConditionChange does,
  -- dropping a removed condition's PF2e value; PF2e unconscious ends Rage.
  if not found then
    update public.characters c
    set sheet = case
      when p_add and jsonb_typeof(c.sheet -> 'conditions') = 'array'
        and c.sheet -> 'conditions' ? cond then c.sheet
      else jsonb_set(
        c.sheet,
        '{conditions}',
        coalesce(
          (
            select jsonb_agg(x)
            from jsonb_array_elements(
              case when jsonb_typeof(c.sheet -> 'conditions') = 'array'
                then c.sheet -> 'conditions' else '[]'::jsonb end
            ) x
            where x <> to_jsonb(cond)
          ),
          '[]'::jsonb
        )
        || case when p_add then jsonb_build_array(cond) else '[]'::jsonb end
      )
    end
    where c.id = p_character and c.system <> 'nimble'
    returning c.sheet -> 'conditions' into result;

    -- PF2e: falling unconscious ends the toggles that say so, as the sheet's own toggle does
    -- (endOnUnconscious in utils/pf2eEffects.ts). SQL can't read the effect definitions in
    -- data/pf2e/effects.ts, so the one that has `endsWhenUnconscious` is named here: Rage
    -- (Player Core 2 p. 72). tests/pf2eEffects.test.ts fails if another one gains it. As
    -- endToggle does, Rage's value goes, and its temporary HP go while no more are left
    -- than it gave.
    if p_add and cond = 'Unconscious' then
      select c.sheet -> 'effects' into effects
      from public.characters c
      where c.id = p_character and c.system = 'pf2e';
      if jsonb_typeof(effects) = 'object' and jsonb_typeof(effects -> 'on') = 'array'
        and effects -> 'on' ? 'Rage' then
        update public.characters c
        set sheet = jsonb_set(
          case
            when effects -> 'tempHp' ->> 'from' = 'Rage'
              and private.jnum(c.sheet -> 'tempHp', 0) <= private.jnum(effects -> 'tempHp' -> 'amount', 0)
              then jsonb_set(c.sheet, '{tempHp}', '0'::jsonb)
            else c.sheet
          end,
          '{effects}',
          jsonb_set(
            case when jsonb_typeof(effects -> 'values') = 'object'
              then jsonb_set(effects, '{values}', (effects -> 'values') - 'Rage')
              else effects end
            - case when effects -> 'tempHp' ->> 'from' = 'Rage' then 'tempHp' else '' end,
            '{on}',
            coalesce(
              (select jsonb_agg(x) from jsonb_array_elements(effects -> 'on') x
               where x <> to_jsonb('Rage'::text)),
              '[]'::jsonb
            )
          )
        )
        where c.id = p_character and c.system = 'pf2e';
      end if;
    end if;

    -- PF2e: a removed valued condition drops its value too (frightened 2), as the sheet does.
    if not p_add then
      update public.characters c
      set sheet = jsonb_set(c.sheet, '{conditionValues}', (c.sheet -> 'conditionValues') - cond)
      where c.id = p_character and c.system <> 'nimble'
        and jsonb_typeof(c.sheet -> 'conditionValues') = 'object'
        and c.sheet -> 'conditionValues' ? cond;
    end if;
  end if;

  insert into public.hero_condition_changes (campaign_id, character_id, condition, add)
  values (p_campaign, p_character, cond, p_add);

  return coalesce(result, '[]'::jsonb);
end $$;

-- The GM's persistent damage on a seated PF2e hero (Player Core p. 445): one per damage type,
-- the GM's amount replacing any of that type; null dice ends it. Writes the saved sheet at
-- once and leaves a hero_condition_changes row ("Persistent Damage") for an open sheet,
-- which applies it with addPersistent / removePersistent (utils/pf2eDamage.ts).
create or replace function public.gm_set_hero_persistent(
  p_campaign uuid,
  p_character uuid,
  p_type text,
  p_dice text default null
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  kind text := lower(btrim(p_type));
  dice text := nullif(regexp_replace(coalesce(p_dice, ''), '\s+', '', 'g'), '');
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
  if char_length(kind) not between 1 and 40 then
    raise exception 'Damage type must be 1 to 40 characters';
  end if;
  if dice is not null and dice !~ '^(\d{1,3}d\d{1,4}([+-]\d{1,3})?|\d{1,3})$' then
    raise exception 'Persistent damage is an amount like 1d6 or 2';
  end if;

  update public.characters c
  set sheet = jsonb_set(
    c.sheet,
    '{persistent}',
    coalesce(
      (
        select jsonb_agg(p)
        from jsonb_array_elements(
          case when jsonb_typeof(c.sheet -> 'persistent') = 'array'
            then c.sheet -> 'persistent' else '[]'::jsonb end
        ) p
        where p ->> 'type' is distinct from kind
      ),
      '[]'::jsonb
    )
    || case when dice is null then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object('dice', dice, 'type', kind)) end
  )
  where c.id = p_character and c.system = 'pf2e'
  returning c.sheet -> 'persistent' into result;
  if not found then
    raise exception 'Persistent damage is a Pathfinder 2e condition';
  end if;

  insert into public.hero_condition_changes
    (campaign_id, character_id, condition, add, persistent_type, persistent_dice)
  values (p_campaign, p_character, 'Persistent Damage', dice is not null, kind, dice);

  return result;
end $$;
revoke execute on function public.gm_set_hero_persistent(uuid, uuid, text, text) from public, anon;
grant execute on function public.gm_set_hero_persistent(uuid, uuid, text, text) to authenticated;
