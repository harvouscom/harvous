# Harvous Redesign Exploration

> A pitch for a familiar-but-novel native experience — focused on writing, driven by scripture, organized by intelligence.

---

## Vision

Harvous should feel like a digital study Bible crossed with a personal journal — not a note-taking app that happens to understand scripture. The current UI inherited web conventions (persistent sidebar, thread-as-content, feed-as-homepage) that don't reflect how people actually study. This doc pitches a redesign built around three principles:

1. **Writing first.** Every interaction should start at the blank page, not a form.
2. **Intelligence behind the scenes.** Organization happens automatically; the user names it later if they want to.
3. **Native from day one.** The web version should feel indistinguishable from a SwiftUI app so the native port is an evolution, not a rewrite.

---

## What Stays (data layer is untouched)

| Kept | Why |
|---|---|
| Thread IDs, NoteThreads table, color assignments | Background intelligence still uses the same graph |
| Space membership, sharing, access control | Modes are a UX reframe — the data model is identical |
| Scripture pill system, translation override | Core magic — unchanged |
| Tag generation, connection detection | Powers the intelligence layer |
| Offline sync, Supabase real-time | Infrastructure stays |

The redesign is **entirely presentation**. No backend schema changes required.

---

## What Changes (intentionally removed)

| Removed | Replaced by |
|---|---|
| Thread feed cards (`CardThread.tsx`) | Color tints on note cards (thread is ambient) |
| Explicit thread creation flow | Auto-grouping + optional naming prompt |
| Desktop sidebar thread list | Library tab + contextual slide-in |
| Featured carousel at top of home | Recall swipe-up layer |
| Tab filters (All / Threads / Notes / Scripture) | Search tab + filter chips inside Library |
| Persistent space name in nav bar | Mode tint — ambient, not labeled |

---

## Concept 1 — Navigation: Mode Bar

The sidebar puts organizational chrome front and center. On mobile it became a 1,900-line drawer component. Neither feels native.

**Proposed:** 4-item bottom tab bar on mobile, left rail on desktop:

```
[ Home ]   [ Search ]   [ ✦ Write ]   [ Library ]
```

- **Home** — Active study surface: what you're working on right now, recall cues, VOTD
- **Search** — Full-text, verse lookup, tag cloud, recent
- **Write** — Always visible, center-prominent, opens the compose sheet immediately
- **Library** — All notes, named threads, spaces, archive

Compose is never buried. The sidebar is gone.

**Space switching** lives behind a leading-edge swipe (like iOS Settings) — deliberate, not always visible. The active space is communicated through ambient color tint, not a persistent label.

---

## Concept 2 — Spaces: Modes, Not Folders

Spaces are currently organizational containers — many, folder-like, switchable. The UX should instead treat them as distinct *study environments*:

| Mode | Visual feel | Primary use |
|---|---|---|
| **Private Study** | Warm, minimal, no activity feed | Daily devotional, personal notes |
| **Shared Space** | Collaborative tint, member presence, activity | Bible study group, church team |
| **Public Space** *(future)* | Discovery, read-heavy, broadcast | Published commentary, public devotionals |

Each mode has a distinct background tint and navigation behavior. Mode switching is a deliberate gesture — swipe down on Home to reveal the switcher — not a dropdown in the nav.

The data model (space IDs, membership, isPublic) is unchanged. The "mode" is just the active space, surfaced with more intent.

---

## Concept 3 — Threads: Background Intelligence

Threads are currently a first-class visible object: you create them, name them, assign notes to them. "My Pile" is the fallback.

**Proposed:** Threads disappear from the visible surface. They become smart collections that form automatically from:

- Scripture reference clusters (notes mentioning the same books / passages)
- Generated tags and topics
- Time windows (what you studied this week)
- Manual "group these" selection gestures

**What the user sees instead:**
- A color bar on a note card (implicit thread membership)
- A "Related" section at the bottom of an open note
- Quiet suggestions: *"You have 5 notes on Philippians — want to name this study?"*

Threads can be named and customized, but never need to be. The data model (`thread_` IDs, NoteThreads table) is identical — only the UI surface changes.

---

## Concept 4 — Conditional Visibility: Earning the Interface

The app surfaces less until the user's context earns more. This is progressive disclosure, not feature gating — the data is always there.

**State 0 — Empty** (new user, 0 notes)
```
┌────────────────────────────┐
│                            │
│   Start with what          │
│   you're reading.          │
│                            │
│        [ + Write ]         │
│                            │
└────────────────────────────┘
```
One action. No nav tabs. No threads. No spaces.

**State 1 — Beginning** (1–10 notes)
- Chronological card list appears
- Scripture pills render as references are typed — the first magic moment
- Auto-generated tags appear as chips below cards
- No thread UI, no space switching visible

**State 2 — Building** (10–50 notes)
- "Related" notes surface at the bottom of open notes
- Thread suggestion prompts appear: *"You've written about Philippians 4 times"*
- Search tab becomes useful, activates
- VOTD / recall cues begin appearing

**State 3 — Active** (50+ notes, regular use)
- Full Recall surface unlocks
- Space sharing / invite features appear in Library
- Thread auto-grouping suggestions arrive weekly
- Connected notes graph teased in Library

---

## Concept 5 — Compose: Writing Surface First

The current flow is form-first: pick a thread, then type, then save.

**Proposed:** Writing-first. The compose sheet slides up full-screen:

```
┌──────────────────────────────────┐
│  Cancel                    Save  │
│                                  │
│  What are you studying?          │
│  ________________________________│
│                                  │
│  (freeform rich text editor)     │
│                                  │
│ ┌────────────────────────────┐   │
│ │  Philippians 4:13  [ESV ▾] │   │  ← auto-detected pill, tap to change
│ └────────────────────────────┘   │
│                                  │
│  #faith  #strength  #Paul        │  ← auto-generated after 1s pause
│                                  │
│  [Add to: Philippians Study ▾]   │  ← suggested thread, optional
└──────────────────────────────────┘
```

- Scripture pills appear **live** as the reference is completed
- Tags generate after a 1-second debounce
- Thread suggestion is post-typing inference, not an upfront form field
- Save is instant; a toast confirms: *"Added to Philippians Study"*

---

## Concept 6 — Cards: Tactile and Spatial

Current cards are list rows with a left-border color accent — text-heavy, web-conventional.

**Proposed:** Index-card aesthetic:

```
┌──────────────────────┐
│ ▓▓▓ Philippians      │  ← 6px color bar + thread name (only if named)
├──────────────────────┤
│ "I can do all things │
│  through Christ..."  │
│                      │
│  Phil 4:13   2d ago  │
└──────────────────────┘
```

- `16px` border-radius, subtle drop shadow
- Long-press reveals action sheet (native gesture)
- Swipe left = archive / delete (with undo toast)
- Swipe right = add to space / share
- Tap = note expands from its card position (not a page navigation)

Home switches between list and 2-column grid based on note density or user preference.

---

## Concept 7 — Recall: Swipe-Up Layer

The current featured carousel and inbox panel feel like web components bolted onto a feed.

**Proposed:** Recall is a pull-up layer from Home:

```
┌──────────────────────────────────┐
│  ○ ○ ● ○ ○   3 of 7 today       │
│                                  │
│  ┌────────────────────────────┐  │
│  │                            │  │
│  │  "Peace that surpasses     │  │
│  │   all understanding"       │  │
│  │                            │  │
│  │  Philippians 4:7           │  │
│  │  Written 3 months ago      │  │
│  │                            │  │
│  └────────────────────────────┘  │
│                                  │
│  ← Not now        Keep it →      │
└──────────────────────────────────┘
```

- Swipe up from Home bottom edge → full-screen Recall mode
- Swipe right: keep (resurface later)
- Swipe left: defer (not now)
- Tap: expand to full note
- Same underlying data as inbox/featured dismissed — different presentation

---

## Concept 8 — Design System: SwiftUI Sensibility

Moving to native means building the web version to *feel* native first. The existing OKLCH color system is excellent — build on it.

### Materials (translucency)

```css
/* Ultra-thin — nav bars, modals */
background: oklch(var(--paper-l) var(--paper-c) var(--paper-h) / 0.85);
backdrop-filter: blur(20px) saturate(1.8);

/* Regular — cards, panels */
background: oklch(var(--paper-l) var(--paper-c) var(--paper-h) / 0.95);
backdrop-filter: blur(10px);
```

### Spring animations (replace linear ease-out)

```css
/* Snappy settle — most transitions */
transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);

/* Spring with overshoot — sheet presents, card pops */
transition: transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
```

### Shape language

| Element | Radius |
|---|---|
| Cards | `16px` |
| Buttons | `12px` |
| Inputs | `10px` |
| Pills / chips | `999px` |

No hard edges except hairline dividers.

### Icons

Stroked, `1.5px` weight, rounded linecaps — SF Symbols aesthetic. Filled variants reserved for active/selected states only.

### Color additions (on top of existing OKLCH system)

```css
--surface-primary   /* main background */
--surface-secondary /* card background */
--surface-tertiary  /* input / inset background */
--surface-overlay   /* modal scrim */
```

Thread colors become subtle card tints rather than bold block fills.

### Typography additions

```css
/* Large title — empty states, section headers */
font-size: 34px; font-weight: 800; line-height: 1.1;

/* Card body — tighter than current */
line-height: 1.3; /* vs current 1.5 */
font-weight: 450; /* between regular and medium */
```

---

## Concept 9 — Apple Intelligence: Recall and Review at the OS Level

This is the highest-leverage native opportunity. Apple Intelligence isn't just an AI feature to add to the app — it's a set of OS-level hooks that let Harvous surface recall and review moments *outside* the app, at exactly the right time. The existing North Star pillars (Remember + Learn) map almost perfectly to what Apple Intelligence exposes.

### Why it matters for Harvous specifically

Recall and review are only valuable when they happen at the right moment. A note resurfaced in-app requires the user to open Harvous first — which means it only happens when they're already thinking about studying. Apple Intelligence can surface recall cues when the user is on their commute, before a Bible study meeting, or during a reading plan streak. That's where the real value lives.

Privacy is also critical here. Personal spiritual notes are sensitive. **Apple Intelligence processing happens on-device** — notes are never sent to Apple's servers for the AI features below. This is a genuine differentiator over cloud-only AI recall.

---

### 9a. Intelligent Notifications (Priority Messages API)

Apple Intelligence classifies and re-orders notifications by inferred priority. Harvous can make its recall notifications *feel urgent* by writing them well — one personalized line, not generic push copy.

**How to use it:**

- Recall notifications are already planned (North Star "Remember" pillar). Format them so Apple Intelligence surfaces them as Priority: one specific scripture or note excerpt, not "Time to review!"
- Example: *"You haven't revisited Romans 8:28 in 6 weeks — it's come up in 4 of your notes."*
- Spaced repetition logic drives the cadence; Apple Intelligence decides when it breaks through.

**Native requirement:** `UNNotificationContent` with `interruptionLevel: .timeSensitive` and rich body text. No special entitlement — just well-written notifications.

---

### 9b. Siri App Intents (Recall on Demand)

App Intents expose Harvous actions to Siri, Shortcuts, and Spotlight — without the user opening the app. These are the highest-value native features for recall and review.

**Intents to build:**

| Intent | Example Siri phrase | What it does |
|---|---|---|
| `StartRecallSession` | *"Hey Siri, start a Harvous review"* | Opens the Recall swipe-up surface directly |
| `GetTodaysRecallCard` | *"Hey Siri, give me a recall card"* | Returns today's top card as a Siri response |
| `AddHarvousNote` | *"Hey Siri, add a note to my Philippians study"* | Opens compose pre-threaded |
| `ShowRelatedNotes` | *"Hey Siri, what have I written about grace?"* | Semantic search result as Siri answer |
| `GetStudyStreak` | *"Hey Siri, what's my Harvous streak?"* | Returns streak count inline |

The `GetTodaysRecallCard` intent is the standout. A user can ask Siri for a recall card while driving, commuting, or before opening a Bible — friction is near zero.

**Native requirement:** `AppIntents` framework (Swift). Capacitor bridge needed to pass intent results to the React layer.

---

### 9c. Spotlight Semantic Search

Apple Intelligence makes Spotlight smarter — it now understands *meaning*, not just keywords. Harvous notes indexed in CoreSpotlight with semantic markup show up in system-wide search results with AI context.

**What this enables:**

- User searches Spotlight for "patience" → Harvous notes on James 1:3–4 appear with an excerpt
- User searches for "that verse about not being anxious" → Philippians 4:6–7 note surfaces even if those words aren't in the note title
- Notes appear alongside Safari bookmarks, Messages, and Reminders — Harvous becomes part of the user's personal knowledge graph at the OS level

**Rich result format:**

```swift
let item = CSSearchableItem(
    uniqueIdentifier: "note_\(note.id)",
    domainIdentifier: "com.harvous.notes",
    attributeSet: {
        let attrs = CSSearchableItemAttributeSet(contentType: .text)
        attrs.title = note.title
        attrs.contentDescription = note.excerpt  // first 200 chars
        attrs.keywords = note.tags + note.scriptureReferences
        attrs.relatedUniqueIdentifier = note.threadId
        return attrs
    }()
)
```

**Native requirement:** `CoreSpotlight` framework. Sync should happen on every note save, in a background task.

---

### 9d. Writing Tools in the Editor

Apple Intelligence Writing Tools appear automatically in any `UITextView` on iOS 18+. For the Harvous TipTap editor, opt-in via the `WritingToolsCoordinator` API to get:

- **Summarize** — compress a long study note into key points
- **Rewrite** — clean up a rushed note written mid-sermon
- **Proofread** — fix grammar/spelling without changing meaning
- **Make Friendly/Professional/Concise** — restyle for sharing

This is almost free — the TipTap editor already uses `UITextView` under the hood in the native layer. The main work is coordinating Writing Tools edits back into ProseMirror's document model (similar to how paste is currently handled).

**Recall angle:** Summarize is directly useful before a review session — condense 5 scattered notes on a book into a one-paragraph summary before the quiz.

**Native requirement:** `WritingToolsCoordinator` + handle `writingToolsWillBegin` / `writingToolsDidEnd` to pause ProseMirror's change tracking during AI edits.

---

### 9e. Personal Context + Calendar Integration

Apple Intelligence (via Siri's personal context) can see the user's calendar. Harvous can use this to surface recall at moments that matter:

**Pattern:** User has a recurring "Bible Study - Thursday 7pm" calendar event → 30 minutes before, Harvous sends a notification: *"Your small group is studying Romans tonight. You have 8 notes on Romans — here are the highlights."*

This requires:
1. A `SiriKit` donation when the user views notes before an event (trains the suggestion)
2. A background task that checks for upcoming calendar events with biblical keywords in the title
3. An intelligent notification formatted for Apple Intelligence's priority system

**Native requirement:** `EventKit` for calendar read access + `BGAppRefreshTask` for background pre-preparation.

---

### 9f. Dynamic Island and Live Activities (Review Streaks)

The Dynamic Island can surface a live review session — tap to return to the Recall surface mid-session.

**Live Activity states:**

```
Expanded:    [ ✦ Recall  |  3 of 7 cards  ·  ████░░░░  ]
Compact:     [ ✦ 3/7 ]
Minimal:     [ ✦ ]
```

Also useful for streaks: *"Day 12 — keep it going"* as a persistent minimal indicator during a study session.

**Native requirement:** `ActivityKit` (Live Activities) + `WidgetKit` for the Always-On display on Apple Watch.

---

### 9g. Widgets for Passive Recall

Home screen and Lock Screen widgets bring recall into the user's passive environment:

| Widget size | Content |
|---|---|
| Small (2×2) | Today's recall card — scripture + date |
| Medium (4×2) | Recall card + "Mark as reviewed" / "Skip" interactive buttons |
| Lock Screen | Streak count + next recall card title |

**Interactive buttons** (iOS 17+) mean a user can mark a card reviewed without unlocking their phone — zero-friction passive recall.

**Native requirement:** `WidgetKit` with `AppIntentTimelineProvider`.

---

### Mapping to North Star Pillars

| North Star pillar | Apple Intelligence surface |
|---|---|
| **Remember** (passive resurfacing) | Priority notifications, Spotlight semantic search, widgets, Dynamic Island |
| **Learn** (active review + quizzes) | Siri intents (`StartRecallSession`, `GetTodaysRecallCard`), interactive widgets |
| **Capture** (zero-friction add) | Siri `AddHarvousNote` intent, Writing Tools (polish what you captured) |
| **Compete** (social + challenges) | Streak widgets, lock screen badges |

---

### Implementation Path

Apple Intelligence features require a true native shell. The Capacitor strategy (see `CAPACITOR_STRATEGIC_ANALYSIS.md`) is the bridge:

1. **Capacitor first** — get a native container shipping. Most Apple Intelligence features are native-side hooks that call into the existing React layer.
2. **App Intents + Spotlight** — highest value, achievable in the Capacitor shell with a Swift plugin.
3. **Writing Tools** — available automatically on `UITextView`; coordination with ProseMirror is the only custom work.
4. **Live Activities + Widgets** — require pure SwiftUI, can ship independently alongside the Capacitor app.
5. **Full SwiftUI rewrite** — the long-term destination where all of the above becomes native-first.

---

## Rollout Sequence

### Phase 1 — Foundation (low risk, high visual payoff)

1. Bottom tab bar on mobile replacing the drawer-based nav
2. Card visual refresh: `16px` radius, drop shadow, spring animations
3. Compose sheet: full-screen, writing-first, thread selection moves to footer

### Phase 2 — Core Concept Shifts

4. Threads go invisible: suppress `CardThread`, route thread access through color chips and Related section
5. Conditional visibility: progressive disclosure for new users (state 0 → 1 → 2)
6. Recall as swipe-up layer from Home

### Phase 3 — Mode and Material

7. Spaces as modes: distinct tints and nav behaviors per space type
8. Material / translucency system across nav bars and panels
9. Auto-thread grouping suggestions (intelligence layer surfaces proactively)

### Phase 4 — Apple Intelligence (requires native shell)

10. CoreSpotlight semantic indexing on every note save
11. App Intents: `StartRecallSession`, `GetTodaysRecallCard`, `AddHarvousNote`
12. Priority notifications with spaced-repetition cadence
13. Writing Tools coordination in the TipTap editor
14. Home screen widgets (small + medium) with interactive recall buttons
15. Live Activities for active review sessions and streaks
16. Calendar integration for pre-study context notifications

---

*Written April 2026 — design exploration, no implementation started.*
