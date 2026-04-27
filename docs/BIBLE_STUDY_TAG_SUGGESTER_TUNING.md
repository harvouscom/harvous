# BibleStudyTagSuggester Tuning Guide (Native)

This document explains how native auto-collection and tags are generated in `native/Harvous/BibleStudyTagSuggester.swift`, what factors affect outcomes, and how to tune behavior safely.

## Purpose

`BibleStudyTagSuggester` does two things from note title + body:

- Generates up to 12 tags (`note.tags`)
- Chooses one primary collection (`note.primaryCollection`)

The intent is:

- Organize notes by Bible-study meaning (themes/topics first)
- Still surface people/places/books when they are truly central
- Avoid noisy or duplicate-overlap tags

## Where It Runs

Tagging is applied from multiple editor flows, so collection/tag output stays updated as note content changes:

- New note save path (`ComposeView`)
- Debounced autosave while editing (`NoteEditorView`)
- Manual flush/persist paths on note switch/background (`NoteEditorView`)

That means primary collection can change over time as note content grows.

## End-to-End Pipeline

## 1) Build searchable text

The suggester combines title + body into a lowercase corpus:

- `titleLower`
- `contentLower`
- `textLower`

## 2) Score keyword rows

For each keyword row (name/category/base/synonyms):

- Match by direct contains for row name and synonyms
- For single-word rows with no synonyms, use whole-word regex
- Track:
  - whether match appears in title
  - frequency count of matches

Confidence starts at `base` and adds:

- `+0.2` if found in title
- `+0.1` per extra mention after first, capped at `+0.5`

Final confidence is capped at `1.0`.

## 3) Add Bible book matches

Canonical book names are checked separately and added as `.book` category with high base confidence.

## 4) De-duplicate overlap

Candidates are sorted by confidence, then filtered:

- Remove exact duplicates
- Remove overlapping concepts (`overlaps(...)`) so near-synonyms do not crowd top tags

## 5) Apply category boost for top-tag ordering

Rows in `bibleStudyBoostCategories` receive an additional confidence bump (`+0.05`) before final top-tag ranking.

## 6) Select top tags

Top 12 by confidence become `note.tags`.

## 7) Choose primary collection

Primary is selected from top tags using `primaryScore(...)`, then tie-broken by `collectionRank(...)`.

This now encodes the desired rule:

- Theme categories usually win for casual mentions
- Character/place can win when repeated enough to indicate central focus

## Categories and Their Role

Categories currently include:

- `spiritual`
- `biblical`
- `life`
- `book`
- `character`
- `place`

`collectionRank(...)` is only a tie-breaker (lower rank wins) after primary score comparison.

## Primary Collection Logic (Current Behavior)

`primaryScore(...)` starts from candidate confidence and adjusts:

- Theme categories (`spiritual`, `biblical`, `life`): small bonus
- `character` / `place`:
  - single mention: penalty
  - repeated mentions: progressively larger bonuses
  - high repetition can overtake themes
- `book`: neutral adjustment (uses base confidence)

This is the key balancing mechanism for:

- Mentioning "David" once in a prayer note -> likely keeps a theme primary
- Note repeatedly centered on David’s life -> character can become primary

## Overlap Behavior

`overlaps(...)` avoids clutter from semantically adjacent tags.

It currently uses:

- Exact match
- Containment (`x contains y`)
- Curated conceptual pairs

This keeps outputs compact but can hide intended nuance if overlap pairs are too aggressive.

## Practical Tuning Levers

Use these levers in order of impact:

1. `keywordRows` coverage
   - Add missing themes/emotions/doctrines
   - Add careful synonyms (avoid broad words that cause false positives)

2. Base confidence per row
   - Raise for high-signal theological concepts
   - Lower for generic/noisy concepts

3. Title/frequency boosts
   - Increase if title intent should dominate more
   - Reduce if long notes are over-amplifying repetition

4. `primaryScore(...)` adjustments
   - Strongest lever for "theme vs character/place" behavior
   - Tune mention thresholds and bonuses/penalties

5. `bibleStudyBoostCategories`
   - Influences top tag ordering and candidate mix before primary pick

6. `overlaps(...)` pairs
   - Add pairs to collapse duplicates
   - Remove pairs if you need both concepts visible together

## Recommended Tuning Workflow

1. Gather real note samples (short, medium, long; devotional, doctrinal, character-study, place-study).
2. For each sample, record:
   - expected primary collection
   - expected top 3-5 tags
3. Compare expected vs actual output.
4. Tune one lever at a time (prefer `primaryScore` and row confidence first).
5. Re-check all samples for regressions.
6. Only then expand synonyms broadly.

## Guardrails

- Avoid overly generic synonyms (`spirit`, `light`, `way`) unless strongly disambiguated.
- Keep overlap pairs focused; overuse can erase useful distinctions.
- Prefer explicit theological/topic phrases for high precision.
- Keep category strategy stable so library organization feels predictable across edits.

## Debugging Checklist

When a primary collection looks wrong:

1. Confirm actual note `title` + `body` include the expected terms.
2. Check if expected terms exist in `keywordRows` (or synonyms).
3. Check repetition count (single mention vs repeated focus).
4. Check if overlap removed the desired tag.
5. Check if a competing tag has stronger base+boost score.
6. Tune `primaryScore` thresholds if issue is character/place dominance.

## Future Improvements (Optional)

- Add lightweight explanation metadata (why a primary/tag won) for debug UI.
- Add fixture-based unit tests for representative note scenarios.
- Consider phrase-level or section-aware weighting (intro vs body vs conclusion).
- Split very broad categories into sub-taxonomies if library growth needs it.

