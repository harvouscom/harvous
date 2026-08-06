# Pastor Features Roadmap

**Status: partly shipped (v2.19.0, August 2026).** Items 5 and 6 (note templates,
the sermon template as an org-provisioned `NoteTemplates` row) are built, along with
the role gate they depend on, ministry channel publishing (8), the congregant
"From your church" feed (13), and — new in v2.19.0 — the **teaching calendar and
Sunday note starter (7)**. Items 1–4 and 9–12 remain design. Individual items
are marked below. Companion to
[CHURCH_ORG_AND_CURRICULUM.md](./CHURCH_ORG_AND_CURRICULUM.md) (org model),
[BILLING_ARCHITECTURE.md](../BILLING_ARCHITECTURE.md) (billing / Polar),
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
- **Planning Center split:** Shared Spaces ↔ PCO **Groups**; ministry broadcast +
  **Resource Library** ↔ PCO **Resources** (utilize or replace). Curriculum feed
  details in [CHURCH_ORG_AND_CURRICULUM.md](./CHURCH_ORG_AND_CURRICULUM.md);
  study-native catalog, `@` mentions, and PCO Resources competition in
  [RESOURCE_LIBRARY.md](./RESOURCE_LIBRARY.md).

**The ladder** (product + pricing + marketing aligned):

| Stage | Who pays | Rails | Marketing page |
|---|---|---|---|
| Solo pastor | free | personal spaces, threads, pills, Recall | `/for/pastors` + `sermon-prep` |
| Pastor + team / group leader | leader (Shared Spaces add-on) | `type='shared'` spaces, `leader` role (PCO Groups lane) | `/for/group-leaders` |
| Church org | church | ministry broadcast + Resource Library + connect (PCO Resources lane) | `/for/churches` |

**The v0 staff-only lock has been lifted.** It said congregant connect, Home "From
your church", and sermon-calendar starters would stay dark until those models were
decided. Connect and the study feed shipped in v2.18.0; the calendar and its starters
shipped in v2.19.0. Congregant surfaces are still gated — they need
`UserMetadata.connectedOrgId` and render nothing without it — but they are no longer
dark by design.

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
Clerk members) never receive role surfaces. **Amended by design (Aug 2026, not yet
built):** a congregant explicitly *granted* leadership of a single space receives role
surfaces for that space only — never a `ChurchCapability`, never the church plan, never
Clerk membership. Church-wide authority stays Clerk-only. See
[CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md](./CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md) §1.
A solo pastor without a church
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
5. **Note templates** *(shipped v2.18.0)* — general feature for every user; see
   [NOTE_TEMPLATES.md](./NOTE_TEMPLATES.md) for the full design. Recommended
   first feature build after the church-org schema groundwork. The sermon
   template (item 6 below) rides these same rails as an org-provisioned
   template — no pastor-specific template UI needed.

## B. Role-gated: pastor/staff tooling

Assigned by role under the church org — never shown to general users.

6. **Sermon note template** *(shipped v2.18.0 — provision it as an org template)* — big idea / outline / application blocks,
   delivered as an org-provisioned `NoteTemplates` row (item 5) scoped to the
   pastor role.
7. **Teaching calendar + Sunday starter** *(shipped v2.19.0)* — staff plan weeks and
   series ahead (date, title, passage, series, and which org template notes start
   from) in the My Church hub. Seeing the plan is `sermon_tools`; authoring it is
   `manage_teaching_plan` (v2.21.0) — a teacher teaches from the plan read-only.
   Congregants see **one** service — the next one — as "This Sunday" on Home, and
   **start a personal note from it** with the passage already a live pill and the
   church's template already in the body. Pairs `sermon-prep` with congregant
   `sermon-notes` without co-editing the pastor's note.

   Shape worth keeping in mind for anything built on top:
   - `ChurchServices`, keyed on `churchId`; **series is a `seriesTitle` column**, not a
     `Threads` row — thread creation in a non-personal space requires the literal space
     owner and non-owners only see the pinned thread, so a series would have been
     invisible to the congregation and orphaned when its author left staff.
     **Superseded by design (Aug 2026, not yet built):** the string becomes its own
     plan-scoped row, `ChurchSeries`, with `seriesId` replacing the column outright — the
     rejection above was of `Threads` as the substrate, not of series as an entity, and
     attaching material at series grain needs the entity. See
     [CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md](./CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md) §9.
   - One service per church per date (unique index) — that is what makes "This Sunday"
     have exactly one answer. **Superseded by design (Aug 2026, not yet built):** the
     plan moves down to the space level, so a ministry channel or church Shared Space
     may carry its own plan (Youth meets Wednesdays). The single index becomes two
     partial ones — one per plan scope — preserving the one-answer guarantee *per plan*
     rather than per church, and Home keeps exactly one card by picking the soonest
     service across the viewer's own sources. See
     [CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md](./CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md).
   - Lineage is `Notes.startedFromServiceId` / `startedFromServiceTitle`, the
     congregant's own row. **No church-facing route reads it**, enforced by a contract
     test. Attaching resources to a service is deliberately still unbuilt — that is
     Resource Library territory (item 11 / `RESOURCE_LIBRARY.md`).
   - `ChurchServices.channelSpaceId` (v2.20.0) front-ran that deferral with a single
     service → channel pointer. It points at a room rather than at material, is stuck
     at service grain because a series is only a string, and puts curation on the
     pastor rather than on whoever made the study. **Decided: the relationship
     inverts** — published material claims the service. Do not extend the pointer;
     see [CHURCH_STUDY_MATERIAL_LINKING.md](./CHURCH_STUDY_MATERIAL_LINKING.md).
8. **Ministry channel publishing** *(shipped v2.18.0)* — staff post curriculum into the relevant
   `type='public'` + `orgId` ministry space (sermon series companion, adult ed,
   students, etc.) before the week; followers read and take *own* notes.
   Publishing is role-gated; following is general once connected.
9. **Quarterly curriculum threads** — staff publish church-wide study
   threads in ministry channels; members copy into their own space (copy-lineage
   preserves attribution). Authoring is role-gated.
10. **Teaching-team prep spaces** — activates `role='leader'`: staff
    co-author prep in a **shared** space (Groups lane); `SpaceInvites.role='leader'`
    is schema-ready. **Scope widened by design (Aug 2026):** leadership becomes
    grantable to a connected congregant, not only to Clerk staff — which also lets a
    volunteer publish to the ministry channel they run, since `canAuthorInSpace` gates
    both. Requires `SpaceMemberships.grantSource` so staff sync stops reaping granted
    rows. See
    [CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md](./CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md)
    §2.2b and P5.
11. **Curriculum handoff** — church master thread in a ministry channel → each
    small-group leader derives a copy into their own shared space with their group.
12. **Aggregate engagement view** *(shipped v2.21.0)* — churches see
    *aggregate* adoption only (N connected, N following the study), never
    individual note content. "Review is never shared" is the privacy
    principle for all church analytics.

    Built to exactly the two numbers above: connected congregants, and followers
    per ministry channel. Admin-only (`manage_staff`) — the narrowest audience
    that makes it useful, since widening later is one line and narrowing is not.
    Never sponsorship-gated: it is a read, and a lapsed church keeps its reads.

    **A count of sermon-started notes was considered and deliberately not
    built.** It is not one of the two numbers this item sanctions, and it would
    be the first church-facing read of `Notes.startedFromServiceId` — which a
    contract test forbids outright. Adding it is a decision about the privacy
    promise, not a feature increment, and needs to be taken as one. See
    [CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md](./CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md) §10.

## Congregant-side surfaces

General users, but only appear once connected to a church. Dark until connect
is decided (v0 is staff-only).

13. **"From your church"** *(shipped v2.18.0)* — Home-level **study feed** from followed ministry
    education channels + sermon-calendar starters +
    `FeaturedItems.contentType='church'`. Not a bulletin / announcements inbox.
    Content gated by connection, not a new UI class for everyone.

---

## Relation to schema groundwork

The `Churches` table, `UserMetadata.connectedChurchId/connectedOrgId/
connectedChurchAt`, org-space semantics in `space-access.ts`, and limit scoping
in `tier-limits.ts` shipped in v2.18.0 — no longer inert. The role gate is
`server/utils/church-role-capabilities.ts`, which derives capabilities
(`publish`, `manage_staff`, `manage_billing`, `manage_templates`,
`sermon_tools`, `manage_teaching_plan`) from the Clerk org role and hands them to
the client as a payload; clients render role surfaces from that payload and never
re-derive from a role string.

`sermon_tools` had no consumer until v2.19.0 — the teaching calendar is the first
feature behind it, and the model for anything else that lands there:
`assertCanManageTeachingPlan` (`server/utils/church-teaching-plan.ts`) proves staff
membership **before** checking sponsorship, so a signed-in stranger never learns
whether a church has lapsed, and fails closed if Clerk is unreachable.

As of v2.21.0 that gate is split in two over one shared ordering.
`assertCanViewTeachingPlan` is the **read** (`sermon_tools`, never
sponsorship-gated); `assertCanManageTeachingPlan` is the **write**
(`manage_teaching_plan`, still 402s on a lapse). That is what makes Pastor and
Teacher different jobs rather than two names for one: a teacher sees the plan and
publishes, a pastor decides what the church teaches and what it writes from.
Two names rather than a mode flag, so the route contract test can tell a read
handler from a write one.

Still design-only: curriculum handoff (11) and aggregate engagement analytics (12).
Operational detail:
[CHURCH_ORG_ONBOARDING_AND_BILLING.md](../CHURCH_ORG_ONBOARDING_AND_BILLING.md).
