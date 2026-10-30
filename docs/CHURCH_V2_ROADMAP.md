# Church V2: Roadmap

**As of September 26, 2026.** Lanes A, B, C and D are built and on `main` (#199, #202). What comes after [CHURCH_V1_SCOPE.md](CHURCH_V1_SCOPE.md), and
in what order. V1 is the loop: a church registers, its staff publish into ministry channels,
and congregants follow them, read "From your church" and take a study plan into their own study.
This doc is the plan for turning that loop into the place a church runs its ministries'
teaching: where its material is written, organized, handed to leaders, and practised.

Where this doc and the code disagree, the code wins and this doc is stale. Each lane below
names the files it would touch so the claim can be checked.

## Where V1 leaves a church

An audit on September 25, 2026 (three passes over authoring, structure, and the design docs)
found **publishing tools on a flat structure**:

- **Getting people in is hard.** A congregant has to find Settings › My Church, search a
  directory, connect, and then choose channels. There is no link, code or QR a church can hand
  out, and no page that shows the church before sign-up.
- **Nothing is the church's own to practise.** Review draws only on the reader's own notes,
  highlights and Scripture. A church can publish a study but cannot give its people anything
  to come back to.
- **There is no ministry.** A "ministry" is one channel (`Spaces.type='public'` + `orgId`).
  A group pairs with at most one channel (`ChurchSpaceChannelLinks`). Staff sync makes every
  staffer a leader of every org space (`church-staff-sync.ts`), and every connected congregant
  can see every channel.
- **There is no content lifecycle.** No draft, review, scheduled or archived state on channel
  material. There is no approval step (every staff role holds `publish`), and no church-wide
  list of what has been published. Versions and co-editing belong to the author, and only in
  shared spaces.
- **Leaders get only the steps.** A study plan handed to a group copies step titles and bodies
  (`study-plan-copy.ts`). No leader notes, discussion questions, agenda or resources come with
  it.
- **There is no taxonomy or church-wide search.** Tags are per person; search is per person
  and per space. `LibraryItemScopes.ministryKey` exists, and writes to it are refused.

## Order

Decided with Derek on September 25, 2026:

1. **A. Reach: the join link and QR code.** It is the smallest build, it is the biggest
   barrier for a pilot church, and every new congregant it brings in is a new Harvous account.
2. **B. Church Review.** This is the reason a church buys the Church plan.
3. **C. Ministries.** The structure a church with many ministries needs.

Lanes D, E and F follow, in an order to be set once A–C have met real churches.

## What stays true

These carry over from V1 and bind every lane below:

- **Not a ChMS.** No giving, check-in, volunteer scheduling, facilities or CRM.
- **No bulletin.** Channels carry study material, not announcements.
- **How many, never who.** A church sees counts. It never sees a person's notes, their
  Review items, or their answers.
- **Congregants never join the Clerk organization.** The organization is the staff roster, at
  most 20 seats, and it is where roles live. Congregants have ordinary Harvous accounts and link
  to their church through `UserMetadata.connected*`, which is what lets a church of 2,000
  connect everyone.
- **Connecting never follows everything.** A person chooses their ministries.
- **No generative AI for study content** (`AGENTS.md`). Suggestions come from fixed templates
  over the church's own passages. Every answer key is Scripture or the church's own words, and
  it is held on the server.
- **"Scheduling" as an anti-goal** (`schema.ts`, the `Churches` docblock) means service and
  volunteer scheduling, which is ChMS territory. **Publishing at a set time is not that**, and
  Derek approved it for lane D.

---

## A. Reach

**A1, the join link and QR code (built, #199).** One live link per church, carrying an
unguessable token (the church list stays private, so there is no slug). The link:

1. shows the church and its channels before sign-up;
2. carries the visitor through sign-up and back again;
3. connects them to the church;
4. lets them choose channels.

Staff copy the link or download the QR as SVG or PNG for bulletins and slides. An admin can
rotate or revoke it. The hub shows "N joined via link", a count only.

- **Table:** `ChurchJoinLinks`.
- **Server:** `server/utils/church-selection-write.ts` (`connectUserToChurch`, lifted out of
  `update-church` so both paths write a connection the same way) and
  `server/routes/church-join.ts`.
- **Page:** `/churches/join/$token` (`PublicJoinChurchPage.tsx`).
- **Hub:** `PrototypeChurchJoinLinkSection.tsx`.
- **Guests:** the page parks the token and picked channels through sign-up and connects once on
  return (`pendingChurchJoin`).

**Later in A:**
- **Invite-as-leader.** `SpaceInvites.role` is always `member` today.
- **Opt-in weekly email digest** of "New from your church". Approved. There is no church email
  at all today; push is the only channel out.
- **Public church and channel preview pages.** Only the study-plan outline is public today
  (`/api/shared/thread-plan/:shareToken`).
- **Native.** Universal links for `/churches/join/*`, and a church connect in the app, which
  today sends only free-text church fields.

## B. Church Review

**The split.**
- **Church plan:** church-authored review exercises, free to anyone connected who follows the
  channel they are published in.
- **Plus:** review of your *own* study.

Church review never grants Plus. A congregant without Plus sees their church's exercises in the
Review dock and section, and adding their own notes to Review stays a Plus action.

**This refines "Review is never shared"; it does not reverse it.** What stays private is a
person's Review: their items built from their own notes, their schedule, and their answers.
What a church gets to share is the *question*. The church-purchased "Review seat packs" in
older docs are superseded by this.

**B1, v1 (built, #199).** Three kinds:
- **Suggested passage exercises.** Harvous suggests the passages cited in a channel's notes and
  in the services and series they belong to. Staff keep or dismiss each one. Congregants get the
  existing verse and chapter ladders.
- **Staff-written multiple choice.**
- **Staff-written ordering and matching.**

Where each piece lives:
- **Tables:** `ChurchReviewExercises` (the definition), plus `ReviewItems.churchExerciseId`
  (each person's own copy, created lazily and never fanned out on publish).
- **Access:** `server/utils/review-access.ts` returns `full`, `church` or `none`, and replaces
  `requireFeature('review')` on the read and answer routes. It is **never** a `church_seat`
  entitlement, because that would grant all of Plus.
- **Delivery:** `server/utils/church-review-delivery.ts`, which has its own daily cap so church
  items cannot crowd a sitting.
- **Staff routes:** `server/routes/church-review.ts`. Writing, publishing and taking down need
  the staffer to lead the channel (`staffLeadsChannel` in `server/utils/church-review-access.ts`),
  so a ministry-scoped teacher writes only their own ministry's questions.

**What staff see:** "Answered by N", with nothing shown below five people. No per-person data
and no correctness figures.

**Later in B:**
- Exercise sets grouped by series, with a season's start and end (see `HARVOUS_4.md`).
- A church adopting a public Challenge season. This depends on `Challenges` being released,
  which is withheld today.

**Open question:** does church Review change the Church price? It is $30/mo or $216/yr in
`src/lib/billing-plans.ts`, and nothing has been sold at that price.

## C. Ministries

**C1, the entity and staff scope.**
- **Data:** `ChurchMinistries` and `ChurchMinistryStaff`, plus `Spaces.ministryId`.
- **Who is scoped:** admin, pastor and coordinator are always church-wide. A teacher or plain
  staffer can be scoped to one or more ministries, and then leads only those ministries'
  spaces.
- **Staff sync** (`computeStaffSyncPlan` in `clerk-org.ts`) gains the scope. Someone with no
  assignment is church-wide, which is today's behaviour.
- **New rule:** creating a space runs a targeted sync. Today a new space waits for the next
  Clerk webhook before staff can lead it.

**C2, the screens.** A Ministries section on the hub, a "Leads" row on each staff member, and
hub lanes grouped by ministry. The ministry picker and the join page offer ministries instead
of loose channels.

**C3, restricted channels (approved).** `Spaces.audience` is one of:
- `church`, the default;
- `ministry`: members of that ministry's groups, its leaders, and staff;
- `leaders`: leaders of that ministry's spaces, and staff.

**The gate is the reaper.** About fifteen read paths treat a `member` row as access, so a
restricted channel removes the member rows of people outside its audience. Patching each reader
would miss one. This narrows church Review delivery too, with no further change.

**Built (Sept 25 2026, branch `claude/church-content-management-1cba4b`):** C1–C3 as above, with
these specifics:
- **Screens.** The staff screen is an expanded tool, `PrototypeExpandedMinistries`, beside Team
  in the hub. The "Leads" row lives in its editor pane, not on the member sheet. The create
  sheets ask which ministry, and a scoped teacher sees only their own.
- **Staff in an audience.** "Staff" means whoever leads the channel, which is what the staff sync
  grants. A teacher scoped to another ministry is outside a restricted channel.
- **Reconciling.** Member rows are reconciled in three places:
  - on an audience change, after a dry-run count;
  - on any assign-space, across the whole church;
  - lazily on the viewer's own reads: `/channels`, `/feed`, church push, and the church Review
    refill. That covers someone who leaves a qualifying group.
- **The join link** offers only `church`-audience channels.
- **Unfollow** is never gated.
- **Production.** Needs `npm run church-ministries:schema:apply -- --production` before deploy.

**Later in C:**
- **Volunteer ministry leads.** A separate `ChurchMinistryGrants` table, never
  `ChurchMinistryStaff`.
- ~~**Library items scoped to a ministry**~~ — built (Sept 26 2026): `scopeKind='ministry'` with
  `ministryKey` = a live `ChurchMinistries.id`. It reaches anyone in one of the ministry's groups
  or following one of its channels, and shows on every room in the ministry like an org-wide
  default (a room can still unpin it).
- **An opt-in group directory** so congregants can find a ministry's groups.

## D. Content lifecycle

**Built (Sept 25 2026, #202): publish at a set time, approval before publish, and a Content
list.**

- **The one rule:** a note is live in a channel exactly when it has a `SpaceNotes` row, and
  about thirty readers rely on that. So nothing waits as a half-live row. Material that is
  scheduled or waiting for approval is a `ChurchContentSubmissions` row. The note stays in its
  author's My Home until it goes live through the ordinary publish
  (`associateAuthoredNoteWithSpace`, as the author).
- **Statuses:** `in_review`, `scheduled`, `published`, `declined`, `withdrawn`, `failed`
  (`server/utils/church-content.ts`).
- **Publish at a set time:** a five-minute tick on the Fly process (`runChurchContentTick` in
  `server/scheduler.ts`), not hourly, so "Sunday 8:00" means 8:00. Each submission is claimed in
  the same transaction as its publish.
- **Approval:**
  - `Churches.contentApproval` is off by default and set in Church settings.
  - When it's on, anyone without `review_content` submits instead of publishing. That is
    teachers and plain staff; admins, pastors and coordinators hold the capability.
  - `add-note` and create-into-channel refuse them with `CONTENT_APPROVAL_REQUIRED`.
  - Approval is church-wide only: a ministry-scoped teacher never holds `review_content`, so
    there is no approval by a ministry lead.
- **Content list:** a hub tool (`PrototypeExpandedChurchContent.tsx`) listing what needs your
  approval, what's waiting, scheduled, came back and recently published. Its pane has approve
  (optionally for a time), decline with a note, reschedule, publish now and unschedule.
- **Scheduling from the note:** a clock beside each church channel in the note's destination
  menu.

**Still open in D:**
- A server-side draft state and an archived state.
- Bulk actions and per-item counts in the Content list.
- Filtering the list by ministry.
- Native handling of `CONTENT_APPROVAL_REQUIRED`; all native church work is deferred.
- ~~Planner content becomes published material.~~ Built (#206): a submission carries the
  entry's `serviceId`, and publishing claims it through `ChurchServicePublishedNotes`.

## E. Group leader kit

**Built (Sept 26 2026).** Four tables, all leaders only (schema: `npm run leader-kit:schema:apply`):
- **Step guides** (`StudyPlanStepGuides`): notes and discussion questions on each step.
- **Agendas** (`GatheringAgendas`): one per gathering, with lines, optional minutes and a total.
  "Add discussion questions" copies in the current step's questions.
- **Resources that travel** (`StudyPlanLibraryItems`): library items attached plan-wide or per step
  on a church channel's plan.
- **"Your church updated this plan"** (`StudyPlanCopyBaselines`): fingerprints of what each
  source step said when copied.

How it behaves:
- **One gate.** `canUseLeaderKit` is the rule that already gates a plan's `pulse`
  (`canManageSpaceThreadStructure`), on its own endpoint (`GET /api/threads/:id/leader-kit`).
  Member-facing reads never touch the kit tables.
- **The agenda is gated on leading the room**, not on the plan gates, so a granted volunteer runs
  their own meetings.
- **Kit carry (Derek):** a copy carries guides and resources only into a church room of the
  channel's own church. Home and churchless groups get steps only.
- **Resources and scopes.** An item already scoped to some rooms gains the group's scope. An
  org-wide item never gets one, because a first space scope would narrow it.
- **Source updates (Derek).** Leaders can add new steps in place, after their nearest earlier step,
  idempotently under a locked baseline. Changed steps can only be opened ("Open the church's
  version") or marked seen; the group's copy is never overwritten.
- **Also fixed:** a granted group leader could see a leaders-only library item on the shelf but got
  a 404 opening it.

There is **no attendance and no RSVP**. That is ChMS work.

**Later in E:**
- Group leaders attaching their own resources to a copy.
- Merging or overwriting upstream edits, and steps removed upstream.
- Plan-level leader notes.
- Printing an agenda, or showing it in the staff planner.
- Guides for copies made before this shipped.
- Rich-text guides.
- One copy per group rather than per person (the `Threads_copiedFromThread_unique` index).

## F. Curriculum and taxonomy

- **Tags** for age group, topic and book.
- **Church-wide search**, for staff and for congregants.
- **A plan repository** reusable across years and channels, alongside series re-runs.
- **`thread_ref` and `pack` library items**, which have no writers today.
- **Per-item counts:** opens, copies, "used in N groups". Counts only.

---

## G. Pilot readiness and Here's My Church

**Built Oct 29 2026, on branch `claude/church-features-hmc-api-2223f6`, not merged.** The aim is one
real church running on Harvous. The plan file is `~/.claude/plans/i-really-want-to-dazzling-pebble.md`.
Schema: `npm run church-pilot:schema:apply`, **applied to production Oct 29 2026**. It adds three
new tables and no column on any existing table, so the code also runs safely without it.

**Hardening.**
- One lapse policy (see CHURCH_ORG_ONBOARDING_AND_BILLING.md).
- "Add 30 days" now adds to the current end.
- The hub reads the plan state of the church being managed, not the staffer's home church.
- A native re-save of the current directory church changes nothing; it used to clear
  `hmcChurchId` and drop every follow.
- A timeout on the HMC add call.
- The HMC sync keeps a registered church's directory link when the listing disappears, and reports
  it.
- A "Share your join link" setup step, and a "Following N channels · Nothing posted yet" row.

**Your service** (`ChurchServiceChoices`, `church-service-choice.ts`). A congregant may choose
one service, stored as day + time (a natural key, not a row id).
- Where the times come from: the church's `ChurchServiceTimes`, or its Here's My Church listing
  when the church isn't on Harvous yet.
- What a choice drives: This Sunday shows that service's time; the church push stays quiet from
  30 minutes before to 90 minutes after it; staff see a per-service headcount in Engagement (one or
  two people read "A few"); and the ministries that meet during it come first. They are labelled,
  never preselected.
- Staff tag what meets during a service in church settings (`ChurchServiceTimeSpaces`).
- Asked in Settings › My Church, and on Home in the empty-feed slot.

**Church sign-up, request then approve** (`ChurchApplications`).
- Staff go to `/churches/start` (for harvous.com to link to), then Settings › My Church, pick their
  church, and send a role and email.
- Approving it in `/admin/churches` › Churches asking to join:
  - creates the Clerk organization with the applicant as admin;
  - registers the church with a 30-day pilot;
  - seeds service times from the HMC profile;
  - connects the applicant.
- Everyone who had already picked the church connects on their next load.

**Here's My Church.**
- HMC branch `claude/partner-church-profile` adds `GET /v1/churches/:id/profile`: structured
  service-time slots, contact, ministries, languages and campuses.
- Harvous calls it through `hmcGetChurchProfile`, which degrades to null until that branch is
  deployed.
- Trusted write-back without review is a contract sketch in HMC's `docs/future/public-api.md`,
  written for the hackathon; it is not built. It needs the consensus tie-break fix first.

**Not done here:**
- the join page doesn't ask for a service;
- there is no "From this morning's sermon" push copy (only the quiet window);
- no email to applicants (concierge reaches out by hand);
- service times don't write back to HMC (that's the hackathon).

## Still out

These are unchanged from V1:
- ~~self-serve church creation~~ (request then approve, Lane G) and Polar checkout;
- multi-church (`ChurchMemberships`, no writers; the join link deliberately does not write it);
- `ChurchConnectionRequests`;
- ChMS sync;
- unlimited staff (Clerk Enhanced);
- church offboarding;
- a count of sermon-started notes;
- `FeaturedItems.contentType='church'`.
