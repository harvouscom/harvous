# Family Accounts

**Status:** Building (v1, web only)  
**Last updated:** 2026-10-09  
**Supersedes:** the April 2026 draft of this file, which assumed Clerk Billing, full parent read
access to children's notes, an XP leaderboard and InboxItems delivery. None of those fit the
product as it stands; see [Cut](#cut-and-why).

---

## Decision log

| Date | Decision |
|---|---|
| 2026-10-09 | Parents see **progress, not content**: a few counts, a coarse last-active bucket and the names of books read. A child's notes stay theirs. No new cross-user note read path. |
| 2026-10-09 | **The owner's Plus covers the household.** New entitlement source `family`; no new Polar product. Cap is **6 people including the owner**. |
| 2026-10-09 | Covered features are the **study features** (`review`, `challenges`, `connector`, `full_history`). Hosting shared spaces (`shared_spaces`) stays with whoever pays. |
| 2026-10-09 | **13 and older only.** "Child" is a role a person consents to at join, not an age check. No COPPA flow. |
| 2026-10-09 | A child can **switch themselves to adult member** without a parent's approval. |
| 2026-10-09 | No leaderboard, XP, streaks or milestone notifications. No parental controls. |

---

## What it is

A household layer over things Harvous already has:

1. **A Family Space**: an ordinary shared space everyone in the family belongs to.
2. **Plus coverage**: one person's Plus extends the study features to up to five others.
3. **A progress view**: parents see how their children's study is going, in numbers, and each
   child sees exactly the same numbers about themselves.

It complements the church layer rather than replacing it. Church connection stays per person.

## Principles

- **Progress, not content.** A parent can learn that their teenager read eleven chapters of
  John this month. They cannot learn what the teenager wrote about it. Notes are where people
  write prayers and doubts, and a note app that reports to a parent is one nobody writes in
  honestly.
- **Consent at join.** The role is part of the invite, the invite page spells out what that
  role shows to whom, and the server refuses a redeem that did not acknowledge it.
- **The child sees what the parent sees.** The child's settings page renders the same payload
  the parent gets, so nothing about the arrangement rests on trust.
- **A role, not an age.** 13+ only. Becoming an adult member is always available to the child.
- **No spiritual competition.** No family scores, rankings, streaks or XP, consistent with
  [REVIEWS_CHALLENGES_SEASON_PASS_STRATEGY.md](./REVIEWS_CHALLENGES_SEASON_PASS_STRATEGY.md).
- **No injection into personal accounts.** Shared material lives in the Family Space; it
  reaches someone's own library only if they copy it in.
- **Never evict.** If the owner's Plus lapses, the family and its space keep working; only
  coverage and new invites stop.

---

## Roles

| | Owner (a parent) | Parent | Child | Adult member |
|---|---|---|---|---|
| Covered by the owner's Plus | pays | yes | yes | yes |
| Sees children's progress | yes | yes | own only | no |
| Their own progress is visible to parents | no | no | yes | no |
| Family Space role | `owner` | `leader` | `member` | `member` |
| Invite people | yes | yes | no | no |
| Rename the family | yes | yes | no | no |
| Remove a child or adult | yes | yes | no | no |
| Remove a parent | yes | no | no | no |
| Make someone a parent | yes | no | no | no |
| Move a child to adult | yes | yes | self | — |
| Leave | no (dissolve instead) | yes | yes | yes |
| Dissolve the family | yes | no | no | no |

Nobody can be moved *into* the child role after joining. That role adds visibility, so it is
only ever entered by accepting an invite that says so.

Every family member can write in the Family Space (a shared space lets any member author).
Parents, as leaders, can also arrange its threads and folders.

---

## Data model

Three new tables. Nothing is added to `Spaces` or `UserMetadata`: Drizzle selects every declared
column, so a new column on a hot table breaks every read of it until the DDL runs.

```
Families       id 'fam_…' · ownerUserId · spaceId · createdAt · updatedAt
               UNIQUE(spaceId) · UNIQUE(ownerUserId)

FamilyMembers  id 'fmem_…' · familyId · userId · role 'parent' | 'child' | 'adult'
               invitedBy · inviteId · joinedAt · roleChangedAt · roleChangedBy
               createdAt · updatedAt
               UNIQUE(userId)        one family per person in v1
               INDEX(familyId)

FamilyInvites  id 'finv_…' · familyId · token · role · label (≤ 40, e.g. "for Tyler")
               createdBy · expiresAt (now + 7 days, required)
               redeemedBy · redeemedAt · revokedAt · createdAt
               UNIQUE(token) · INDEX(familyId)
```

- **The family's name is the space's title.** There is no `Families.name` to drift from it.
- **The Family Space is a plain personal shared space** (`type = 'shared'`, `orgId` null),
  linked from `Families.spaceId`. A new `Spaces.type` value would have to be taught to
  `canAuthorInSpace`, `requireSpaceAccess`, the navigation serializers and native, for no
  behavior the shared type doesn't already have.
- **Why not a family role on `SpaceMemberships`?** Space roles decide who may write. Family roles
  decide billing and visibility. "One family per person" is a unique index on
  `FamilyMembers.userId` and cannot be expressed on `SpaceMemberships`. And coverage should not
  hang off a row in a space that can be soft-deleted.
- **Why a separate invite table?** `SpaceInvites` links are multi-use and carry a space role.
  A family invite carries a role the invitee consents to, so it is single-use, and redeeming
  one does more (family row, space row, coverage). A family token reaching the generic space
  redeem would skip every family check.
- **Family-space roles** are written in the same transaction as the family change: owner →
  `owner`, other parents → `leader` with `grantSource = 'family'`, children and adults → `member`.

Schema is applied with `npm run family:schema:apply` (additive DDL, idempotent), never
`db:push`. Apply it to production before the routes deploy.

---

## Lifecycles

**Create.** Settings › Family › Start a family. Requires the caller's own Plus (`billing` or
`admin_grant`) and that they are in no family. One transaction creates the space, the owner's
space membership, the `Families` row and the owner's `FamilyMembers` row as `parent`.

**Invite.** A parent picks a role (parent, child or adult), optionally labels the invite, and
gets a link: `/family/join/<token>`. Refused when members plus live invites would exceed 6, or
when the owner is not currently paying. Links expire after 7 days and work once. There are no
email invites; Harvous has no transactional email sender.

**Join.** The invite page shows the family name, who invited them, the role, and the plain list
of what that role shares. Signed-out visitors sign up first and return to the page. Redeem is
refused if the person is already in a family, if the invite is used, revoked or expired, or if
the family is full. The client must send back the role it showed (`acknowledgedRole`).

**Role change.** See the matrix. Child → adult takes effect immediately and the child's card
disappears from parents' view. Parents see the member's new role in the list.

**Leave / remove.** The member's Family Space membership is removed with
`removeMemberPreservingResponses`, so what they wrote there stays. Their coverage ends.

**Dissolve.** Owner only. Family rows are deleted and coverage ends; the space remains as an
ordinary shared space with everyone still in it. The owner can delete it through the normal,
recoverable space delete.

**Account deletion.** Deleting the owner's account dissolves the family first. Deleting a
member's account removes their family row.

**Owner's Plus lapses.** Nothing is evicted. Coverage switches off, new invites are refused with
upgrade copy for the owner, and everything resumes when Plus does.

**Guarding the Family Space.** While a space is a family's, the generic space routes refuse to
mint invites for it, remove members from it, or delete it, and point to Settings › Family.

---

## Billing

- New entitlement source **`family`**, stored per covered member and feature with
  `providerRef = familyId`. Stored rather than computed so `listActiveFeatureKeys` stays one
  query, and so coverage shows up in census and admin counts.
- **Who sponsors:** only the owner, and only from their own `billing` or `admin_grant` rows.
  Coverage never chains from `family`, `church_seat` or `trial` rows.
- **What flows:** `review`, `challenges`, `connector`, `full_history` (constants in
  `src/lib/billing-plans.ts`: `FAMILY_COVERED_FEATURES`, `FAMILY_MAX_MEMBERS = 6`).
  `challenges` is withheld today and is issued anyway, matching how Plus issues it.
- **When rows change:** inside each family transaction (join, leave, remove, dissolve); after
  every write to the owner's own entitlements (`setEntitlementsForProduct`,
  `setFeatureEntitlement`, `cancelBillingEntitlements`), which covers the Polar webhook,
  provider sync, admin grants and the dev toggle from one place; and on
  `syncEntitlementsFromProvider` and `GET /api/family` as a self-heal. Reconciliation is
  idempotent and never revokes on an error.
- **Cancel at period end** needs nothing special: Polar keeps the subscription active until it
  is revoked, and family rows follow the owner's billing rows.
- **A member with their own Plus keeps it.** Both rows coexist (the unique key includes the
  source). There is no automatic pause; their Family page notes they can cancel their own.
- **Plan page.** A covered member with no subscription of their own sees "Plus, covered by
  {first name}'s family" rather than "Managed by Harvous". `/api/subscription/status` carries a
  `coverage` object for this.
- **Admin counts** report `family` separately from `billing` and grants.

This is a deliberate exception to "seats are the product line" in
`server/utils/tier-limits.ts`: six study seats for one subscription. The 12-person space cap is
unaffected and stays the fence for hosting.

---

## What parents see

`GET /api/family/progress`, rolling 30 days, one entry per child:

| Signal | Source |
|---|---|
| Last active: today / this week / this month / earlier / never | latest of `ReadingEvents`, `NoteVisitEvents`, and notes they wrote |
| Chapters read (count) | distinct chapters in `ReadingEvents` with `dwellBucket` read or study (glances never count) |
| Books read (names) | distinct books from the same rows, in canonical order |
| Notes written (count) | `Notes` they created, `addedBy = 'user'` (imports, templates and system notes excluded; locked notes counted, never singled out) |

**Never shown:** note titles or bodies, highlights, thread or plan titles, which chapters,
searches, Recall, Review (items, schedule, answers or activity — Review is never shared, per
[CHURCH_V2_ROADMAP.md](../CHURCH_V2_ROADMAP.md) and [STUDY_PLANS.md](./STUDY_PLANS.md)), spaces
they belong to, or exact times.

Parents see children only, never other parents or adult members. A child gets their own entry
and nothing else; an adult gets nothing. Contract tests scan the query file and fail if it
reaches for note text, Review, search or recall tables.

What the child sees, on Settings › Family and on the invite page before joining:

> What your parents can see: when you were last active, how many chapters you read, which books
> they were in, and how many notes you wrote, over the last 30 days. They can never see your
> notes, highlights, searches, or Review.

---

## Family Space

An ordinary shared space: everyone can read and write, notes copied in are independent copies,
locked notes never appear in it. It is created and named with the family and shows up in the
sidebar like any shared space. A "Family" label and "Parent" in place of "Leader" in its roster
are later polish.

---

## Surfaces

**Web (v1):**
- Settings › Family (`PrototypeFamilyPage`): start a family, members and roles, invite sheet,
  pending invites, children's progress cards, the child's "what your parents can see" card,
  become an adult, leave, dissolve.
- Invite page `/family/join/<token>` (`PublicJoinFamilyPage`).
- Plan page coverage line.
- Behind `FAMILY_PREVIEW_USER_IDS` until launch, like the Connector preview.

**Native:** no Family settings row in v1 (an intentional difference noted in both settings
lists). The Family Space works there already, because it is a shared space.

---

## Cut, and why

| From the April draft | Why it was cut |
|---|---|
| Full parent visibility of children's notes and threads | Notes are where people write honestly. Progress is enough for a parent to encourage, and nothing more is needed to make the feature useful. |
| Parental controls (block locked notes, block private spaces, approve space joins) | Blocking locked notes is pointless when parents can't read notes. Gating a 13-year-old's space joins contradicts "a role, not an age". |
| Automatic simplified UI for children | Tied to the full-visibility model; a teen gets the same app. |
| Family Small / Large plans, Clerk plan env vars | Billing is Polar now, and the owner's Plus covers the household. |
| "Plan stacking not allowed" | Rows from different sources coexist harmlessly; forcing a cancellation helped nobody. |
| Family XP leaderboard, streak notifications | Spiritual competition, ruled out across the product. XP is no longer shown anywhere. |
| Milestone notifications to parents | Same reason; and Harvous has no in-app notification store to carry them. |
| Email invites, inbox items for invites | No transactional email; `InboxItems` is a retired Webflow pipeline. |

## Deferred

- **Multiple families / split households**, and a "primary family" for coverage.
- **Church inheritance** (children inheriting a parent's church) and church targeting of family
  spaces. Church connection and channel follows stay per person.
- **Ownership transfer**, and letting any paying parent sponsor.
- **Family reading plans** with per-member progress inside the Family Space.
- **Web push** on membership events (join, leave, role change).
- **A weekly digest** for parents.
- **Native** settings and invite screens.
- **Under-13 accounts.** Needs verifiable parental consent, minimal data collection and a
  parent's right to delete; see
  [CHMS_INTEGRATION_RESEARCH.md §7](./CHMS_INTEGRATION_RESEARCH.md#7-privacy-security-and-compliance).

## Open questions

- Does `/upgrade` and harvous.com/pricing mention family coverage at launch?
- Is 30 days the right window for the progress view, or should parents be able to see a longer
  arc without it turning into a streak?

---

## Phases

| Phase | Contents |
|---|---|
| 0 | This spec; correct the parent-visibility lines in CHMS research. |
| 1 | Tables and DDL; `/api/family` routes (create, read, rename, dissolve, invites, redeem, roles, leave); Family Space guards; account-deletion hooks; Settings › Family; invite page; preview gate. |
| 2 | `family` entitlement source and reconciler; hooks in the entitlement writers; sync self-heal; `coverage` on subscription status; Plan page copy; admin counts. |
| 3 | Progress endpoint, parent cards, the child's mirror card, contract tests. |
| 4 | Family label in sidebar and roster; release notes; lift the preview gate at launch. |
