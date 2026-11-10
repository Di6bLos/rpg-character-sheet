-- ---------------------------------------------------------------------------
-- Cap campaigns at 3 per creator (mirrors the character limit trigger).
-- Existing campaigns are untouched; only new inserts are checked.
-- ---------------------------------------------------------------------------
create function private.enforce_campaign_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.campaigns c where c.created_by = new.created_by) >= 3 then
    raise exception 'Campaign limit reached (3 per player)' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger campaigns_limit before insert on public.campaigns
  for each row execute function private.enforce_campaign_limit();
