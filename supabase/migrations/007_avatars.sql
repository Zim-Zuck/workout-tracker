-- Kun Workouts — 007: profile pictures.
--
-- Run after 006. Safe to re-run.
--
-- Unlike the backups bucket in 004, this one is PUBLIC. A profile picture is
-- shown next to your name on a friend's leaderboard, in their notification
-- inbox and on a recap card — all places where an <img> needs a URL that just
-- works. Making it private would mean minting a signed URL per avatar per
-- render, which is a lot of machinery to protect a photo the user chose to
-- attach to a name that is already visible to every signed-in user (001).
--
-- Public read does NOT mean public write. The policies below still key on the
-- first path segment being the user's own uuid, so nobody can overwrite
-- somebody else's picture.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists avatars_read_all on storage.objects;
create policy avatars_read_all on storage.objects
  for select to authenticated, anon
  using (bucket_id = 'avatars');

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Account deletion must take the avatar with it, exactly as 004 made it take
-- the backup. Replaced here rather than edited in 004 so that migration stays
-- runnable on its own.
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
   where bucket_id in ('backups', 'avatars')
     and (storage.foldername(name))[1] = me::text;

  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
