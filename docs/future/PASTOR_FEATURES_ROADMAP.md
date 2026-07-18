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
- **Church curriculum** = org-owned broadcast spaces: `Spaces.orgId` set,
  `type='public'`. Staff author (owner/leader), congregants follow + copy notes
  into their own Harvous via the existing copy-lineage rails
  (`copiedFromNoteId`/`NoteVersions`).
- **Congregant linkage** = `UserMetadata.connectedChurchId`/`connectedOrgId`,
  set via a future connection-request flow. Connected users see "From your
  church" surfaces and auto-follow church broadcast spaces.
- **Billing** = church pays (draft tiers: Connect free → Study → Study Plus →
  Network), same owner-pays philosophy as the Shared Spaces add-on.
  Org-owned spaces never count against a person's owned-space limit. Review
  stays individual, always.

**The ladder** (product + pricing + marketing aligned):

| Stage | Who pays | Rails | Marketing page |
|---|---|---|---|
| Solo pastor | free | personal spaces, threads, pills, Recall | `/for/pastors` + `sermon-prep` |
| Pastor + team / group leader | leader (Shared Spaces add-on) | `type='shared'` spaces, `leader` role | `/for/group-leaders` |
| Church org | church | `orgId` + `type='public'` broadcast spaces, connection flow | `/for/churches` |

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
org is served by the general-first features below, plus, later, the free
"Church Connect" tier as the role-assignment entry point.

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
7. **Preaching calendar view** — timeline lens over series threads: plan
   weeks ahead, see the year. A view, not a data-model change.
8. **Broadcast publishing** — "This Sunday at [church]": pastor posts the
   passage list + outline to the church's `type='public'` space before
   Sunday; congregants follow and take their *own* notes alongside (pairs
   `sermon-prep` with the existing `sermon-notes` use case). Publishing is
   role-gated; following is general.
9. **Quarterly curriculum threads** — staff publish church-wide study
   threads; members copy into their own space (copy-lineage preserves
   attribution). Authoring is role-gated.
10. **Teaching-team prep spaces** — activates `role='leader'`: staff
    co-author prep in a shared space; `SpaceInvites.role='leader'` is
    schema-ready.
11. **Curriculum handoff** — church master thread → each small-group leader
    derives a copy into their own shared space with their group.
12. **Aggregate engagement view** (later, carefully) — churches see
    *aggregate* adoption only (N connected, N following the study), never
    individual note content. "Review is never shared" is the privacy
    principle for all church analytics.

## Congregant-side surfaces

General users, but only appear once connected to a church.

13. **"From your church"** — Home-level section fed by the connected
    church's broadcast spaces + `FeaturedItems.contentType='church'`
    (church-curated VOTD / featured study). Not a new feature class for
    general users — it's content, gated by connection, not UI complexity.

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
