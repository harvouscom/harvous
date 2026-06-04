# Architecture Readiness Audit (Web Prototype + Native)

Assessment of where the current architecture is well-positioned for the roadmap (`docs/future/`, `docs/native-prototype/`, `native/docs/future/`) and where seams/debt should be addressed *before* the dependent feature lands. Each item cites a location, the roadmap feature that will press on it, rough effort, and a priority.

**Priorities:** **P0** = address soon / blocks near-term roadmap · **P1** = do before the dependent feature · **P2** = hygiene.

This audit is the backlog companion to [`HARVOUS_BUILD_CONVENTIONS.md`](./HARVOUS_BUILD_CONVENTIONS.md). The three ✅ items below were fixed in the pass that produced these docs.

---

## ✅ Fixed in this pass (quick wins)

- **Web — shell motion timing.** Three duplicated `*_EXIT_MS = 260` constants in `proto-shell-context.tsx` → single `spa/src/layouts/proto-motion.ts` (`PROTO_PANEL_EXIT_MS`).
- **Web — popover dismiss.** Extracted `spa/src/hooks/usePopoverDismiss.ts` (open + outside-click + Escape) and adopted in `ListViewMenu`, `PrototypeNoteMoreMenu`, `AccountMenu`. ~15 prototype files still hand-roll popover positioning/dismiss — migrate them incrementally (P2 below).
- **Native — sync error visibility.** `Note.syncError` is now surfaced with a retry banner in `NoteInspectorView.swift` (was stored but never shown).

---

## 1. Web prototype

| # | Seam / debt | Where | Roadmap pressure | Effort | Pri |
|---|---|---|---|---|---|
| W1 | **Monolithic shell context** — one `ProtoShellProvider` value object (~18 consumer files) holds sidebar + inspector + thread-panel + editor-chrome + folder-chip + scripture-passage state. Any change re-renders all consumers. | `spa/src/layouts/proto-shell-context.tsx` (539 lines) | New panes/surfaces (AI assistant sidebar, compare panel, multi-space) all add fields here. | M | P1 |
| W2 | **Oversized sidebar** — all 6 list-mode renderers (notes/folders/highlights/scripture/dictionary/threads) live in one component; adding a mode edits this file **and** the `ListViewMenu` order tuple **and** `SidebarListMode`/`VALID_MODES`. | `spa/src/pages/prototype/PrototypeSidebar.tsx` (1,448 lines) | More scripture/highlight views; reading-plan & recall surfaces. | M | P1 |
| W3 | **Hand-rolled popovers** — ~15 files position + dismiss popovers manually. Hook now exists; most not migrated. | `spa/src/pages/prototype/*.tsx` | Every new menu compounds the duplication. | S | P2 |
| W4 | **Editor-chrome portal coupling** — `formatToolbarHostEl` / `studyDockCarouselHostEl` / `referenceChromeHostEl` are untyped `HTMLDivElement|null` refs that editors must know to portal into; no factory/abstraction. | `proto-shell-context.tsx` | New dock/chrome types (commentary, AI, compare). | M | P2 |
| W5 | **Thread-panel history is fragile** — expanded state pushed to `history.state` with a custom flag + `threadPanelHistorySkipRef` to dedupe popstate; race-prone. | `proto-shell-context.tsx` (`pushThreadPanelExpandedHistory`, `onPopState`) | Deeper study-thread navigation. | M | P2 |
| W6 | **Scripture-pill reprocess can retry-loop** — on persistent server failure the reprocess condition re-evaluates each render. | `PrototypeNotePage` reprocess effect | More server-side scripture processing. | S | P1 |
| W7 | **Refetch-storm debounce is unexplained** — 600ms list refresh "avoids Aw Snap error 5" with no documented mechanism; risky to tune. | `SimplifiedPrototypeLayout.tsx`; see `docs/troubleshooting/PROTOTYPE_AW_SNAP_ERROR_5.md` | Realtime/collab sync will change refresh cadence. | S | P2 |
| W8 | **No optimistic-update convention** — some mutations use `updateNoteOffline`, others don't; no shared rollback pattern. | `spa/src/hooks/mutations/*` | Collab + offline edits need consistent conflict UX. | M | P1 |

## 2. Native (SwiftUI)

| # | Seam / debt | Where | Roadmap pressure | Effort | Pri |
|---|---|---|---|---|---|
| N1 | **Hardcoded attachment types** — pill rehydration and the delete guard branch explicitly on `ScripturePillAttachment` / `URLLinkPillAttachment`; no protocol. A new attachment type means editing the sensitive delete logic. | `native/Harvous/Editor/HarvousEditor.swift` (`harvousExpandedPlainText` ~L19–35; pill checks throughout) | Rich media (`docs/future/TIPTAP_UPGRADE_AND_RICH_MEDIA.md`), inline images beyond current. | M | P1 |
| N2 | **Editor logic trapped in the view** — `EditorAutosaveDebouncer`, format-bar state, pill focus, selection tracking all live inside `NoteEditorView`; not independently testable/reusable. | `Views/NoteEditorView.swift` (3,622 lines) | AI assistant, focus mode, iOS parity all reuse editor state. | L | P1 |
| N3 | **Selection tracking is NSScrollView-coupled** — `selectionViewPoint`/`selectionCaretViewportRect` are viewport-relative; hard to port the editor to a different text surface. | `Editor/EditorProxy.swift` | iOS parity (Tier 4), any non-scrollview editor host. | M | P2 |
| N4 | **Mixed observation patterns** — `SpaceStore` is legacy `ObservableObject`/`@Published`; peers (`HarvousSyncService`, `HarvousAppearanceStore`, `HarvousClerkBridge`) are `@Observable`. | `Services/SpaceStore.swift` (295 lines) | Consistency; cleaner state as stores grow. | M | P2 |
| N5 | **Scripture pills rasterized every layout pass** — CIFilter blur + variable-font draw, no memo cache; cost scales with pill count. | `Editor/ScripturePillAttachment.swift` | Pill-heavy synced notes from web. | M | P1 |
| N6 | **Silent sync-error recovery** — error now *shown* (✅ above), but there's still no global "stuck notes" surface or batch retry, and `flushNoteUpdate` permanent failures leave `needsSync=false`. | `Services/HarvousSyncService.swift` (~L787–822) | Cloud sync (Tier 2), collab. | S | P1 |
| N7 | **No destructive color token** — views use raw `.red`/`.orange`. | `DesignSystem/HarvousColors.swift` | Consistent destructive/warning UI. | S | P2 |
| N8 | **ModelContainer in-memory fallback** — schema-migration failure can silently fall back to in-memory (data-loss risk on bad migration). | `App/` model container setup | Any schema change for cloud sync. | M | P1 |

## 3. Cross-cutting / roadmap-blocking (index only — decide elsewhere)

These are **product/data-model decisions already analyzed** in dedicated docs. The architecture is *capable* (all clients share one API + Postgres); these are decisions, not infra gaps. Do **not** re-decide here — drive them through the linked docs.

| Topic | Status | Authoritative doc |
|---|---|---|
| Study-thread sync (web Postgres string IDs ↔ native UUIDs) | blocks web↔native highlight parity | `native/docs/future/NATIVE_WEB_DATA_MODEL_GAP.md`; `PROTOTYPE_2_0_ARCHITECTURE.md` §5 |
| Note body canonical format (HTML vs plaintext+pills) | open | `NATIVE_WEB_DATA_MODEL_GAP.md` |
| `threadId` handling (sentinel vs parity) | open | `docs/CLASSIC_TO_2_0_MIGRATION.md` |
| Auth provider (Clerk vs Supabase vs deferred) | open | `docs/native-prototype/NATIVE_2_0_PLATFORM_STRATEGY.md` §4 |
| Native cloud sync (bootstrap/push/changes, LWW) | planned (Tier 2) | `native/docs/future/ARCHITECTURE_ROADMAP.md` |
| Multi-space in the 2.0 shell | deferred (My Home only) | `PROTOTYPE_2_0_ARCHITECTURE.md` §6 |

## 4. Suggested order

1. **P1 quick structural wins:** W6 (retry-loop guard), N6 (batch retry / re-queue on permanent fail), N8 (fail loud on migration).
2. **P1 before their features:** W1 (split context) + W2 (decompose sidebar) before more panes/list modes; N1 (attachment protocol) + N2 (editor view-model) before rich media / AI / iOS parity; N5 (pill raster cache) before heavy synced notes; W8 (optimistic-update convention) before collab.
3. **P2 hygiene:** W3 (finish popover migration), W4/W5 (chrome portals, history), N3 (selection protocol), N4 (`SpaceStore` → `@Observable`), N7 (destructive token).

Each P1 item is its own PR-sized change; none were implemented in this pass beyond the three ✅ quick wins, pending prioritization.
