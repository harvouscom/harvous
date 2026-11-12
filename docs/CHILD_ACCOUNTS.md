# Parent-managed child accounts

See [Child notebook follow-up](future/CHILD_NOTEBOOK_FOLLOW_UP.md) for family-selected translations, remaining staging and production checks, and the age-13 handoff.

The US-first web pilot runs in isolated staging with fictional child accounts. The staging database, Clerk test instance, and Kids Web Services Test integration are configured. Production enrollment remains off.

## Experience and boundaries

- Adult Harvous accounts keep the existing 13+ signup. My Family links to Child notebooks at `/settings/child-accounts` when enrollment is available or the parent already manages a child. Child account API routes use `/api/child-accounts`.
- The parent verifies the primary verified email of their Clerk account through Kids Web Services (KWS).
- Adult verification does not create a child or constitute consent. A signed, matching KWS webhook marks a short-lived request verified. The parent separately accepts the versioned Harvous notice and attests guardianship, under-13 eligibility, and US residence before submitting a first name or nickname.
- Each verification request can create only one child. KWS may recognize an already verified adult on subsequent requests. No child email, phone, full birth date, photo, Clerk identity, or payment account is created.
- Children use an isolated `/kids.html` entry on a separate origin. Parent-generated links are 256-bit, single-use credentials, expire in five minutes, and travel in the URL fragment (not server logs or referrers). The fragment is removed immediately. Session tokens are held in memory only and expire after eight hours; refresh needs another link.
- Parents may use “Sign me out and open child notebook” for a shared device. This awaits adult sign-out and clears adult query caches. Otherwise use the child’s device or a separate browser profile. This does not claim to secure a device where a parent deliberately leaves another account signed in.
- Child notes remain canonical `Notes` owned by the child identity in its personal My Home. Private notes use plain-text titles and bodies, with folders, tags, Threads, Scripture references, and links to currently approved resources. The child notebook and the design preview use the same interface components. The child API also supports notebook preferences, scoped search, a private Family Bible, and saved My Bible highlights and verse stickers. Each agreement to the notice (creation and every renewal) is kept in `FamilyChildConsents`; `FamilyChildren` holds only the current one, which gates access. Public sharing, direct messages, purchases, connectors, and optional telemetry are unavailable.
- Parents can read/export the child notebook, revoke every session, withdraw consent, and delete the account. Parent queries explicitly opt out of persisted query caching and are cleared on sign-out.
- Children can start an export from their notebook. The parent signs in and chooses a readable text file or a versioned JSON backup in My Family. The backup preserves the child’s stored note IDs, folder assignments, tags, Thread relationships, Scripture references, and the stickers the child put on verses in My Bible. Verse stickers are private to the child in the app (they never appear in the parent’s Family Bible view) and reach the parent only through this export.
- Approved ministry access is **read-only channel reading**, not collaborative Shared Space membership. A parent must currently follow the ministry channel. That membership and the live association are checked on each read. Removing the parent’s membership or approval removes future access. Child identity and personal notes never enter the channel roster. Material is rendered as plain text without images, links, scripts, or embeds.
- Family Bible shares chapters and verse thoughts between the child and the parent managing that notebook. The parent chooses permitted translations and shared chapters. My Bible can read chapters in the same permitted translations. Neither mode offers comparison. Removing a translation hides readings in that translation from the child. Removing a shared chapter deletes its thoughts. The adult Family Space membership and sharing rules remain separate.
- Search covers the child’s own notes, their Family Bible readings, and currently approved ministry resources. Opening a result checks access again. Notebook cover, light/dark mode, larger reading and writing text, and sound and motion preferences are stored on the child account.
- The pilot omits ministry responses, co-editing, uploads, rich text, peer discovery, push notifications, native sign-in, parent transfer, automatic graduation, and automatic reactivation after withdrawal. A notice version change pauses child access until the parent renews consent on the notebook's page in My Family (`POST /api/child-accounts/children/:id/consent`); withdrawn notebooks never resume there.

## KWS setup

The provided licensing URL is https://www.kidswebservices.com/licensing. Its page returned HTTP 403 during research; no pricing or licensing terms have been assumed or accepted.

Use the Epic Developer Portal to create/select the Harvous organization and product, enable Parent Verification, review/accept the service terms, configure branding, supported US verification methods, and publish to Test. KWS Parent Verification verifies adulthood; Harvous owns the direct notice, guardianship attestation, consent record, permissions, withdrawal, and deletion.

Server-only configuration (never VITE_ or PUBLIC_, never commit credentials):

```
HARVOUS_CHILD_ACCOUNTS_ENABLED=false
HARVOUS_CHILD_RETENTION_READY=false
HARVOUS_CHILD_RECOVERY_PAUSED=false
HARVOUS_CHILD_APP_URL=https://kids.harvous.com/kids.html
HARVOUS_PARENT_APP_URL=https://app.harvous.com
HARVOUS_CHILD_PRIVACY_URL=<published, reviewed child privacy policy URL>
KWS_ENVIRONMENT=test
KWS_ORG_ID=<from KWS Integration Information>
KWS_PRODUCT_ID=<Harvous KWS product>
KWS_CLIENT_ID=<from KWS Integration Information>
KWS_API_KEY=<server-side client secret>
KWS_SEND_EMAIL_URL=<complete product-specific send-email URL from authenticated API reference>
KWS_WEBHOOK_SECRET=<test webhook secret>
KWS_PREVIOUS_WEBHOOK_SECRET=<optional during rotation>
FAMILY_RETENTION_CRON_SECRET=<at least 32 random characters>
```

The send-email endpoint is deliberately configured rather than guessed: the detailed product API specification requires Epic portal access. Verify the request against that product’s current specification during staging. Public integration docs specify `email`, `location`, `language`, `externalPayload`, `userContext: parent`, OAuth client credentials with scope `verification`, and a non-empty User-Agent; the implementation follows those requirements.

Set the KWS webhook URL to the API’s public `/api/webhooks/kws` endpoint. It validates `x-kws-signature` HMAC-SHA256 over `timestamp.rawBody`, milliseconds, a five-minute delivery tolerance, multiple v1 signatures during rotation, organization/product, parent email digest, environment, request expiry, and pending status. It never accepts browser redirect parameters as proof. KWS verification callbacks cannot reactivate a withdrawn child. No webhook body, email, note text, or credential is logged by family routes.

KWS redirects can point to `/settings/child-accounts`; redirects are navigation only. The parent uses “Check verification status” after returning. Verify webhook delivery/retry timing against the five-minute signature tolerance in staging. Pending requests are limited to three starts per account per hour; KWS separately imposes provider limits.

References checked 2026-11-10:

- https://dev.epicgames.com/docs/kids-web-services/kws-get-started
- https://dev.epicgames.com/docs/kids-web-services/parent-verification-service/pv-service-flow
- https://dev.epicgames.com/docs/kids-web-services/parent-verification-service/pv-service-integration
- https://dev.epicgames.com/docs/kids-web-services/parent-verification-service/pv-service-api-reference
- https://dev.epicgames.com/docs/kids-web-services/parent-verification-service/set-up/pv-service-configure-webhook

## Data lifecycle

Additive tables include `FamilyVerifications`, `FamilyChildren`, `FamilyChildSessions`, `FamilySpaceApprovals`, `FamilyChildBibleReadings`, `FamilyChildBibleThoughts`, `FamilyChildVerseStickers`, and `ChildNoteResources`. All have RLS enabled without browser policies; only the server accesses them. Sessions are stored as SHA-256 digests. Consent contains the parent-child relationship, notice version, acceptance time, provider request/transaction, and verification environment. KWS receives an opaque request UUID, the adult email, language, and US location, never child notes or profile data.

Child creation, one-time request consumption, and My Home creation are atomic. Child requests lock the child record and re-check the session after the lock, serializing against withdrawal/deletion. Parent reads and writes always constrain both parent and child IDs. Child bearer tokens bypass Clerk and cannot fall back to a parent cookie on adult endpoints.

Immediate deletion uses the same relational note cascade as ordinary notes, in the child deletion transaction, then removes the child, preferences, sessions, approvals, Family Bible readings and thoughts, My Bible verse stickers and highlights, the consent history, My Home, and verification. No Clerk identity exists for the child. Parent account deletion is blocked until managed children are deleted; a short-lived deletion tombstone closes the concurrent child-enrollment race. Clerk deletion failures now return an incomplete-deletion error rather than success.

Retention policy implemented by the daily job:

| Data | Retention |
|---|---|
| Unconsumed verification request | Seven days; no child profile exists |
| Handoff credential | Five minutes |
| Child session | Eight hours |
| Withdrawn child account | Access stops immediately; delete after 30 days |
| Inactive child account | Delete after 365 days without child activity |
| Active child notebook and consent | While needed for the active account; explicit deletion removes both |
| Parent deletion tombstone | Seven days |

`family:retention` defaults to a read-only candidate count. `--apply` deletes due data and expired credentials. The job processes up to 100 child accounts per invocation; monitor backlog and run another bounded batch when necessary. Child-owned notes are excluded from the nightly adult CSV backups and product usage metrics. Database snapshots, infrastructure log retention, and KWS data rights follow the operational policies for those providers. Complete and publish those terms before enabling enrollment. Do not add child IDs to adult lifecycle email campaigns or optional analytics, or run bulk authoring/enrichment scripts over child-owned notes without reviewing this boundary.

## Recovering a database backup

Before directing the app at a restored backup, set `HARVOUS_CHILD_RECOVERY_PAUSED=true` on the API and verify it is active on every instance. Parent management, child requests, KWS callbacks, and scheduled retention return an uncached 503 during recovery. Wait for in-flight writers to finish before switching databases. The public child privacy notice and its contact information stay available on the marketing site.

Reconcile restored notebooks against the authoritative consent and deletion state from outside the restored database. For a planned recovery, capture only notebook IDs and current withdrawal timestamps from the original database after pausing writers. Keep this reconciliation record encrypted and access-restricted, and delete it when recovery is complete. Do not restore a notebook whose deletion or consent status cannot be established.

Purge restored records for deleted notebooks using the normal child deletion cascade. Reapply withdrawals with their original timestamps and clear all restored child sessions and handoff credentials. Remove unused verification requests created before the restore, keeping the verification records linked to existing notebooks. Run retention against the reviewed target and verify the affected records are gone before clearing the pause. Rehearse on a disposable database with fictional records, including one active notebook, one deleted since the backup, and one withdrawn since the backup.

## Isolated staging setup

The existing `new.harvous.com` frontend uses the live Fly API. The isolated staging configuration uses `fly.child-staging.toml` for `harvous-family-staging`, `wrangler.child-parent-staging.jsonc` for `family-test.harvous.com`, and `wrangler.kids.jsonc --env staging` for `kids-test.harvous.com`. Both Workers use the isolated Fly API. The parent app needs the Clerk test publishable key at build time and the API needs the matching test secret. Leave analytics keys unset for the build. The isolated Fly API skips the adult scheduler and stops at startup if its database or Clerk configuration fails the staging checks.

Use the explicit configs in the deploy commands. Run `node scripts/build-child-staging.mjs` with `HARVOUS_STAGING_CLERK_PUBLISHABLE_KEY` supplied from the isolated Clerk application. It builds parent assets to `dist-child-staging` with the development Clerk CSP and child assets to `dist-kids-staging`. Both production output directories stay separate. Stage Fly secrets against `harvous-family-staging` only. Keep `HARVOUS_CHILD_ACCOUNTS_ENABLED` and `HARVOUS_CHILD_RETENTION_READY` unset until the staging deployment and retention job are verified.

Set `HARVOUS_CHILD_ENVIRONMENT=staging` on the staging API. That setting accepts KWS Test only alongside a recognized non-production Supabase URL, a Clerk test secret, and distinct staging origins. Staging rejects the production Fly app, database and child origin and the existing Harvous parent origins. Keep enrollment off until the staging retention Worker has successfully called the staging API. Import the Bible verse fixtures or seed the supported translations in the staging database so the reader can be exercised. Use only fictional child accounts.

## Deployment sequence

1. Review the child data flow, privacy notice, vendor contracts, jurisdiction scope, retention, ministry safeguards, and incident-response process with qualified counsel. KWS integration is not Harvous certification.
2. Run `npm run child-accounts:schema` to inspect the additive SQL. Apply it to the explicitly reviewed staging target using `npm run child-accounts:schema -- --apply` and the existing database target guard. Do not use the Shared Spaces migration for these tables.
3. Build the API and adult SPA. Run `npm run build:child` to build `kids.html` into `dist-kids`. Deploy the child front end with `wrangler.kids.jsonc` on its own origin. That worker blocks adult routes and service workers, strips cookies, has no SPA fallback, and sends restrictive content/security headers. Do not enable Cloudflare Web Analytics or other tracking injection on this origin.
4. Configure the same retention secret in the child Worker and API. The child worker has a daily scheduled event at 04:17 UTC, calling the authenticated API retention job. Confirm successful execution and monitoring before setting `HARVOUS_CHILD_RETENTION_READY=true`. Include the child origin in API `ALLOWED_ORIGINS` when CSRF enforcement is enabled.
5. Configure KWS Test, the reviewed privacy URL, and child origin. Use consenting adults and fictional child fixtures in staging. Enable enrollment only on that environment. Production accepts production KWS credentials. Verify the actual secrets and endpoint in the KWS product’s integration settings.
6. Exercise first-time verification, AgeGraph preverification, signature rotation/replay, wrong email/product, expired callbacks, failed KWS sends, double redemption, two parents/two children, revoked sessions during save, parent removal from a ministry, XSS-like note text, export, parent deletion, erasure including note versions, retention, and mobile sign-out. Offline tests mock external systems; they are not a substitute for these integration checks.
7. After review, publish KWS Production, configure its distinct secrets, apply the additive schema to the explicitly reviewed production target if needed, and deploy with public enrollment closed. Verify the scheduled retention job.
8. For the production rehearsal, keep `HARVOUS_CHILD_ACCOUNTS_ENABLED=false` and configure `HARVOUS_CHILD_PILOT_PARENT_ID` with the exact production Clerk ID of the consenting test parent. The rehearsal still requires the production database, live Clerk, KWS Production, configured public URLs, retention readiness, Plus, and parental consent. Use the real UI to verify the signed callback and child session. Confirm a separate parent cannot enroll. Remove the pilot setting and test data before enabling public enrollment. With enrollment closed and no pilot configured, existing child sessions are blocked while parents can still manage or export notebooks.
9. Publish the updated age policy in the separate marketing repository and verify the privacy links before enabling enrollment. Independent accounts retain the existing 13+ signup rule.

## Verification commands

```
npm run test:family
npx vitest run server/utils/__tests__/delete-note-cascade.test.ts
npm run design:check
npm run check:auth-gated-queries
npm run check:thread-terminology
npm run check:pds-tokens
npm run typecheck:ratchet
npm run build:api
npm run build:spa
npm run child-accounts:schema
```

Design parity: web-only pilot (Tier C). Existing settings primitives/tokens are reused. Fixture scene: `ds-26-family-privacy` in `/__dev/design-system`. Native apps are not enabled for child accounts.

### Shared-device child mode

The adult account menu links to Family to select a child. “Use child mode on this device” requires explicit confirmation, then creates a fresh handoff, clears adult caches, and signs the adult out before navigating. A sign-out failure stops the handoff. The isolated child entry ends its child session before returning to the configured parent sign-in page. Returning never restores a saved adult session.

The child return action ends the child session and opens the parent sign-in page. The parent page clears any existing adult session before presenting fresh sign-in, including when the child opened a handoff link in the adult’s browser profile. Preview notes and decorations at `/kids.html?preview=1` are fictional and reset on reload.

Local verification used disposable PostgreSQL and fictional families. The real API handled simulated Clerk responses and signed KWS callbacks, blocked enrollment before consent, redeemed single-use links, kept notes and Bible thoughts isolated, revoked access when the parent removed approval, and exported the child’s work. The Worker’s scheduled handler called the retention endpoint and verified deletion of the expired child, note, reading, thought, sessions, and consent record. Browser checks used the built child app for search, cover changes, and shared verse thoughts. The staging rehearsal later verified live KWS Test email and callback, real Clerk session handoff in a browser, and a successful Cloudflare scheduled cleanup. See the follow-up for the evidence and remaining production checks.

## Notebook organization and a future account transition

The preview puts private notes in My Notebook and parent-shared ministry readings and Bible bookmarks in Family Space. Search reads those two sources. The isolated app uses current access on search and opening a result, including after a parent removes an approval.

Use the adult note model for production organization. The folder is the note's `primaryCollection` label. Tags use `Tags` and `NoteTags`, and Threads use child-owned `Threads` and `NoteThreads`. The note inspector can edit those relationships inside the child's personal Home. Preview edits stay in memory. The isolated child API persists titles, bodies, and note details, including organization and approved resource references.

For a future transition to an independent account, preserve canonical note and organization IDs. After verifying both sides of the handoff, a server transaction should transfer ownership of the personal Home, notes, tags and Threads together. Preserve their relationships and Scripture references, reconcile account-local note numbers if needed, and end child sessions and guardian access at cutover. Family Space resources and membership should remain governed by the family's permissions. The transition needs its own identity, authorization, and data integrity checks before it can be enabled.

Repeat the shared-device handoff against the production Clerk configuration before opening real enrollment. Verify parent session freshness, browser Back and refresh, and the supported sign-in methods.
