# Phase C: Supabase Storage → Cloudflare R2

**Status: PLANNED.** Drafted 2026-08-27. Part of [INFRA_ENDGAME.md](INFRA_ENDGAME.md).
Prerequisite: [Phase A](CLOUDFLARE_MIGRATION.md) complete — public attachment
URLs move behind `app.harvous.com`, which requires the Worker.

Moves the three Supabase Storage buckets to R2. Two are easy (private,
server-mediated). One is the hardest data problem in the whole endgame:
`note-attachments` URLs are **baked into saved note HTML**.

---

## Bucket inventory (verified 2026-08-27)

| Bucket | Access | Server helper | The catch |
|---|---|---|---|
| `note-attachments` | public | `server/utils/note-inline-image-upload.ts` (`NOTE_ATTACHMENTS_BUCKET`) | absolute `{SUPABASE_URL}/storage/v1/object/public/note-attachments/...` URLs embedded in stored note content |
| `library-files` | private, signed URLs | `server/utils/library-file-upload.ts` (`LIBRARY_FILES_BUCKET`) | none — clients only ever see short-lived signed URLs the server mints |
| `user-exports` | private | `server/utils/user-export-backup-store.ts` (`USER_EXPORTS_BUCKET`); keys `<userId>/<date>.<ext>` | none — never served to users; written by the nightly backup (`/api/admin/backup-exports` via `backup-user-exports.yml`) |

Bucket/policy SQL lives in `supabase/storage-note-attachments.sql` and
`supabase/storage-library-files.sql` — R2 has no RLS; the equivalent is "private
bucket + server-only credentials", which is what the private buckets already
assume in practice (the helpers use the service client).

## Target design

- One R2 bucket per current bucket, same names. All server access through the
  S3-compatible API — the three helpers swap their `client.storage.from(...)`
  calls for an S3 client (`@aws-sdk/client-s3` pointed at the R2 endpoint, or
  Cloudflare's binding if the access moves to the Worker; **recommend the S3
  client from Fly** so the helpers keep their call sites and the Worker stays
  thin).
- **Public serving path for attachments:** `app.harvous.com/attachments/<key>` —
  a Worker route reading the R2 binding directly (zero egress, cached at edge).
  New uploads return this URL shape. Benefits beyond the migration: attachment
  URLs become origin-relative to the app domain, so this problem can never
  recur with a future storage move.
- Signed URLs for `library-files`: S3 presigned GETs from Fly, same TTL
  semantics as today's Supabase `createSignedUrl` calls.
- Cost: R2 has zero egress fees; storage ~$0.015/GB-mo. At current scale this
  rounds to ~$0.

## The baked-URL problem, in three parts

1. **Stop the bleeding first:** switch `note-inline-image-upload.ts` to write to
   R2 and return `app.harvous.com/attachments/...` URLs. From this commit on,
   no new Supabase URLs enter note content.
2. **Compatibility shim, immediately after:** old URLs point at
   `https://<project>.supabase.co/storage/...` — a domain we don't control, so a
   Worker redirect can't intercept them. The shim is therefore *not deleting the
   Supabase bucket* until step 3 completes and soaks. (If Supabase is ever to be
   fully exited before the rewrite finishes, the objects must be copied and the
   rewrite finished first — order is load-bearing.)
3. **One-time corpus rewrite:** a maintenance script (home:
   `server/scripts/`, run against production deliberately) that:
   - copies every object `note-attachments/*` to R2 (rclone or S3-to-S3; verify
     object count + a sampled checksum before proceeding);
   - scans `Notes` content for the `{SUPABASE_URL}/storage/v1/object/public/note-attachments/`
     prefix and rewrites it to the new origin-relative path;
   - **respects the versioning/sync invariants** — this is the dangerous part:
     - go through the same update path semantics as `/api/notes/update`
       (bump `currentVersion`/`NoteVersions` correctly) so native/web clients
       don't 409 or, worse, silently diverge;
     - this **will bump `updatedAt`**, which is both sort key and sync
       watermark (`docs/` + memory: the "phantom update" bug family). That is
       acceptable-but-noisy: every rewritten note resyncs to all devices and
       jumps in recency sorts. Decide explicitly at execution: either accept
       one visible "everything updated" event (announce it), or write
       `updatedAt` back to its prior value in the same transaction and bump
       only the sync tombstone/delta mechanism. **Read the data-agent context
       and `server/routes/sync.ts` comments (~lines 1297, 1327) before
       choosing.** Do not improvise this on migration day.
   - is idempotent (prefix match means a second run is a no-op) and logs every
     rewritten note id.
4. Soak with both stores live (old Supabase URLs still resolve), then delete the
   Supabase buckets last — they are the rollback.

## Verification

- New note with pasted image → URL is `app.harvous.com/attachments/...`, renders
  on web, native (macOS + iOS), and in a **shared/public note** (crawler OG
  image path included).
- Rewritten legacy note: renders everywhere, `NoteVersions` history intact, no
  409 on next edit from a device that had the pre-rewrite copy cached offline —
  test this exact case: device offline during rewrite, edits the note, comes
  back online.
- `library-files`: upload + signed download round-trip; expiry still enforced.
- Nightly backup writes to R2 (`backup-user-exports.yml` green) and a restore
  read works.
- Object count parity old vs new store before any deletion.

## How to execute

Three sessions: (1) helper swaps + Worker serving route + shim, (2) the corpus
rewrite script with the versioning decision made and reviewed first, (3) copy,
rewrite, soak, delete. Session 2 must read the data-agent context file — note
versioning and sync watermarks are its invariants.
