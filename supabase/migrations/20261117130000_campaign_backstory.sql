-- The board's "Read full story" dialog: campaign_roster only sends the first
-- 4,000 characters of each backstory (a preview), so the dialog asks for the
-- whole text of one seated hero when it opens. Campaign members and staff only.
create function public.campaign_backstory(p_campaign uuid, p_character uuid) returns text
language sql stable security definer set search_path = '' as $$
  select c.sheet ->> 'backstory'
  from public.campaign_members m
  join public.characters c on c.id = m.character_id
  where m.campaign_id = p_campaign
    and m.character_id = p_character
    and (private.is_campaign_member(p_campaign) or private.is_staff())
$$;

revoke execute on function public.campaign_backstory(uuid, uuid) from public, anon;
grant execute on function public.campaign_backstory(uuid, uuid) to authenticated;
