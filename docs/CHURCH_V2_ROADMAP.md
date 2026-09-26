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
- **Server:** `server/utils/church-connection.ts` (`connectUserToChurch`, lifted out of
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
- **Planner content becomes published material.** A `kind='content'` entry already reaches
  followers' Home as a card, but its note isn't attached. Next: schedule the entry's note for
  its date, and claim the entry through `ChurchServicePublishedNotes` when it publishes.

## E. Group leader kit

- Leader-only notes and discussion questions on each step of a study plan.
- A per-meeting agenda tied to plan steps.
- Library items that travel with a plan when it is handed to a group.
- A "the source was updated" notice for a group's copy.

There is **no attendance and no RSVP**. That is ChMS work.

## F. Curriculum and taxonomy

- **Tags** for age group, topic and book.
- **Church-wide search**, for staff and for congregants.
- **A plan repository** reusable across years and channels, alongside series re-runs.
- **`thread_ref` and `pack` library items**, which have no writers today.
- **Per-item counts:** opens, copies, "used in N groups". Counts only.

---

## Still out

These are unchanged from V1:
- self-serve church creation and Polar checkout;
- multi-church (`ChurchMemberships`, no writers; the join link deliberately does not write it);
- `ChurchConnectionRequests`;
- ChMS sync;
- unlimited staff (Clerk Enhanced);
- church offboarding;
- a count of sermon-started notes;
- `FeaturedItems.contentType='church'`.
