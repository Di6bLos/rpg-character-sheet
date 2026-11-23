-- A player sends their hero's Initiative roll to the GM's tracker. Players can't
-- write combatants (combatants_gm), so this only moves the caller's own seated
-- hero and the summons seated under it (summon_key "<character id>:…"), which
-- act on the hero's turn. Returns how many rows moved (0: not on the tracker yet).
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
  set initiative = p_initiative
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
