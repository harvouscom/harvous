# Shared Spaces — launch strategy

**Status:** July 2026 v1 product loop is implemented in the native-like production shell. The remaining launch
work is operational verification, especially billing and a safe disposable E2E run.

Canonical behavior: [SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md). Verification:
[SHARED_SPACES_TESTING.md](../SHARED_SPACES_TESTING.md). Post-v1 sequence:
[SHARED_SPACES_ROADMAP.md](./SHARED_SPACES_ROADMAP.md).

## Launch promise

Shared Spaces lets a small group study in one place while every person keeps ownership of their own notes:

- My Home remains the complete private aggregate for everything a person authors.
- A shared space is a live audience and organization context for reusable notes, not a copied content silo.
- Members can respond to passages without editing the author's note.
- The owner starts and chooses the current Thread; members attach their own associated notes.
- Invite links are simple, and joining is free.

Lead with **study together while keeping your notes yours**. Do not lead with copying, collaborative document
editing, or generic file sharing.

## Implemented v1 differentiators

### Canonical notes in multiple contexts

Composing in **This space** creates a canonical My Home note plus a space association. Authors can use
**Add to space** for an existing note. Non-authors use **Save a copy**, which creates an attributed independent
note.

Folders, pins, order, Threads, and responses remain isolated per space even when the same canonical note is
associated with several spaces.

### Passage-level responses

Members respond to a selected passage on another person's read-only note. Responses render as persistent overlays
only in that space. My Home exposes the same conversation through Note Activity grouped by space.

Durable anchors resolve against immutable versions. If the source passage changes beyond recognition, the Activity
row remains and says **Passage changed**. Only the author can inspect or restore note versions.

### Threads

The space owner uses **Start a Thread** and selects one current Thread. Members can view it and attach only their
own actively associated notes. Internal connection-cluster and `StudyThreadEntries` identifiers remain technical
implementation details; launch language is **Thread** or **Threads**.

### Safe lifecycle

Leaving or removal archives a member's authored associations but preserves their responses on other people's
notes. Removing and later re-sharing a note restores the space conversation without restoring stale organization.

Deleting a shared space immediately hides it and revokes access. The owner can restore it from Settings for 30
days; expiration purges space-level data without deleting canonical notes.

## Privacy and trust claims

Launch copy may accurately say:

- encrypted notes are excluded from Shared Spaces;
- invite previews expose metadata, not content previews;
- non-owner members do not receive member email fields in shared response shapes;
- a note is read in an explicit My Home or space context;
- public-link controls are hidden in shared context, and My Home warns before exposing a note associated with a
  space;
- members join free. Say owners pay to create or host only after the paid-launch gate below passes.

Do not claim real-time presence, email invites, ownership transfer, public broadcast spaces, or same-note
collaborative editing.

## Billing launch gate

Subscription webhook and entitlement-reconciliation code exists. Launch still requires:

1. Clerk monthly/annual Shared Spaces plans and the expected feature/plan IDs;
2. production environment values, including webhook signing secret;
3. correct subscription-item event registration;
4. one real purchase, cancellation, and expiration verification;
5. confirmation that creation unlocks after checkout and remains free for joiners;
6. support and recovery notes for webhook delay or failure.

Until those steps pass, describe billing as implemented in code but not production-verified.

## Release verification gate

Before paid launch:

1. run the terminology check and offline Shared Spaces checks;
2. run the canonical migration sequence below;
3. run the protected live suite only with the exact disposable marker, disposable database URL, matching expected project
   ref, unique run ID, and two distinct Clerk users;
4. manually verify `/`, `/n/{id}`, My Home/This space compose, note Activity, Thread permissions, lifecycle,
   privacy boundaries, and settings recovery;
5. review documentation links and `git diff --check`.

Use one reviewed direct Supabase target for every migration command:

```bash
export SHARED_SPACES_MIGRATION_DATABASE_URL='<direct Supabase URL on port 5432>'
export SHARED_SPACES_MIGRATION_EXPECTED_PROJECT_REF='<target project ref>'
export SHARED_SPACES_MIGRATION_PRODUCTION_PROJECT_REF='<known production project ref>'
export SHARED_SPACES_MIGRATION_ENVIRONMENT='staging' # staging|production
export SUPABASE_DIRECT_URL="$SHARED_SPACES_MIGRATION_DATABASE_URL"
# Production only; exact value required:
# export SHARED_SPACES_MIGRATION_PRODUCTION_ACK='I_ACKNOWLEDGE_SHARED_SPACES_PRODUCTION_MIGRATION'
```

The production ref is mandatory in staging and production. A production target cannot be labeled staging;
production mode must target that exact ref and include the exact acknowledgement. Take and verify a backup, then
quiesce note/Thread/shared-space writers. Run this exact order:

1. `npm run shared-spaces:schema:additive`, then
   `npm run shared-spaces:schema:additive -- --apply`;
2. `npm run shared-spaces:preflight`;
3. `npm run shared-spaces:backfill -- --batch-size=200`, then
   `npm run shared-spaces:backfill -- --apply --batch-size=200`;
4. `npm run shared-spaces:verify -- --batch-size=200`;
5. `npm run shared-spaces:db:push`, review its dry-run, then
   `npm run shared-spaces:db:push -- --apply` for final schema reconciliation and RLS;
6. `npm run shared-spaces:verify -- --batch-size=200` again;
7. deploy, smoke-test `/` and `/n/{id}`, then resume writers.

Generic `npm run db:push` remains general project tooling and is not approved for the Shared Spaces cutover.
The protected live release gate is intentionally blocked when the required disposable environment variables are
absent. Generic `npm run test:e2e` excludes the protected join, collaboration, and invite specs; use
`npm run test:e2e:shared-spaces`, which enables `HARVOUS_SHARED_SPACES_RELEASE_GATE=1`, only with the complete
safe disposable environment. Never substitute a production database.

## Messaging

Use:

- “Study together without giving up ownership of your notes.”
- “Respond to a passage in context.”
- “Follow the current Thread and add your own notes.”
- “Invite with a link. Joining is free.”

Avoid:

- “Copy your notes into the group.”
- “Everyone edits the same note.”
- “Live collaboration” before realtime presence is shipped and verified.
- Any feature label other than **Thread** or **Threads**.

## Post-v1

The committed sequence is v1.1 mentions plus a one-heart acknowledgment (without notifications), v1.2 realtime
invalidation before presence and event unread state, then v2 leadership/billing/email-invite/transfer/public/church
work. Native parity remains long-term; collaborative editing is optional and evidence-led. See
[SHARED_SPACES_ROADMAP.md](./SHARED_SPACES_ROADMAP.md).
