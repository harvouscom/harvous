# Memory Layer — Assessment & Roadmap

Status: **Workstreams A, B, and C shipped 2026-06-26.** This doc's scorecard and
roadmap below describe the *pre-implementation* state and are kept for the
reasoning, not the status column — see "What shipped" for what's actually live.
Last updated 2026-06-26 (assessment); status corrected 2026-08-01.

## What shipped (2026-06-26)

- **A — fingerprints:** `9968bbec` `feat(memory): passage memory fingerprints`.
  Persisted `NoteFingerprints` table (themes, people, places, `emotionalTone` via
  a new lexicon, `meaningWeight`), computed in
  [server/utils/note-fingerprint.ts](../../server/utils/note-fingerprint.ts) and
  hooked into `process-scripture-references.ts`. Backfilled to 524 existing notes.
- **B — forgetting-aware resurfacing:** `3d440931`
  `feat(memory): forgetting-aware resurfacing`. Retrievability-based ranking in
  [server/utils/note-recall-state.ts](../../server/utils/note-recall-state.ts) and
  `pickRevisitNote()`, replacing recency-only ordering; stability persists across
  devices on `NoteFingerprints`.
- **C — study arcs:** `6216a22b` `feat(memory): study arcs`. `deriveStudyArcs()` in
  [src/utils/prototype-home-trends.ts](../../src/utils/prototype-home-trends.ts)
  groups themed notes into 6-month arcs; surfaced as a Home card.
- **Recall carousel:** `dd769b20` unified the Home resurfacing surface (note +
  highlight + arc + subject + cross-ref + passage) into one swipeable, snoozable
  carousel, replacing the older loose card stack.
- **Generative recall, phase 1:** `9a4c2a9d` — four client-side generative cards
  (continue-book, recurring-person, bare-highlight, reflection-prompt) that seed a
  draft note instead of just resurfacing one.

**Recall trails were deliberately dropped**, not deferred: a read-only DB check found
only 8 `NoteConnections` edges across 5 of 115 users with zero chains longer than 2
notes — an explicit-link trail would be invisible to ~96% of users. The narrower
`buildStudyThreadTrail` / inspector spine still exists for that 4%.

**Generative recall, phase 2** (`crossrefGap` and `connectNotes` cards) is approved
but deferred — plan at `~/.claude/plans/i-m-wondering-how-great-foamy-dusk.md`.

**Still genuinely not done:** workstream A's inspector read-out (declined by the
user), and the paid `review` feature (practice-from-your-notes) that this layer is
meant to ground per `SCRIPTURE_AI_GROUNDING_PHASE_5.md`.

## Context

A Perplexity write-up framed a "scripture-centered memory graph" — recall trails, forgetting-aware
resurfacing, passage memory fingerprints, and a "living commentary on your own life" — as the most
promising direction for Harvous. This doc answers two questions honestly from a full code read:
**how good is our memory layer against that vision today, and what should we build next?**

Headline finding: **Harvous has already built the hardest, most defensible part of that vision — a
real canonical scripture knowledge graph — but the resurfacing *intelligence* on top of it is only
half-built.** We are strong on structure, thin on time and narrative. Most of what Perplexity calls
"novel" is exactly the part we haven't built yet, sitting on infrastructure we already own.

This complements the data-layer roadmap in [SCRIPTURE_KNOWLEDGE_LAYER.md](./SCRIPTURE_KNOWLEDGE_LAYER.md)
and the UX exploration in [STUDY_SURFACES_AND_KNOWLEDGE_UX.md](./STUDY_SURFACES_AND_KNOWLEDGE_UX.md).

---

## Scorecard — Perplexity vision vs. what exists

| Perplexity concept | Status | Evidence in code |
|---|---|---|
| Scripture-centered knowledge graph (note↔passage↔theme↔person↔place) | **Built (data) / on-demand (edges)** | Canonical layer: 341k+ TSK cross-refs, 629k+ OpenBible topic→verse edges, 3.1k people, 1.3k places, keyed on `(book,chapter,verse)`. `server/db/schema.ts` (`ScriptureMetadata`, `ScriptureCrossReferences`, `ScriptureTopicVerses`, `BiblePeople/Places`, `ScriptureEntityRefs`); `server/utils/scripture-knowledge.ts`. No AI — deterministic SQL joins. |
| Passage-mediated relatedness (notes related via shared passage / cross-ref / theme) | **Built, but ephemeral** | `getRelatedNotesForNote()` + `rankRelatedNotes()` score shared-passage (3) / cross-ref (2) / theme (1). Computed per request, never persisted. `server/utils/scripture-knowledge.ts`. |
| Forgetting-aware resurfacing (high meaning × low revisit) | **Partial — recency only** | `pickRevisitNote()` = 14-day age gate + 21-day cooldown + daily rotation + substantive-first ranking. No meaning score, no forgetting curve, no spaced-repetition. `src/utils/prototype-home-trends.ts`, `spa/src/pages/prototype/proto-recall-cooldown.ts`. |
| Passage memory fingerprints (themes + tone + people + linked passages per note) | **Components exist, never assembled; tone missing** | Passages (`ScriptureMetadata`), people/places + themes (`server/utils/passage-aware-tags.ts`, `NoteTags`). Never unified into one per-note object. **Emotional tone is captured nowhere.** |
| Recall trails (how one insight led to another over time) | **Missing** | Only seed is `Notes.linkedFromNoteId` (one-way "created from highlighting another"). No temporal chaining or trail surface. |
| "Living commentary on your life" — 6-month study arcs | **Missing (stubbed)** | Closest live pieces: `deriveSubjectConnections()`, lead-theme, `computeActivityRhythm()` — none time-windowed into arcs. Explicit stub in `spa/src/pages/prototype/PrototypeSidebarHomeView.tsx`: "a future recall/review pass will resurface notes from this season." |

**Bottom line:** the moat (canonical graph + passage-first relatedness) is real and rare. The gap is
turning the graph + timestamps we already have into **meaning-scored resurfacing, per-note
fingerprints, and time-aware trails/arcs.**

---

## Guiding principles (keep these)

- **Deterministic-first, no-AI default.** The current layer is fully deterministic, offline-capable,
  and grounded in real facts (real cross-refs, real entity mentions). That is a differentiator, not a
  limitation — preserve it. Emotional tone is the one place AI tempts us; do lexicon-first, AI optional later.
- **Server-derived so native gets it free.** Highlights/study entries are shared with native iOS
  (`StudyThreadEntries`). Fingerprints and scores should be computed server-side in the existing
  scripture-processing pipeline so web + native both benefit.
- **Respect existing intent signals.** Pins, `collectionUserOverride`, `dismissedAutoTags`, and the
  21-day recall cooldown already encode user intent — new scoring must consume, not override them.

---

## Roadmap

Three co-equal workstreams. Independent in user-facing value, but they share one substrate:
**Workstream A (fingerprints) is the cheapest force-multiplier** — it carries the `meaningWeight` B
needs and the per-note themes C needs. Recommended build order A → B → C, but each ships value alone.

### A. Passage memory fingerprints (the substrate)

**Goal:** one persisted, per-note semantic profile, recomputed on save.

**Build:**
- A persisted fingerprint per note (new `NoteFingerprints` table, or a JSON column on `Notes` to ride
  existing offline-sync rails — decide in design). Fields:
  - `passages` — from `ScriptureMetadata` (already stored).
  - `themes` (weighted) — from OpenBible topics + curated `chapter-subjects.json` + `NoteTags`.
  - `people`, `places` — from `ScriptureEntityRefs` / `passage-aware-tags.ts`.
  - `emotionalTone` — **NEW.** Lexicon-based (lament / joy / fear / gratitude / hope / conviction /
    awe), reusing the keyword-corpus pattern in `src/utils/bible-study-keywords.ts`. No AI.
  - `meaningWeight` — **NEW.** Composite of: substantive length, has-highlights, passage count,
    pin/override, edit count. Reuse the `isSubstantiveNote` heuristic from `prototype-home-trends.ts`.
- Compute inside the existing pipeline: `server/utils/process-scripture-references.ts`.

**Reuse:** `passage-aware-tags.ts`, `scripture-knowledge.ts` (`getNotePassages`, theme aggregation),
`bible-study-keywords.ts`, `chapter-subjects.json`.

**Done when:** every note (web + native) has a fingerprint on save; `meaningWeight` and `themes` are
queryable; a minimal read-out appears in the note inspector (no graph).

### B. Forgetting-aware resurfacing

**Goal:** high-meaning, fading notes resurface *before* low-meaning ones — without manual grading.

**Build:**
- Replace the recency-only ranking in `pickRevisitNote()` with a retrievability score:
  `R = exp(-Δt / stability)`, where `Δt` = time since last meaningful revisit and `stability` lengthens
  each time the user actually engages a recall card (FSRS/SM-2-lite, no quality grade).
- Surface order = low `R` first, weighted by `meaningWeight` (from A); keep daily rotation as the
  deterministic tie-break.
- Persist per-note `stability` + `lastReviewedAt` (in the fingerprint or a note column;
  `proto-recall-cooldown.ts` already records recall opens — the natural hook to bump stability).

**Reuse:** `pickRevisitNote()`, `proto-recall-cooldown.ts`, `isSubstantiveNote`,
`PrototypeSidebarHomeView.tsx` "Worth another look" card.

**Done when:** with seeded notes, a high-meaning 30-day-quiet note outranks a thin 30-day-quiet note;
opening + engaging a recall lengthens its interval; still deterministic per day.

### C. Recall trails & study arcs ("living commentary")

**Goal:** show how insights connected over weeks/months — the hardest-to-copy, most "Harvous" feature.

**Build:**
- **Recall trails:** order `linkedFromNoteId` + `NoteConnections` + shared-passage links by `createdAt`
  into a sequence ("Insight A → B → C"). Reuse the BFS in `server/utils/study-thread-graph.ts`, then
  sort by time.
- **Study arcs:** over a rolling window (e.g., 6 months), compute top recurring themes from fingerprints
  (A), bucket notes by month, and narrate the arc deterministically ("Over 6 months you've returned to
  *Suffering & Hope* across 9 notes, starting in January with Romans 8…"). Reuse
  `deriveSubjectConnections()` + `computeActivityRhythm()` patterns, adding the time dimension.
- New derive helpers (`deriveStudyArcs`, `deriveRecallTrail`) in `src/utils/prototype-home-trends.ts`;
  a Home card / dedicated arcs surface; wire the existing empty `onClick` stub in
  `spa/src/pages/prototype/PrototypeSidebarHomeView.tsx`.

**Reuse:** `study-thread-graph.ts`, `deriveSubjectConnections`, `computeActivityRhythm`,
`linkedFromNoteId`.

**Done when:** a user with ~6 months of notes sees at least one coherent arc and one trail;
deterministic; no AI required.

---

## One architectural decision to make in design

**Persist vs. recompute.** Forgetting scores (B) and arcs (C) both need state that *accumulates*
(`meaningWeight`, `stability`, `lastReviewedAt`, monthly theme history). Today relatedness is
recomputed every query and thrown away. Recommendation: **persist the per-note fingerprint** (node-level
attributes) so accumulation is possible — but do **not** persist/visualize an edge graph (intentionally
out of scope). Decide table vs. JSON-column on `Notes` during design, weighing offline-sync.

## Risks / watch-items

- Emotional-tone lexicon will be noisy at first — gate it behind a relevance threshold like the existing
  `MIN_THEME_CORROBORATION_RELEVANCE = 50` pattern; never let tone auto-create folders/tags.
- Don't let forgetting-aware scoring fight pins/overrides/cooldown — those win.
- Keep heavy fingerprint computation off the typing hot path (it already runs post-idle in
  `process-scripture-references.ts`); native parity means server-side derivation.

## Verification (per workstream, when built)

- **A:** seed notes with known passages → confirm fingerprint rows have correct themes/people/places,
  a sane `meaningWeight`, and a tone label; spot-check the inspector read-out.
- **B:** seed pairs of equal-age notes differing only in meaning signals → confirm ordering; open a
  recall card → confirm `stability` bump lengthens the next interval.
- **C:** seed ~6 months of themed notes → confirm at least one arc narration and one time-ordered trail;
  verify determinism (same day = same output).
