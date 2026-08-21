# Future Features Documentation

This folder contains documentation for features planned for post-V1 release. Some have been implemented and moved to the main docs; the rest are designed and ready to implement when you're ready to build them.

## 📋 Overview

- **Implemented features:** Listed below; full docs live in the main [docs/](../) folder.
- **Planned features:** Deferred to v1.1+ (post-V1 launch). Architecture is designed and ready.

## ✅ Implemented (moved to main docs)

These were designed here and are now live. The stub files in this folder point to the canonical docs.

- **Referral Bonus** – [REFERRAL_BONUS_IMPLEMENTATION.md](./REFERRAL_BONUS_IMPLEMENTATION.md) → [../REFERRAL_BONUS_IMPLEMENTATION.md](../REFERRAL_BONUS_IMPLEMENTATION.md)
  User-facing summary: [../FEATURES.md#💳 Billing & Referrals](../FEATURES.md#-billing--referrals--implemented)
- **Locked Notes & Encryption** – [LOCKED_NOTES_ENCRYPTION.md](./LOCKED_NOTES_ENCRYPTION.md) → [../LOCKED_NOTES_ENCRYPTION.md](../LOCKED_NOTES_ENCRYPTION.md)
  Encryption: AES-GCM 256-bit, PBKDF2-SHA256 310k iterations (see main doc for full transparency). User-facing summary: [../FEATURES.md#🔒 Locked Notes & Encryption](../FEATURES.md#-locked-notes--encryption--implemented)
- **Sharing System** – Public share links and collaborative shared spaces are fully implemented.
  See [COLLABORATIVE_SHARED_SPACES.md](./COLLABORATIVE_SHARED_SPACES.md) for shared spaces details and [../SHARED_SPACES_DEV_NOTES.md](../SHARED_SPACES_DEV_NOTES.md) for current design/behavior.
- **Offline Mode** – Full offline read/write support with IndexedDB, sync queues, and conflict resolution is implemented.
  See [OFFLINE_MODE_IMPLEMENTATION.md](./OFFLINE_MODE_IMPLEMENTATION.md) for architecture reference.

## 📁 Documentation Structure (planned / not yet implemented)

### Strategy & Roadmap

- **`HARVOUS_SDK_AND_FUTURE_ROADMAP.md`** - SDK vision and future core product roadmap
  - Harvous SDK idea and why (inspired by OpenAI Apps SDK; deferred in favor of core product)
  - Contrast with share sheet/extension and MCP/API-only approaches
  - Future core features: space sharing and groups, then learning (challenges, recall/quizzes, live events)
  - Phase sequence and anti-patterns (not a dumping ground, not fragmented)

- **`TECH_STACK_SCALING_ASSESSMENT.md`** - Stack fit for scaling and future vision
  - Verdict on current stack vs alternatives (Next, Firebase, Capacitor, etc.)
  - Scaling bottlenecks: Netlify function, cross-client sync, realtime collab
  - Recommended evolution paths (not rewrites)

### Scripture Intelligence

- **`SCRIPTURE_KNOWLEDGE_LAYER.md`** - Shared canonical knowledge layer (themes, people, places, cross-references) over Scripture, sourced from open datasets (TSK, OpenBible.info, Easton's)
  - Deterministic connections between a user's notes with no AI at runtime; grounds future AI features
  - Flagship near-term win: passage-aware auto-folder/auto-tag (uses a note's cited passages, not just its prose)
  - Phased roadmap: schema + data pipeline → connection layer → auto-tag/folder → resurfacing → suggested threads → AI grounding

- **`SCRIPTURE_AI_GROUNDING_PHASE_5.md`** - Phase 5 decision doc: grounding **Review** (personal AI quizzes) on the knowledge layer
  - Web-first Mistral Small runtime; shared grounding context builder
  - Review always paid and individual; GMMC deferred; Compete via Season Pass
  - Links [MONETIZATION_AND_PRICING.md](./MONETIZATION_AND_PRICING.md) for SKUs

- **`MEMORY_LAYER_ASSESSMENT.md`** - Honest assessment of the memory layer vs. a "scripture-centered memory graph" vision + roadmap
  - Scorecard: canonical knowledge graph is built; resurfacing intelligence on top is half-built (strong on structure, thin on time/narrative)
  - Three co-equal workstreams: passage memory fingerprints (substrate) → forgetting-aware resurfacing → recall trails & study arcs ("living commentary")
  - Deterministic-first, server-derived for native parity; persist per-note fingerprint but no edge-graph visualization
  - Reuses existing `prototype-home-trends.ts`, `scripture-knowledge.ts`, `passage-aware-tags.ts`, `study-thread-graph.ts`

- **`STUDY_SURFACES_AND_KNOWLEDGE_UX.md`** - UX exploration: Easton's, ISBE expand, topical/knowledge layer surfaces across study docks, Home, sidebar list views, and inspector
  - Maps lexicon vs passage-graph layers to concrete UI affordances
  - Candidate datasets: Scripture Interpreting Scripture (phrase cross-refs), Nave's (topic browse), Harvous-authored chains (Thompson-like paths)
  - Current-state audit, brainstorm by surface, cross-surface flows, prioritization matrix (P0–P3)
  - Complements the data-layer roadmap in SCRIPTURE_KNOWLEDGE_LAYER.md

### Monetization & Business Model

- **`MONETIZATION_AND_PRICING.md`** - Canonical product and pricing strategy (Review, Group Sharing, Season Pass, Group Leader, church org principles)
  - Review vs Compete split; Group Leader hosts spaces without member Review
  - Planning Center competitive positioning for future church org (pricing TBD)

- **`CLERK_MONETIZATION_ARCHITECTURE.md`** - Technical architecture for monetization (Clerk metadata, Stripe, org patterns)

- **`MONETIZATION_QUICK_START.md`** - Quick reference: SKU table, Review vs Compete, Clerk patterns

- **`MONETIZATION_SUMMARY.md`** - Brief index: church connection + sharing; points to canonical pricing doc

### Mobile Apps

- **`CAPACITOR_STRATEGIC_ANALYSIS.md`** - Strategic analysis for iOS/Android native apps
  - Architectural challenges (SSR → hybrid, auth migration, database strategy)
  - Effort estimates (20-32 days MVP, 6-9 weeks full offline)
  - Implementation recommendations (hybrid API approach vs offline-first)
  - App store approval considerations
  - Decision tree and ROI analysis
  - References detailed implementation guide in main docs folder

- **`NETLIFY_FUNCTION_OPTIMIZATION_AND_CAPACITOR_PREP.md`** - Reduce Netlify function usage and align web app with Capacitor-ready architecture (hybrid, caching, centralized API)

### Church Features

- **`STUDY_PLANS.md`** — ✅ built. What a study plan is and how one reaches a congregation
  - A `Threads` row with `mode='sequence'`; a series publishes into one
  - Ministry channels can carry one (`CHANNELS_READ_ONLY_PILOT` lifted Aug 2026)
  - Attached material, progress, the public preview, and the gaps that remain
  - Start here before `CHURCH_STUDY_MATERIAL_LINKING.md` — that doc is the attach layer only

- **`CHURCH_CONNECTION_SYSTEM.md`** - Church connection implementation
  - User sets church → Church creates org → Auto-connection
  - Matching algorithm (name + city + state)
  - Database schema for churches
  - Connection request flow

- **`CHURCH_ORG_AND_CURRICULUM.md`** - Church org accounts & education curriculum vision
  - Vision: churches have org accounts for curriculum management; share threads/notes to attendees
  - Two layers: individual shared spaces (current) vs church-org distribution (future)
  - MyChurchPanel evolution: sync with available church organizations (Clerk), user links to church → receives curriculum
  - How curriculum flows (publish to org → inbox / “From your church” for org members)
  - References CHURCH_CONNECTION_SYSTEM, SHARING_AND_GROUPS_INFRASTRUCTURE

- **`RESOURCE_LIBRARY.md`** - Church (then school) Resource Library vs Planning Center Groups Resources
  - Study-native catalog: browse, pin, copy, and `@` mention library items inside notes
  - Org-owned library with space/ministry scopes; complements ministry broadcast channels
  - Naming: Library / LibraryItem (distinct from existing `noteType: 'resource'` bookmark notes)
  - Phases: space-local links → org files → library mentions → schools / ChMS import

- **`CLERK_ORGANIZATIONS_CHURCHES_CHECKLIST.md`** - Implementation checklist for Clerk Organizations for churches
  - What to think through: church sign-up, users joining (new/existing), MyChurchPanel evolution
  - Product flows, schema, auth/backend, invites/join, edge cases, UI/UX, migration
  - Summary table and pointers to CHURCH_CONNECTION_SYSTEM, CHURCH_ORG_AND_CURRICULUM

- **`CHMS_INTEGRATION_RESEARCH.md`** - ChMS integration research (Planning Center, Breeze, ChurchSoftware.com)
  - OpenFaith-first strategy with direct-API fallback; entity mapping to shared spaces
  - Roster sync, curriculum push, bidirectional attendance/progress, youth COPPA
  - UX spec: `/settings/church` expansion, church admin dashboard, program templates
  - ChurchSoftware.com partner outreach brief; gap analysis and phased roadmap
  - Resource Library complements PCO Groups Resources (see RESOURCE_LIBRARY.md)

### Sharing & Collaboration (✅ Implemented)

- **`SHARING_SYSTEM_DESIGN.md`** - Original sharing system design (implemented)
- **`SHARING_AND_GROUPS_INFRASTRUCTURE.md`** - Infrastructure analysis (implemented)
- **`SHARING_QUICK_REFERENCE.md`** - Quick comparison of sharing approaches (implemented)
- **`COLLABORATIVE_SHARED_SPACES.md`** - Collaborative shared spaces (implemented, v1 complete Feb 2026)
- **`SHARED_SPACES_LAUNCH_STRATEGY.md`** - Pre-launch product strategy for the July 2026 foundation rewrite: small-group differentiators (respond, group thread), operational checklist, messaging, and post-launch roadmap

### Real-Time Collaboration (Planned)

- **`REALTIME_SUPABASE_PLAN.md`** - Real-time collaboration with Supabase Realtime + Tiptap
  - Phase 1: Cross-device instant sync via Supabase Broadcast (invalidation signals)
  - Phase 2: Live shared spaces with Supabase Presence ("who's online")
  - Phase 3: Collaborative note editing via Hocuspocus + Yjs + Supabase Postgres persistence
  - Incremental rollout — each phase is independently valuable
- **`REALTIME_LIVEBLOCKS_PLAN.md`** - Original Liveblocks plan (archived for reference)

### User Experience

- **`NAV_PROFILE_AND_ACCOUNT_SWITCHER.md`** - Nav profile + search (desktop & mobile): current implementation, Claude-style richer account strip, plan/subtitle/actions, and account-switching directions (Clerk, orgs, family accounts)
- **`APP_LAYOUT_APPEARANCE_CUSTOMIZATION.md`** - App layout appearance customization
  - Themes: named presets (Default, Warm, Cool, Glass, Sepia) bundling background + appearance + tone
  - Customizable background (presets + optional custom color) as theme overrides
  - Appearance mode: default paper vs glass (transparent paper, tinted colors, backdrop blur)
  - Storage, CSS variables (`data-theme`, `--app-background`), settings UI, and implementation outline
  - Key files to touch and technical notes

- **`NOTE_TEMPLATES.md`** - Note templates (future feature)
  - Pre-defined study methods (SOAP, Inductive, Bible Nerd, Topical, Chapter Summary, Comparative)
  - User-created templates and "Save as template"
  - Shared-space templates for groups
  - Implementation outline and design considerations

- **`SCRIPTURE_NOTES_FUTURE_IMPROVEMENTS.md`** - Scripture note experience improvements
  - Overlapping passages: surfacing on scripture note view + merge action (redirect refs, update pills, delete merged note)
  - Related: overlap-aware reuse at creation, check-existing overlap, detection-time longer ref
  - Bible reader / “collected verses” view: see which verses you’ve saved across the Bible (book/chapter/verse, highlight saved)
  - Data and implementation notes for each

- **`QUESTION_HIGHLIGHT_SUGGESTIONS_NATIVE.md`** - Interrogative sentences: wavy inline suggestion + tap to create anchored study highlight (native TextKit exploration; implementation reverted — doc only)

- **`NATIVE_SPACE_CONTEXT_FOLLOWUPS.md`** - Native parity backlog for space context + co-editing (web shipped Aug 2026)
  - Highest priority: the author is locked out of their own note in My Home, because native renders from the `coEditEnabled` OR-mirror instead of the per-space association
  - Two-stage fix: scope the flag via `activeSharedAssociations`, then implement the pen lease (native has none today)
  - Also: whether the space picker orphans the open note, add-to-space (doesn't exist natively yet), and compose destination

- **`OFFLINE_MODE_IMPLEMENTATION.md`** - Offline mode architecture reference (✅ implemented)
  - Full offline read/write support with IndexedDB, sync queues, and conflict resolution

### Design track (decision docs — options + recommendation, awaiting a call)

Written August 2026 from the improvement list. Each states the problem, the real alternatives with
trade-offs, and a recommendation; each ends with a Decision log to fill in on review.

- **`TOOLBAR_SHAPE_LANGUAGE_OPTIONS.md`** - Toolbar orb vs sidebar tile (#11, #24)
  - **Decided Aug 21, unbuilt:** icon controls become tiles, labelled chips stay pills, avatar stays
    round; floating surfaces adopt the same rule (12px surface, 10px tiles); floating bars square on
    both platforms; 36px targets hold; toolbar and surfaces land as one change
  - Finds the sidebar tile's `9px` radius is an untokenized literal, and that web/native radii have
    already drifted on `button` and `scripturePill`
  - Includes the floating-menu cohesion half and why it should follow, not lead
- **`SUGGESTION_ACTIONS_REDESIGN.md`** - What a reader can say to a suggestion (#19, and #2's generalization)
  - Recommends two honest answers: "Not now" (21 days) and a genuinely permanent "Not interested"
  - Documents that "Don't suggest this again" was a 21-day snooze; two contained fixes already shipped
- **`HIGHLIGHT_REFERENCE_STYLING_SPEC.md`** - What the four marks look like, everywhere (#5, #3)
  - **Decided Aug 21, unbuilt:** everything levels on solid 2px (the dock and native come *down*,
    so the chapter's thickness never changes); a saved reference and a highlight are told apart by
    offset — 3px vs 2px — rather than by weight; one spotlight mechanism across all four surfaces;
    the reader toolbar flips above a selection rather than overlapping the dock band; the highlight
    dock's excerpt stays unpainted
  - Records that the same highlight renders 2px in the reader and 3px in the dock, and — corrected
    by measurement in the `ds-23-mark-styling` scene — that a highlight and a saved reference are
    indistinguishable in the reader *and* the note body, not just the note body
  - Compare the surfaces, and toggle the proposed spec, in `ds-23-mark-styling`
- **`READER_PARTIAL_VERSE_HIGHLIGHTS.md`** - Highlighting less than a whole verse (#7)
  - Recommends reusing the excerpt model the dock and native already share, painted imperatively
  - Names the blocking piece: the server upsert key is verse-granular and must gain the excerpt
- **`SPACES_PLANNER_AND_GATHERINGS.md`** - Shared spaces, the planner, and gatherings (#1)
  - **Mostly a correction**: nearly every piece this item was framed around has since shipped,
    checked row by row against `main`
  - The one live gap: a church's next service reaches Home, a room's next gathering does not
  - **Decided Aug 21:** Home is a cross-context front page — gatherings reach it, bounded by the
    four-day wall, in one "Coming up" group ordered by date, one card for leaders and members alike
- **`READER_MARGIN_INDICATORS.md`** - How the reader says "you have written about this" (#8)
  - **Decided Aug 21, unbuilt:** the bar stays; the verse carries a visually-hidden "in one of your
    notes" so the signal is not sight-only; a merged bar keeps its own span; the spoken cue follows
    the `showMarginNotes` preference
  - Finds the presence signal has no non-visual equivalent, and that a bar merged past the
    three-lane cap is stretched to a span no note actually cites
  - Compare the options in the `ds-22-margin-indicators` gallery scene rather than from the prose

Two of these are decided and built. `TOOLBAR_SHAPE_LANGUAGE_OPTIONS.md` (Option B: tile shape,
glass kept) is decided and awaiting implementation; `SUGGESTION_ACTIONS_REDESIGN.md` (Option B)
shipped in v2.78.0.

## 🎯 Implementation Priority

> **This section is stale (last accurate ~early 2026) and kept for history, not
> sequencing.** Reality has diverged on every phase below: native shipped as a
> Swift app, not Capacitor; Realtime shipped as part of Shared Spaces
> co-editing; and Church Connection remains partially built (identity + staff
> sync live, billing + self-serve signup not). For current priorities, read
> [NATIVE_SPACE_CONTEXT_FOLLOWUPS.md](./NATIVE_SPACE_CONTEXT_FOLLOWUPS.md)
> (freshest, names a live regression),
> [SHARED_SPACES_ROADMAP.md](./SHARED_SPACES_ROADMAP.md), and
> [MEMORY_LAYER_ASSESSMENT.md](./MEMORY_LAYER_ASSESSMENT.md).

### ✅ Completed
- **Sharing System** — Public share links and collaborative shared spaces, including co-editing (implemented)
- **Offline Mode** — Full offline read/write with IndexedDB, sync queues, and conflict resolution (implemented)
- **Real-Time Collaboration** — Supabase Realtime shipped as the transport for co-editing (private channels, RLS-enforced); see `server/utils/realtime.ts` and `src/hooks/useNoteEditLease.ts`. `REALTIME_SUPABASE_PLAN.md`'s phases 1–3 are largely done.
- **Native Mobile Apps** — shipped, but as a native SwiftUI app (`native/Harvous/`) targeting iOS + macOS directly against the same Hono API, **not** Capacitor. `CAPACITOR_STRATEGIC_ANALYSIS.md` and `CAPACITOR_SETUP_GUIDE.md` are superseded — the team took the native-first path instead.

### Church Connection — partially built
- Live: church identity, staff sync, HMC directory, admin provisioning (`server/routes/churches.ts`, `/admin/churches`), org-owned broadcast spaces.
- Not yet: self-serve church signup, `ChurchConnectionRequests` (congregant connect flow), `Churches.billingPlan`. See [CHURCH_CONNECTION_SYSTEM.md](./CHURCH_CONNECTION_SYSTEM.md) and [PASTOR_FEATURES_ROADMAP.md](./PASTOR_FEATURES_ROADMAP.md) for current state and the recommended first general-purpose build (note templates).

## 🗄️ Database Schema

### Add Now (Safe)
- `UserMetadata.connectedChurchId` (optional)
- `UserMetadata.connectedOrgId` (optional)

### Add Later (When Implementing Features)
- `Churches` - Church organizations
- `ChurchConnectionRequests` - Pending connections

See `CLERK_MONETIZATION_ARCHITECTURE.md` for complete database schemas.

## 🚀 When to Implement

**Not for V1:**
- All features in this folder are post-V1
- Focus on Note Types and Selected Text for V1
- Launch V1 first, then add these features

**After V1:**
- Implement based on user feedback and priorities
- All architecture is ready
- Just need to build the features

## 📚 Related Documentation

- **`../ARCHITECTURE.md`** - Core app architecture
- **`../FEATURES.md`** - Current feature set
- **`../CHANGELOG.md`** - V1 release notes and feature history

## 💡 Key Principles

1. **Design First** - All features are fully designed before implementation
2. **Flexible** - Architecture supports multiple use cases
3. **Scalable** - Built to handle growth
4. **Ready When You Are** - All documentation ready, implement when needed

---

**Status**: Some features implemented (see above); rest documented and ready for implementation post-V1 🚀

