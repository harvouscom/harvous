# Give Me More Context

An on-demand AI context panel that surfaces bite-sized, relevant background for any scripture the user is engaging with — without overwhelming them.

**Status:** Not started. Vision doc only.

---

## Problem

Most AI Bible tools dump too much at once. A user who taps a verse doesn't want a commentary chapter — they want *one interesting thing* that helps them go deeper. The goal here is to match the depth of curiosity in the moment, not max out the AI's knowledge.

---

## Entry Points

- Scripture note view (any saved note with a scripture reference)
- Verse of the Day
- Any selected/highlighted passage in the editor

A small "Give me more context" affordance (button or tap target) appears on each of these surfaces.

---

## UX Pattern

Tapping "Give me more context" opens a **bottom sheet / panel**.

The panel is transparent about what the AI is doing — modeled after the Claude mobile conversation summary UI:
- Shows processing steps as they happen: *"Looking at historical context…"*, *"Checking cross-references…"*, *"Reviewing original language…"*
- Steps appear as expandable rows so the user can drill in if they want
- Feels like a knowledgeable friend working through the question, not a search result

This transparency builds trust and makes the experience feel alive rather than instant-black-box.

---

## Key Differentiator: Bite-Sized Context

Instead of generating everything at once, the panel starts with **2–3 light framing questions** to understand what the user actually wants:

- Historical or cultural background?
- Original language insight (Hebrew/Greek)?
- Cross-references — how does this connect to other passages?
- Theological or doctrinal angle?
- How does this connect to my notes?

Each selection surfaces **one focused, digestible chunk** — not a wall of text.

---

## "I'm Feeling Lucky" Option

Always present alongside the framing questions. Inspired by Google's original *I'm Feeling Lucky*.

- Skips the questions entirely
- Surfaces the single most interesting/relevant bit of context the AI would choose for this passage
- Low friction, high delight — great for casual moments or when the user just wants to be surprised

---

## AI Model & Cost

- Use a **cost-efficient model** (e.g., `claude-haiku-4-5-20251001`) to keep per-request costs low at scale
- Must be accurate with biblical/theological context — validate model selection against scripture and historical accuracy before shipping
- Ground each request with a focused system prompt that includes: book, chapter, verse range, and user's translation preference
- Grounding the prompt (rather than retrieval) keeps latency low and costs predictable

---

## Monetization

AI-powered feature → **premium tier**. Follows the same pattern as the AI "Ask" queries in `SMS_AND_EMAIL_CAPTURE.md`.

Free users might get 1–3 uses/month to experience it before hitting a paywall.

---

## Related Docs

- [HARVOUS_NORTH_STAR.md](./HARVOUS_NORTH_STAR.md) — "Learn" pillar; this feature fits between Remember and Learn
- [SMS_AND_EMAIL_CAPTURE.md](./SMS_AND_EMAIL_CAPTURE.md) — AI premium tier pattern
- [SCRIPTURE_NOTES_FUTURE_IMPROVEMENTS.md](./SCRIPTURE_NOTES_FUTURE_IMPROVEMENTS.md) — Other scripture note enhancements
