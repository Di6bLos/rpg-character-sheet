-- "I roll my own dice" moves from each hero's sheet to the player: one setting for all
-- their heroes, switched from the account menu. The app copies it onto the sheet the
-- player edits (sheet.ownDice), where the rules read it.
alter table public.profiles
  add column own_dice boolean not null default false;
grant update (own_dice) on public.profiles to authenticated;

-- Players who rolled their own dice for any hero keep doing so.
update public.profiles p
set own_dice = true
where exists (
  select 1 from public.characters c
  where c.user_id = p.id and (c.sheet ->> 'ownDice')::boolean is true
);
