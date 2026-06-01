-- One-time Supabase Storage setup for web inline note images.
-- Run in Supabase SQL Editor (Dashboard → SQL).

-- Public bucket: saved note HTML uses <img src="https://.../object/public/note-attachments/...">
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'note-attachments',
  'note-attachments',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Authenticated users: read objects under their Clerk user id prefix.
create policy "note_attachments_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'note-attachments'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);

-- Authenticated users: upload/update under their prefix.
create policy "note_attachments_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'note-attachments'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);

create policy "note_attachments_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'note-attachments'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
)
with check (
  bucket_id = 'note-attachments'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);

create policy "note_attachments_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'note-attachments'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);
