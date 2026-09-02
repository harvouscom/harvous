# Harvous Reviews, Challenges, and Season Pass

> **Status (September 2026): Reviews and personal Challenges shipped in v3.0. Season Pass did not.**
>
> This doc is canonical for the product thesis, and it supersedes the Mistral-based Review
> runtime in [SCRIPTURE_AI_GROUNDING_PHASE_5.md](./SCRIPTURE_AI_GROUNDING_PHASE_5.md). The
> "no generative AI for study content" rule below is the shipped position, not an aspiration.
>
> **What is built** — the Recommended v1 section at the foot of this doc, minus the Season Pass
> block and the Study Dock:
>
> | Piece | Where |
> |---|---|
> | Review items (note / highlight / connection / Thread / verse) | `ReviewItems`, `server/utils/review-service.ts` |
> | Authored prompts, verse ladder, cloze | `src/utils/review-prompts.ts`, `src/utils/verse-cloze.ts` |
> | Transparent scheduling (1 / 4 / 14, ×1.8 from the third recall, 180 cap) | `src/utils/review-scheduling.ts` |
> | `I recalled it` / `I almost had it` / reveal | `PrototypeReviewDock.tsx`, and the paper stack's edge |
> | Study Inbox, max three rows, no counts | `PrototypeStudyInbox.tsx` on Activity |
> | Personal challenges (4 templates) | `src/utils/challenge-templates.ts`, `server/utils/challenge-service.ts` |
> | Plus gating on `review` / `challenges` | `server/middleware/require-feature.ts`, `useHasFeature` |
>
> **What is not built, and why**
>
> - **Season Pass.** Needs authored editorial content — a season map, a curated quiz set, a
>   schedule — which is a content pipeline rather than a code problem. The access model in this
>   doc stands; the `challenges` feature key already covers it, and there is deliberately no
>   `season_pass` key.
> - **A suggestion-shaped Study Dock** (Harvous proposing an exercise unprompted inside a note).
>   The dock *surface* now exists and is where Review lives — one shell-owned card in the study
>   band, following you across Activity, notes and the reader (`PrototypeReviewDock.tsx`). What
>   is not built is the unprompted half: nothing decides on its own that this note, right now,
>   deserves a card. The dock only ever shows what the reader asked for, from the Inbox or a
>   row, which is why the rules about not appearing on create and suppressing after dismissals
>   have nothing yet to govern.
> - **Escalation between surfaces** (dock → inbox), which only matters once the dock exists.
> - **XP or streaks** on review activity. The tables exist and are untouched; a streak on a
>   spiritual practice is the "spiritual competition" this doc's own language section rules out.
> - **Native parity.** Web only; native calls the same endpoints when it comes.
>
> **One thing worth revisiting:** the `revisitNote` recall kind on Home can still offer a note
> that Review is actively asking about. A clean recall lengthens the note's resurfacing
> stability, which pushes it down the deck rather than removing it — enough in practice, but
> excluding notes with an active review item would be exact.

## Product thesis

Harvous helps people **build their own Study Bible**.

The product should not primarily provide answers, generate interpretations, or turn Bible study into a streak-driven task list. Instead, it should help people return to what they have studied, recall it, expand it, connect it, question it, and preserve it as part of an evolving personal body of study.

> Harvous organizes the Bible’s knowledge layer around a person’s own study, then helps them return to, deepen, and connect what they have already written.

The core learning loop is:

```text
Study → Capture → Recall → Expand → Connect → Return
```

- **Study:** Read Scripture and explore trusted, structured study material.
- **Capture:** Write notes, questions, observations, applications, and connections.
- **Recall:** Attempt to remember a prior observation or passage before reopening it.
- **Expand:** Add evidence, nuance, clarification, or an unresolved question.
- **Connect:** Relate material across Scripture, themes, dictionary concepts, notes, and threads.
- **Return:** Revisit the material later based on activity, retention signals, and personal intent.

## Core principles

### Harvous prompts; it does not replace study

Harvous may surface, sequence, and prompt against user-authored material and curated Bible knowledge. It should not provide an interpretation in the user’s place.

The user remains the active reader, interpreter, writer, and connector.

### Expand upon, not answer

The product should guide a user toward deeper work rather than supplying a conclusion.

Examples:

- “What detail in this passage led you to that observation?”
- “Why did you connect these two passages?”
- “What has become clearer since you first asked this question?”
- “What distinction would keep this idea from being oversimplified?”
- “What central idea is taking shape across this thread?”

The value is the user’s act of retrieval, explanation, comparison, and synthesis.

### No generative AI for study content

Harvous should not use AI to generate Bible-study answers, interpretations, summaries, quiz questions, explanations, or personalized theological content.

When AI is used, it should only assist with surfacing existing material—such as a user’s own notes, explicit connections, Scripture references, tags, threads, and curated knowledge-layer relationships.

### No roadblocks to notes

Opening a note, creating a note, writing, and studying must remain immediate.

Reviews and Challenges are ambient invitations. They should never be mandatory interstitials, modals, forced daily tasks, or barriers to accessing notes.

### Personalization should be implicit

Do not ask users to repeatedly evaluate Harvous with prompts such as “Was this helpful?”

Instead, infer what to do next from natural behavior:

- Whether they attempt recall before revealing a note.
- Whether they reveal the source immediately.
- Whether they revise or expand a note.
- Whether they create a new Scripture connection.
- Whether they revisit a thread organically.
- Whether they pause, defer, dismiss, or finish a suggested activity.
- Whether they return to a question without resolving it.

Users should have meaningful controls—such as `Not now`, `Pause`, `Hide`, `Return soon`, and `Dismiss`—but should not have to manage the personalization system through surveys.

## The two knowledge layers

Harvous should connect two layers of information.

| Layer | Contains | Established by |
|---|---|---|
| Scripture knowledge layer | Scripture references, book structure, people, places, themes, dictionary concepts, biblical events, curated cross-references, and editorial Season Pass structures | Harvous and curated sources |
| Personal Study Bible Profile | User notes, questions, threads, personal connections, review history, expansions, summaries, and stated priorities | The user |

The shared knowledge layer provides the terrain. The personal layer records a user’s path through it.

Harvous should carefully distinguish among:

- A curated Bible or editorial relationship.
- A personal connection made by the user.
- A relationship Harvous noticed through shared nodes or activity.
- A suggestion to revisit something.
- An unresolved question.

It must not treat an inferred relationship as an established fact, or an established editorial relationship as the user’s personal conclusion.

## The Study Bible Profile

The Study Bible Profile is not a doctrine score or a claim that Harvous knows what the user believes. It is a transparent, user-owned representation of what they have studied, written, linked, revisited, clarified, and left unresolved.

Possible internal state per user and node:

```ts
type UserNodeState = {
  userId: string
  nodeId: string // note, passage, theme, dictionary concept, thread, etc.

  exposureCount: number
  revisitCount: number
  explicitConnectionCount: number
  expansionCount: number
  synthesisCount: number

  firstStudiedAt?: Date
  lastSeenAt?: Date
  lastReviewedAt?: Date
  nextReviewAt?: Date

  recallState: "new" | "fragile" | "forming" | "durable"
  priority: "normal" | "important" | "focused" | "paused"
  status: "active" | "paused" | "archived"
}
```

Possible user-facing language:

> Your Study Bible is taking shape.
>
> You have built 42 connections across 8 active themes. Your thread on prayer is developing. Your study of covenant has questions ready to revisit.

Do not lead with scores or make this a public comparison system. The point is to make a person’s accumulated attention to Scripture visible and useful.

## Reviews

### Purpose

Reviews help users return to their own study at an appropriate time. They should not feel like generic flashcards or an overdue task queue.

A Review can ask a user to:

- Recall a verse or note.
- Reconstruct a verse from partial cues.
- Explain an existing connection.
- Add evidence to an observation.
- Revisit an open question.
- Compare related passages.
- Synthesize a thread.
- Mark something for later without shame.

### A review item is not only a flashcard

Possible review types:

| Type | Example |
|---|---|
| Note recall | “Before opening it, what did you observe in Romans 8?” |
| Scripture connection | “Why did you connect Exodus 19:6 and 1 Peter 2:9?” |
| Explain in your own words | “What is the main movement of James 2:14–26?” |
| Application reflection | “What did you intend to carry forward from this passage?” |
| Verse memory | “John 15:5 — what comes next?” |
| Open question | “What has become clearer since you first asked this?” |
| Thread synthesis | “What central idea is taking shape in your Covenant thread?” |

### Review outcomes

Keep the user interaction simple and meaningful:

- `I recalled it`
- `I almost had it`
- `Show my note` or `Reveal`

These are not satisfaction ratings. They describe the state of the user’s recall and guide future scheduling.

Suggested behaviors:

| Action | Inference | Next action |
|---|---|---|
| User writes before reveal | Attempted, unassisted recall | Count as meaningful retrieval |
| User reveals immediately | Needs support | Treat as assisted recall; revisit sooner |
| User almost recalls | Fragile memory | Shorter interval, potentially a stronger cue |
| User recalls reliably | Durable access | Longer interval; later offer expansion or synthesis |
| User edits the note | Understanding is evolving | Revisit the revised idea later |
| User creates a link | New personal graph edge | Invite a later explanation of that connection |
| User dismisses or pauses | Bad timing or low relevance | Suppress and do not automatically promote |

### Review scheduling

Start with transparent rules rather than an opaque adaptive system.

```ts
if (outcome === "revealed") nextReview = inDays(1)
if (outcome === "almost") nextReview = inDays(4)
if (outcome === "recalled") nextReview = inDays(14)

if (successfulRecalls >= 3) {
  nextReview = multiplyInterval(1.8)
}
```

The actual schedule should be adjustable and should prevent backlog anxiety:

- Cap new reviews per day.
- Let users pause threads or specific items.
- Let users quietly reset a queue.
- Avoid aggressive overdue counts and guilt language.
- Use review activity to adjust suggested session length.

### Review progression

The exercise should become more meaningful as the user demonstrates familiarity.

| Stage | User state | Exercise goal |
|---|---|---|
| Recognize | New or weak material | Use a small cue to identify what was studied |
| Recall | Material is becoming familiar | Bring back the original observation or connection before revealing it |
| Expand | Repeated recall, little development | Add evidence, nuance, context, distinction, or a question |
| Connect | More than one relevant node exists | Explain how passages, notes, or themes relate |
| Synthesize | A thread or cluster is mature enough | State the central idea, choose backbone notes, or update a summary |

## Focus exercises

Focus exercises work close to the text: a verse, note, question, or explicit connection.

### Verse memory ladder

Use varied retrieval rather than endless rereading.

1. **Recognize**
   - Show a reference plus a distinctive phrase.
   - Example: “John 15:5 — ‘apart from me…’ What comes next?”

2. **Rebuild**
   - Display the verse with selected words or phrases removed.
   - Example: “I am the vine; you are the ____.”

3. **Sequence**
   - Present phrases from the verse out of order and ask the user to arrange them.

4. **Recall**
   - Show only the reference and invite the user to write or speak the verse before reveal.

5. **Locate**
   - Show a meaningful phrase and ask the user to identify its reference from familiar options.

6. **Contextualize**
   - Ask what happens immediately before or after the verse.

7. **Connect**
   - Ask what note, passage, or theme the user connected to the verse and why.

Harvous does not need to auto-grade all open writing. It can track reveal use, sequence completion, user choices, and whether the user makes a new note or connection.

### Note expansion exercises

For a user-authored observation:

- “What phrase in the text led you to this observation?”
- “Can you make this observation more specific in one sentence?”
- “What changes when you read the paragraph around this verse?”
- “What does this note not claim?”
- “What remains unclear or worth studying further?”
- “Which existing note helps you test or develop this observation?”
- “Would you keep this note as written, expand it, or mark it unresolved?”

The result should be a user-owned artifact: revised note, new evidence, Scripture link, open question, or preserved uncertainty.

## Altitude exercises

Altitude exercises help users zoom out from individual notes and verses to see patterns, themes, development, contrast, and unresolved questions across their personal Study Bible.

### Connection explanation

**Trigger:** Two user-studied passages share a curated theme but have no personal connection.

> You have notes on Exodus 19:6 and 1 Peter 2:9, both connected to God’s people. What relationship do you see between these passages?

Actions:

- Write a connection.
- Link existing notes.
- Open both passages.
- Choose “I do not see one yet.”

“I do not see one yet” should be a valid conclusion. It is not a failure.

### Compare and distinguish

**Trigger:** Related material could be flattened into a simplistic connection.

> You have connected covenant to both Noah and Abraham. What seems similar between these accounts? What seems distinct?

This is important: Harvous should help users identify how ideas relate, not merely suggest that everything is related.

### Thread backbone

**Trigger:** A thread has multiple notes but no synthesis.

> Your Kingdom of God thread has 9 notes across 5 passages. Choose the three notes that best represent its backbone.

Then:

> In one or two sentences, what central idea are these notes forming?

### Open-question route

**Trigger:** A question has accrued related notes or recurring attention.

> You first asked, “What does it mean for the kingdom to be near?” Since then, you have written notes on Mark 1, Matthew 6, and Daniel 7. Which note most changes how you approach that question?

Actions:

- Update the question.
- Add evidence.
- Create a sub-question.
- Keep it open.
- Start a focused Challenge.

### Missing bridge

**Trigger:** Two active personal clusters overlap or sit near each other in the curated graph.

> Your study of prayer and the kingdom has grown in parallel. Is there a passage, note, or question that could bridge these threads?

Harvous can surface candidates. It should not invent the bridge or present a suggestion as a theological conclusion.

### Sort and name

**Trigger:** A cluster of notes shares a theme or Season Pass topic.

> These five notes are connected to covenant. Group them into two or three clusters, then name each cluster.

The user does the categorization and naming. Harvous only supplies the material already in their Study Bible.

### Sequence and storyline

**Trigger:** The knowledge layer provides a set of related passages around an event, book movement, or theme.

> Place these passages in the order they occur in the biblical story. What develops as the theme appears again?

This can be used for:

- Narrative sequences.
- A book’s argument or movement.
- A public season’s Scripture set.
- User-selected passages in a thread.

### Zoom-out board

A visual exercise, particularly useful on desktop and iPad:

- Center the active theme, passage, or question.
- Show 4–8 relevant nodes from personal study and curated knowledge.
- Invite the user to add relationships.
- Require or encourage a relationship label, not just a connecting line.
- Save the result as a thread map or study-guide page.

Do not default to a giant automatic Bible graph. Start with small, purposeful sets of nodes.

### Personal connection model

```ts
type PersonalConnection = {
  fromNodeId: string
  toNodeId: string
  relation:
    | "echoes"
    | "contrasts"
    | "develops"
    | "fulfills"
    | "raises-a-question-about"
    | "personal-observation"
  explanation?: string
  createdBy: "user"
}
```

Curated graph relationships should remain distinct from personal user-created relationships.

## Challenges

### Purpose

Challenges turn meaningful study opportunities into bounded, flexible paths. They should support focused exploration, not pressure, competition, or generic productivity.

A Challenge can be created from:

- An active thread.
- A question with growing evidence.
- A passage range.
- A theme.
- A memorization goal.
- A group or church study in the future.
- A Season Pass guide.

### Personal challenge example

**Strengthen this thread**

1. Recall the central question of your Romans 8 thread.
2. Revisit one note and add the textual evidence that supports it.
3. Link one related passage you have studied and explain why it belongs.
4. Name one uncertainty or tension that remains unresolved.
5. Write a short summary for your future self.

Every step should result in something the user owns: a note, connection, question, clarification, or summary.

### Challenge personalization without generation

Choose actions based on state:

```ts
if (userHasRelatedNote && recallState === "fragile") {
  action = "recall"
} else if (userHasRelatedNotesInTwoPassages && !hasExplainedConnection) {
  action = "connect"
} else if (threadHasThreeOrMoreNotes && !hasSummary) {
  action = "synthesize"
} else {
  action = "observe"
}
```

Use authored templates and known entities:

> You have notes on Mark 1:14–15 and Daniel 7. Before the challenge opens, write one sentence explaining why you think these passages belong in the same study.

The system does not invent the prompt’s theological content. It selects existing nodes and applies a prewritten exercise pattern.

### Challenge sizing

Use actual behavior to tune challenge size:

- Frequent short sessions: suggest short, focused steps.
- Consistent completion: gradually offer deeper routes.
- Repeated partial completion: reduce step count or defer the route.
- Explicit pause: remove it from active surfaces.

Do not use “failure” language for incomplete challenges.

## Season Pass

### Definition

Season Pass is Harvous’s public, seasonal Bible-learning experience. It is available to everyone.

A season can be educational, playful, thematic, and communal. It provides a shared reason to explore Scripture, themes, people, concepts, passages, and biblical storylines together.

Season Pass is not a premium-only productivity feature.

### Access model

| Feature | Everyone | Harvous Plus |
|---|---:|---:|
| Join public seasonal challenge | Yes | Yes |
| View public season map and schedule | Yes | Yes |
| Participate in public quizzes, events, and activities | Yes | Yes |
| Build a personal study guide from the season | No | Yes |
| Practice season material before the public challenge opens | No | Yes |
| Connect season material to personal notes and threads | Basic participation | Personalized study workflow |
| Personal Reviews and Challenges around season material | No | Yes |
| Carry season learning into a personalized thread and review path | Basic archive access | Personal continuation tools |

The premium distinction should not be “pay to access Scripture” or “pay to receive the answers.”

It is:

> Season Pass brings everyone together to explore Scripture. Harvous Plus helps a person prepare through their own study and keep building after the season ends.

### Season lifecycle

#### Upcoming: join and prepare

Everyone can see:

- Season title and identity.
- Theme and learning goals.
- Schedule.
- Public Scripture and knowledge map.
- Start date.
- Any free pre-season material.

Plus users can see:

> Build your guide for this season.
>
> Create a personal study guide from season passages, your existing notes, connected themes, and dictionary concepts.

#### Preparation: Plus practice

The personal season guide is the intersection of public and personal layers:

```text
Personal season guide = public season map ∩ personal Study Bible Profile
```

For example, a Kingdom season may contain Mark 1, Matthew 6, Daniel 7, the theme “Kingdom of God,” and selected dictionary concepts. Harvous can identify a user’s existing notes and threads related to those nodes and offer practice built from them.

> Prepare for The Kingdom
>
> You already have 4 notes connected to this season. Start with Mark 1:14–15 and your Kingdom thread.

#### Live season: shared experience

All users can receive the same public experience:

- Weekly or daily seasonal challenges.
- Authored public quiz rounds.
- Thematic activities.
- Shared milestones.
- Optional catch-up.
- Season calendar.

Plus users receive a personal practice advantage, not generated answers:

- Recall relevant season material before an event.
- Practice against their own notes and connections.
- Revisit themes or passages where their recall is fragile.
- Build a private study guide and personal season thread.
- Carry private questions and expansions into their Study Bible.

#### After the season: carry it forward

Everyone should be able to browse a completed season.

Plus users can be invited to preserve the personal results:

> Add this season to your Study Bible.
>
> You created 5 notes and 3 connections during this season. Continue with a personal review path or turn these into a thread.

## Public quizzes without AI

Public quizzes should be curated, authored, and versioned editorial content.

```ts
type QuizQuestion = {
  seasonId: string
  prompt: string
  type: "multiple_choice" | "ordering" | "matching" | "reference_lookup"
  answer: Answer
  explanation?: string
  scriptureReferences: string[]
  themeIds: string[]
  difficulty: 1 | 2 | 3
}
```

Plus practice can personalize selection and timing without generating new questions:

- Select upcoming authored questions relevant to the user’s studied passages or themes.
- Mix question types and presentation order.
- Repeat missed questions later.
- Pair quiz practice with a link to the user’s own related note.
- Add user-authored recall and expansion prompts alongside public quiz questions.

## Entry points and navigation

### Product rule

A user should always be able to open a note and begin writing immediately.

Reviews, Challenges, and Season Pass should be invitations—not roadblocks.

### Three primary surfaces

| Surface | Purpose | Content |
|---|---|---|
| Study Inbox in the sidebar | Intentional destination for a small number of actionable items | Due Reviews, a Challenge continuation, a high-confidence invitation to deepen a thread |
| Study Dock within a note or thread | Contextual suggestion in the active study flow | One relevant Review, Challenge, connection exercise, or season invitation |
| Season Pass destination | Public, long-horizon seasonal experience | Current season, upcoming season, public challenges, seasonal archive, Plus guide builder |

### Study Inbox

The sidebar Inbox should be a calm, curated stack—not an anxiety-producing task manager.

Example:

> Study Inbox
>
> 3 things worth returning to
>
> - Recall your note on Romans 8
> - Continue your Prayer challenge
> - Expand a connection between Exodus 19 and 1 Peter 2

Core actions:

- `Start`
- `Not now`
- `Dismiss`
- `Pause thread`
- `See all`

Avoid a prominent escalating badge count such as “27 due.” If there are no relevant actions, the empty state should feel peaceful:

> Nothing waiting. Keep studying.

### Study Dock

The Study Dock should display only one primary contextual invitation at a time, and only where there is a clear reason.

Example:

> Return to this connection
>
> You linked Romans 8:15 and Galatians 4:6 previously. Before opening your notes, explain why they belong together.
>
> `Begin` · `Not now` · `×`

Or:

> Develop this thread
>
> Your Covenant thread has 7 notes and no summary yet. Write the central idea taking shape.
>
> `Expand` · `Dismiss`

Dock rules:

- Never cover the editor.
- Never steal keyboard focus.
- Do not show immediately when a note is created.
- Do not show on every note open.
- Suppress after repeated dismissals or lack of engagement.
- Show only when grounded in meaningful personal or season context.
- Become more visible only after a user explicitly enters a Review or Challenge session.

### Season Pass destination

Season Pass should feel more editorial, lively, and communal than the ordinary Harvous workspace.

Possible sidebar structure:

```text
Sidebar
├── Notes
├── Threads
├── Study Inbox
├── Season Pass
└── Library / Scripture
```

On mobile, avoid turning every item into a permanent top-level tab. Preserve fast note access and make Inbox/Season access compact and intentional.

### Escalation model

A useful opportunity can move through surfaces only when it remains relevant:

1. **Contextual first:** show an appropriate suggestion in the Study Dock while the related note, passage, thread, or theme is open.
2. **Promote selectively:** if still timely and genuinely valuable, show it in Study Inbox later.
3. **Seasonal by invitation:** if an active thread intersects with a public season, invite the user to explore it or build a Plus guide.

Respect the inverse path:

- Dock dismissal does not automatically promote to Inbox.
- Inbox `Not now` defers quietly.
- Pausing a season suppresses related invitations.
- Archiving a note or thread retires active Review and Challenge items associated with it.

## Recommendation engine without generative AI

The central runtime question is:

> Of the user’s existing notes, questions, connections, themes, and season materials, what is the most worthwhile next interaction?

This is a recommendation and scheduling problem, not a content-generation problem.

### Candidate actions

```ts
type Candidate = {
  nodeId: string
  action: "recall" | "expand" | "connect" | "synthesize" | "memorize"
  source: "personal_note" | "thread" | "season_material" | "knowledge_layer"
}
```

### Candidate scoring

```ts
function score(candidate: Candidate, context: Context) {
  return (
    relevanceToCurrentContext(candidate, context) * 0.30 +
    learningNeed(candidate, context) * 0.30 +
    connectionPotential(candidate, context) * 0.20 +
    userIntent(candidate, context) * 0.15 +
    timingFit(candidate, context) * 0.05
  )
}
```

Potential factors:

- **Relevance to current context:** passage, note, theme, or thread the user is currently viewing.
- **Learning need:** recent reveal use, fragile recall, unreviewed material, or long interval since successful recall.
- **Connection potential:** two user-studied nodes share a theme or season relationship but lack an explained personal edge.
- **User intent:** pinned, important, focused, recently edited, or recently revisited material.
- **Timing fit:** normal session length, current workload, active challenge load, deferral behavior, and time since last study.

The highest-scoring eligible candidate becomes the single Dock card or an Inbox item.

### Example authored templates

```ts
const promptTemplates = {
  recallNote:
    "Before opening it, what did you observe in {reference}?",

  explainConnection:
    "Why did you connect {referenceA} and {referenceB}?",

  strengthenObservation:
    "What detail in {reference} most supports the observation you wrote?",

  revisitQuestion:
    "You asked this before: {questionTitle}. What has become clearer since?",

  synthesizeThread:
    "What central idea is taking shape across your {threadTitle} thread?",

  clarifyTheme:
    "How does {reference} develop your understanding of {themeName}?"
}
```

Prompts are personal because their inputs are personal, not because new wording is generated at runtime.

## Cold start

Do not fake personalization when a user has little study activity.

| User state | Appropriate behavior |
|---|---|
| Brand new | Show public Season Pass, encourage first note or Scripture exploration |
| One or two notes | Offer a light recall prompt after meaningful time has passed |
| Has a thread | Suggest a simple return-to-thread Challenge |
| Actively making links | Invite a connection-expansion Review |
| Rich personal graph | Offer a personalized study guide and adaptive practice route |

Harvous becomes more personal as the user actually studies. That is a feature, not a limitation.

## Appropriate AI boundaries

If Harvous uses AI at all, follow this order:

1. Exact Scripture references, tags, threads, themes, and dictionary links.
2. Keyword and full-text search across user-owned material.
3. Semantic retrieval across the user’s own notes.
4. Optional AI query interpretation or reranking constrained to returning source-linked, existing material.

Example permissible capability:

> Show me everything I have written about God’s faithfulness during suffering.

The result should be note links, verbatim excerpts, existing tags, thread references, and attached Scripture/theme connections. It should not generate a new theological answer, interpretation, or summary unless Harvous’s product policy changes explicitly.

## Product language

Potential language that reinforces the system:

- “Return to your study—not just reread it.”
- “Recall what you noticed. Expand what you understand. Keep building.”
- “Guidance from your own study, not answers generated for you.”
- “Your Study Bible is taking shape.”
- “Build your guide for this season.”
- “Practice with your own notes before the season begins.”
- “Trace a connection.”
- “Keep this verse.”
- “Develop this thread.”
- “Name what remains unresolved.”

Avoid language that implies theological scoring, algorithmic authority, shame, or spiritual competition.

## Recommended v1

Build the smallest coherent version that proves the loop.

### Reviews

- User-created or user-selected review items.
- Passage, note, connection, and thread sources.
- A small authored library of recall, expand, connect, and synthesize templates.
- Simple self-reported recall state: `I recalled it`, `I almost had it`, `Show my note`.
- Transparent interval scheduling.
- Daily or session queue with pause/archive controls.
- Reveal original source and allow immediate edit, connection, or question creation.

### Challenges

- Private, personal Challenges from a thread, question, verse set, theme, or Season Pass guide.
- A few high-quality authored challenge paths.
- Flexible completion and rescheduling.
- Challenge steps that create notes, connections, questions, or summaries.
- No group competition or public leaderboards in the initial release.

### Study surfaces

- Sidebar Study Inbox with a maximum of three curated cards.
- One contextual Study Dock card within a note or thread.
- Dismiss, defer, pause, and archive behavior that is respected.
- No interruption to direct note opening or writing.

### Season Pass

- Public season home.
- Curated season map and authored quiz/challenge content.
- Upcoming, live, and completed season states.
- Plus-only ability to build a personal season guide and practice against relevant existing notes and authored quiz material.

## Non-negotiable product rule

> Notes are the place people go to think. Inbox, Dock, Reviews, Challenges, and Season Pass are places where Harvous can invite them to return, expand, connect, and keep building.
