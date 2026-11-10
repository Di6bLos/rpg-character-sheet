-- ---------------------------------------------------------------------------
-- Harden the 3-campaigns-per-creator limit.
-- 1. Serialize inserts per creator so concurrent transactions can't both pass the count.
-- 2. Make created_by immutable so ownership can't be moved to dodge or consume a quota.
-- ---------------------------------------------------------------------------
create or replace function private.enforce_campaign_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('campaign_limit:' || new.created_by::text, 0));
  if (select count(*) from public.campaigns c where c.created_by = new.created_by) >= 3 then
    raise exception 'Campaign limit reached (3 per player)' using errcode = 'P0001';
  end if;
  return new;
end $$;

create function private.lock_campaign_creator() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'Campaign creator cannot be changed' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger campaigns_lock_creator before update on public.campaigns
  for each row execute function private.lock_campaign_creator();
