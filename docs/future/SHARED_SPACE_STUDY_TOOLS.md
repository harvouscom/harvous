# Shared space study tools — what each role actually gets

**Status: a map of what exists (Sep 2026), plus a ranked list of what does not.**

> **Read with care on `main`.** This doc and the six gap fixes it describes as closed landed on the
> `new` branch in commit `2f05f597b` (Sep 2 2026), which was never merged to `main`. On `main` the
> gaps marked ~~fixed~~ below are still open — in particular gap 3, so "owner or leader" in a
> churchless room still means "owner". The suggestions doc it links to was built on `main` with
> that in mind. Merge the commit, or re-do the fixes, before trusting the capability table here.

Fifteen docs in this folder describe pieces of shared spaces. None of them answers the
question a person actually asks — *what can I do in this room, and what can the person who
runs it do that I cannot?* — so the same audit keeps being run from scratch, and three
docs' status lines were found stale the last time it was.

This one is deliberately **not** a sixteenth description of the systems. It is a capability
table and a gap list, and it cites the symbol that decides each row alongside the line
number, because the last audit's own citations had drifted fifty lines by the time anyone
read them.

**Corrections this doc made when it landed:** `SHARED_SPACES_LAUNCH_STRATEGY.md` still
listed shared highlight annotations and group study threads as the unbuilt Tier-1
differentiators; both shipped. `STUDY_PLANS.md` said in one section that there is no
completion state and in the next that completion was built in August; the first was stale.

---

## The shape of a room

There is no `isSharedSpace` column. A room's kind is `Spaces.type` × `Spaces.orgId`, and
the four combinations behave differently enough that "shared space" alone is not a useful
subject:

| Kind | Discrimination | Who authors |
|---|---|---|
| Personal space | `type='personal'` | the owner |
| **Personal Shared Space** | `type='shared'`, no `orgId` | any member |
| Church Shared Space | `type='shared'` + `orgId` | any member |
| Ministry channel (broadcast) | `type='public'` + `orgId` | owner + leader only |

Roles are `owner | leader | member` on `SpaceMemberships.role`, ranked by `ROLE_RANK`
(`server/utils/space-access.ts`). The owner holds a membership row *and* is
`Spaces.userId` — and those are not the same authority: `isActualSpaceOwner` checks the
column, `role === 'owner'` checks the row, and a few gates deliberately use the stricter
one.

The rest of this doc means **Personal Shared Space** unless it says otherwise — the stated
launch audience, "small co-study groups."

---

## What each role gets

| | Owner | Leader | Member | Decided by |
|---|---|---|---|---|
| Compose notes into the room | ● | ● | ● | `canAuthorInSpace` — `shared` returns true for every role |
| Co-edit a note ("pass the pen") | ● | ● | ● | `SpaceNotes.coEditEnabled`, per-note, **the author opts in** — `canEditNoteAsCollaborator` |
| Annotate anyone's note | ● | ● | ● | `study-threads.ts` unions every member's entries; `mapUnionedRows` attributes them |
| Reply to someone's annotation | ● | ● | ● | `HighlightDockWeb` `onReply` — a new annotation on the same anchor, **not** gated on `readOnly` |
| Remove an annotation | own + any on your note + any in the room | own + any on your note | own + any on your note | `canModerateStudyThreadEntry` |
| Walk the pinned study plan | ● | ● | ● | `listGroupStudyThreadsForSpace` |
| See its own progress / mark it finished | ● | ● | ● | `PrototypeThreadPlanProgress` — takes no role at all, by contract |
| Close the run for the room | ● | ● | ○ | `canManageSpaceThreadStructure` |
| See the room's *other* Threads | ● | ● | ○ | `availableThreads = canManageThreads ? … : []` |
| Start / rename / pin a Thread | ● | ● | ○ | `canManageSpaceStructure`; the create sheet is stricter still — `if (!isOwner) return null` |
| Read the room's plan | ● | ● | ○ | `resolveSpacePlanAccess` — `canManageSpaceStructure`, **narrowed Sep 2026** (gap 2) |
| Change the plan | ● | ● | ○ | same, `spaceLaneWrite` |
| "Coming up": the gathering, a note, **and the passage** | ● | ● | ● | `GET /api/church/spaces/:id/coming-up`, gated on membership alone |
| Space Library shelf | curate | curate | read | `assertCanManageSpaceLibrary` — the server's verdict, shipped as `canManage` on the payload |
| Space scripture index, scoped search, space-scoped study feed | ● | ● | ● | `StudyFeedScope.kind === 'space'` |
| Pin a note | ● | ○ | ○ | `canPinSharedSpaceItem` — *"pinning is moderation"* |
| Invite links: create / copy / revoke | ● | ○ | ○ | `minRole: 'owner'` + `type === 'shared'` + the add-on |
| Roster | full | stripped | stripped | `serializeSpaceMemberForViewer` |
| Remove a member | anyone | self | self | hand-rolled `space.userId === auth.userId` |
| Grant leadership | ● | ○ | ○ | `assertCanGrantSpaceLeadership` — two lanes; a granted leader can never grant |
| Settings, cover, meeting rhythm | ● | ○ | ○ | `PrototypeSpaceSettingsSection` |
| See who else is in the room | ● | ● | ● | `useSpacePresence` — rooms that gather only, never a channel |
| Rest the room's passage card | ● | ● | ● | `RecallEvents.spaceId` + the space-keyed cooldown store; suppression never crosses rooms |

The **Tools** popover in the room's header (`proto-tools-registry.tsx`) is where a room's
tools are reached. It holds two rows today — Library and Planner — against the church hub's
six. Both appear for a member once there is something to see, and for whoever curates them
while still empty, *"otherwise the one person who could plan the first gathering is the one
person who cannot find where."*

---

## The gaps, ranked

All seven were found in the Sep 2026 audit. Six are closed and the seventh is half closed;
what each one taught is kept, because the *shape* of these failures recurs even when the
instance does not — most often a decision that was made on the server and never reached a
screen.

**1. ~~The member's half of a study plan never closes.~~ Fixed.**
`POST /api/threads/:threadId/complete` shipped built and contract-tested with **zero
clients**; `viewerCompletedAt` was fetched, parsed, and rendered nowhere; and
`useCloseThreadRun`'s docblock named a hook — `useCompleteThreadPlan` — that did not exist.
A server-side decision is not shipped until something calls it.

**2. ~~A church room's members are locked out of the plan their own room keeps.~~ Resolved
by narrowing the other side.** Two rooms of identical shape answered a member differently
depending on whether a church sat behind one. Derek's call was to make the churchless case
match the church one rather than widen the church one: a plan holds undated backlog rows,
which are the room's intentions and not yet anything it has committed to. The space lane's
*read* is now `canManageSpaceStructure`, and what a member keeps is `coming-up` — membership
-gated, never returning an undated row. Narrowing is not free, and what made it safe was
shipping it *after* gap 3: before that, "owner or leader" in a life group meant "owner".

**3. ~~No co-leader in a churchless group.~~ Fixed.**
The `leader` role always ranked correctly and every capability helper always honoured it,
but `assertCanGrantSpaceLeadership` 404'd on any room without an `orgId`, so nothing could
create one. The gate now has two lanes like the plan's: a church room asks the church, a
Shared Space asks its owner. In both, **a granted leader cannot grant** — enforced
structurally, by reading `Spaces.userId`, the one column a grant can never write.

**4. ~~"Coming up" offers one verb.~~ Fixed.** The card knew the passage all along and did
nothing with it: the only verb was "write about this", which is the half of the week that
happens *at* the gathering. A second row opens the passage in the reader. It is a row rather
than a control inside the first one, because `proto-church-tools` is the row-list card and
the alternative nested a button inside a button.

**5. ~~Presence is written and dark.~~ Turned on.**
`useSpacePresence` was complete, with zero callers, and the hub hardcoded
`presenceOthers={[]}` — which made `SharedSpaceSocialGreeting`'s `presentOther` branch dead
at runtime. Now mounted for rooms that gather only: a channel is a broadcast to a
congregation, so "3 people studying" there is both meaningless and a presence channel with a
congregation on it.

**6. ~~Annotation is one-way.~~ Fixed — and the original claim was wrong.**
This doc first said Sarah could not answer an annotation on her note. Investigating it, the
overlay had *always* grouped every entry whose range overlaps into one dock and carouselled
them, attributed, calling them "responses". So the grouping existed; what was missing was the
way in — to answer someone you had to find and re-select the exact text they had highlighted
— and the group rendered newest-first, so the carousel walked an exchange backwards.

So a Reply action on a foreign annotation now creates an ordinary annotation on the *same*
anchor, and groups read oldest-first. **No new table and no new route**, which was the point:
a reply row inside `StudyThreadEntries` would have to be excluded by hand from the ~25 files
that read that table expecting a highlight, and the failure mode there is silent — a phantom
highlight in the study feed, in fingerprints, in exports, in the scripture index. True
threading ("in reply to", a reply list, notification) remains a separate project.

**7. ~~Recall is never shared.~~ Partly closed, and the rest is named.**
`RecallEvents` had no `spaceId` while the client's cooldown store had always been keyed by
one — so the local half of suppression was space-correct and the cross-device half was not.
Dismissing a suggestion on a laptop would have hidden it in every room on a phone. The column
landed with **NULL meaning personal Home**, which is where every prior row came from, so no
backfill was needed and a legacy dismissal keeps applying exactly where it was made
(`resolveRecallRoomScope`).

It has a live consumer rather than sitting dark: the room's "showing up in your notes" passage
card was frozen — one passage, forever, for everyone, with no way to say "not that one" — and
now rests through the same two stores Home uses, keyed by the room. Saying "Not now" moves it
to the room's next-most-cited passage.

**What is still open is the bigger claim**: the room's *material* resurfacing the way Home's
does. That needs `buildRecallCandidates` — 37 inputs, all derived by the 1,457-line,
personal-only `useHomeSurfaceData` — to become space-aware, and it runs into a decision already
made deliberately: the space hub does not render your personal Continue/Suggested, because
"standing in a shared space, it rendered *your* study, under someone else's roof." That is a
memory-layer project, not a gap to close in passing.

---

## Designed, not built

- **[What's next](./SPACE_STUDY_SUGGESTIONS_AND_VOTES.md)** — members suggest a topic (a Thread, a
  note, a passage, or free text), a leader builds a slate, the room votes, and the leader chooses
  in the open. Suggestions are named, votes are counted; the tally advises rather than decides.
  Opt-in per space, with two church-hosted additions. Phase 1 is the suggestion half alone, which
  copies `LibraryItemSuggestions` almost exactly and is useful without any voting.

---

## Fences that constrain anything built here

Restated because every one of these has been re-proposed at least once:

- **No reminders, notifications, recurrence engine, room booking, or attendance.**
  `meetingDay` / `meetingTime` / `publishCadence` are display and defaults; whoever runs the
  room still enters every gathering by hand.
- **One next gathering per context you joined, never a schedule of any context.**
- **Review is never shared.** `Notes.startedFromServiceId` has a grep-enforced reader
  allowlist. A member seeing their *own* progress is not an exception to this — the rule
  guards a person's study from other people.
- **Encrypted notes never enter shared contexts**, for any viewer, including via annotation.
- **Closed is a label, not a lock.** People finish late.
- **Members see only the pinned Thread** — a room hands out the current study, not a library
  of past ones.
