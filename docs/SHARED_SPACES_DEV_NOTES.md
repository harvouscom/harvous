# Shared Spaces — Development Notes & Decisions

**Status: Foundation complete (July 2026), clean-break architecture.** Shared Spaces is Harvous's first
paid feature. This is a rewrite of the Feb 2026 v1 doc — the v1 sharing model (`Members`,
`SpaceInvitations`, `Spaces.isPublic`/`shareToken`) is **retired**, not migrated. This document describes
the new model.

This document captures design decisions, rules, and implementation details for the collaborative shared
spaces feature. It is a living reference for continued development.

---

## The clean break

Nobody's legacy (Classic-era) shared space needed to keep working, so the July 2026 branch
(`feat/shared-spaces-foundation`) did not migrate v1 data:

- `Members` and `SpaceInvitations` are **frozen** — no new code reads or writes them. They're annotated
  `@deprecated` in `server/db/schema.ts` and kept only for hygiene deletes (account deletion, dev
  reset-to-new, dev/live merge) until they're dropped.
- `Spaces.isPublic`, `Spaces.shareToken`, `Spaces.shareTokenCreatedAt` are similarly frozen. New code
  never reads or writes them.
- Legacy shareToken-based routes (`POST /api/spaces/join/:token`, `GET /api/spaces/join-preview/:token`,
  `GET /api/invitations/:token`, `POST /api/invitations/:token/accept`, `POST /api/invitations/:token/decline`)
  return **410 GONE**.
- Any v1 shared space silently becomes a plain personal space for its owner — the owner keeps everything,
  members lose access, old links die. No grandfathering, no carve-outs.
- One exception: Harvous system-user "featured" spaces (the first-party spaces the admin surfaces via
  `/api/featured/items`) were promoted onto the new rails by a one-time script,
  `server/scripts/migrate-harvous-system-spaces.ts` (idempotent — sets `type='shared'`, creates the owner
  membership row, copies existing `Members` rows to `SpaceMemberships`).

## Data model

One container table, a type discriminator, and brand-new membership/invite rails:

```
Spaces
  id, title, description, color, backgroundGradient,
  userId          -- creator / billing anchor (NOT necessarily "owner" for permission purposes — see below)
  type            -- 'personal' | 'shared' | 'public'
  orgId           -- nullable Clerk organization id; reserved for future church-org hosting
  isPublic, shareToken, shareTokenCreatedAt   -- @deprecated, frozen

SpaceMemberships
  id, spaceId, userId,
  role            -- 'owner' | 'leader' | 'member' — the owner gets a row too (see "Owner is a role" below)
  invitedBy, inviteId   -- null on the owner row
  joinedAt, createdAt, updatedAt
  UNIQUE (spaceId, userId)

SpaceInvites
  id, spaceId, token,
  kind            -- 'link' | 'email' (only 'link' is created today; email is a fast-follow)
  role            -- role granted on redeem
  expiresAt       -- validated at preview AND redeem, from day one (default now+30d)
  maxUses, useCount, revokedAt

UserMetadata
  sharedSpacesAddOn   -- boolean; the Shared Spaces paid-add-on entitlement
  sharedSpacesAddOnUpdatedAt
```

`My Home` is a `Spaces` row with `type='personal'` (unchanged from before) — personal spaces have no
membership rows; the creator is implicitly the only person in them.

### `type` values

| Value | Meaning |
|---|---|
| `personal` | My Home / named-private spaces. No memberships. |
| `shared` | Collaborative — owner + invited members. The paid add-on gate. |
| `public` | **Reserved for a future branch.** Harvous-hosted, free, broadcast spaces (Harvous curates; members follow + copy notes into their own space, but don't post into the public space). No creation path exists yet — see "Public spaces" below. |

**Shared spaces are only ever created as shared.** There's no personal→shared conversion in the
foundation — the paid gate lives at exactly one call site (`POST /api/spaces/create-shared`), and content
moves between spaces via copy-in (below), not by flipping a flag on an existing personal space.

### Owner is a role, not just `Spaces.userId`

The v1 model derived "owner" solely from `Spaces.userId === currentUserId`, with no membership row for
the owner. That was a mistake — it meant owner-vs-member logic had two different code paths depending on
which side of the check you were on. In the new model, **the owner gets a `SpaceMemberships` row with
`role='owner'`**, created transactionally alongside the space. `Spaces.userId` remains the creator/billing
anchor (used for the paid-add-on check, and as a fallback identity), but all access/role logic reads
`SpaceMemberships`.

`server/utils/space-access.ts` — `requireSpaceAccess(spaceId, userId, opts?)`:
- `type='personal'` → `Spaces.userId === userId` is the only possible role (`'owner'`); no membership rows.
- `type='shared'`/`'public'` → reads `SpaceMemberships`. **Heal-on-read**: if `Spaces.userId === userId`
  but the owner membership row is somehow missing (a partial create), it's inserted rather than 403ing the
  creator.
- `opts.minRole` (`'owner' | 'leader' | 'member'`, default `'member'`) — role order is
  owner > leader > member.

`canAuthorInSpace(space, role)` is a small capability function, not scattered role comparisons:
- `personal` → owner only.
- `shared` → any member (this is the whole point — "everyone contributes to the same threads").
- `public` → owner/leader only (broadcast model — members follow and copy, they don't post). This branch
  is dormant until public spaces ship, but the shape is already right.

### Roles

`owner | leader | member`. Only owner and member are exercised by the foundation UI; `leader` is
schema-real but has no activation path yet (Group Leader / church org will grant it). No UI for promoting
members or transferring ownership exists yet.

| Action | Owner | Leader (future) | Member |
|---|---|---|---|
| View space, see member list | ✅ | ✅ | ✅ |
| Create invite links, see them | ✅ | — | ❌ |
| Edit title/color | ✅ | — | ❌ |
| Add/remove own notes | ✅ | — | ✅ |
| Remove any note (moderation) | ✅ | — | own only |
| Space-wide folder removal | ✅ | — | ❌ |
| Leave space | ❌ (blocked) | — | ✅ |
| Delete the space | ✅ | — | ❌ |

---

## Entitlement — the Shared Spaces add-on

**Owner pays. Joining is always free and uncapped.** The old `unlimited` tier (Group Sharing, $6/mo ·
$48/yr) is **fully retired** — zero subscribers, no grandfathering logic anywhere. The Shared Spaces
add-on (`UserMetadata.sharedSpacesAddOn`) is the *only* thing that grants owning a shared space.

- **Free tier:** own **0** shared spaces, join unlimited.
- **Add-on:** own up to **10** shared spaces.
- **Invisible cap (both):** **30** people per space, enforced at invite redeem (`canAddMemberToSpace` in
  `server/utils/tier-limits.ts`) and at the admin add-member endpoint. Not marketed as a headline number.

The gate runs at **space-becomes-shared** time and **invite-creation** time — never at join/redeem. This
means: if an owner's add-on lapses, their existing shared space and its members are completely
unaffected; only *new* invite creation and *new* shared-space creation 403 with an upgrade prompt.

```
hasSharedSpacesAddOn(auth)   -- DB-first (UserMetadata.sharedSpacesAddOn), Clerk JWT `shared_spaces`
                                 feature fallback for the purchase→webhook gap (disabled by
                                 BILLING_TIER_DB_ONLY=true)
canCreateSharedSpace(userId, auth)   -- the paid gate; 403 SHARED_SPACE_LIMIT_EXCEEDED + upgradeUrl
canAddMemberToSpace(spaceId)         -- 30-person cap only; same for every entitlement
```

No billing webhook exists yet (fast-follow) — interim entitlement grants are the Clerk JWT feature
fallback, or an admin grant via `setSharedSpacesAddOnForUserId` (pattern:
`server/scripts/backfill-tier-from-clerk.ts`).

### Clerk dashboard (manual setup)

1. Create a "Shared Spaces" plan (monthly + annual) in Clerk Billing.
2. Attach a feature with slug `shared_spaces` to it.
3. Set env: `CLERK_SHARED_SPACES_PLAN_ID` (server) and `VITE_CLERK_SHARED_SPACES_PLAN_ID` (spa) — see
   `.env.example`.
4. **Archive the Unlimited plan** in Clerk (zero subscribers — no need to keep it purchasable).

---

## Content model: native + copy-in

A shared space has its own notes/threads/folders, same as My Home — the difference is `spaceId` points at
a `type='shared'` space and multiple people can author into it.

- **Native**: any member composes directly in the space (`POST /api/notes/create` with the space's id;
  gated by `requireSpaceAccess` + `canAuthorInSpace`, added in this branch to close a pre-existing
  injection hole where any `spaceId` was accepted with zero validation).
- **Copy-in**: `POST /api/spaces/:spaceId/copy-notes` copies one or more notes into a space as **new,
  independent rows** — new id, new `simpleNoteId`, author = caller, verbatim content (scripture pills
  carry over as-is, no reprocessing), `ResourceMetadata`/`ScriptureMetadata` copied, `NoteConnections`
  **not** copied. The source is untouched. This is the personal→shared path today, and generalizes to
  public→personal later (the permission check is "can I read the source's space", not "do I own the
  source space").
- **Merged view**: `getNotesForSharedSpace` (`server/utils/dashboard-data.ts`) returns every member's
  notes by `spaceId`, with `contentEncrypted=false` enforced for **every** viewer including the author
  (locked notes never appear in a shared context — see below), and author attribution
  (`authorUserId`/`authorDisplayName`/`authorColor`) via one batched `UserMetadata` join.
- **Permissions**: author-only edit/delete (unchanged — `eq(Notes.userId, ...)` filters already enforced
  this). Owner moderation is "remove from space", not "edit/delete someone else's note" — `remove-items`
  nulls `spaceId` on any member's item; the detached note re-homes to the *author's* My Home via the
  existing `ensurePersonalHomeSpace` null-`spaceId` backfill on their next nav load. Members can only
  remove their own items.
- **Folders**: `Notes.primaryCollection`/`secondaryCollections` work unchanged (no schema change needed).
  Any member can read the folder registry; **registering a new folder label** (`folders/create`) is
  owner-only in shared/public spaces (leaders when that role ships). Space-wide folder removal
  (`folders/remove`, which strips a label from every note in the space) is owner-only in shared spaces.
- **Study threads, scripture index**: stay **author-scoped** in the foundation (each member sees their
  own clusters within the space — `NoteConnections` are per-user).
- **Highlights list**: **unioned** in shared/public spaces — sidebar Highlights shows every member's
  eligible `StudyThreadEntry` rows on notes in the space, with author chips. Personal / My Home stays
  author-scoped. Opening a foreign note loads unioned `studyThreads` on details for highlight dock deep
  links; inline overlay render shows cross-member annotations without writing into the author's TipTap body.

### My Home overlay (shared shell, no space switch)

When a shared space is the active shell context (`activeSpaceId`), members can reach personal My Home
without switching spaces:

- **List scope chip bar** (`This space` | `My Home`) on the shared-space list sidebar — toggles
  `sidebarListSpaceScope` in proto shell state (persisted in `proto-sidebar-nav-store`). The layout
  passes `scopedSpaceId` to `PrototypeSidebar` as either the active shared space or personal My Home;
  `activeSpaceId`, the space switcher label, and the shared dashboard stay on the shared space.
- **Search “My Home” tab** — distinct from **Elsewhere** (which only searches outside the current
  drilldown within the same space). The My Home tab runs FTS + universal search against personal My Home
  while the list remains scoped to the shared space.
- **Compose** — default **+** / **N** still creates into the active shared space. **New note in My Home**
  (space switcher menu; mobile toolbar house button) sets `composeTargetSpaceIdOverride` for one draft
  session, cleared on first persist or leaving the draft route.

Scope resets to **This space** when `activeSpaceId` changes or the user leaves shared space.

### Locked notes

Unchanged rule, now enforced uniformly: **locked notes (`contentEncrypted: true`) never appear in shared
contexts, for any viewer** — including the note's own author viewing the shared-space list. (The v1 doc's
carve-out for "owner viewing their own space" doesn't apply here since ownership no longer implies
authorship of every note.) Copy-in and create-into-shared both reject encrypted notes with a 400.

---

## Join flow

Fresh, built on `SpaceInvites` from day one — including invite expiry validation, which was a known v1
gap.

1. Owner creates a link: `POST /api/spaces/:spaceId/invites` (owner-only; **this is the paid gate** — a
   lapsed add-on blocks new invite creation). Default expiry: 30 days from creation. Optional `maxUses`.
2. `GET /api/spaces/:spaceId/invites` lists active links; `DELETE .../invites/:inviteId` revokes one
   (rotation = revoke + create).
3. Recipient opens `/spaces/join/:token` → `GET /api/spaces/invite-preview/:token` (public, no auth):
   validates revoked/expired/max-uses **live**, returns space card, owner display name, people count, and
   unencrypted note/thread previews.
4. `POST /api/spaces/invites/:token/redeem` (auth required): re-validates the invite, rejects
   self/owner-join, guards double-join via the `SpaceMemberships` unique index, enforces the 30-person
   cap, inserts the membership row, increments `useCount`.
5. **No owner-entitlement check at redeem** — the gate already ran at invite creation. A live invite
   redeems until it expires even if the owner's add-on has since lapsed (the 30-day default bounds this;
   documented policy, not an oversight).

---

## Public spaces (future, not implemented)

Reserved by the `type='public'` value and the `canAuthorInSpace` capability function, but there is no
creation path, UI, or anonymous-read story yet. Locked-in shape when it ships:

- **Hosts**: Harvous only at first (rides `server/utils/harvous-admin.ts`), church orgs later via
  `Spaces.orgId`. No user-facing creation path in the foundation.
- **Participation**: broadcast — Harvous (or the org) curates; joiners follow for free and can copy notes
  into their own personal space; members don't post into the public space (`canAuthorInSpace` restricts
  authoring to owner/leader for `type='public'`).
- **Billing**: public spaces don't count toward any tier limit.
- **Anonymous read**: undecided — could be a full public SEO-friendly page, or a preview-then-join-gate
  pattern like the current invite-preview. Design the read path when this ships.

---

## Forward hooks

- **Church org**: `Spaces.orgId` (nullable Clerk organization id) is the anchor point. See
  `docs/future/CLERK_MONETIZATION_ARCHITECTURE.md` for the Clerk Organizations shape (org roles, org-level
  billing metadata).
- **Group shared challenges**: space-as-cohort — future challenge/leaderboard tables key off `spaceId`.
  Nothing challenge-specific exists yet; only `UserXP`/`UserSeasonalXP` (per-user-per-season) and
  `FeaturedItems` (`contentType: 'challenge'`) scaffolding exist today.
- **@ mention pills** (notes/folders/threads as inline references, replacing highlight-to-connect): a
  separate editor-domain branch. Cross-space visibility rules are pre-decided so that branch doesn't have
  to re-litigate them — see "Cross-space reference rules" below and
  `docs/future/MENTION_PILLS.md`.

### Cross-space reference rules (for the @ mention branch)

1. A mention/reference target resolves **within the space the note lives in** — a shared-space note must
   never reference personal content other members can't open.
2. When content crosses spaces (copy-in), references pointing at content the destination audience can't
   see should degrade to a "private reference" state or plain text. Copy-notes' verbatim-content behavior
   (no reprocessing) is compatible with this — the mention branch owns the degrade logic.
3. Person-mentions (future) ride `SpaceMemberships` for the candidate list.

---

## Before merging

This branch was cut before an unrelated `SupportTicketNotes` table (+ `SupportTickets.repliedAt`/
`notifiedAt` columns) landed on `main`. Running `npm run db:push` from this branch as-is will prompt to
**drop** those — they're someone else's live work, not in scope here. **Rebase/merge `main` into this
branch (picking up its `server/db/schema.ts` changes) before the next `db:push`**, and re-verify with
`npx drizzle-kit push` (read the diff; don't blindly accept data-loss prompts) rather than the
non-interactive `npm run db:push` when schema drift is possible.

## Known gaps / fast-follow (explicit non-goals of this branch)

- **Supabase Realtime + presence** — `src/hooks/useRealtimeSync.ts` is coded and mounted but disabled (no
  Supabase config in this environment). Shared-space freshness today is a 45s poll on the notes list
  (`useSpaceNotes(..., { pollWhileActive: true })`) plus normal React Query invalidation on your own
  actions.
- **Email invites** — `SpaceInvites.kind='email'` is schema-ready; nothing creates one yet.
- **Leader role activation** — no promotion/demotion UI; Group Leader ships this.
- **Unioned study-threads/scripture index** — still author-scoped per member within a shared space
  (highlights list is unioned; see Content model above).
- **Billing webhook** — `sharedSpacesAddOn` is set via JWT fallback + admin grant only; a Stripe/Clerk
  webhook that writes it directly is a fast-follow.
- **Public spaces UI** — see above.
- **Church org** — see above.
- **Legacy table drop** — `Members`/`SpaceInvitations` stay in the schema (hygiene deletes only) until a
  drop is scheduled; `hasUnlimitedNotes`/legacy `tier==='unlimited'` cleanup is deferred (low-risk, but
  touches several call sites — see the branch history for the exact grep).
- **Full sidebar generalization** — the foundation renders a dedicated
  `PrototypeSidebarSharedSpaceView` when a shared space is active, rather than making every existing
  personal list mode (folders/threads/scripture index) space-aware. This was a deliberate scope choice
  to avoid touching the ~20 `homeSpaceId` call sites inside the large, heavily-used
  `PrototypeSidebar.tsx` in the same branch that also rewired the backend. A fast-follow can generalize
  those list modes once the foundation has shipped.
- **Overlapping highlights on the same passage** — when the note author had an in-body highlight
  before sharing and members add responses on the same span, today the surfaces stay separate (body mark
  vs overlay). Future: overlay stack badge ("2") opening the dock carousel for all entries on that
  anchor; optional note-level "show/hide responses" filter. No per-dock "mine vs responses" toggle
  unless we collapse multiple `StudyThreadEntry` rows into one card.

## Local dev testing guide

**Requirement**: Two Clerk accounts (or a second browser profile).

1. `npm run dev:all`. Grant user A the add-on:
   `UPDATE "UserMetadata" SET "sharedSpacesAddOn" = true WHERE "userId" = '<A>';`
2. As A: open the space switcher (Home toggle in the sidebar toolbar) → "New shared space" → name it.
   Verify `Spaces.type='shared'` and an owner `SpaceMemberships` row exist.
3. As A: open the space's people sheet → "New invite link" → copy the URL.
4. As B (no add-on, free tier): paste the link → preview renders → sign in / join. Verify a `member`
   `SpaceMemberships` row exists and the space shows up in B's switcher.
5. As B: compose a note in the space. As A: see it appear (poll or refresh) with B's author chip.
6. As A: revoke B's ability by removing them from the space; confirm B's note returns to B's own My Home.
7. Try `curl -X POST /api/notes/create` with a `spaceId` you don't belong to — expect 403 (this was
   previously a silent accept).
8. Revoke A's add-on (`sharedSpacesAddOn = false`) — confirm new-invite-creation and new-shared-space
   creation 403, but B's existing membership and the space's content are untouched.

## Related docs

- [future/SPACE_MODES_PRODUCT.md](future/SPACE_MODES_PRODUCT.md) — product rules, limits matrix.
- [future/MONETIZATION_AND_PRICING.md](future/MONETIZATION_AND_PRICING.md) — pricing/SKU naming.
- [DATABASE.md](DATABASE.md) — full schema.
- [future/CLERK_MONETIZATION_ARCHITECTURE.md](future/CLERK_MONETIZATION_ARCHITECTURE.md) — Clerk
  Organizations shape for the future church-org path.
