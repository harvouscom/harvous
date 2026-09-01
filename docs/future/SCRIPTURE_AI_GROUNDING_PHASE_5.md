# Scripture AI Grounding (Phase 5)

> **Superseded for Review (September 2026).** Review shipped in 3.0 **without generative AI**,
> and the Mistral runtime described below was never built. Prompts are authored
> (`src/utils/review-prompts.ts`) and filled with the reader's own notes, passages and
> connections; the schedule is arithmetic (`src/utils/review-scheduling.ts`); nothing the
> reader writes is graded. The product position is in
> [REVIEWS_CHALLENGES_SEASON_PASS_STRATEGY.md](./REVIEWS_CHALLENGES_SEASON_PASS_STRATEGY.md):
> Harvous surfaces and sequences a person's own study, and does not generate study content for
> them.
>
> What survives here is the **grounding layer's** value for deterministic work — cross-refs,
> themes, entity refs, `getRelatedNotesForPassages` — which Review's prompt context already
> uses without a model. Read sections 3 and 5 as a design for a runtime that does not exist.
> If generation is ever proposed, the cost constraint in
> [billing-plans.ts](../../src/lib/billing-plans.ts) still applies, and so does the product
> decision, which would have to change first.

The phase where the deterministic Scripture Knowledge Layer (Phases 0-4) becomes the
**grounding substrate** for Harvous's first user-facing AI feature: **Review** — personal, interactive
quiz sessions from the user's own notes. The model formats questions from real cross-references,
themes, and related notes instead of recalling facts — cheaper, more accurate, and far less prone to
fabricating Scripture.

**Status:** Decision doc. Not started. Phases 0-4 of [SCRIPTURE_KNOWLEDGE_LAYER.md](./SCRIPTURE_KNOWLEDGE_LAYER.md)
are complete. Phase 5 introduces (a) the first runtime AI call path and (b) the **Review** paid
product. Product and pricing decisions live in
[MONETIZATION_AND_PRICING.md](./MONETIZATION_AND_PRICING.md).

**Guiding principle:** AI is optional polish on a deterministic core. Deterministic practice (connection
MCQ from the knowledge layer) and Compete's free track work without runtime AI. **Review is always paid
and always individual.**

**Deferred:** [Give Me More Context](./GIVE_ME_MORE_CONTEXT.md) (GMMC) — not v1; may reuse the same
grounding builder if built later.

---

## 1. Where this fits

Phase 5 is the last knowledge-layer roadmap bullet: ground AI on the layer for **Review** (customer-facing
name for the Learn pillar's personal practice). It maps to [HARVOUS_NORTH_STAR.md](./HARVOUS_NORTH_STAR.md)
— *"Study smarter. Review what's actually yours."*

**Single v1 consumer:** **Review** — AI-generated quiz sessions from the user's notes (recall prompts,
connection challenges, fill-in-blank), grounded on the knowledge layer.

**Not in v1 runtime scope:**

- **GMMC** — deferred vision doc only.
- **Compete / curated challenges** — mostly deterministic + editorial content; Season Pass monetization
  per [MONETIZATION_AND_PRICING.md](./MONETIZATION_AND_PRICING.md), not Mistral at scale for curated
  guides.

**Platform:** Web-first — SPA calls Hono API; native is a client of the same endpoints. Optional
on-device Apple Foundation Models on native later ([ScriptureReflectionGenerator](../../native/Harvous/Services/ScriptureReflectionGenerator.swift))
is not the primary path.

---

## 2. Why ground at all

Today nothing in Harvous calls an LLM at runtime. Claude is used only in **offline authoring scripts**
(`server/scripts/author-subjects.ts`, `npm run bible:generate`). Phase 5 adds the first live request path.

Harvous already has the facts as indexed rows:

- `ScriptureCrossReferences` (TSK) — real cross-references.
- `ScriptureTopicVerses` / `ScriptureTopics` (OpenBible) — real themes.
- `ScriptureEntityRefs` + `BiblePeople` / `BiblePlaces` — people and places.
- `getRelatedNotesForPassages(userId, passages)` ([server/utils/scripture-knowledge.ts](../../server/utils/scripture-knowledge.ts)) — the user's own connected notes.

The model **writes questions about supplied facts** rather than asserting scripture from memory.

```mermaid
flowchart LR
  Notes["User notes + passages"] --> Builder[Grounding context builder]
  Builder --> KL["Knowledge layer: cross-refs, themes, entities"]
  Builder --> Related["getRelatedNotesForPassages"]
  KL --> Context[Structured context block]
  Related --> Context
  Context --> Prompt[Grounded system prompt]
  Prompt --> Mistral[Mistral Small web API]
  Mistral --> QuizJSON["Quiz session JSON"]
```

---

## 3. Shared grounding context builder

One server-side builder reused by Review (and GMMC later if ever built).

**Input:** note snippets and/or `VerseKey[]`, optional `noteId`, user translation preference.

**Process:**

- `getKnowledgeForPassages(passages)` — cross-refs, themes, people, places (bounded).
- `getRelatedNotesForPassages(userId, passages)` — related note titles + connection reasons.
- Token caps via existing limit options (`crossRefLimit`, `themeLimit`, `limit`).

**Output:** compact structured block for the system prompt — facts only, not prose.

**Runtime stack:**

- **Model:** Mistral Small (`mistral-small-latest` or successor) via server SDK or REST.
- **Not at runtime:** OpenAI, Claude (Claude stays offline-only for authoring scripts).
- **Env:** e.g. `MISTRAL_API_KEY` on Netlify functions (separate from `ANTHROPIC_API_KEY`).
- **Bundling:** single bundled API function — SDK must bundle cleanly (AGENTS.md contract).
- **Clients:** web SPA + native call the same `/api/review/...` endpoints.

**Session pattern:** generate N questions **once per session**, cache server-side or return session id;
grade deterministically from stored correct keys — never ask the model to grade.

**Faith guardrails (AGENTS.md "Faith and AI"):**

- Never fabricate verses; correct answers come from grounding data.
- Identify AI output as AI.
- Questions reflect user note content, not generic trivia or authoritative doctrine.

---

## 4. Review product shape

**Paid SKU:** [MONETIZATION_AND_PRICING.md](./MONETIZATION_AND_PRICING.md) — **Review** $4/mo, always
individual (own notes, preferences, pace). Not included in Group Leader or church org as shared access.

**Question types:**

| Type | LLM needed? |
|---|---|
| Connection MCQ ("which passage links to X?") | Optional — often fully deterministic from TSK |
| Recall from user note text | Yes — Mistral formats question from supplied snippet |
| Fill-in-blank from note | Often template; LLM for variety |
| Theme / entity match | Deterministic from knowledge layer |

**Free tier:** deterministic practice only; **no free AI Review sessions** (optional one-time trial —
open decision in monetization doc).

**Compete:** separate product — current season free track; **Season Pass** for full curated guide.
Personal Review complements but does not replace Compete.

---

## 5. Cost and abuse control

- **Cost drivers:** Mistral Small pricing, grounding prompt size, sessions per user.
- **Cache** grounding blocks by passage key (shared across users).
- **Rate limit** AI endpoints (`rateLimit` middleware).
- **Token budget** on grounding + max output tokens per session.
- **Gate:** `canUseAiFeature(auth)` → `{ allowed, reason }` checks `hasReview` (future entitlement).

---

## 6. Monetization

Canonical pricing: [MONETIZATION_AND_PRICING.md](./MONETIZATION_AND_PRICING.md).

| Decision | Recommendation |
|---|---|
| Paid boundary | **Review always paid** — no monthly free AI credits |
| Product name | **Review** (customer); Learn pillar (internal) |
| vs Group Sharing | Separate SKUs — no bundle; users subscribe to each independently |
| vs Compete | Season Pass for challenges; Review for personal notes |
| Group Leader | Pays to host spaces; **does not** include member Review |
| Enforcement | `canUseAiFeature` / `hasReview` on Review endpoints |
| Church (future) | Optional bulk Review **seat packs** — each seat still individual |

Existing `UserMetadata.tier` (`free` | `unlimited`) maps to **Group Sharing** today; Review adds a
separate entitlement when implemented.

---

## 7. Open decisions checklist

- [ ] Mistral model id + structured output schema for quiz sessions.
- [ ] Accuracy eval fixtures (fabrication rate, answer fidelity, note fidelity).
- [ ] Grounding token budget (cross-refs / themes / related notes caps).
- [ ] Context cache strategy + invalidation.
- [ ] One-time Review trial on signup (yes/no).
- [ ] Fair-use session cap for paid Review vs unlimited.
- [ ] GMMC later: shared Review entitlement vs separate (when/if built).
- [ ] Native on-device generation: optional fallback vs server-only.

---

## 8. Phased rollout

1. **Grounding builder** — pure + server util; unit tests.
2. **Review session endpoint** — Mistral generates cached quiz set; deterministic grading.
3. **Review billing** — `hasReview`, upgrade UI, `canUseAiFeature`.
4. **Deterministic Compete** — free track; Season Pass content pipeline (minimal runtime AI).
5. **Group Leader** SKU (sharing/admin; members buy Review individually).

GMMC and full Compete editorial pipeline are not blockers for steps 1–3.

---

## Related Docs

- [MONETIZATION_AND_PRICING.md](./MONETIZATION_AND_PRICING.md) — Review, Sharing, Season Pass, Group Leader.
- [SCRIPTURE_KNOWLEDGE_LAYER.md](./SCRIPTURE_KNOWLEDGE_LAYER.md) — Phases 0-4 substrate.
- [GIVE_ME_MORE_CONTEXT.md](./GIVE_ME_MORE_CONTEXT.md) — deferred; not v1.
- [HARVOUS_NORTH_STAR.md](./HARVOUS_NORTH_STAR.md) — Learn / Compete pillars.
- [HARVOUS_SDK_AND_FUTURE_ROADMAP.md](./HARVOUS_SDK_AND_FUTURE_ROADMAP.md) — challenges vs personal Review.
- [../../server/utils/tier-limits.ts](../../server/utils/tier-limits.ts) — sharing entitlements today.
