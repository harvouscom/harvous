# OS 27 native implementation, and the web/native decisions still open

> Status: future. Not a build plan for the current sprint.
> Written: 2026-10-04, against `main` (`native/Harvous` SwiftUI app, Hono sync already shipping).
> Related: [HARVOUS_NORTH_STAR.md](./HARVOUS_NORTH_STAR.md), [native/docs/future/ARCHITECTURE_ROADMAP.md](../../native/docs/future/ARCHITECTURE_ROADMAP.md), [native/docs/future/NATIVE_WEB_DATA_MODEL_GAP.md](../../native/docs/future/NATIVE_WEB_DATA_MODEL_GAP.md).
>
> Capacitor is not the path. [CAPACITOR_STRATEGIC_ANALYSIS.md](./CAPACITOR_STRATEGIC_ANALYSIS.md) is historical. This doc assumes the existing SwiftUI app.

Harvous on the web is the study hub: notes, threads, scripture pills, a passage view that shows what you already saved, Activity, Suggestions, Review. The native app is a real editor with Clerk and two-way sync, but it is behind on the hub features, and it is invisible to the OS 27 assistant until it exposes itself.

iOS 27, iPadOS 27, and macOS 27 Golden Gate shipped 2026-09-14. Siri AI (personal context, on-screen awareness, app actions) is the part that changes Harvous. Photos Extend, Liquid Glass, and Safari tab grouping do not.

Siri AI requires iPhone 16 and later, or iPhone 15 Pro / 15 Pro Max. Everything below needs a fallback on older OS versions. If native ships without App Intents, Siri keeps filing Bible thoughts in Apple Notes, which gained create-and-append in this release.

---

## What to build, in order

### 1. Notes domain schemas, before any model work

App Intents is the only way Siri AI reaches a third-party app. Schemas are how it knows what a note is.

The `.notes` domain (Apple docs, App Intents) is the one to adopt:

- Intents: `createNote`, `updateNote`, `appendText`
- Entities: `note`, `folder`, `account`

Example phrases Apple documents: “Create a note called meeting notes.” “Rename this note to taxes.” “Move this note to my work folder.” “Add this item to the wishlist note.”

Map Harvous onto that, do not invent a parallel vocabulary:

| Schema | Harvous object | Notes |
|---|---|---|
| `note` | `Note`, keyed by `serverId` (`note_…`) once synced, local UUID before that | Index title, excerpt, `detectedRefs`, `createdAt`. Do not index encrypted bodies. |
| `folder` | `primaryFolder` / `secondaryFolders` | This is what the native UI already calls a folder. Do not also expose web `Threads` until decision D1 below is made. |
| `account` | Clerk user / personal space | One account in v1. Shared spaces stay out of Siri until membership sync is trusted. |
| `createNote` | Existing note create + sync flush | Accept an optional scripture reference and folder. Preserve `createdAt` from the intent, do not stamp “now” over a dictated study date. |
| `appendText` | Append to `body`, then flush | This is the sermon-capture path. Target folder or note by name. |
| `updateNote` | Rename, move folder, pin | Do not let Siri rewrite body HTML. Append and rename only, until the body-format decision is explicit. |

Also:

- Conform indexed entities to `IndexedEntity` and donate them to the Spotlight semantic index, so “what did I write on Romans 8” can resolve to a Harvous note with attribution. Queries go through `EntityStringQuery` / `IndexedEntityQuery`.
- Put intents and entities in a shared Swift package imported by the app and by an App Intents extension, so a capture works when the app is not running.
- Use `ExecutionTargets` so writes run in the main app. Widgets and the extension should not write SwiftData beside the app.
- Confirm before implementation whether adopting `.notes` requires every schema in the domain. The domain page lists the three intents and three entities above. If partial adoption is rejected at build time, implement the full set with shared spaces and co-editing no-ops rather than skipping the domain.

Docs: [Making actions and content discoverable by Apple Intelligence](https://developer.apple.com/documentation/appintents/making-actions-and-content-discoverable-by-apple-intelligence), [Notes domain](https://developer.apple.com/documentation/appintents/app-schema-domain-notes), WWDC26 session 240.

### 2. On-screen awareness in the reader and the editor

View annotations map visible rows to entities so “this verse” and “this note” resolve. `NSUserActivity` covers the single primary item (the open note, or the open passage).

Worth doing:

- Passage view: annotate the visible reference. “Note this verse” creates a note with that ref and the current folder.
- Note list: annotate visible notes. “Append that to the sermon thread” only works after D1, so v1 should say folder.
- System on-screen awareness is the “keep your Bible app” path. Someone in YouVersion can ask Siri to save the passage on screen into Harvous only if Harvous has a `createNote` intent and the system can see the reference. Do not depend on YouVersion adopting anything.

Transferable entities let Shortcuts and other apps hand a note across. Do that after the schema, not before.

### 3. On-device models for Suggestions and Review, not a new assistant

Foundation Models in OS 27 is one `LanguageModelSession` API. The model is swappable via the `LanguageModel` protocol: Apple’s on-device model, Private Cloud Compute, or a provider package. Anthropic ships `ClaudeForFoundationModels`. Dynamic profiles can swap instructions mid-session (SOAP vs inductive vs sermon outline). The Evaluations framework is for checking that a suggestion does not invent a reference.

Use it for features the web already has or has specced, not a sidebar chatbot:

- Suggestions grounded in the open note plus `detectedRefs`. Tools the model may call: scripture lookup already on device, the user’s own notes for that reference. No tool that writes a note without a confirm.
- Review questions from the user’s notes. This is the Learn pillar. On-device by default. Private Cloud Compute is free for App Store Small Business Program apps under 2 million first-time downloads, which is the right ceiling for Harvous.
- Camera capture: multimodal prompts plus Vision OCR as a model tool. A bulletin, whiteboard, or study-Bible margin becomes a note with refs parsed. That is a native capture surface the web cannot match.

Core AI (bring your own model, fully on device) is later. Do not block Suggestions on it.

The native roadmap’s “AI Study Assistant” (Tier 5, Claude over URLSession) should be re-scoped onto this session API so there is one tool-calling path, not two.

### 4. Activity as a widget, after the data is honest

WidgetKit already has interactive widgets. OS 27 adds an extra-large family that can fill a Home Screen page. A week-of-study widget is the right native face for Activity, with a tap-through that opens the note via an App Intent.

Do not build it until `createdAt` on synced notes is the note date, not the import or sync date. Web import already keeps the export date (`server/utils/import-commit.ts` writes `createdAt` from the file, and falls back to now only when the date is missing). Native create currently stamps `Date()`. A widget built on sync-day timestamps will lie.

Share extension and the vault inbox scanner stay the other capture doors. They are not OS 27 features. They are still the right “add from anywhere” work, and they should call the same `createNote` intent the schema uses.

### Skip for v1

Write with Siri already works in any text field. Shipping it inside the editor is not a differentiator. Extra-large widgets beyond Activity, Journal-style prompt chrome, and Image Playground do not serve capture, remember, or review.

---

## Web vs native: what is already decided, and what is not

Sync is real (`native/Harvous/Services/HarvousSyncService.swift`, Clerk via `HarvousClerkBridge`). The August gap doc is partly stale. Status from the current models and sync service:

| Topic | State | What to do |
|---|---|---|
| Auth | Decided. Clerk is the user key. | No further decision. |
| Body format | Decided, lossy. Canonical HTML in the DB. Native stores plain `Note.body` and keeps `serverContentHTML` so an unedited note flushes the original HTML. Regeneration only when `body` changes. | Accept it. Do not let Siri or Suggestions rewrite HTML. Revisit only if native grows a TipTap-fidelity editor. |
| Conflict policy | Implemented, not written down as a product rule. Pull skips dirty rows. Upload is last-write-wins. `currentVersion` is sent as `expectedVersion` when present; a push without it is unconditional. | Write this down as the policy. Do not build CRDT for v1. Co-edited notes are already read-only on native (`coEditEnabled`) and must stay that way until there is a pen lease. |
| `simpleNoteId` | Half done. Sync stores the server high-water mark (`highestSimpleNoteId`, reserved range). `Note.swift` still has the TODO to reconcile on conflict. Local id is a UUID; cross-platform id is `serverId`. | Treat `serverId` as the only cross-platform key. Keep `simpleNoteId` as a display label. On conflict, server value wins. Delete the TODO once that is the code. |
| Version history | Not the same thing. Server has `NoteVersions`. Native has `NoteSnapshot`, and the history UI is unmounted. | Keep snapshots device-local. Do not sync them until someone wants restore-on-web. |
| Containment | Open. See D1. | Block “move to thread” intents on this. |
| Highlights | Partial. Sync pulls `studyThreadEntries` into native `StudyThread`. Native has extra fields (`suggestedQuestions`, and similar) the server may not store. | See D2. |
| Product surfaces | Open. See D3. | Do not port Activity / Review / Suggestions as a rewrite. Decide which exist on native at all. |

### D1. Thread vs folder. This is the one that blocks Siri and sync placement.

Web: every note has a `threadId`. `NoteThreads` is many-to-many. Threads are the organizing object in the product language (“add to threads”).

Native: `Note` has `spaceId`, `primaryFolder`, `secondaryFolders`, and a legacy `threadName` that the model comment says is unused in the UI. There is no `threadId`. `HarvousSyncService` pushes `threadId: ""` on create. `StudyThread` is an anchored highlight branch, not a web thread. The names collide.

Pick one:

1. **Folders are the native name for web threads.** One folder label equals one thread title. Secondary folders equal `NoteThreads` membership. Stop pushing an empty `threadId`; resolve or create the thread by title on push, the way web import already does in `getOrCreateThread`. This matches the current native UI and unblocks “move this note to my Romans folder.”
2. **Threads stay a separate object native does not have yet.** Add `threadId` / `serverThreadId` on `Note`, show threads in the native sidebar, and treat folders as the collection layer only. More faithful to web, more UI.
3. **Keep the empty string.** Current behavior. Notes land wherever the server defaults an empty thread. Platforms drift. Do not ship Siri “move” until this is abandoned.

Recommendation: option 1 for personal notes. Shared spaces can stay on option 3 until membership sync is trusted. My Pile / Unorganized / Sort Later already share a helper on both sides (`isMyPileFolderTitle`); keep that as the empty-folder bucket, not as a real thread.

### D2. Highlight overflow

`StudyThreadEntries` on the server and `StudyThread` on the device are the same idea, plus native-only fields. Pick one: drop native-only fields on push, add columns, or store overflow as JSON. Until then, those fields are device-local and a reinstall loses them.

### D3. Which hub features exist on native

Not in the native tree today: Activity, Review, Suggestions, the import session UI, church spaces as a first-class surface. Passage view and pills do exist in some form (refs are re-detected on open).

Decide explicitly, or native will keep growing editor features while the web keeps the reason to come back:

- Activity: native widget plus a list, fed by note `createdAt` / `updatedAt`. No separate model.
- Suggestions: on-device Foundation Models, grounded in refs. Plus-gated the same way as web.
- Review: same exercises as web, generated on device from synced notes. Do not fork the question format.
- Import: native does not need the web import wizard. It needs the vault inbox and a share extension that call the same create path, and it must keep the source `createdAt`.

### D4. Encryption and public notes

`contentEncrypted` and `isPublic` / `shareToken` are on the native model. Confirm native never pushes a decrypted body for an encrypted note, and never donates encrypted note text to Spotlight. Public share links can stay “copy link”; do not build a second public viewer.

### D5. Android

There is no Android client in this repo. OS 27 work is Apple-only. Do not let it set the data model. The decisions above are about the Hono API, which Android would also consume.

---

## Sequencing

1. Decide D1 (folder = thread, or not). Small sync change either way. Unblocks everything that places a note.
2. App Intents package: `createNote`, `appendText`, indexed `note` and `folder`. App Intents extension. No UI.
3. View annotations on the open note and the passage.
4. Share extension and camera OCR calling that same create intent.
5. Foundation Models Suggestions, on device, confirm-to-save.
6. Activity widget, after `createdAt` is trustworthy.
7. Review, after Suggestions, because it is the same grounding with a different prompt.

Do not start Tier 5 “AI Study Assistant” or collaboration OT before 1–3. An assistant that cannot see the user’s notes from Siri, and a collab layer on a read-only co-edit flag, are both ahead of the gap.
