-- One-time Supabase Storage setup for Resource Library file uploads.
-- Run in Supabase SQL Editor (Dashboard → SQL).
--
-- PRIVATE bucket, unlike note-attachments: library files are reachable only
-- through short-lived signed URLs minted server-side after the owner check in
-- server/routes/library.ts. No client-role policies on purpose — all access
-- goes through the service role, keeping the permission model in one place
-- (docs/future/RESOURCE_LIBRARY.md §8). When church libraries land, member
-- access is a route change, not a storage-policy change.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'library-files',
  'library-files',
  false,
  52428800, -- 50MB, PCO-analogous cap; large media stays an external link
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/markdown',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'audio/mpeg',
    'audio/mp4',
    'audio/x-m4a'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
