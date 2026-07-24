# Pastor Features Roadmap

**Status:** Design only — no code lands from this doc. Companion to
[CHURCH_ORG_AND_CURRICULUM.md](./CHURCH_ORG_AND_CURRICULUM.md) (org/billing model)
and [CHURCH_CONNECTION_SYSTEM.md](./CHURCH_CONNECTION_SYSTEM.md) (connection flow).
Written July 2026 alongside the harvous.com `/for/pastors` audience page and
`sermon-prep` use case, and the church-org schema groundwork on
`feat/shared-spaces-foundation`.

## Architectural stance

**Church org is an extension of Shared Spaces, not a parallel system.**

- A **church** = a `Churches` row + a Clerk Organization holding **staff/volunteers
  only (≤20, hard constraint)** — congregants never join the Clerk org.
- **Church curriculum** = org-owned **ministry education channels** (broadcast
  spaces): `Spaces.orgId` set, `type='public'`. One space per ministry or study
  context (adult ed, students, sermon series companion, leader resources, etc.) —
  **not** a church announcements / bulletin feed. Staff author (owner/leader);
  congregants follow + copy (or start-from-starter) into their own Harvous via
  copy-lineage / note-templates (`copiedFromNoteId`/`NoteVersions`).
- **Congregant linkage** = `UserMetadata.connectedChurchId`/`connectedOrgId`,
  set via a future connection-request flow. Connected users see "From your
  church" as a **study feed** from followed ministry channels.
- **Billing** = church pays **Church base + add-ons** (curriculum, church Shared
  Spaces, analytics, unlimited staff) — see
  [MONETIZATION_AND_PRICING.md §7](./MONETIZATION_AND_PRICING.md). Same
  owner-pays philosophy as the personal Shared Spaces add-on. Org-owned spaces
  never count against a person's owned-space limit. Review stays individual,
  always.
- **Planning Center split:** Shared Spaces ↔ PCO **Groups**; ministry broadcast
  ↔ PCO **Resources** (utilize or replace). Details in
  [CHURCH_ORG_AND_CURRICULUM.md](./CHURCH_ORG_AND_CURRICULUM.md).

**The ladder** (product + pricing + marketing aligned):

| Stage | Who pays | Rails | Marketing page |
|---|---|---|---|
| Solo pastor | free | personal spaces, threads, pills, Recall | `/for/pastors` + `sermon-prep` |
| Pastor + team / group leader | leader (Shared Spaces add-on) | `type='shared'` spaces, `leader` role (PCO Groups lane) | `/for/group-leaders` |
| Church org | church | ministry broadcast spaces + connect (PCO Resources lane) | `/for/churches` |

**v0 product lock** (before congregant surfaces): staff-only pilot — ministry
spaces appear for staff who own/lead them; connect / Home "From your church" /
sermon-calendar starters stay dark until those models are decided. See
[Locked product decisions](./CHURCH_ORG_AND_CURRICULUM.md#locked-product-decisions-july-2026).

## Gating principle

Pastor/sermon-prep-specific surfaces are **not general-app features**. They
belong to a **role-gated feature set assigned under the church org** — a
staff member's role (pastor, teacher, admin) unlocks role-specific tooling.
General users never see sermon-prep UI. A feature only ships to everyone if
it's genuinely useful to general users first, framed generally; pastor
marketing then describes the pastor's *use* of a general feature, not a
pastor-only feature.

### How role gating works

Pastors/staff are the ≤20 Clerk org members, and **Clerk org custom roles**
(e.g. `org:pastor`, `org:teacher`, `org:admin`) are the natural home for role
assignment — no new tables needed. The server derives a per-user
**feature-set payload** (on the existing user/session bootstrap) from Clerk
org membership + role + `Churches.isActive`; clients render role surfaces
only when the payload says so. Congregants (`connectedChurchId` only, never
Clerk members) never receive role surfaces. A solo pastor without a church
org is served by the general-first features below, plus, later, **Church base**
(paid or pilot `isActive`) as the role-assignment entry point.

---

## A. General-first features (ship to everyone)

`/for/pastors` frames the pastor's use of these — they are not pastor-only.

1. **Passage history** — "everything I've written on this passage," powered
   by scripture pills + the existing space scripture index
   (`build-space-scripture-references`). Genuinely general (any student of
   Romans 8 wants their prior notes on Romans 8); for pastors it's the
   `/for/pastors` promise ("when week 40 needs week 3") made literal.
   Highest leverage, mostly existing rails.
2. **Seasonal recall** — resurface last year's notes when the season returns
   (Advent, Easter, a book studied last summer). General Recall improvement
   (date-anchored triggers on existing cooldown/stability rails); pastors get
   "last year's Advent prep" for free.
3. **Archive import** — general import rails + portable markdown already
   exist; "bring your years of Word docs" is a general onboarding story.
4. **Share a note/thread by link** — works *today* (shareToken + OG cards).
   Marketing can already say "send your congregation the notes."
5. **Note templates** — general feature for every user; see
   [NOTE_TEMPLATES.md](./NOTE_TEMPLATES.md) for the full design. Recommended
   first feature build after the church-org schema groundwork. The sermon
   template (item 6 below) rides these same rails as an org-provisioned
   template — no pastor-specific template UI needed.

## B. Role-gated: pastor/staff tooling

Assigned by role under the church org — never shown to general users.

6. **Sermon note template** — big idea / outline / application blocks,
   delivered as an org-provisioned `NoteTemplates` row (item 5) scoped to the
   pastor role.
7. **Sermon / service calendar** — plan weeks and series ahead (date, passage,
   title). Staff attach **resources** and **sermon starter notes** to a given
   service. Connected people get **start a new personal note from the starter**
   (structure + passage preloaded via note-templates + copy-lineage) — pairs
   `sermon-prep` with congregant `sermon-notes` without co-editing the pastor's
   note.
8. **Ministry channel publishing** — staff post curriculum into the relevant
   `type='public'` + `orgId` ministry space (sermon series companion, adult ed,
   students, etc.) before the week; followers read and take *own* notes.
   Publishing is role-gated; following is general once connected.
9. **Quarterly curriculum threads** — staff publish church-wide study
   threads in ministry channels; members copy into their own space (copy-lineage
   preserves attribution). Authoring is role-gated.
10. **Teaching-team prep spaces** — activates `role='leader'`: staff
    co-author prep in a **shared** space (Groups lane); `SpaceInvites.role='leader'`
    is schema-ready.
11. **Curriculum handoff** — church master thread in a ministry channel → each
    small-group leader derives a copy into their own shared space with their group.
12. **Aggregate engagement view** (later, carefully) — churches see
    *aggregate* adoption only (N connected, N following the study), never
    individual note content. "Review is never shared" is the privacy
    principle for all church analytics.

## Congregant-side surfaces

General users, but only appear once connected to a church. Dark until connect
is decided (v0 is staff-only).

13. **"From your church"** — Home-level **study feed** from followed ministry
    education channels + sermon-calendar starters +
    `FeaturedItems.contentType='church'`. Not a bulletin / announcements inbox.
    Content gated by connection, not a new UI class for everyone.

---

## Relation to schema groundwork

The `Churches` table, `UserMetadata.connectedChurchId/connectedOrgId/
connectedChurchAt`, org-space semantics in `space-access.ts`, and limit
scoping in `tier-limits.ts` are already landed (inert) on
`feat/shared-spaces-foundation` — see
[CHURCH_ORG_AND_CURRICULUM.md](./CHURCH_ORG_AND_CURRICULUM.md#database--schema)
for the current state. None of the features above are built; this doc exists
to keep product, schema, and marketing aimed at the same ladder as each piece
lands.
