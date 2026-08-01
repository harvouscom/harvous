# Shared Spaces — development notes

**Status:** Implemented in the July 2026 native-like production web shell; launch verification is pending. This
is the canonical engineering reference for Shared Spaces. The February 2026 membership, copy-in, and
personal-to-public-toggle designs are retired; see [Clean break](#clean-break).

## Product model

### My Home is canonical

Every note a person authors has one canonical, author-owned row and remains visible in **My Home**, which is the
complete aggregate of that person's authored notes. A shared space is a live audience and organization context,
not a second owner and not a copied note container.

`SpaceNotes` associates a canonical note with a shared or public space:

- A note can be associated with multiple spaces at once.
- Editing the author-owned note updates every context that renders that note.
- The author retains edit and delete authority. A space owner can remove an association but cannot rewrite
  another person's note.
- `SpaceNotes` owns per-space placement such as folders, pin state, order, and other organization overrides.
- `Threads`, `NoteThreads`, and anchored responses are scoped to the relevant space. Organization in one space
  does not leak into My Home or another space.
- Encrypted notes (`contentEncrypted=true`) cannot be associated with or rendered in a shared context.

`Notes.spaceId` remains for the canonical private location and legacy compatibility. A note composed in a shared
space is created canonically in the author's My Home and receives a `SpaceNotes` association to the visible
space. The server applies the same rule to sync-created notes.

### Visible compose scope

Compose follows the scope the user can see:

- **My Home:** creates a private canonical note only.
- **This space:** creates the canonical note in My Home and associates it with the active shared space.
- **Add to space:** an author may associate an existing authored note with another shared space.
- **Save a copy:** a non-author cannot reuse another person's canonical note. They may create an independent
  copy in My Home. The copy stores source note/version/author attribution.

The native-like shell is served at `/` on dedicated hosts, including `http://localhost:4322/`. Canonical note
routes are `/{id}` (legacy `/n/{id}` forever-redirects). An explicit `?space={spaceId}` context selects the shared-space read and organization
context without changing note ownership.

## Note Activity and space activity

**Note Activity** is the response index for one canonical note:

- In My Home it groups responses by shared space, including archived associations.
- Inside a shared space it is limited to that active context.
- Persistent in-body response overlays render only while the note is opened in the relevant shared space.
  My Home exposes those responses through Note Activity, never as persistent overlays.
- A detached durable anchor remains in the index as **Passage changed** instead of moving to unrelated text.
- Immutable `NoteVersions` checkpoints support durable anchors and recovery, but version history is
  author-only.

This is separate from **space activity** and the member's `SpaceMemberships.lastVisitedAt` watermark. Space
activity answers what is new in a space since the member's visit; Note Activity answers who responded to one
note and where.

The internal table/API identifier `StudyThreadEntries` remains for anchored highlight and response rows. That is
an implementation identifier, not a user-facing feature name.

## Threads

Shared Spaces v1 has real **Threads**:

- The owner uses **Start a Thread** and chooses the one current/pinned Thread.
- Members can view the current Thread and attach their own actively associated notes to it.
- A note may be attached only when it is active in that space, unencrypted, and authored by the actor.
- Thread membership and folder/pin organization are isolated to the space.
- Internal connection-cluster and `StudyThreadEntries` identifiers may remain in code and schema; all product
  and user-facing language is **Thread** or **Threads**.

**One Thread concept, two backends (implementation only):**

- **My Home** sidebar Threads are note-link clusters (`NoteConnections` + `studyThreadTitle` on notes). Create
  by connecting notes; delete unlinks the cluster.
- **Shared spaces** use real `Threads` rows scoped by `spaceId` (`group-threads`). Create via **Start a
  Thread**; delete removes the space Thread container while canonical notes stay in My Home.
- Product copy stays **Thread** in both contexts. Shared-space UI must not use the My Home cluster create/list
  path when **This space** is selected.
- **Space dashboard:** **Current Thread** card shows the pinned Thread; the owner-only **Threads** section lists
  other Threads only (no duplicate current row). **Sidebar → Threads** list mode shows every Thread in the
  space, including current, for open/delete/manage.

## Membership, invites, and roles

`Spaces.type` is `personal | shared | public`. `SpaceMemberships` contains an explicit owner row plus future
`leader` and current `member` roles. `SpaceInvites` provides expiring/revocable link invitations.

- The owner manages the space, links, people, structure, and the current Thread.
- Members join free, add or remove their own notes, view the current Thread, attach their own notes to it, and
  respond to notes.
- `leader` is schema-ready but has no v1 promotion UI.
- Invite preview is metadata-only: space identity, owner display name, people count, expiry, and join state. It
  does not expose note, Thread, or member previews.
- Non-owner member serialization strips email fields, including nested response shapes.

## Lifecycle

### Note and membership removal

Removing a note archives its `SpaceNotes` association. The canonical note remains in My Home.

When a member leaves or is removed:

- Their active authored associations are archived.
- Their notes remain canonical in My Home.
- Their per-space Thread attachments and organization are removed.
- Their responses on other authors' notes are preserved, with a display-name snapshot when needed.

Re-sharing a previously removed note reactivates the existing unique association. Responses return with that
space context, but old folders, pins, order, and Thread placement do not silently return.

### Shared-space deletion and recovery

Deleting a shared space immediately hides it, revokes active invite links, and invalidates member access. The
owner can restore it for 30 days from **Settings → Sharing → Recently deleted spaces**.

After the recovery deadline, bounded maintenance purges the space, memberships, invites, associations, Threads,
Thread attachments, responses, and space-level connections. Canonical notes and their author-owned versions are
not purged.

## Privacy and sharing boundaries

- Encrypted notes are excluded from shared-space association, reads, search, and response flows.
- Every note read and mutation carries an explicit context; membership plus an active association is required
  for a shared-space read.
- Public note links are hidden while working in a shared-space context.
- From My Home, creating a public link for a note that is also in shared spaces requires a warning that its live
  contents will become visible outside those spaces.
- Invite preview is metadata-only and rate-limited.
- Shared response APIs do not disclose member email addresses to non-owners.
- Shared Spaces are owner-paid to create or host; joining is free.

## Billing state

`UserMetadata.sharedSpacesAddOn` is the persisted entitlement. The server includes:

- Clerk subscription-item webhook handling for active, canceled, ended, and expired events;
- an idempotent Clerk-to-database reconciliation endpoint;
- a JWT feature fallback for the checkout-to-webhook gap;
- owner creation and invite-creation gates.

This code is **not yet proof of production billing readiness**. Clerk plan/feature IDs, webhook signing secret,
event subscriptions, environment variables, and an end-to-end monthly/annual purchase/cancel test still require
manual setup and verification. Do not document billing as production-verified until those checks pass.

## Clean break

The July 2026 implementation does not preserve the February membership rails:

- `Members`, `SpaceInvitations`, and space `isPublic/shareToken` membership behavior are retired and frozen.
- Legacy membership/join routes return `410 GONE`.
- No personal-to-public or private-to-shared toggle exists. A Shared Space is created as shared.
- Historical copy-in was replaced by canonical notes plus `SpaceNotes`. Copying remains only the explicit
  non-author **Save a copy** action.
- Historical design documents remain for context only and must carry a superseded notice.

## Migration and verification

Use one reviewed direct Supabase target for every command:

```bash
export SHARED_SPACES_MIGRATION_DATABASE_URL='<direct Supabase URL on port 5432>'
export SHARED_SPACES_MIGRATION_EXPECTED_PROJECT_REF='<target project ref>'
export SHARED_SPACES_MIGRATION_PRODUCTION_PROJECT_REF='<known production project ref>'
export SHARED_SPACES_MIGRATION_ENVIRONMENT='staging' # staging|production
export SUPABASE_DIRECT_URL="$SHARED_SPACES_MIGRATION_DATABASE_URL"
# Production only; exact value required:
# export SHARED_SPACES_MIGRATION_PRODUCTION_ACK='I_ACKNOWLEDGE_SHARED_SPACES_PRODUCTION_MIGRATION'
```

The known production ref is mandatory for both staging and production. A target matching it cannot run under a
staging label; production requires the exact production target, `environment=production`, and exact
acknowledgement.

After taking and verifying a backup, quiesce note/Thread/shared-space writers. Follow this exact sequence from
[SHARED_SPACES_TESTING.md](./SHARED_SPACES_TESTING.md):

1. `npm run shared-spaces:schema:additive`, then
   `npm run shared-spaces:schema:additive -- --apply`;
2. `npm run shared-spaces:preflight`;
3. `npm run shared-spaces:backfill -- --batch-size=200`, then
   `npm run shared-spaces:backfill -- --apply --batch-size=200`;
4. `npm run shared-spaces:verify -- --batch-size=200`;
5. `npm run shared-spaces:db:push`, review its dry-run, then
   `npm run shared-spaces:db:push -- --apply` for final schema reconciliation and RLS;
6. `npm run shared-spaces:verify -- --batch-size=200` again;
7. deploy, smoke-test `/` and `/{id}`, then resume writers.

Generic `npm run db:push` remains general project tooling and is not approved for the Shared Spaces cutover.
Never run destructive E2E setup against production. The E2E preflight requires an explicitly marked disposable
Supabase project and rejects a declared production target.

## Related documents

- [SHARED_SPACES_TESTING.md](./SHARED_SPACES_TESTING.md) — safe migration and release verification.
- [future/SPACE_MODES_PRODUCT.md](./future/SPACE_MODES_PRODUCT.md) — product rules and limits.
- [future/SHARED_SPACES_LAUNCH_STRATEGY.md](./future/SHARED_SPACES_LAUNCH_STRATEGY.md) — launch readiness.
- [future/SHARED_SPACES_ROADMAP.md](./future/SHARED_SPACES_ROADMAP.md) — post-v1 sequence.
- [future/SPACE_COVER_IMAGE_VARIANTS.md](./future/SPACE_COVER_IMAGE_VARIANTS.md) — 5×5×light/dark cover catalog (space covers only).
- [future/MENTION_PILLS.md](./future/MENTION_PILLS.md) — future mention rules.
- [future/NATIVE_SPACE_CONTEXT_FOLLOWUPS.md](./future/NATIVE_SPACE_CONTEXT_FOLLOWUPS.md) — native parity backlog for space context + co-editing. Read this before touching `Note.coEditEnabled` in Swift: it is an OR-mirror across associations and native currently renders from it directly, which locks the author out of their own note in My Home.
