-- Creature types for the NPC lists' filter (stat_block.creatureType; the list lives in
-- utils/creatureTypes.ts). The GM's Guide rows get theirs from the bestiary reseed; this
-- fills in everything else and indexes the filter.

create index if not exists npcs_creature_type_idx
  on public.npcs ((stat_block ->> 'creatureType'));

-- Same guess as inferCreatureType(): the free-text type starts with a creature type name,
-- or else humanoid NPCs are Humanoid.
create function private.guess_creature_type(p_type text, p_kind text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(
    (select t from unnest(array[
       'Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon', 'Elemental', 'Fey',
       'Fiend', 'Giant', 'Humanoid', 'Monstrosity', 'Ooze', 'Plant', 'Undead'
     ]) as t
     where lower(coalesce(p_type, '')) like lower(t) || '%'
     limit 1),
    case when p_kind = 'humanoid' then 'Humanoid' end
  )
$$;

update public.npcs
set stat_block = stat_block || jsonb_build_object(
  'creatureType', private.guess_creature_type(stat_block ->> 'type', kind))
where not stat_block ? 'creatureType'
  and private.guess_creature_type(stat_block ->> 'type', kind) is not null;

-- Campaign copies take the type of the pool entry they came from, else the same guess.
update public.campaign_npcs c
set stat_block = c.stat_block || jsonb_build_object('creatureType', g.creature_type)
from (
  select c2.id,
         coalesce(p.stat_block ->> 'creatureType',
                  private.guess_creature_type(c2.stat_block ->> 'type', c2.kind)) as creature_type
  from public.campaign_npcs c2
  left join public.npcs p on p.id = c2.pool_npc_id
  where not c2.stat_block ? 'creatureType'
) g
where g.id = c.id
  and g.creature_type is not null;

drop function private.guess_creature_type(text, text);
