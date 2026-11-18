-- Statuses one hero gives another (Help: "Helped"), waiting for the target's own
-- sheet to pick them up. Sheets don't reload from the database while open, so the
-- helper never writes the target's sheet: the target's client adds the status to
-- its own sheet and deletes the row.
create table public.hero_effects (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  effect text not null check (effect in ('Helped')),
  from_name text not null default '' check (char_length(from_name) <= 80),
  created_at timestamptz not null default now()
);
create index hero_effects_character_idx on public.hero_effects (character_id);
alter table public.hero_effects enable row level security;

-- A seated member may give a status to a hero seated in the same campaign.
create policy hero_effects_insert on public.hero_effects for insert to authenticated
  with check (
    (select private.is_campaign_member(campaign_id))
    and exists (
      select 1 from public.campaign_members m
      where m.campaign_id = hero_effects.campaign_id
        and m.character_id = hero_effects.character_id
    )
  );
-- Only the target hero's owner sees and clears them.
create policy hero_effects_select on public.hero_effects for select to authenticated
  using (
    exists (
      select 1 from public.characters c
      where c.id = hero_effects.character_id and c.user_id = (select auth.uid())
    )
  );
create policy hero_effects_delete on public.hero_effects for delete to authenticated
  using (
    exists (
      select 1 from public.characters c
      where c.id = hero_effects.character_id and c.user_id = (select auth.uid())
    )
  );

alter publication supabase_realtime add table public.hero_effects;
