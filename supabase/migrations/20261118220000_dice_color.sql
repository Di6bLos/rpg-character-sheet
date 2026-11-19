-- The colour of a player's 3D dice in the dice tray; null follows their accent.
alter table public.profiles
  add column dice_color text check (dice_color ~ '^#[0-9A-Fa-f]{6}$');
grant update (dice_color) on public.profiles to authenticated;
