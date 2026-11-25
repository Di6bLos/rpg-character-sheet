-- The GM's condition change writes the saved sheet for every game system. Nimble keeps
-- its rules (ends, holds, the status behind a condition); D&D 5e and Pathfinder 2e get a
-- plain add or remove on `conditions` (an add moves nothing if it's already there; the
-- client sends no end for them). The pickup row for an open sheet is inserted as before.

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

  -- D&D 5e and Pathfinder 2e: a plain add or remove on the condition names (no ends,
  -- holds or statuses), as utils/heroConditionChange.ts applyPlainConditionChange does.
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
  end if;

  insert into public.hero_condition_changes (campaign_id, character_id, condition, add)
  values (p_campaign, p_character, cond, p_add);

  return coalesce(result, '[]'::jsonb);
end $$;
