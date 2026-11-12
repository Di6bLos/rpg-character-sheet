-- Shared NPC pool, ready for thousands of rows (official monsters for three systems
-- plus every GM's homebrew) and safe against ownership changes.

-- Name search is a substring match (`ilike '%goblin%'`), which a btree can't serve.
create extension if not exists pg_trgm with schema extensions;
create index if not exists npcs_name_trgm_idx
  on public.npcs using gin (name extensions.gin_trgm_ops);

-- Unfiltered pages (Admin → NPCs, the Library's "All") are ordered by name, then id.
create index if not exists npcs_name_id_idx on public.npcs (name, id);

-- An entry's author never changes: staff may edit any row (npcs_update), but not
-- reassign it, so "my NPCs", the author's edit rights and delete rights stay true.
create function private.npcs_keep_author() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_by := old.created_by;
  return new;
end $$;

create trigger npcs_keep_author before update of created_by on public.npcs
  for each row execute function private.npcs_keep_author();
