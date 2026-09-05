# What's next — members suggest, leaders slate, the room votes

**Status: phase 1 built (Sep 5 2026); phases 2–4 designed, not built.** Decisions below were
taken with Derek; the reasoning is recorded because the code can be read later and the
reasoning cannot.

**What phase 1 shipped, and where it departs from the shape below.** `SpaceStudySuggestions`,
`Spaces.studyPlanningMode` (`'off' | 'suggest'`; `'vote'` is refused by the write route until
phase 2), the room's "What's next" Tools row, the sheet (`PrototypeSpaceStudySuggestionsSheet`),
and the leader queue, in `server/routes/space-study-suggestions.ts`. Two phase-1 choices to know
before building phase 2:

- `status` is `'open' | 'accepted' | 'declined'`. There is no round yet, so there is nothing to
  be *slated onto*; phase 2 adds `'slated'` and `becameOptionId` alongside, and `accepted` stays
  as the record of the rounds-less era.
- **Accepting pins a Thread directly**, in the same transaction as the status change
  (`becameThreadId`). A suggested Thread is pinned as it is; a passage, note, or idea becomes a
  new Thread titled from it, owned by the reviewer. That is the "what a choice becomes" section
  below, applied one step early — when rounds arrive, the close route does this instead.
- The review gate is `canManageSpaceThreadStructure`, not `canManageSpaceStructure` — accepting
  pins a Thread, so it follows the rule that already governs the room's Threads.
- A member may withdraw their own suggestion while it is open. A leaving member's open
  suggestions leave with them; reviewed ones stay as the room's record.
- Built on `main` before the Sep 2 role fixes recorded in `SHARED_SPACE_STUDY_TOOLS.md` were on it,
  so for a few hours a churchless room's only reviewer was its owner. Those fixes were then
  cherry-picked onto the same branch, which is what makes the two-role table above true here: a
  granted leader of a Shared Space reviews suggestions, and `canManageSpaceThreadStructure` was
  already written to honour the role.

A room needs a way to answer "what should we study after this?" without it falling to whoever
speaks first. Three moves, in order: **members suggest**, a **leader builds a slate** from those
suggestions and their own ideas, and the **room votes**. The tally advises; the leader chooses,
in the open.

Opt-in per space. A room that has never wanted this should never see it.

---

## Locked decisions

**The tally advises, it does not decide.** A leader picks, and the room sees both the counts and
the choice with its reason. This matches how the rest of the app treats decisions — completion is
a claim a member makes, a run is closed by a leader, and neither is derived. It also means a tie
needs no rule and a pastor can steer without cancelling the round in front of everyone. The
override being visible is what stops it becoming a sham vote.

**Votes are counted, never named.** The same rule `readTogetherPulse` already enforces on the
study-plan pulse — *how many, never who* — and the same reason: a tally read from below should
not feel like a register of who wanted what. A member sees **their own** vote reflected back so
they can change it, exactly as `viewerCompletedAt` reads a member's own row back to them.

**Overriding the top vote requires a reason.** Going with the room costs nothing to explain;
going against it costs a sentence, and the room reads that sentence. That is the whole safeguard
— not the field being filled, which any leader can satisfy with a word, but the fact that the
sentence is shown next to the tally it overruled. A choice that matches the top vote may still
carry a reason; it is simply optional there.

Three edges, because "the top vote" is ambiguous in all of them:

- **A tie at the top** is not an override. If four options tie at five votes, picking any of them
  is going with the room, and demanding a justification for a tie the leader did not create would
  be a rule punishing arithmetic. Required only when the chosen option is *outside* the set tied
  for the highest count.
- **Nobody voted** is the same case: every option sits at zero, all are tied for top, no reason is
  required. There is no vote to override.
- **Choosing something not on the slate is not offered.** A leader wanting something else adds it
  to the slate — where the room can see and vote on it — rather than producing it at the close.
  A winner that was never a candidate makes the whole round theatre, and it would leave
  `becameThreadId` pointing at a Thread no option ever named.

**Enforced on the server**, in the close route, not only in the form. A requirement that lives in
the client is decoration: the rule is that the stored round cannot be in the state
"chose off-top, said nothing".

**Suggestions are named.** The opposite call, and it follows the existing exception in
`server/routes/church-library-suggestions.ts`: that file's rule protects *observed* behaviour —
what someone read, wrote, or studied — while a suggestion is an affirmative submission, someone
raising their hand, which a reviewer "cannot act on, reply to, or judge fairly without knowing
who sent it." A vote is not that: it needs no reply and no follow-up, so it stays counted.

**Suggestions are private to their author and the room's leaders.** Copied from the library
queue, where congregants read only `/suggestions/mine`. It keeps the leader's curation real
rather than ratifying whatever got seen first, and it avoids a popularity contest before the
slate exists. Deliberately the narrow choice: widening this later is free, narrowing it is not.

**Nothing fires on a clock.** A round may carry a `closesAt`, evaluated on read — a round past
its date reads as closed. No job, no reminder, no notification. Same treatment `serviceDate`
gets, and the same fence the planner keeps.

**Closing is a label, not a lock.** A closed round stays readable, with its slate and its
result. Nothing is deleted.

---

## The four rows, and why not fewer

| Table | Holds | Attributed? |
|---|---|---|
| `SpaceStudySuggestions` | a member's proposal | **yes** — author is the point |
| `SpaceStudyRounds` | one cycle: opened, closed, chosen option, and the reason | leader, yes |
| `SpaceStudyOptions` | the slate for a round | no author shown |
| `SpaceStudyVotes` | one row per (option, member) | stored, **never serialized** |

Suggestions and options stay separate rather than one row with a `stage`, for the same reason
`LibraryItemSuggestions` and `LibraryItems` are two tables: the suggestion is attributed and the
thing it becomes is not, and a single row that is named at one stage and anonymous at the next is
one refactor away from leaking. Rounds stay a row because the advisory decision — who closed it,
when, what they chose, and the sentence explaining it — is the record the whole design rests on.

`SpaceStudyVotes` needs `userId` to keep one vote per person and to let someone change their
mind. **That column exists for uniqueness, not for reading.** The precedent is exact:
`readTogetherPulse` reads `userId` in its body to count distinct members and the contract test
asserts on its *declared return type* instead — "what must never happen is one leaving, and the
signature is where that is stated."

### Suggestion shape

```
kind: 'thread' | 'note' | 'scripture' | 'text'
refId: text            -- the Thread or Note id; null for scripture and text
scriptureReference: text
body: text             -- the free text, and the "why" for the other three kinds
status: 'open' | 'slated' | 'declined'
becameOptionId, reviewedByUserId, reviewedAt, leaderReadAt
```

One discriminated pointer, not several competing ones — `FeaturedItems.contentType` is the same
shape. This is **not** the mistake the `channelSpaceId` post-mortem records; that was two nullable
single-pointer columns racing to mean the same thing. Here `kind` says which table `refId` names,
and a row without a `kind` is impossible.

`leaderReadAt` drives an unread count on the Tools row, the way `LibraryItemSuggestions.staffReadAt`
and `SupportTickets.adminReadAt` already do.

### The setting

One column: `Spaces.studyPlanningMode = 'off' | 'suggest' | 'vote'`, default `'off'`. Not a
settings table — the roadmap's own note is that a table for a couple of scalars is ceremony. Three
values rather than a boolean because "members can suggest, but we don't vote" is a real way for a
small group to work, and it is the cheaper half to ship.

### One open round per space

A partial unique index on `(spaceId) WHERE closedAt IS NULL`, mirroring `Threads_onePinnedPerSpace`.
A room deciding two things at once is not a thing this is for.

---

## Who may do what

| | Owner | Leader | Member |
|---|---|---|---|
| Suggest | ● | ● | ● |
| See all suggestions | ● | ● | own only |
| Open a round, build the slate | ● | ● | ○ |
| Vote | ● | ● | ● |
| See the tally | ● | ● | ● |
| Close a round and choose | ● | ● | ○ |
| Remove a suggestion | own + any in the room | own + any in the room | own |

Leader-level throughout, via `canManageSpaceStructure` — the same rule that already decides who
makes a room's folders and Threads. Removal mirrors `canModerateStudyThreadEntry`.

Worth noting this only became a two-role feature in Sep 2026: before granted leadership reached
churchless rooms, "owner or leader" in a life group meant "owner".

---

## What a choice becomes

The chosen option creates a Thread with that title, `spaceId` set, pinned as the room's Current
Thread. Nothing new: `Threads_onePinnedPerSpace` already guarantees the slot, members already
understand the words, and a leader can turn it into a study plan with the toggle that exists.
`SpaceStudyRounds.becameThreadId` records the link so the round's history stays honest.

---

## The church layer

Two additions for church-hosted rooms, both chosen; neither blocks the group-level feature.

**1. Church studies appear as options.** When a leader builds a slate in a church-hosted room,
they can pull from series the church has published — `ChurchSeries.publishedThreadId` is already
the seam, and `publishSeriesAsStudyPlan` already turns a series into something a group can walk.
Staff author once; any group can pick it up.

**2. The church sees what groups are asking for.** Aggregate interest, so teaching can be planned
against it.

> **The care this one needs.** A library suggestion is *addressed to the church*, which is what
> licenses naming its author. A study suggestion is addressed to **the group** — and a member
> writing "something on grief" into their life group did not thereby write it to their pastor.
>
> So the church read is over **options that reached a slate**, never raw suggestions: a leader
> chose to surface it, which is the human act that makes it sayable outward. Aggregate over the
> normalized subject — a scripture reference, a linked series, a topic — and never the free text.
> Counts per group are acceptable (a group is not a person); counts per member never are.
>
> This deserves its own contract test, in the shape `church-engagement.ts` already uses to prove
> it cannot ask what a congregant read.

---

## Phases

1. **Suggestions only.** `SpaceStudySuggestions`, the `'suggest'` mode, a Tools row with an unread
   count, a leader queue. Copies `LibraryItemSuggestions` almost line for line, and is useful on
   its own — a room that never votes still benefits.
2. **Slate and vote.** Rounds, options, votes, the advisory close. The privacy contract test lands
   here, with the feature.
3. **Church studies as options.** Slate composition reads published series.
4. **Church aggregate.** Only after phase 3 has real slates to aggregate, and with the
   options-not-suggestions rule above enforced by test.

---

## Open questions

- **Does a member see the slate before it opens for votes?** Probably not — a slate under
  construction is a leader's working surface.
- **Can a member withdraw a suggestion after it is slated?** The option is the room's now; the
  suggestion is theirs. Leaning: withdraw the suggestion, leave the option.
- **What happens to a round when its space is deleted or its leader leaves?** Follows
  `shared-space-lifecycle.ts`; needs adding there rather than being discovered later, the way
  `ThreadProgress` was.
