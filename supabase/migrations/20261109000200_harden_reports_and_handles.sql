-- Reports: the client only chooses what to report (target_type, target_id) and
-- why (reason). Everything moderators act on (storage location, file name,
-- uploader, where it lives) is looked up from the target row, so a crafted
-- report can't point a "remove file" or "restrict uploader" action elsewhere.
create function private.fill_report_details() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  new.reporter_id := me;
  new.status := 'open';
  new.resolved_by := null;
  new.resolved_at := null;

  if new.target_type = 'library' then
    select 'library', d.file_path, d.name || '.' || d.ext, d.uploaded_by, 'Document library'
    into new.bucket, new.file_path, new.file_name, new.uploader_id, new.where_label
    from public.library_documents d
    where d.id = new.target_id;

  elsif new.target_type = 'board' then
    select 'campaign-files', b.file_path, b.title, b.created_by, c.name || ' board'
    into new.bucket, new.file_path, new.file_name, new.uploader_id, new.where_label
    from public.board_items b
    join public.campaigns c on c.id = b.campaign_id
    where b.id = new.target_id
      and private.is_campaign_member(b.campaign_id)
      and (not b.hidden or private.is_campaign_gm(b.campaign_id));

  elsif new.target_type = 'journal' then
    select 'campaign-files', a.file_path, a.name, e.author_id, c.name || ' journal'
    into new.bucket, new.file_path, new.file_name, new.uploader_id, new.where_label
    from public.journal_attachments a
    join public.journal_entries e on e.id = a.entry_id
    join public.campaigns c on c.id = e.campaign_id
    where a.id = new.target_id
      and private.is_campaign_member(e.campaign_id)
      and (e.visibility = 'party' or e.author_id = me or private.is_campaign_gm(e.campaign_id));
  end if;

  if new.file_path is null then
    raise exception 'That file no longer exists or you can''t see it';
  end if;
  if new.uploader_id = me then
    raise exception 'You can''t report your own upload';
  end if;
  return new;
end $$;

create trigger reports_fill_details before insert on public.reports
  for each row execute function private.fill_report_details();

-- Rows filed before this trigger existed carried client-supplied details.
-- Re-derive them, and drop open reports whose target is gone or invisible.
update public.reports r set
  bucket = 'library', file_path = d.file_path, file_name = d.name || '.' || d.ext,
  uploader_id = d.uploaded_by, where_label = 'Document library'
from public.library_documents d
where r.target_type = 'library' and d.id = r.target_id and r.status = 'open';

update public.reports r set
  bucket = 'campaign-files', file_path = b.file_path, file_name = b.title,
  uploader_id = b.created_by, where_label = c.name || ' board'
from public.board_items b join public.campaigns c on c.id = b.campaign_id
where r.target_type = 'board' and b.id = r.target_id and r.status = 'open';

update public.reports r set
  bucket = 'campaign-files', file_path = a.file_path, file_name = a.name,
  uploader_id = e.author_id, where_label = c.name || ' journal'
from public.journal_attachments a
join public.journal_entries e on e.id = a.entry_id
join public.campaigns c on c.id = e.campaign_id
where r.target_type = 'journal' and a.id = r.target_id and r.status = 'open';

update public.reports r set status = 'dismissed', resolved_at = now()
where r.status = 'open' and not exists (
  select 1 from public.library_documents d where r.target_type = 'library' and d.id = r.target_id
  union all
  select 1 from public.board_items b where r.target_type = 'board' and b.id = r.target_id
  union all
  select 1 from public.journal_attachments a where r.target_type = 'journal' and a.id = r.target_id
);

-- Usernames: signup accepts and checks up to 24 characters, so keep a free
-- requested handle whole. Only the fallback (derived or taken) is shortened to
-- leave room for a numeric suffix.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  base text;
  candidate text;
begin
  base := lower(coalesce(new.raw_user_meta_data ->> 'handle', split_part(new.email, '@', 1)));
  base := regexp_replace(base, '[^a-z0-9_]', '', 'g');
  if char_length(base) < 3 then base := 'player' || base; end if;
  candidate := left(base, 24);
  while exists (select 1 from public.profiles p where p.handle = candidate) loop
    candidate := left(base, 20) || floor(random() * 9000 + 1000)::int::text;
  end loop;

  insert into public.profiles (id, handle, display_name)
  values (
    new.id,
    candidate,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), candidate), 60)
  );
  insert into public.user_permissions (user_id) values (new.id);
  return new;
end $$;

revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;
