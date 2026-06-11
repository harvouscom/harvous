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

- Match row name and each synonym using **whole-word regex** when the needle is one token (so e.g. `hello` never matches keyword `Hell`)
- Match multi-word synonyms (and multi-word rows) using a **bounded phrase regex** (`\b…\b` around the normalized phrase); still use substring containment for multi-word Bible book names in the separate book pass
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

**Tags** stay the top 12 keyword names by confidence (`picked.prefix(12)`).

**Primary folder** is chosen from the **full** overlap-deduped `picked` list (not only those 12): fold all rows with `betterPrimaryCandidate`, which compares `primaryScore`. When two scores are within `primaryScoreAmbiguityEpsilon` (~0.04), the tie-break prefers **title presence** (`inTitle`), then **lower** `folderCategoryRank` (better category for a shelf label).

This encodes:

- A topic that only surfaces as an auto **secondary** folder candidate can still become **primary** if its folder score beats everything else (fixes “first high-confidence tag always wins primary”).
- Theme categories usually win for casual mentions; character/place win when the score is genuinely stronger (repetition/title), not merely because they appeared in the tag top 12.

## 8) Secondary folders vs tags

**Cascade (least → most organizing weight):** primary folder → secondary folders → tags. Folder labels are never duplicated as auto-tags; tags only surface keywords that did not become primary or secondary folders.

Assignment order:

1. Score keyword rows from title + body.
2. **Concept overlap dedupe** — drop lower-scoring rows when concepts overlap (e.g. `Salvation` vs `Redemption` via synonym). Shared pairs live in [`src/utils/bible-study-concept-overlaps.ts`](../src/utils/bible-study-concept-overlaps.ts); keep native `BibleStudyTagSuggester.overlaps()` in sync.
3. Pick **primary** from the deduped pool.
4. Pick **secondaries** from the remainder (exclude primary + overlapping concepts).
5. Pick **tags** from the remainder, excluding primary + secondary labels (and concept overlaps with those labels).

Auto **secondary folders** use the same keyword pool but **stricter gates** than tags:

- Default minimum folder score: `secondaryMinPrimaryScore` (0.78).
- **Themes** (`spiritual`, `biblical`, `life`, `book`, `theme`): require **title hit** or **≥ 2 body occurrences** in addition to the score floor (native parity; web `isEligibleSecondaryFolder` in `bible-study-collection-web.ts`).
- **`character` and `place`**: require **title hit** or **≥ 3 occurrences**, otherwise they need **`secondaryCharacterPlaceMinScore`** (0.88). Incidental people/places can still appear in `note.tags` but should not auto-fill secondary folders.

**Folder-only exclusions:** `God`, `Jesus`, and `Holy Spirit` are too broad for auto primary/secondary folder labels (they appear in almost every devotional note). They are filtered out of folder candidate scoring on web (`isAutoFolderExcludedKeyword` in `bible-study-keywords.ts`) and native (`autoFolderExcludedNames` in `BibleStudyTagSuggester`). Tags may still surface Jesus and Holy Spirit; tags already skip God on web.

Web cards mirror this in `src/utils/bible-study-collection-web.ts` (primary over all deduped keywords; secondary eligibility for character/place uses title, rough occurrence count, and the same score floors). Server re-tagging (`server/utils/auto-tag-generator.ts`) receives `excludeLabels` from the note’s stored primary + secondary collections on create/update.

## Categories and Their Role

Categories currently include:

- `spiritual`
- `biblical`
- `life`
- `book`
- `character`
- `place`

`folderCategoryRank(...)` is used inside `betterPrimaryCandidate` when scores are within the epsilon band (and was previously the tie-break after `primaryScore` when primary was restricted to the tag top 12).

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

## Web parity (`bible-study-collection-web.ts`)

Production note cards use the same intent as native:

- **Primary** is chosen from the **full** deduped keyword set (`pickPrimaryRowFromDeduped` / `betterPrimaryRow`), not only from the top tag slice — so the auto primary is **not** “whatever matched first.”
- **Secondaries** use the same stricter thresholds for `character` / `place` vs themes as native (`SECONDARY_MIN_SCORE`, `SECONDARY_CHARACTER_PLACE_MIN_SCORE`, `MAX_AUTO_SECONDARIES`).
- **After edits**, `applyAutoCollectionAfterEdit` refreshes primary/secondaries with the same **cooldown** and **materially stronger** replacement rule as native (`AUTO_REPLACE_COOLDOWN_MS`, +0.18 margin; web also requires `strongSignal` on the candidate row’s raw match confidence).

Paths: [`src/utils/bible-study-collection-web.ts`](../src/utils/bible-study-collection-web.ts), consumer [`src/components/react/CardFullEditable.tsx`](../src/components/react/CardFullEditable.tsx).

## Re-analysis vs “promoting a stored secondary”

Auto **secondaries** are computed **after** primary: same scored pool, minus the current primary label and overlapping concepts. The app does **not** run a separate step that only walks `secondaryFolders` / `secondaryCollections` to pick a new primary.

What actually corrects a primary over time:

1. Title + body are **re-scored** on each apply/edit.
2. The new **global** primary winner can be a label that, if you had kept the old primary, would have appeared as a **secondary** — because both come from the same `picked` / row set; primary is the fold/reduction over **all** candidates, not “first tag.”
3. **Replacing** an already-set primary is **conservative** (cooldown + stronger evidence) so the shelf label does not flap; see below.

| Question | Answer |
|----------|--------|
| Is auto primary always the “first” folder or tag? | **No** — primary is chosen by folding the full overlap-deduped candidate list with score + tie-breaks. |
| Does the app re-read only the stored secondary list to fix primary? | **No** — it **re-scores content**; the winner is global. |
| Can primary change later with high confidence? | **Yes**, if the new winner clears **cooldown + materially stronger (+0.18) + strong evidence** (native: title or ≥3 occurrences on the **candidate** row; web: `strongSignal`). Pinned primary or manual override (without pin) can freeze updates. |

## Primary replacement (stability gates)

Native (`applyPrimaryMutation`):

- **Cooldown**: `autoFolderCooldown` (25 seconds) after `folderLastAutoUpdatedAt` before allowing a primary **swap** to a different label.
- **Swap rule** (`shouldReplacePrimaryFolder`): candidate must be **≥ 0.18** ahead on `primaryScore` vs current **and** show **title hit or ≥3 occurrences** on the candidate.

Web (`applyAutoCollectionAfterEdit`): same cooldown and +0.18 idea; see `strongSignal` in TS for the web-specific confidence check.

## Resolved library labels (native)

Persisted `primaryFolder` is often a **library-resolved** string (e.g. keyword `Prayer` → existing folder `Prayer Life` via `resolveToExistingFolder`). Replacement compares `primaryScore` for **current vs candidate**. The implementation maps that persisted label back to the correct `picked` row (`scoredForLibraryFolderLabel`) so the current side is not mis-scored as `0` when the string does not exactly match a keyword `name`.

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

## Synonym precision (life keywords)

**Intent:** Suppress *incidental* church vocabulary (e.g. `relationship with God`, `fellowship hall`), not notes that are clearly about marriage or friendship. On-topic prose still surfaces **Marriage** / **Friendship** via direct keyword names (`marriage`, `wedding`, `spouse`, `friendship`, `companionship`) and vetted synonyms (`fellowship`, `friendships` — with phrase guards for building names only).

Single-word life synonyms are high-risk in testimony and devotional notes. Prefer multi-word needles (`restore relationship`, `relational conflict`) over bare tokens that double as spiritual language (`relationship` on Marriage was removed for this reason).

**Scoring:** Synonym-only hits score at **80% of base** confidence (`base × 0.8`). Direct keyword-name hits keep full base. Web implements this in `findKeywordsInTextWithPriority` (`confidence` starts at `0`, not `keyword.confidence`).

**Phrase context gates:** When a broad synonym must stay, add a guard in [`src/utils/life-keyword-context.ts`](../src/utils/life-keyword-context.ts) (web) and native `LifeKeywordContextGate.swift` instead of relying on threshold alone. Current patterns:

- Skip **Marriage / Relationships / Reconciliation** when `relationship` appears inside `relationship with God|Christ|Jesus|the Lord|Lord`.
- Skip **Friendship** when `fellowship` appears inside `fellowship hall` or `church fellowship`.

**When to remove vs gate:** Remove the synonym if it is almost never the intended topic (e.g. `relationship` on Marriage — use the separate **Relationships** row with phrase synonyms). Add a context gate when the word is valid in some prose but commonly incidental in church vocabulary.

**Regression fixtures** (`src/utils/__tests__/bible-study-tag-testimony.test.ts`, native `BibleStudyTagSuggesterFolderTests`):

- **Incidental (Lutheran testimony):** Marriage and Friendship must not appear; John / Salvation / Communion may.
- **On-topic:** Wedding/spouse prose → primary **Marriage**; friendship/companionship/fellowship prose → primary **Friendship**; `fellowship hall` alone → no Friendship.

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

