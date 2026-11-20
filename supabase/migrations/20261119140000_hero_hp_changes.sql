-- HP changes the GM makes to a seated hero from the battle board's stats modal,
-- waiting for the hero's own sheet to pick them up. Sheets don't reload from the
-- database while open, so the GM never writes the sheet: the owner's client applies
-- the change with the sheet's own rules (takeDamage / heal) and deletes the row.
create table public.hero_hp_changes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  -- Negative is damage, positive is healing.
  amount integer not null check (amount <> 0 and abs(amount) <= 999),
  crit boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index hero_hp_changes_character_idx on public.hero_hp_changes (character_id);
alter table public.hero_hp_changes enable row level security;

-- Only the campaign's GM, and only for a hero seated in that campaign.
create policy hero_hp_changes_insert on public.hero_hp_changes for insert to authenticated
  with check (
    (select private.is_campaign_gm(campaign_id))
    and exists (
      select 1 from public.campaign_members m
      where m.campaign_id = hero_hp_changes.campaign_id
        and m.character_id = hero_hp_changes.character_id
    )
  );
-- Only the hero's owner sees and clears them.
create policy hero_hp_changes_select on public.hero_hp_changes for select to authenticated
  using (
    exists (
      select 1 from public.characters c
      where c.id = hero_hp_changes.character_id and c.user_id = (select auth.uid())
    )
  );
create policy hero_hp_changes_delete on public.hero_hp_changes for delete to authenticated
  using (
    exists (
      select 1 from public.characters c
      where c.id = hero_hp_changes.character_id and c.user_id = (select auth.uid())
    )
  );

alter publication supabase_realtime add table public.hero_hp_changes;
