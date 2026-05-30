# Question highlight suggestions (interrogative sentences)

**Status:** Explored as a native iOS/macOS prototype; **not merged** — implementation was reverted. This doc preserves the design and hook points for a future pass.

## Idea

When note body text contains a clause that reads like a **standalone question** (MVP: ends with `?`, minimum trimmed length), show a **non-persisted** visual hint (wavy underline in an amber “hint” color — distinct from spell-check red and from thick study-highlight underlines). **Tap** promotes the span to a real **anchored mini-note highlight** (`StudyThread` + inline paint), same persistence path as selection-based highlighting.

Optional: **Settings** toggle (“Suggest highlights for questions”) backed by `UserDefaults` / `@AppStorage`.

## Why native-first was sensible

Harvous already paints study highlights in **`NSTextStorage`** via `HarvousStudyHighlightMapper` and custom **`HarvousLayoutManager`** underline drawing. Ephemeral “suggestion” styling fits that pipeline without ProseMirror.

A **web** variant would use TipTap `Decoration.inline` + CSS `text-decoration-style: wavy` (see historical web-only notes in chat); not implemented here.

## Detection (deterministic)

- Walk **expanded plain** text (`harvousExpandedPlainText`) in UTF-16.
- Sentence boundaries: reset start after `.` or `!` (horizontal whitespace only); **newlines do not reset** so a question can wrap across lines.
- Emit ranges ending at `?`; require trimmed character count ≥ **12**; cap at **40** ranges per document.

Implement as a small pure helper (working name: `QuestionSentenceSuggestionScanner`).

## Painting

1. **Strip** prior suggestion attrs each paint pass (full document).
2. **Apply persisted highlights** as today (`stripPainting` / `applyHighlights`).
3. **Apply suggestions**: map each candidate expanded range → storage ranges via `HarvousStudyHighlightMapper.storageRanges(forExpandedRange:in:)`.

**Attributes**

- `NSAttributedString.Key` extension: `harvousQuestionSuggestion` (marker string).
- `underlineStyle`: `.single` (thin — triggers layout underline path).
- `underlineColor`: warm amber accent with slight alpha.

**Wavy line**

- `HarvousLayoutManager.drawUnderline`: if glyph range has `harvousQuestionSuggestion`, draw a **sine-wave stroke** in CGContext and **return** (do not call `super.drawUnderline` for that run).
- Thick `.underlineStyle` paths remain for real study highlights (+2pt translate).

## Exclusions

- Skip ranges that **overlap** any existing highlight **expanded** anchor range.
- Skip if mapped **storage** ranges intersect **scripture pills**; on macOS also skip HR / inline image attachments.

## Tap handling

- **macOS:** `HarvousNoteTextView` — after pill + rect highlight hits, `characterIndex(for:)` → read `harvousQuestionSuggestion` effective range → `expandedRange(forStorageSelection:in:)` → excerpt substring → callback `(NSRange, String)`.
- **iOS:** `Coordinator.handlePillTap` — same attribute resolution after highlight rect checks.

## Wiring into the app

- **`HarvousEditor`**: optional `onQuestionSuggestionTap: ((NSRange, String) -> Void)?`; coordinator **`paintStudyHighlights`** always strips suggestions, applies highlights, then applies suggestions **only if** the callback is non-nil.
- **`NoteEditorView`**: `@AppStorage` for toggle; handler calls **`SelectionHighlightCreator.create`** (empty annotation, derived focus title), then **`scheduleRefreshThreads`** and **`userActivatedStudyHighlight(threadId:)`** to open the dock.

## Settings

- Key example: `harvous.settings.study.suggestHighlightForQuestions` (default `true`).
- Surface in **Default Bible** (or Study) settings: `Toggle("Suggest highlights for questions", …)` with short footnote.

## Xcode

- Add `QuestionSentenceSuggestionScanner.swift` under **Editor** group; include in **Harvous_macOS** and **Harvous_iOS** compile sources.

## Risks / follow-ups

- **False positives:** `"Dr."`, URLs with `?`, rhetorical fragments — tighten with heuristics or on-device ML later.
- **Caret vs tap:** clicking a suggestion creates a highlight instead of placing caret — acceptable if rare; otherwise require long-press or a chip.
- **Keyboard:** no dedicated keyboard path in MVP; add if accessibility review requires it.
- **Session dismiss:** plan mentioned optional dismissed-id set; not required for first ship.

## Related native code (unchanged)

- `SelectionHighlightCreator.swift` — create anchored mini-note from expanded range.
- `ThreadStore.createMiniNote` — seeds `StudyPromptSuggester.questions(forSnippet:…)`.
- `EditorStudyHighlight.swift` — `HarvousStudyHighlightMapper`, `StudyHighlightPaint`.
- `HarvousLayoutManager.swift` — underline drawing hook.

---

*Last updated: prototype explored then reverted; this file is the reference for revisiting the feature.*
