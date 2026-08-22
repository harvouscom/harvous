# Shared Spaces, the Planner, and Where a Gathering Shows Up

**Status:** **Decided** (August 21, 2026) — Option B, with placement and bounds settled; see
[Option B in detail](#option-b-in-detail). Most of what this item originally asked for was already
built, **including the placement itself**: Home already draws a row per context, on the four-day
wall, sorted soonest-first. What remains is a server change with an authorization question in it —
see [Correction, August 21, 2026](#correction-august-21-2026--the-placement-already-exists). Read
that before the roadmap below, which still describes the placement as work to do.
**Last Updated:** August 21, 2026
**Audience:** Whoever decides how a room's rhythm reaches the people in it.
**Covers:** improvement-list item #1 (shared spaces + planner + "add gathering") — design-track
item D-6. The plan flagged this one as needing a product conversation before design; the
conversation it needs turns out to be much narrower than the item implies.

---

## Executive summary

**This item is largely out of date, and saying so is most of its value.** The church and planner
layer moved substantially between the improvement list being written and now. Nearly every piece
D-6 was framed around has since shipped, and re-proposing them would be re-deciding settled
questions.

What survives is one asymmetry, and it is a real product question:

> **A church's next service reaches Home. A room's next gathering does not.**
> `PrototypeHomeThisSunday.tsx` puts the church's service on Home with one tap into notes on it.
> A shared space's gathering appears only inside that space
> (`PrototypeSpaceComingUp.tsx`, rendered from `PrototypeSidebarSharedSpaceView.tsx:854`). Someone
> in three groups that all meet this week is told about none of them until they visit each room
> in turn — while the church they merely follow gets a card on the front page.

**Recommendation: Option B — a room's next gathering reaches Home on the same terms the church's
does, bounded by the four-day wall rather than by a count.** The doctrine already in force is
"one next gathering per context you joined, never a schedule of any context"
(`CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md` §1). A room you joined is such a context. The wall is
what keeps several of them from becoming a calendar, and it is a rule the codebase already has.

---

## First: what the item asked for, and what is already true

Each row below was checked against `main` rather than against the earlier assessment, because
several of that assessment's findings have since been closed.

| The premise | What is actually true |
|---|---|
| "Add a gathering" is a feature to design | It is one of **three labels for one create action**. `planVocabulary()` (`spa/src/lib/church-services.ts:509`) returns "Add a sermon" (church plan), "Add a study" (channel), or "Add a gathering" (a room that meets). `planKind` is server-derived from the space, never chosen by the client. |
| Rooms retype the date of every gathering | `rhythmDates()` (`church-services.ts:383`) offers the next six dates from the room's declared rhythm, wired into the entry editor (`PrototypeSermonEditorFields.tsx:181`). It offers dates; it does not schedule or recur, and its own comment says so. |
| Only church rooms can plan | A churchless shared space can hold a plan, and the Planner row appears in its own view for whoever can manage it — with the reasoning recorded inline: "otherwise the one person who could plan the first gathering is the one person who cannot find where" (`PrototypeSidebarSharedSpaceView.tsx:380-400`). |
| Only staff can see the plan | The read is membership-gated. Members of the room see what it is on, and get the same one tap into notes that the church card gives (`PrototypeSpaceComingUp.tsx`). |
| Connecting to a church should auto-follow its channels | Considered and **deliberately declined**. `PrototypeMinistryPicker.tsx` exists instead — a congregant chooses which ministries they are part of. The comment there names auto-follow-all as the obvious fix and says why it was refused. |
| The public study-plan preview is a phantom endpoint | It has a client now: `PublicSharedThreadPage.tsx:133`. |
| Study plans are undocumented | `docs/future/STUDY_PLANS.md`. |

Two anti-goals are load-bearing and should survive any change here, because both were arrived at
the hard way:

- **Nothing fires on a clock.** `schema.ts:47-51` states it directly for `meetingDay` /
  `meetingTime` / `publishCadence`: they are display and defaults, and "whoever runs the room
  still enters every gathering by hand." `rhythmDates` sits deliberately just underneath that
  line — it removes the retyping without introducing recurrence, exceptions, cancellations or a
  scheduler.
- **Never a schedule.** One next thing per context, never a list of a context's dates.

---

## The alternatives for the remaining gap

| Option | Verdict | Trade-off |
|---|---|---|
| A. Leave it — a room is a place you go | Defensible | The asymmetry stands: a church you follow outranks a room you joined, which is backwards |
| **B. Room gatherings reach Home, bounded by the four-day wall** | **Recommended** | Reuses an existing rule and an existing card shape; a week where several rooms meet does produce several rows |
| C. One combined "this week" row | Not recommended | Collapsing several rooms into one row is a schedule wearing a single card, and loses the one-tap-into-notes that makes the church card useful |
| D. Fold into Suggested | Not recommended | A gathering you committed to is not a suggestion, and the shelf's cooldowns would let you "not now" an actual commitment |

---

## Option B in detail

**Goal:** the front page tells you what you have committed to this week, on the same terms
whatever kind of room it is.

**Build:**
- Reuse `useSpaceComingUp` per joined gathering space, or add one aggregate read — the endpoint
  is already membership-gated, so no new authorization question.
- Render with the existing card shape. `PrototypeHomeThisSunday` is the precedent and should be
  the pattern, not a second design: same one-tap-into-notes, same eyebrow grammar.
- **Bound by the wall, not by a count.** `SERVICE_GRACE_DAYS = 4` already governs both how long a
  past service stays visible and how far ahead the church card looks, and it is not arbitrary —
  its comment ties it to the engagement research behind harvous.com/about, and says outright: do
  not tidy this number. A room whose next gathering is nine days out simply does not appear.

### Correction, August 21, 2026 — the placement already exists

Checked against `main` before building, and the brief above is wrong about where the work is.

**Home already renders a row per space context.** `PrototypeHomeThisSunday.tsx` was amended in
August 2026 to draw "the church row, plus a row per context you belong to", and `selectHomeCards`
(`spa/src/lib/church-services.ts:252-287`) already does everything this doc recommended: it groups
services by source, emits a context row per space, applies the four-day grace window *and* a
look-ahead bound, and sorts contexts soonest-first. The placement decision was already
implemented — for church-org spaces.

**The gap is that the data source is church-scoped, three times over:**

| Where | What it does |
|---|---|
| `useChurchSermons` (`spa/src/hooks/queries/useChurchSermons.ts:32-44`) | The query is `enabled` only when `profile.connectedOrgId` is set. Deliberately: an always-on church call for the majority with no church would be a real regression. |
| `GET /api/church/services` (`server/routes/church.ts:461-466`) | `if (!church) return c.json({ connected: false, services: [] })` — a hard early return. |
| `listViewerPlanSources` (`server/utils/church-teaching-plan.ts:187-214`) | Joins memberships to spaces `where Spaces.orgId = orgId`, then filters to `isChurchOrgSpaceRow`. A plain shared space is excluded even for a connected viewer. |

So a churchless shared space that meets on Tuesdays is invisible to Home twice: the query never
fires, and the endpoint would not return it if it did.

**Which makes the work server-side, not a Home placement change.** Revised shape:

- Let the endpoint answer for a viewer with no church — the early return has to go, and the two
  space queries need a path that is not scoped by `church.id` / `orgId`.
- Widen `listViewerPlanSources` past `isChurchOrgSpaceRow`, or give it a sibling for plain shared
  spaces. This is the authorization-sensitive part and deserves the care: it decides which spaces'
  plans a viewer may read, and it is currently answered by an org filter that would no longer
  apply.
- Find a cheap client signal for "this viewer belongs to a space that could have a plan", so the
  gate can be relaxed without reintroducing the always-on call the current gate exists to prevent.
  That reasoning is sound and should survive.

**None of the decisions in this doc change** — the four-day wall, one group soonest-first, one
card for everyone. They are already how the existing context rows behave, which is a good sign
they were the right calls. Only the estimate moves: this is a server change with an authorization
question in it, not the placement change the brief describes.

---

**Why no cap:** a cap hides a gathering you agreed to attend, which is worse than a busy Monday.
If someone is in five rooms that all meet Tuesday, five rows on Tuesday is *true* — and the wall
means it is Tuesday's problem, not every day's.

**Reuse:** the card, the wall, the membership-gated endpoint, and the note-seeding path all
already exist. This is a placement decision, not a new surface.

**Placement — one group, soonest first.** The church's service and a room's gathering interleave
in a single "Coming up" group ordered by date, rather than the church keeping a card of its own
above a separate room list. One idea — what is next — instead of two lists to scan for the same
kind of thing. This is the half that makes it a decision about Home rather than an addition to it:
"This Sunday" stops being its own furniture and becomes the church's row in a group it shares.

**One card for everyone, leader or member.** A leader already reaches the Planner from the room
itself, so Home does not need a second affordance, and a role-conditional card state is a class of
bug this codebase has hit before. The tempting version — "you lead this and next week has no entry
yet" — is a real idea and deliberately deferred: it is a second state to design, test and keep
honest, and it can be added later without disturbing anything decided here.

**Done when:** a member of a churchless shared space that meets this week sees it on Home,
gets one tap into notes on it, sees it ordered against the church's service by date rather than by
kind, and sees nothing at all in a week the room does not meet.

---

## The question that was genuinely Derek's — answered

Everything above followed from one call, and it was the product conversation the plan flagged:

> **Is Home a place that tells you what is next across every context you are in, or is it your
> own study and nothing else?**

**Answered August 21, 2026: the former.** Home tells you what is next across the contexts you are
in. Today's hybrid was uneven rather than principled — the church got a card, rooms did not, and
the difference traced to build order — and this resolves it in the direction that keeps both.

The alternative was live and was rejected deliberately, which is the part worth recording: "Home
is yours alone" would have meant **removing** the This Sunday card, not merely declining to add
siblings to it. It was put that way when the call was made, so nobody later reads "we chose to add
gathering rows" as the whole of the decision. The decision is that Home is a cross-context front
page, and the rows follow from it.

---

## Risks / watch-items

- **Fifteen docs already cover this area** and several carry status lines that are now wrong —
  the Aug-16 audit found `CHURCH_STUDY_MATERIAL_LINKING.md` claiming "not built" when the
  `ChurchServicePublishedNotes` table (`schema.ts:1983`) said otherwise. That audit's own citation
  for it has since drifted by fifty lines, which is the argument for citing symbols alongside
  line numbers. Anything landing here should correct the status line of the
  doc it touches rather than adding a sixteenth description of the same system.
- **`SPACE_MEETING_RHYTHM_AND_CALENDAR.md` owns the adjacent questions** — multiple meeting days,
  in-person/online, timezone, calendar export — and explicitly does *not* cover this one
  ("nothing here schedules, reminds, or recurs"). Keep the boundary: that doc is about the
  rhythm's shape, this one is about where the rhythm is seen.
- **Home is already busy.** Continue, Suggested, This Sunday, From your church. Adding a row type
  needs checking against a populated fixture, not an empty account.
- **`kind='content'` still has the weaker output.** A channel's plan promises that attaching a
  study to a service makes the congregation find it; the attach-at-publish control and the
  congregant read path were the open half of that inversion. Out of scope here, but it is the
  other place the planner writes rows whose destination is thin.
- **No native equivalent.** The church hub and space views exist natively in part; a Home
  gathering row would need a Swift answer, unlike the reader work.

---

## Related docs

- `docs/future/CHURCH_SPACE_PLANS_AND_SERVICE_TIMES.md` — the parent decision, and §1's doctrine
- `docs/future/SPACE_MEETING_RHYTHM_AND_CALENDAR.md` — the rhythm's shape; deliberately not this
- `docs/future/SPACE_MODES_PRODUCT.md` — what a space *is*, and the ownership rules
- `docs/future/STUDY_PLANS.md` — what a plan becomes once it is published
- `docs/future/CHURCH_STUDY_MATERIAL_LINKING.md` — the `kind='content'` output, still half-built

---

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-08-21 | **Home is a cross-context front page.** A joined room's next gathering reaches Home on the same terms the church's service does. | Derek's call. The asymmetry was build order rather than intent — a context you merely follow outranked one you committed to. The coherent alternative (Home is yours alone, and This Sunday is *removed*) was put on the table and rejected deliberately. |
| 2026-08-21 | **Bounded by the four-day wall, no cap.** | `SERVICE_GRACE_DAYS = 4` already governs the church card and is tied to the engagement research behind harvous.com/about. A cap would silently hide a gathering someone agreed to attend; the wall means a busy Tuesday is Tuesday's problem and not every day's. |
| 2026-08-21 | **One "Coming up" group, soonest first** — church service and room gatherings interleaved by date, not separated by kind. | One idea rather than two lists for the same kind of thing. Means "This Sunday" stops being its own furniture and becomes the church's row in a shared group. |
| 2026-08-21 | **Corrected: the placement is already built; the remaining work is server-side.** No decision above changes. | Checked against `main` before building rather than after. `selectHomeCards` already emits a context row per space on the four-day wall, soonest-first — the recommendation had been implemented for church-org spaces. The gap is a church-scoped data source in three places, one of which (`listViewerPlanSources`) decides which spaces' plans a viewer may read. That the existing rows already behave the way this doc argued for is the best evidence the calls were right. |
| 2026-08-21 | **One card for everyone; no leader variant.** | A leader reaches the Planner from the room itself. A role-conditional card state is a class of bug this codebase has hit before. The "you lead this and next week is empty" cue is a good idea, deferred rather than rejected — it can be added later without disturbing anything above. |
