-- Follow-ups to 20261120130000_hero_condition_changes and 20261120140000_initiative_mode.

-- 1. Initiative mode by game system. Nimble rules (heroes first) suit Nimble campaigns
-- only; D&D 5e and Pathfinder 2e order everyone by the roll. The column default gave
-- every existing encounter 'nimble', so move the others to 'classic', and make new
-- encounter rows (created with their campaign) follow the campaign's system.
update public.encounters e
set initiative_mode = 'classic'
from public.campaigns c
where c.id = e.campaign_id
  and c.system <> 'nimble'
  and e.initiative_mode = 'nimble';

create function private.encounter_default_mode() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.campaigns c where c.id = new.campaign_id and c.system <> 'nimble'
  ) then
    new.initiative_mode := 'classic';
  end if;
  return new;
end $$;

create trigger encounters_default_mode
  before insert on public.encounters
  for each row execute function private.encounter_default_mode();

-- 2. Players see only whether a creature is Down; how hurt it is stays with the GM.
create or replace function public.campaign_initiative(p_campaign uuid)
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
      when not gm then null
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

-- 3. The GM's condition change on the saved sheet follows the sheet's own rules
-- (utils/nimbleConditions.ts, useNimbleConditions):
--   * adding a condition that ends at the end of the hero's turn during that turn
--     holds it past this turn's end (`conditionHold`), as addCondition does;
--   * removing one also ends the ability or spell status behind it (`effects`), as the
--     sheet's toggle does, and drops its end and hold.
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

  insert into public.hero_condition_changes (campaign_id, character_id, condition, add)
  values (p_campaign, p_character, cond, p_add);

  return coalesce(result, '[]'::jsonb);
end $$;
