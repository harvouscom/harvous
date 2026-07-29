# Shared Spaces — testing and migration safety

This is the release verification runbook for the July 2026 Shared Spaces model.

## Hard safety rule

**Never point Shared Spaces E2E setup, seeding, teardown, or migration rehearsal at production.** Use a dedicated,
disposable Supabase project with two dedicated Clerk test users.

The release-gate preflight requires all of the following:

```text
HARVOUS_E2E_DISPOSABLE_DB=HARVOUS_SHARED_SPACES_E2E_DISPOSABLE_V1
E2E_SUPABASE_DATABASE_URL=<disposable Postgres URL>
HARVOUS_E2E_EXPECTED_PROJECT_REF=<project ref parsed from that URL>
HARVOUS_E2E_PRODUCTION_PROJECT_REF=<known production project ref; must differ>
HARVOUS_E2E_EXPECTED_DB_ROLE=<dedicated least-privilege E2E role>
HARVOUS_E2E_RUN_ID=<unique human-readable run or CI attempt id>
TEST_USER_A_EMAIL=<owner test user>
TEST_USER_A_CLERK_ID=<owner Clerk id>
TEST_USER_B_EMAIL=<member test user>
TEST_USER_B_CLERK_ID=<member Clerk id>
CLERK_SECRET_KEY=<test Clerk instance; must start sk_test_>
PUBLIC_CLERK_PUBLISHABLE_KEY=<same test Clerk instance; must start pk_test_>
```

The marker value must match **exactly**. The URL must parse to the declared expected project ref. The run ID must
contain a letter or number and namespaces all run-owned records. User A and User B must have distinct email
addresses and Clerk IDs.

The known production project ref is mandatory and is rejected if it equals either the parsed or expected E2E
project ref. If `PRODUCTION_SUPABASE_DATABASE_URL` is also provided, the preflight rejects an E2E URL with the
same normalized host, port, and database path.

### Disposable database provisioning

Run these steps only as the owner of a newly created disposable E2E database. Substitute local placeholders;
never copy a real password or project ref into this document.

```sql
-- Run as the disposable database owner.
COMMENT ON DATABASE "<disposable_database_name>"
  IS 'HARVOUS_SHARED_SPACES_E2E_DISPOSABLE_V1';

CREATE ROLE harvous_e2e_runner
  LOGIN
  PASSWORD '<generated-test-only-password>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION BYPASSRLS;

GRANT CONNECT ON DATABASE "<disposable_database_name>" TO harvous_e2e_runner;
GRANT USAGE ON SCHEMA public TO harvous_e2e_runner;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO harvous_e2e_runner;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO harvous_e2e_runner;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO harvous_e2e_runner;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO harvous_e2e_runner;
```

Build `E2E_SUPABASE_DATABASE_URL` with that dedicated role, not `postgres`, `supabase_admin`, or a pooler owner
role. `BYPASSRLS` is required because this disposable database enables RLS without browser policies; constrain the
role with the listed schema/table grants and never create it outside the disposable project. Before every recovery cleanup, seed, and global teardown mutation, the harness performs a read-only identity
query against `pg_database` and requires:

- `current_database()` to return a database;
- the database comment to equal `HARVOUS_SHARED_SPACES_E2E_DISPOSABLE_V1` exactly;
- `current_user` to equal `HARVOUS_E2E_EXPECTED_DB_ROLE` exactly;
- the parsed project ref to remain the expected non-production ref.

**Never add this database comment, dedicated role, or disposable marker to production.** The environment marker,
URL, and project ref are only caller claims; the database-owned comment and role are the independent destructive
safety boundary.

## Local routes

The native-like prototype runs at:

- `http://localhost:4322/`
- note routes such as `http://localhost:4322/{id}`

Do not use `/prototype` for local verification on the dedicated localhost host.

## Offline release checks

These do not need the disposable database:

```bash
npm run check:thread-terminology
npm run test:shared-spaces:offline
```

The terminology check enforces **Thread/Threads** across active user-facing source, help, native, E2E, and release
notes. `StudyThreadEntries` remains a permitted internal identifier because the checker evaluates user-facing
labels rather than renaming schema.

## Live disposable E2E

Generic `npm run test:e2e` excludes the fail-closed `shared-space-join`,
`shared-spaces-collaboration`, and `space-invites` specs. This keeps normal Playwright runs from entering
destructive release setup. The protected scripts set `HARVOUS_SHARED_SPACES_RELEASE_GATE=1` and require the full
safe identity above.

After exporting the complete safe environment:

```bash
npm run test:e2e:shared-spaces
```

The script enables `HARVOUS_SHARED_SPACES_RELEASE_GATE=1`, starts an isolated app/API process, seeds only the
declared run namespace, exercises join/collaboration/invite flows with the two test users, and tears down
registered run resources.

The live run is currently **blocked when the required variables are absent**. A missing-variable preflight
failure is expected and must not be bypassed by pointing at a convenient existing database.

## Canonical association migration order

Rehearse this sequence only against a direct (port 5432) disposable/staging database; production execution uses
the same sequence only after rehearsal and release approval. Never use the runtime pooler URL. First take and
verify a database backup, then quiesce note/Thread/shared-space writers. Set the dedicated migration URL and the
Drizzle direct URL to the same reviewed target:

```bash
export SHARED_SPACES_MIGRATION_DATABASE_URL='<direct Supabase URL on port 5432>'
export SHARED_SPACES_MIGRATION_EXPECTED_PROJECT_REF='<reviewed Supabase project ref>'
export SHARED_SPACES_MIGRATION_PRODUCTION_PROJECT_REF='<known production project ref>'
export SHARED_SPACES_MIGRATION_ENVIRONMENT='staging' # staging|production
export SUPABASE_DIRECT_URL="$SHARED_SPACES_MIGRATION_DATABASE_URL"
# Production only (exact value required):
# export SHARED_SPACES_MIGRATION_PRODUCTION_ACK='I_ACKNOWLEDGE_SHARED_SPACES_PRODUCTION_MIGRATION'

# 1. Print and review the additive, idempotent DDL. No connection is opened.
npm run shared-spaces:schema:additive

# 2. Apply only additive tables/columns/non-unique indexes.
npm run shared-spaces:schema:additive -- --apply

# 3. Read-only preflight. Expected legacy rows print as MIGRATE and do not fail.
npm run shared-spaces:preflight

# 4. Preview data repair, then apply after reviewing every count/reason.
npm run shared-spaces:backfill -- --batch-size=200
npm run shared-spaces:backfill -- --apply --batch-size=200

# 5. Postcondition verifier: every nonzero finding fails.
npm run shared-spaces:verify -- --batch-size=200

# 6. Print and review the guarded final reconciliation commands, then apply.
npm run shared-spaces:db:push
npm run shared-spaces:db:push -- --apply

# 7. Verify the final constrained/RLS-enabled state again.
npm run shared-spaces:verify -- --batch-size=200

# 8. Deploy, smoke-test / and /{id}, then resume writers.
```

Every migration command validates the same dedicated URL, environment, expected ref, known production ref, and
parsed project ref before issuing SQL, then logs a password-free database fingerprint. The production ref is
mandatory for staging and production. If the actual target matches it, staging mode is rejected; only production
mode with matching expected/production refs and the exact acknowledgement may proceed. The required order is
**backup/quiesce → additive dry/apply → preflight → backfill dry/apply → verifier → guarded
`shared-spaces:db:push` dry/apply → verifier → deploy/smoke/resume**. The additive stage deliberately excludes
unique/data-dependent constraints, including `Threads_onePinnedPerSpace`. The backfill repairs duplicate pins
and data invariants; only the guarded final push adds those constraints and enables RLS. Generic `npm run
db:push` remains general project tooling and is not approved for this cutover.

The backfill creates baseline note versions and deterministically moves every legacy note out of a shared
`Notes.spaceId`. Eligible unencrypted owner/member notes receive active associations; encrypted, departed,
invalid, or expired-space notes are rehomed without an active association. Valid recoverable deleted-space
structure is retained. It also migrates durable anchors and repairs multiple current Thread pins. The verifier checks association
integrity, encrypted-note exclusion, membership validity, one current Thread per space, note versions, and
durable anchors.

Keep the repair-to-final-index window short. The guarded final push is reconciliation only after additive DDL,
preflight, repair, and a clean postcondition verifier, and it must be followed by the verifier again. Abort and
restore/repair from the backup on any unsafe preflight anomaly, unexpected backfill skip, verifier failure, or
environment ambiguity.

## Expired-space purge schedule

`npm run build:api` bundles both `api.cjs` and `purge-shared-spaces.cjs`. Netlify config schedules the purge
function at `@daily`; it is not mounted in the Hono HTTP router. Each invocation drains 50-row batches for up to
500 spaces or a 25-second budget and reports whether work may remain. After deploy, confirm the scheduled function is
listed in Netlify and inspect its first invocation log. The bounded authenticated-request maintenance remains a
fallback, not the scheduling guarantee.

## Manual product smoke test

With User A as owner and User B as member:

1. Open `/` as A, create a shared space, create an invite link, and verify the public preview is metadata-only.
2. Join as B for free. Confirm non-owner people/response payloads do not reveal email.
3. In **This space**, compose as B. Confirm one canonical note appears in B's My Home and in the space through an
   association.
4. Associate one A-authored note with multiple spaces. Change it in My Home and confirm each context renders the
   same canonical content while folders, pins, and Threads remain space-specific.
5. Open A's note in the shared space and respond to a passage. Confirm the persistent overlay appears there,
   while My Home shows the response only under Note Activity grouped by space.
6. Change the source passage enough to detach the anchor. Confirm Note Activity says **Passage changed** and
   version history remains author-only.
7. Start and pin a Thread as A. Confirm B can view it and attach only B's own associated notes.
8. Remove B. Confirm B's authored associations are archived and B's responses on A's note remain.
9. Re-add and re-share a note. Confirm responses return but old folder/pin/Thread placement does not.
10. Delete the space. Confirm immediate hiding and invite revocation, then restore it from
    **Settings → Sharing → Recently deleted spaces** within the 30-day window.
11. From a foreign note, confirm **Save a copy** creates an attributed independent note. From an authored note,
    confirm **Add to space** reuses the canonical note.
12. Confirm encrypted notes cannot be added and public-link controls are absent in shared context. From My Home,
    confirm an associated note shows the external-visibility warning before creating a public link.

## Documentation checks

No dedicated Markdown link checker is currently defined in `package.json`. Before handoff:

```bash
npm run check:thread-terminology
git diff --check
```

Also inspect changed Markdown links and paths manually, then review `git diff` to ensure no plan, source, test,
release-note, or changelog file was modified by the documentation pass.
