# Parent-managed child accounts

Implementation date: 2026-11-10. Status: code implemented for a US-first web pilot; **not enabled, migrated, deployed, or certified compliant**.

## Experience and boundaries

- Adult Harvous accounts keep the existing 13+ signup. My Family links to Child notebooks at `/settings/child-accounts` when enrollment is available or the parent already manages a child. Child account API routes use `/api/child-accounts`.
- The parent verifies the primary verified email of their Clerk account through Kids Web Services (KWS).
- Adult verification does not create a child or constitute consent. A signed, matching KWS webhook marks a short-lived request verified. The parent separately accepts the versioned Harvous notice and attests guardianship and US residence before submitting a nickname and age band.
- Each verification request can create only one child. KWS may recognize an already verified adult on subsequent requests. No child email, phone, full birth date, photo, Clerk identity, or payment account is created.
- Children use an isolated `/kids.html` entry on a separate origin. Parent-generated links are 256-bit, single-use credentials, expire in five minutes, and travel in the URL fragment (not server logs or referrers). The fragment is removed immediately. Session tokens are held in memory only and expire after eight hours; refresh needs another link.
- Parents may use “Sign me out and open child notebook” for a shared device. This awaits adult sign-out and clears adult query caches. Otherwise use the child’s device or a separate browser profile. This does not claim to secure a device where a parent deliberately leaves another account signed in.
- Child notes remain canonical `Notes` owned by the child identity in its personal My Home. The isolated API accepts only plain text title/body fields. No public sharing, responses, direct messages, purchases, connectors, or optional telemetry endpoints are exposed.
- Parents can read/export the child notebook, revoke every session, withdraw consent, and delete the account. Parent queries explicitly opt out of persisted query caching and are cleared on sign-out.
- Children can start an export from their notebook. The parent signs in and chooses a readable text file or a versioned JSON backup in My Family. The backup preserves the child’s stored note IDs, folder assignments, tags, Thread relationships, and Scripture references.
- Approved ministry access is **read-only channel reading**, not collaborative Shared Space membership. A parent must currently follow the ministry channel. That membership and the live association are checked on each read. Removing the parent’s membership or approval removes future access. Child identity and personal notes never enter the channel roster. Material is rendered as plain text without images, links, scripts, or embeds.
- The pilot intentionally omits child responses, co-editing, uploads, rich text, peer discovery, push notifications, native sign-in, parent transfer, automatic graduation, and automatic reactivation after withdrawal. A notice version change blocks child access until a supported renewal flow is added; do not change the notice version on an active pilot without a migration/renewal plan.

## KWS setup

The provided licensing URL is https://www.kidswebservices.com/licensing. Its page returned HTTP 403 during research; no pricing or licensing terms have been assumed or accepted.

Use the Epic Developer Portal to create/select the Harvous organization and product, enable Parent Verification, review/accept the service terms, configure branding, supported US verification methods, and publish to Test. KWS Parent Verification verifies adulthood; Harvous owns the direct notice, guardianship attestation, consent record, permissions, withdrawal, and deletion.

Server-only configuration (never VITE_ or PUBLIC_, never commit credentials):

```
HARVOUS_CHILD_ACCOUNTS_ENABLED=false
HARVOUS_CHILD_RETENTION_READY=false
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

Four additive tables: `FamilyVerifications`, `FamilyChildren`, `FamilyChildSessions`, `FamilySpaceApprovals`. All have RLS enabled without browser policies; only the server accesses them. Sessions are stored as SHA-256 digests. Consent contains the parent-child relationship, notice version, acceptance time, provider request/transaction, and verification environment. KWS receives an opaque request UUID, the adult email, language, and US location, never child notes or profile data.

Child creation, one-time request consumption, and My Home creation are atomic. Child requests lock the child record and re-check the session after the lock, serializing against withdrawal/deletion. Parent reads and writes always constrain both parent and child IDs. Child bearer tokens bypass Clerk and cannot fall back to a parent cookie on adult endpoints.

Immediate deletion uses the same relational note cascade as ordinary notes, in the child deletion transaction, then removes the child, sessions, approvals, My Home, and verification. No Clerk identity exists for the child. Parent account deletion is blocked until managed children are deleted; a short-lived deletion tombstone closes the concurrent child-enrollment race. Clerk deletion failures now return an incomplete-deletion error rather than success.

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

`family:retention` defaults to a read-only candidate count. `--apply` deletes due data and expired credentials. The job processes up to 100 child accounts per invocation; monitor backlog and run another bounded batch when necessary. Backup expiry, infrastructure log retention, and KWS data rights are operational policies, not controlled by this code. Complete and publish those terms before enabling enrollment. Do not add child IDs to adult lifecycle email campaigns or optional analytics, or run bulk authoring/enrichment scripts over child-owned notes without reviewing this boundary.

## Deployment sequence (not executed)

1. Review the child data flow, privacy notice, vendor contracts, jurisdiction scope, retention, ministry safeguards, and incident-response process with qualified counsel. KWS integration is not Harvous certification.
2. Run `npm run child-accounts:schema` to inspect the additive SQL. Apply it to the explicitly reviewed staging target using `npm run child-accounts:schema -- --apply` and the existing database target guard. Do not use the Shared Spaces migration for these tables.
3. Build API and SPA. `kids.html` is a separate Vite entry. Deploy the child front end with `wrangler.kids.jsonc` on its own origin. That worker blocks adult routes and service workers, strips cookies, has no SPA fallback, and sends restrictive content/security headers. Do not enable Cloudflare Web Analytics or other tracking injection on this origin.
4. Configure the same retention secret in the child Worker and API. The child worker has a daily scheduled event at 04:17 UTC, calling the authenticated API retention job. Confirm successful execution and monitoring before setting `HARVOUS_CHILD_RETENTION_READY=true`. Include the child origin in API `ALLOWED_ORIGINS` when CSRF enforcement is enabled.
5. Configure KWS Test, the reviewed privacy URL, and child origin. Use consenting adults and fictional child fixtures in staging. Enable enrollment only on that environment. Production rejects KWS Test credentials by environment label; operators must also ensure the actual secrets/endpoints belong to the declared environment.
6. Exercise first-time verification, AgeGraph preverification, signature rotation/replay, wrong email/product, expired callbacks, failed KWS sends, double redemption, two parents/two children, revoked sessions during save, parent removal from a ministry, XSS-like note text, export, parent deletion, erasure including note versions, retention, and mobile sign-out. Offline tests mock external systems; they are not a substitute for these integration checks.
7. After review, publish KWS Production, configure its distinct secrets, apply the additive schema to the explicitly reviewed production target, deploy, verify scheduled retention, and enable enrollment. Update the separate marketing repository’s age policy to explain parent-created accounts; do not simply remove the 13+ independent-account rule.

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

The design preview’s top-right child menu groups customization, the privacy guide, and a parent-only return action. Its return dialog signs out the preview’s Clerk session before opening real parent sign-in. Preview notes and decorations remain fictional and reset on reload. The isolated entry shares the preview’s note fields and uses the child API to save and reopen private notes. The rest of the preview, including search, notebook customization, and the collaborative Family Bible, still needs its own production integration.

Local verification used a disposable PostgreSQL database and two fictional child accounts. The isolated app redeemed a single-use handoff, saved a note, and reopened it after a fresh session. A second child could neither see nor edit that note. The local check seeded consent and handoff records directly, so KWS, Clerk, and retention still require staging verification.

## Notebook organization and a future account transition

The preview puts private notes in My Notebook and parent-shared ministry readings and Bible bookmarks in Family Space. Search reads those two sources. Production search will need to apply the child's current access both when returning results and when opening an item, including after a parent removes it.

Use the adult note model for production organization. The folder is the note's `primaryCollection` label. Tags use `Tags` and `NoteTags`, and Threads use child-owned `Threads` and `NoteThreads`. The note inspector can edit those relationships inside the child's personal Home. Its preview data stays in memory. The current child API still accepts title and body only.

For a future transition to an independent account, preserve canonical note and organization IDs. After verifying both sides of the handoff, a server transaction should transfer ownership of the personal Home, notes, tags and Threads together. Preserve their relationships and Scripture references, reconcile account-local note numbers if needed, and end child sessions and guardian access at cutover. Family Space resources and membership should remain governed by the family's permissions. The transition needs its own identity, authorization, and data integrity checks before it can be enabled.

Before enabling shared-device access, exercise the real Clerk sign-out/sign-in flow on staging, including the selected sign-in methods, back/refresh, and an existing provider session. Parent session freshness must be verified for the deployed authentication configuration.
