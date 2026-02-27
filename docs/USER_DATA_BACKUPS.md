# User data backups

## Current state

- **Turso PITR:** Production DB has point-in-time recovery (retention depends on plan: 24h free, 10/30/90 days on paid). Use for disaster recovery of the whole DB.
- **User export:** Users can download their data as CSV or Markdown via **Profile → My Data → Export**. Same format as import (CSV threads or Markdown). Data is generated on demand and downloaded; no server-side copy is kept.
- **Import:** Users can re-import CSV or Markdown exports via **Profile → My Data → Import**.

## Goal: backups stored safely

To reduce risk of users losing data (e.g. after key switches like pk_test → pk_live, or accidental overwrites), we want **backups stored safely** in addition to Turso PITR and user download.

### Option A: Scheduled per-user CSV export to cloud storage (recommended)

- **What:** A scheduled job (cron or Netlify scheduled function) that, for each user with notes, generates the same CSV (or Markdown) as the export endpoint and uploads it to a private bucket (e.g. S3, R2) with path like `backups/{userId}/{date}.csv`.
- **Why:** Per-user, same format as export/import; easy to restore a single user or hand them a file.
- **Needs:**
  - Storage bucket (S3/R2) with write-only access from the job, no public read.
  - Credentials in env (e.g. `BACKUP_BUCKET_URL`, `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, or R2 equivalents).
  - Scheduled trigger (e.g. daily): Netlify scheduled function, or external cron calling an internal admin endpoint protected by a secret.
  - Retention policy (e.g. keep last 7 or 30 days; delete older files).
- **Privacy:** User content in bucket; restrict access, encrypt at rest (bucket default), and document retention.

### Option B: Encourage users to export regularly

- **What:** In-app copy (e.g. in My Data panel): “Export your data regularly to keep a safe copy on your device.”
- **Why:** No new infra; uses existing export. Users who export have a local backup.
- **Limitation:** Only backs up users who actually export; no automatic history.

### Option C: Full DB dump to cloud storage

- **What:** Periodic (e.g. daily) `turso db shell harvous-db .dump > backup.sql` (or Turso API equivalent), then upload to a private bucket with date in filename; apply retention (e.g. last 7 days).
- **Why:** One job, whole-DB disaster recovery; no per-user iteration.
- **Limitation:** Restore is full DB only; per-user restore requires extracting from dump or using export logic elsewhere.

### Recommendation

- **Short term:** Add Option B (copy in My Data) so users know to export for a safe copy.
- **Next:** Implement Option A (scheduled per-user CSV to bucket) so every user with notes gets an automatic backup in the same format as export/import. Option C can be added later for full-DB disaster recovery if needed.

## Implementation notes for Option A (implemented)

- **Shared export helper:** `server/utils/export-user-data.ts` — `generateUserExport(userId, format)` returns `{ content, fileExtension }`. Used by `GET /api/user/export` and by the backup job.
- **Backup endpoint:** `POST /api/admin/backup-exports` — protected by `Authorization: Bearer <BACKUP_CRON_SECRET>`. Lists distinct `userId` from `Notes`, generates CSV per user via `generateUserExport(userId, 'csv-threads')`, uploads to Netlify Blob store `user-exports` at key `{userId}/{YYYY-MM-DD}.csv`, then deletes blobs older than `BACKUP_RETENTION_DAYS` (default 30).
- **Env (Netlify):** `BACKUP_CRON_SECRET`, optional `BACKUP_RETENTION_DAYS`.
- **GHA workflow:** `.github/workflows/backup-user-exports.yml` — runs daily at 3 AM UTC; calls the backup endpoint. Secrets: `BACKUP_CRON_SECRET`, optional `BACKUP_SITE_URL` (default `https://app.harvous.com`).
- Do not expose backup URLs to the client; storage is server-side only.

## Relation to Clerk migration (pk_test → pk_live)

The Clerk read-time mapping and merge-on-first-login (see `docs/troubleshooting/CLERK_DUPLICATE_USER_MIGRATION.md`) ensure that **other users** who had data under test IDs get that data merged to their live ID on first sign-in after the switch—so they don’t “lose” data as long as they’re in the mapping. Having scheduled backups (Option A) adds a safety net if a merge fails or a user reports missing data: we can identify their user ID from the backup and fix or restore from CSV.
