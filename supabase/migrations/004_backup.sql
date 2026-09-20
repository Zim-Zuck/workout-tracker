-- Kun Workouts — 004: cloud backup storage.
--
-- Run after 003. Safe to re-run.
--
-- Scope note: this is BACKUP, not sync. One file per user, overwritten each
-- time, restored on demand. Real two-way sync across devices would need
-- conflict resolution on every workout and set — a large, failure-prone piece
-- of machinery for a problem most users have once, when they change phone.
-- A snapshot solves that case for a fraction of the complexity and risk.

-- Private bucket. The `public = false` here is what stops backup files being
-- readable by URL; the policies below are what restrict them per-user.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backups', 'backups', false, 26214400, array['application/json'])
on conflict (id) do update
  set public = false,
      file_size_limit = 26214400,
      allowed_mime_types = array['application/json'];

-- Every policy below keys on the FIRST path segment being the user's own uuid,
-- so a backup lives at "<user-id>/latest.json" and there is no path a client can
-- construct that reaches someone else's file.
drop policy if exists backups_read_own on storage.objects;
create policy backups_read_own on storage.objects
  for select to authenticated
  using (bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists backups_insert_own on storage.objects;
create policy backups_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists backups_update_own on storage.objects;
create policy backups_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists backups_delete_own on storage.objects;
create policy backups_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text);

-- Deleting an account must take its backup with it. auth.users cascades to the
-- app's own tables, but storage objects are not foreign-keyed to the user, so
-- they need removing explicitly. delete_my_account() is replaced here rather
-- than edited in 001 so that migration stays runnable on its own.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in';
  end if;

  delete from storage.objects
   where bucket_id = 'backups'
     and (storage.foldername(name))[1] = me::text;

  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
