# Note inline image storage (Supabase)

Web inline images in note bodies are stored in Supabase Storage and referenced as `<img src="...">` in TipTap HTML.

## Environment variables

Same server keys as Realtime ([SUPABASE_REALTIME_SETUP.md](./SUPABASE_REALTIME_SETUP.md)):

| Variable | Where | Purpose |
|----------|--------|---------|
| `SUPABASE_URL` | API (Netlify + `.env`) | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | API only | Upload via `POST /api/notes/:noteId/inline-image` |

If either is unset, the upload endpoint returns `503` with a clear error.

## Bucket setup (one-time)

In the Supabase dashboard (or SQL editor), run [`supabase/storage-note-attachments.sql`](../supabase/storage-note-attachments.sql):

1. Creates public bucket **`note-attachments`** (public read so saved HTML `<img>` tags load without signed URLs).
2. Adds Storage RLS policies so authenticated users can read/write only under `{userId}/` (for future direct browser uploads).

Object path pattern: `{userId}/{noteId}/{uuid}.jpg`

## API

- **`POST /api/notes/:noteId/inline-image`** — `multipart/form-data` field `file` (image). Returns `{ url: string }`.
- Auth: Clerk session; note must belong to the user.

## Client

Prototype format toolbar **Insert image** uploads via this endpoint, then `editor.commands.setImage({ src: url })`.

## Native parity

macOS/iOS still persist `[Image:base64]` in plain `body`. Cross-platform display on web requires a future bridge or native migration to the same bucket URLs.
