import SwiftUI
import SwiftData
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

/// Debounces SwiftData writes without touching `@State`, so typing does not rebuild `HarvousEditor` every keystroke.
@MainActor
private final class EditorAutosaveDebouncer {
    private var task: Task<Void, Never>?
    private var sequence: UInt64 = 0
    private(set) var latestTitle: String = ""
    private(set) var latestBody: String = ""
    private(set) var latestRefs: [String] = []

    func cancel() {
        task?.cancel()
        task = nil
    }

    func updateSnapshot(title: String, body: String, refs: [String]) {
        latestTitle = title
        latestBody = body
        latestRefs = refs
    }

    @discardableResult
    func schedule(
        after delay: TimeInterval = 1,
        note: Note,
        context: ModelContext,
        allowPrimaryFolderUpdate: Bool = true,
        existingFolders: [String] = [],
        onSettled: @escaping @MainActor (_ token: UInt64) -> Void = { _ in }
    ) -> UInt64 {
        task?.cancel()
        sequence += 1
        let token = sequence
        let expectedNoteId = note.id
        task = Task { @MainActor in
            defer { onSettled(token) }
            let nanos = UInt64((delay * 1_000_000_000).rounded())
            try? await Task.sleep(nanoseconds: nanos)
            guard !Task.isCancelled else { return }
            guard note.id == expectedNoteId else { return }
            let unchanged =
                note.title == self.latestTitle && note.body == self.latestBody && note.detectedRefs == self.latestRefs
            guard !unchanged else { return }
            note.title = self.latestTitle
            note.body = self.latestBody
            note.detectedRefs = self.latestRefs
            note.markDirty()
            BibleStudyTagSuggester.applyToNote(note, allowPrimaryUpdate: allowPrimaryFolderUpdate, existingFolders: existingFolders)
            try? context.saveWithLogging()
            NoteSnapshotter.shared.noteDidAutosave(
                noteID: note.id,
                body: note.body,
                title: note.title,
                refs: note.detectedRefs,
                in: context
            )
            HarvousNoteSpotlightIndexer.reindex(note: note)
            HarvousVaultExporter.scheduleWrite(note: note, modelContext: context)
        }
        return token
    }
}

struct NoteEditorView: View {
    @Binding var note: Note?

    @Environment(\.modelContext) private var context
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.harvousScriptureTheme) private var scriptureTheme
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.harvousIsIPadSplitLayout) private var isIPadSplitLayout

    /// When set, pushes `LinkedNotesView` for this linked-notes entry id (macOS split column + iOS nested stack).
    var onNavigateToLinkedNotes: ((UUID) -> Void)? = nil
    /// iOS stacked editor: pop after delete.
    var onRequestDismissEditor: (() -> Void)? = nil
    @State private var editorState = EditorState()
    @State private var title = ""
    /// Reference-type debounce — must not use `@State` timestamps keyed to each keypress (that remounts the editor).
    @State private var autosave = EditorAutosaveDebouncer()
    @State private var latestAutosaveToken: UInt64 = 0
    /// Suppresses debounced saves while `syncFromNote` and the text view reset settle after a note switch.
    @State private var isNoteTransition = false
    @State private var isFolderContextUpdating = false
    @State private var newNoteTiltTrigger = false
    @State private var showFolderToolbarText = true
    @FocusState private var titleFocused: Bool

    /// Study threads anchored to this note (refreshed on appear / note change / returning active).
    @State private var threadsForNote: [StudyThread] = []
    /// Conditional trail snapshot (incoming + outgoing linked-note markers).
    @State private var trailSnapshot = ThreadStore.TrailSnapshot(incoming: [], outgoing: [])
    /// Transient notice for inspector jump / tooling.
    @State private var studyHighlightPaints: [StudyHighlightPaint] = []
    /// Pinned dock thread (tap, compose confirm).
    @State private var dockPinnedHighlightThreadId: UUID?
    /// Expanded state for bottom highlight morph capsule.
    @State private var activeHighlightDockExpanded = false
    @State private var scripturePassageSheet: ScripturePassageSheetItem?
    /// When set, a modal bottom sheet opens showing the selected highlight's note (mirrors scripture-pill UX).
    @State private var highlightDetailThreadId: HighlightDetailSheetItem?
    @State private var showLinkPicker = false
    @State private var showWikiLinkPicker = false
    @State private var showRelatedNotes = false
    /// Inline highlight authoring (popover + floating bar triggers).
    @State private var highlightCaptureSession: HighlightCaptureSession?
    @State private var highlightAnnotationDraft = ""
    @State private var highlightAnnotationTitle = ""
    @State private var highlightAnnotationAccent: StudyHighlightAccentToken = .warmAmber
    @Namespace private var selectionAccessoryNamespace

    /// Inline expanded chrome for a tapped scripture pill (passage + accent + translation).
    /// Replaces the former bottom action bar as the primary click affordance; the old bar still
    /// drives selection-near-pill editing of book/chapter/verse.
    @State private var activePillDock: ActiveScripturePillDockItem?
    @State private var activePillDockExpanded: Bool = true
    /// Inline URL-pill chrome: opened on URL-pill tap, mutually exclusive with `activePillDock`
    /// so we never stack two pill docks. Carries the `displayHost` for the dock title fallback
    /// and the attachment range so Remove / Edit can mutate the right span.
    @State private var activeUrlPillDock: ActiveURLPillDockItem?
    /// Set when the user picks Edit from the URL pill dock — drives the modal href editor sheet.
    /// Carries the original href + range so the sheet can call `proxy.replaceURLPill(in:newHref:)`.
    @State private var editingURLPillDraft: ActiveURLPillDockItem?
    /// Observed to drive the action bar's Look up button visibility (the bar checks slug index
    /// existence inside `onLookup` closure conditional).
    @ObservedObject private var eastonsService = EastonsDictionaryService.shared
    /// Passage highlights for the active pill dock reference + translation (library-wide).
    @State private var scripturePassageHighlights: [StudyThread] = []
    /// Prefetch scripture HTML for pills in this note — cancelled when switching notes or on editor disappear.
    @State private var scripturePillPrefetchTask: Task<Void, Never>?
    /// Prefetch Easton's entries for words on this note's existing reference-highlight threads —
    /// cancelled on note switch. Re-fired when threads change or when the slug index finishes loading.
    @State private var eastonsEntryPrefetchTask: Task<Void, Never>?
    /// Coalesces rapid back-to-back refreshThreads() calls (note switch, scene phase, highlight events)
    /// into a single execution within the same event turn.
    @State private var refreshThreadsTask: Task<Void, Never>?
    /// Coalesces rapid keystroke-driven highlight paint reconciliation so the SwiftData fetch + sort
    /// does not run on every character — the cumulative main-thread cost was holding up nav back-button hits.
    @State private var reconcileStudyHighlightsTask: Task<Void, Never>?

    /// When provided by a split-layout parent (macOS, iPad), the inspector panel is controlled externally.
    /// On iPhone this stays `.constant(false)` and the editor uses its internal sheet instead.
    var showInspector: Binding<Bool> = .constant(false)
    @StateObject private var proxy = EditorProxy()
    @EnvironmentObject private var appRouter: HarvousAppRouter
    #if os(iOS)
    @State private var showInspectorIOS = false

    /// Matches `syncIOSNoteFooterSupplement` suppress flag (pill dock, pinned highlight, highlight capture)—not router timing alone.
    private var iosStudyDockOverlayChromeSuppressed: Bool {
        activePillDock != nil || activeUrlPillDock != nil || dockPinnedHighlightThreadId != nil || highlightCaptureSession != nil
    }

    /// When study docks occupy the footer slot via `safeAreaInset`, shrink the inner scroll tail padding —
    /// the inset already consumes vertical space instead of overlapping like the legacy bottom overlay did.
    private var iosNoteEditorScrollContentBottomPadding: CGFloat {
        iosStudyDockOverlayChromeSuppressed
            ? HarvousIOSMorphingChromeLayout.interChromeSpacing + 16
            : HarvousIOSMorphingChromeLayout.noteEditorScrollContentBottomPadding
    }
#endif

    // MARK: - Body

    var body: some View {
#if os(macOS)
        noteEditorMacOSScene
#else
        noteEditorLifecycleStack
#endif
    }

#if os(macOS)
    /// Extracted so the type checker doesn't have to resolve the whole modifier chain + lifecycleStack in one pass.
    private var noteEditorMacOSScene: some View {
        // Pre-type the optional closures so the modifier chain has no ternary inference to do.
        let hasNote = note != nil
        let deleteAction: (() -> Void)? = hasNote ? { deleteCurrentNoteIfPossible() } : nil
        let newConnectedAction: (() -> Void)? = hasNote ? { createConnectedNoteFromKeyboard() } : nil
        let nextHighlightAction: (() -> Void)? = hasNote ? { focusNextStudyHighlight() } : nil
        let prevHighlightAction: (() -> Void)? = hasNote ? { focusPreviousStudyHighlight() } : nil
        let toggleHighlightDockAction: (() -> Void)? = hasNote ? { toggleStudyHighlightDockExpandedFromKeyboard() } : nil
        let removeHighlightAction: (() -> Void)? = hasNote ? { removeActiveHighlightFromKeyboard() } : nil
        return noteEditorMacOSFocusValues(
            deleteAction: deleteAction,
            newConnectedAction: newConnectedAction,
            nextHighlightAction: nextHighlightAction,
            prevHighlightAction: prevHighlightAction,
            toggleHighlightDockAction: toggleHighlightDockAction,
            removeHighlightAction: removeHighlightAction
        )
    }

    // Split into two functions so the type checker handles each half independently
    // without inserting a Group node into the view tree (Group disrupts view identity
    // and breaks dock animation continuity).
    private func noteEditorMacOSFocusValues(
        deleteAction: (() -> Void)?,
        newConnectedAction: (() -> Void)?,
        nextHighlightAction: (() -> Void)?,
        prevHighlightAction: (() -> Void)?,
        toggleHighlightDockAction: (() -> Void)?,
        removeHighlightAction: (() -> Void)?
    ) -> some View {
        noteEditorInnerFocusValues(
            deleteAction: deleteAction,
            newConnectedAction: newConnectedAction,
            nextHighlightAction: nextHighlightAction,
            prevHighlightAction: prevHighlightAction,
            toggleHighlightDockAction: toggleHighlightDockAction,
            removeHighlightAction: removeHighlightAction
        )
        .focusedSceneValue(\.folderContextUpdating, isFolderContextUpdating)
        .focusedSceneValue(\.showFolderToolbarText, showFolderToolbarText)
        .onAppear {
            proxy.onScripturePillKeyboardFocus = { ref, trans, range in
                scripturePillTapped(reference: ref, translation: trans, range: range)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .harvousToggleActivePillDockExpanded)) { _ in
            guard activePillDock != nil else { return }
            activePillDockExpanded.toggle()
        }
    }

    private func noteEditorInnerFocusValues(
        deleteAction: (() -> Void)?,
        newConnectedAction: (() -> Void)?,
        nextHighlightAction: (() -> Void)?,
        prevHighlightAction: (() -> Void)?,
        toggleHighlightDockAction: (() -> Void)?,
        removeHighlightAction: (() -> Void)?
    ) -> some View {
        noteEditorLifecycleStack
            .focusedObject(proxy)
            .focusedSceneValue(\.deleteNoteAction, deleteAction)
            .focusedSceneValue(\.newConnectedNoteAction, newConnectedAction)
            .focusedSceneValue(\.nextStudyHighlightAction, nextHighlightAction)
            .focusedSceneValue(\.previousStudyHighlightAction, prevHighlightAction)
            .focusedSceneValue(\.toggleStudyHighlightDockExpandedAction, toggleHighlightDockAction)
            .focusedSceneValue(\.removeActiveStudyHighlightAction, removeHighlightAction)
    }
#endif

    /// Split from `body` so the type checker can finish within a reasonable time.
    /// Split from `noteEditorLifecycleStack` so each half stays within the type-checker's expression limit.
    private var noteEditorStateObservers: some View {
        Group {
            if let note {
                editorCanvas(note: note)
            } else {
                emptyDetail
            }
        }
        .preference(
            key: NoteShareSnapshotPreferenceKey.self,
            value: NoteShareSnapshot(title: note != nil ? title : "", body: note != nil ? editorState.plainText : "")
        )
        .onChange(of: note?.id) { oldId, newId in
            isNoteTransition = true
            // Synchronous: `HarvousEditor` also resets async on `boundNoteID` change; without this, proxy
            // pill / format state can lag one turn and briefly pair stale UI with the new note.
            proxy.resetFormatBarStateForNewNote()
            scripturePillPrefetchTask?.cancel()
            scripturePillPrefetchTask = nil
            dockPinnedHighlightThreadId = nil
            activeHighlightDockExpanded = false
            activePillDock = nil
            activePillDockExpanded = false
            activeUrlPillDock = nil
            studyHighlightPaints = []
            scripturePassageSheet = nil
            highlightDetailThreadId = nil
            dismissHighlightCapture()
            if let n = note {
                scheduleRefreshThreads(note: n)
            } else {
                threadsForNote = []
                trailSnapshot = .init(incoming: [], outgoing: [])
            }
            autosave.cancel()
            // Capture UI before any child representable runs; avoids persisting wrong note after a switch.
            let snapshotTitle = title
            let snapshotBody = editorState.plainText
            let snapshotRefs = editorState.detectedRefs
#if os(macOS)
            proxy.resetMacBodyLayoutHeightForNoteTransition(noteID: newId)
#endif
            if let oldId {
                let mergedRefs = ScriptureDetector.mergedDetectedRefs(title: snapshotTitle, bodyRefs: snapshotRefs)
                flushPendingEdits(forNoteId: oldId, title: snapshotTitle, body: snapshotBody, refs: mergedRefs)
            }
            syncFromNote()
            #if os(iOS)
            scheduleSyncIOSNoteFooterSupplement()
            #endif
            scheduleConsumePendingStudyHighlightListActivation()
            Task { @MainActor in
                isNoteTransition = false
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                if let n = note {
                    scheduleRefreshThreads(note: n)
                }
                return
            }
            guard phase == .inactive || phase == .background else { return }
            guard let n = note else { return }
            autosave.cancel()
            persistEditorIntoNote(n)
            HarvousVaultExportCoordinator.shared.flush(modelContext: context)
        }
        .onAppear {
            syncFromNote()
            if let n = note {
                scheduleRefreshThreads(note: n)
            }
            // Warm the Easton's slug index so the action bar's Look up button can probe
            // synchronously while the user selects words.
            EastonsDictionaryService.shared.loadIndexIfNeeded()
        }
        // Auto-focus title when a brand-new empty note is opened (Apple Notes UX)
        .task(id: note?.id) {
            guard let n = note, n.title.isEmpty, n.body.isEmpty else { return }
            try? await Task.sleep(for: .milliseconds(80))
            titleFocused = true
            newNoteTiltTrigger.toggle()
        }
        .onChange(of: chipPrimaryLabel) { _, newValue in
            animateFolderTextReveal(for: newValue)
        }
        .onChange(of: isFolderContextUpdating) { _, updating in
            guard updating else { return }
            animateFolderTextReveal(for: chipPrimaryLabel)
        }
        .onChange(of: proxy.singleWordSelection) { _, word in
            // Speculative prefetch — by the time the user taps Look up, the in-memory entry
            // cache is already warm and `EastonsEntryView.runFetch` short-circuits the spinner.
            guard let word, !word.isEmpty else { return }
            guard let slug = eastonsService.matchedSlug(forWord: word) else { return }
            eastonsService.prefetchEntry(slug: slug)
        }
        .onChange(of: eastonsService.indexLoadState) { _, state in
            // Once the slug index is loaded (disk hit or network), prefetch entries for any
            // reference highlights already on this note — covers the case where threads loaded
            // before the index did.
            guard state == .loaded, let n = note else { return }
            scheduleEastonsEntryPrefetch(note: n)
        }
    }

    private var noteEditorLifecycleStack: some View {
        noteEditorStateObservers
#if os(macOS)
            .onChange(of: bodySelectionChangeToken) { _, _ in scheduleOnBodySelectionHostChanged() }
#else
            .onChange(of: bodySelectionChangeToken) { _, _ in scheduleOnBodySelectionHostChanged() }
            .onChange(of: title) { _, _ in scheduleSyncIOSNoteFooterSupplement() }
#endif
            .onChange(of: activePillDock) { _, new in
                let item = new
                Task { @MainActor in
                    guard note != nil else { return }
                    refreshScripturePassageHighlights(item: item)
                }
                #if os(iOS)
                scheduleSyncIOSNoteFooterSupplement()
                #endif
            }
            .onChange(of: dockPinnedHighlightThreadId) { _, _ in
                #if os(iOS)
                scheduleSyncIOSNoteFooterSupplement()
                #endif
            }
            .onChange(of: highlightCaptureSession?.id) { _, _ in
                #if os(iOS)
                scheduleSyncIOSNoteFooterSupplement()
                #endif
            }
            .onChange(of: editorState.plainText) { _, _ in
                guard let note else { return }
                scheduleReconcileStudyHighlightsPainting(for: note)
                scheduleConsumePendingStudyHighlightListActivation()
            }
            .onChange(of: appRouter.pendingStudyHighlightActivation?.requestId) { _, _ in
                scheduleConsumePendingStudyHighlightListActivation()
            }
            .onReceive(NotificationCenter.default.publisher(for: .harvousNewStandaloneNoteFromSelection)) { notification in
                // Only the currently-active editor should respond — multiple `NoteEditorView` instances can be
                // mounted (nested nav stacks on iOS, split view on macOS). Fanning the save out to all of them
                // caused duplicate inserts and, when the stale one had been destroyed mid-notification, a
                // SwiftData `try!` crash on its retained context.
                guard isCurrentForStandaloneSelection else { return }
                Task { @MainActor in
                    receiveStandaloneNoteFromSelection(notification)
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: .harvousHighlightCapturePrompt)) { payload in
                // Same fan-out rationale as `.harvousNewStandaloneNoteFromSelection` above — multiple editors
                // may be mounted; only the focused one should react. Stale instances reaching SwiftData via
                // their retained context is the documented crash source.
                guard isCurrentForStandaloneSelection else { return }
                Task { @MainActor in consumeHighlightPrompt(payload) }
            }
            .onReceive(NotificationCenter.default.publisher(for: .harvousLookupWordRequested)) { payload in
                guard isCurrentForStandaloneSelection else { return }
                Task { @MainActor in consumeLookupWordRequested(payload) }
            }
            .onReceive(NotificationCenter.default.publisher(for: .harvousRequestInsertWikiLink)) { _ in
                guard isCurrentForStandaloneSelection else { return }
                #if os(macOS)
                proxy.refocusTextView()
                #endif
                showWikiLinkPicker = true
            }
            .onReceive(NotificationCenter.default.publisher(for: .harvousStudyThreadsPurged)) { _ in
                // Global purge — only the focused editor needs to react; stale editors mutating their dock
                // state on a torn-down context was contributing to crash signals on rapid open/close.
                guard isCurrentForStandaloneSelection else { return }
                if let pinned = dockPinnedHighlightThreadId,
                   ThreadStore.fetch(id: pinned, modelContext: context) == nil {
                    dismissStudyHighlightDock()
                }
                if let n = note { scheduleRefreshThreads(note: n) }
            }
            .onAppear {
                proxy.onScripturePillAttachmentRemoved = { ranges in
                    Task { @MainActor in
                        // Guard against firing after the editor has been dismissed — proxy's removal
                        // callback can outlive a rapid open/close on iOS and we'd otherwise mutate
                        // dock @State on a torn-down view.
                        guard note != nil else { return }
                        if let dock = activePillDock, case .body(let bodyRange) = dock.anchor,
                           ranges.contains(where: { NSIntersectionRange($0, bodyRange).length > 0 }) {
                            activePillDock = nil
                            activePillDockExpanded = false
                        }
                    }
                }
            }
    }

    /// True only for the editor the user is actively writing in — used to gate notification fan-out.
    private var isCurrentForStandaloneSelection: Bool {
        guard note != nil else { return false }
        #if os(iOS)
        return appRouter.iosActiveNoteEditorChromeProxy === proxy
        #else
        return true
        #endif
    }

    /// iOS: stack spacing matches bottom chrome `interChromeSpacing`; macOS keeps the prior 8pt rhythm.
    private var studyDockStackSpacing: CGFloat {
        #if os(iOS)
        HarvousIOSMorphingChromeLayout.interChromeSpacing
        #else
        8
        #endif
    }

    /// Single token so one `onChange` can react to selection length or caret moves without overloading the type checker.
    private var bodySelectionChangeToken: String {
        let r = proxy.bodySelectedUTF16Range
        return "\(proxy.hasSelection)|\(r.location)|\(r.length)"
    }

    // MARK: - Highlight capture (selection menu + floating bar)

    private func dismissHighlightCapture() {
        highlightCaptureSession = nil
        highlightAnnotationDraft = ""
        highlightAnnotationTitle = ""
        highlightAnnotationAccent = .warmAmber
    }

    private func consumeHighlightPrompt(_ notification: Notification) {
        guard isCurrentForStandaloneSelection else { return }
        guard let ui = notification.userInfo,
              let idStr = ui[HarvousHighlightCapturePromptUserInfo.parentNoteIdKey] as? String,
              let nid = UUID(uuidString: idStr),
              let current = note, current.id == nid,
              let excerpt = ui[HarvousHighlightCapturePromptUserInfo.excerptKey] as? String else { return }
        let loc = (ui[HarvousHighlightCapturePromptUserInfo.expandedLocationKey] as? NSNumber)?.intValue
        let len = (ui[HarvousHighlightCapturePromptUserInfo.expandedLengthKey] as? NSNumber)?.intValue
        guard let loc, let len, len > 0 else { return }
        var anchor: CGRect?
        if let v = ui[HarvousHighlightCapturePromptUserInfo.anchorRectKey] as? NSValue {
            #if os(macOS)
            anchor = v.rectValue
            #else
            anchor = v.cgRectValue
            #endif
        }
        highlightCaptureSession = HighlightCaptureSession(
            parentNoteId: nid,
            excerpt: excerpt,
            expandedUTF16Location: loc,
            expandedUTF16Length: len,
            anchorRect: anchor
        )
        highlightAnnotationDraft = ""
        highlightAnnotationTitle = ThreadEditorSnippet.shortLabelPreview(from: excerpt)
        highlightAnnotationAccent = .warmAmber
    }

    private func consumeLookupWordRequested(_ notification: Notification) {
        guard isCurrentForStandaloneSelection else { return }
        guard let ui = notification.userInfo,
              let idStr = ui[HarvousLookupWordRequestedUserInfo.parentNoteIdKey] as? String,
              let nid = UUID(uuidString: idStr),
              let current = note, current.id == nid,
              let word = ui[HarvousLookupWordRequestedUserInfo.wordKey] as? String else { return }
        let loc = (ui[HarvousLookupWordRequestedUserInfo.expandedLocationKey] as? NSNumber)?.intValue
        let len = (ui[HarvousLookupWordRequestedUserInfo.expandedLengthKey] as? NSNumber)?.intValue
        guard let loc, let len, len > 0 else { return }
        let thread = ThreadStore.createReferenceHighlight(
            parent: current,
            spaceId: current.resolvedSpaceId(),
            word: word,
            expandedAnchorUTF16Range: NSRange(location: loc, length: len),
            expandedPlainForAnchor: editorState.plainText,
            modelContext: context
        )
        scheduleRefreshThreads(note: current)
        // Open the highlight dock for the new reference — the dock renders the Easton's entry inline.
        dockPinnedHighlightThreadId = thread.id
        activeHighlightDockExpanded = true
    }

    private func saveHighlightFromPanel(for note: Note) {
        guard let session = highlightCaptureSession, session.parentNoteId == note.id else { return }
        let trimmed = highlightAnnotationDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        autosave.cancel()
        persistEditorIntoNote(note)
        let exp = NSRange(location: session.expandedUTF16Location, length: session.expandedUTF16Length)
        let thread = SelectionHighlightCreator.create(
            parent: note,
            excerpt: session.excerpt,
            annotation: trimmed,
            focusTitle: highlightAnnotationTitle,
            expandedUTF16Range: exp,
            expandedPlain: editorState.plainText,
            highlightAccent: highlightAnnotationAccent,
            modelContext: context
        )
        dismissHighlightCapture()
        scheduleRefreshThreads(note: note)
        // New highlight wins — replace any open scripture/URL pill dock so the user sees their
        // freshly created highlight pinned in the inline dock.
        dismissActiveScripturePillDock()
        activeUrlPillDock = nil
        dockPinnedHighlightThreadId = thread.id
        activeHighlightDockExpanded = true
    }

    #if os(iOS)
    @ViewBuilder
    private func iosHighlightAnnotationCaptureSheet(session: HighlightCaptureSession) -> some View {
        if let n = note, n.id == session.parentNoteId {
            IOSHighlightAuthoringSheet(
                excerptPreview: session.excerpt,
                annotationText: $highlightAnnotationDraft,
                titleText: $highlightAnnotationTitle,
                selectedAccent: $highlightAnnotationAccent,
                onCancel: {
                    dismissHighlightCapture()
                },
                onSave: { saveHighlightFromPanel(for: n) }
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        } else {
            Color.clear
                .task { dismissHighlightCapture() }
        }
    }
    #endif

    /// Shared morph id — the bar and popover share their capsule chrome for a seamless grow animation.
    private static let selectionAccessoryCapsuleMorphID = "harvous-selection-accessory-capsule"

    @ViewBuilder
    private func selectionAccessoryLayer(note: Note, horizontalClampWidth: CGFloat) -> some View {
        let anchorRect = proxy.selectionViewportRect
        ZStack(alignment: .topLeading) {
            #if os(macOS)
            // iOS: highlight + new note live in UITextView’s system edit menu (`HarvousBodyTextView.editMenu`).
            if highlightCaptureSession == nil, proxy.hasSelection, let rect = anchorRect {
                let intersectRemovals = threadIdsIntersectingCurrentBodySelection()
                let clearFormatting = selectionIntersectsClearableRichFormatting()
                let showErase = !intersectRemovals.isEmpty || clearFormatting
                let showLookup = proxy.singleWordSelection
                    .map { eastonsService.hasEntry(forWord: $0) } ?? false
                // Base = Highlight + New Note (84pt) + horizontal padding (12). Each optional pill
                // (Look up, Erase) adds 37pt (36 glyph + 0.5 divider + spacing).
                let extras = (showLookup ? 37 : 0) + (showErase ? 37 : 0)
                let width: CGFloat = 96 + CGFloat(extras)
                let x = selectionAccessoryX(rect: rect, containerWidth: horizontalClampWidth, width: width)
                let y = selectionAccessoryY(rect: rect)
                let eraseHelp: String = {
                    if !intersectRemovals.isEmpty, clearFormatting { return "Erase highlight and formatting" }
                    if !intersectRemovals.isEmpty { return "Remove highlight from text" }
                    return "Clear bold, links, and other formatting"
                }()
                let lookupTarget: String? = {
                    guard let w = proxy.singleWordSelection else { return nil }
                    return eastonsService.hasEntry(forWord: w) ? w : nil
                }()
                SelectionActionBar(
                    morphNamespace: selectionAccessoryNamespace,
                    morphID: Self.selectionAccessoryCapsuleMorphID,
                    onHighlight: {
                        withAnimation(.spring(response: 0.36, dampingFraction: 0.82)) {
                            proxy.triggerHighlightCapturePrompt?()
                        }
                    },
                    onNewStandaloneNote: { proxy.triggerStandaloneNoteFromSelection?() },
                    onLookup: lookupTarget.map { word in
                        {
                            guard let (_, storage) = proxy.textViewPair() else { return }
                            let storageRange = proxy.bodySelectedUTF16Range
                            guard case .success(let expRange) = HarvousStudyHighlightMapper.expandedRange(
                                forStorageSelection: storageRange, in: storage
                            ), expRange.length > 0 else { return }
                            let thread = ThreadStore.createReferenceHighlight(
                                parent: note,
                                spaceId: note.resolvedSpaceId(),
                                word: word,
                                expandedAnchorUTF16Range: expRange,
                                expandedPlainForAnchor: editorState.plainText,
                                modelContext: context
                            )
                            scheduleRefreshThreads(note: note)
                            // Open the highlight dock so the user sees the Easton's entry inline.
                            dockPinnedHighlightThreadId = thread.id
                            activeHighlightDockExpanded = true
                        }
                    },
                    onEraseInlineFormatting: showErase
                        ? {
                            proxy.triggerRemoveIntersectingStudyHighlightsFromSelection?()
                        }
                        : nil,
                    eraseInlineFormattingHelp: eraseHelp
                )
                .offset(x: x, y: y)
                .transition(.asymmetric(
                    insertion: .opacity.combined(with: .scale(scale: 0.9, anchor: .top)),
                    removal: .opacity
                ))
            }
            #endif
            #if os(macOS)
            if let session = highlightCaptureSession, session.parentNoteId == note.id {
                let baseRect = session.anchorRect ?? anchorRect ?? CGRect(x: horizontalClampWidth / 2, y: 80, width: 0, height: 0)
                // Match `selectionAccessoryX` side inset (8pt) so the 360pt design cap never exceeds the paper column.
                let panelW = min(360, max(horizontalClampWidth - 16, 160))
                let x = selectionAccessoryX(rect: baseRect, containerWidth: horizontalClampWidth, width: panelW)
                let y = selectionAccessoryY(rect: baseRect)
                HighlightAnnotationPopover(
                    excerptPreview: session.excerpt,
                    annotationText: $highlightAnnotationDraft,
                    titleText: $highlightAnnotationTitle,
                    selectedAccent: $highlightAnnotationAccent,
                    morphNamespace: selectionAccessoryNamespace,
                    morphID: Self.selectionAccessoryCapsuleMorphID,
                    onCancel: {
                        withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
                            dismissHighlightCapture()
                        }
                    },
                    onSave: { saveHighlightFromPanel(for: note) }
                )
                .offset(x: x, y: y)
                .transition(.asymmetric(
                    insertion: .opacity,
                    removal: .opacity.combined(with: .scale(scale: 0.95, anchor: .top))
                ))
            }
            #endif
            if let prompt = proxy.scripturePillDeletionPrompt {
                let barW: CGFloat = min(340, max(horizontalClampWidth - 16, 260))
                let rect = prompt.anchorViewportRect
                let hasRealAnchor = rect.width > 0.5 && rect.height > 0.5
                let layoutRect =
                    hasRealAnchor
                    ? rect
                    : CGRect(x: horizontalClampWidth / 2, y: 100, width: 1, height: 28)
                let x = selectionAccessoryX(rect: layoutRect, containerWidth: horizontalClampWidth, width: barW)
                let y = selectionAccessoryY(rect: layoutRect)
                scripturePillDeletionConfirmBar
                    .frame(width: barW)
                    .offset(x: x, y: y)
                    .transition(.asymmetric(
                        insertion: .opacity.combined(with: .scale(scale: 0.92, anchor: .top)),
                        removal: .opacity
                    ))
            }
        }
        #if os(macOS)
        .animation(.spring(response: 0.36, dampingFraction: 0.82), value: highlightCaptureSession != nil)
        #endif
        .animation(.spring(response: 0.32, dampingFraction: 0.84), value: proxy.scripturePillDeletionPrompt != nil)
    }

    /// Clamps a floating accessory horizontally inside the editor paper, centered on the selection.
    private func selectionAccessoryX(rect: CGRect, containerWidth: CGFloat, width: CGFloat) -> CGFloat {
        let inset: CGFloat = 8
        let raw = rect.midX - width / 2
        return min(max(raw, inset), max(inset, containerWidth - width - inset))
    }

    /// Positions the accessory **below** the selection (8pt gap) so the selected prose stays visible.
    private func selectionAccessoryY(rect: CGRect) -> CGFloat {
        rect.maxY + 8
    }

    /// Single-row capsule (trash + dismiss) — matches `SelectionActionBar` chrome; keep below the pill.
    private var scripturePillDeletionConfirmBar: some View {
        HStack(spacing: 0) {
            Text("Remove this scripture pill?")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.88)
                .multilineTextAlignment(.leading)
                .padding(.leading, 14)
                .padding(.trailing, 10)
                .layoutPriority(1)

            Rectangle()
                .fill(Color.primary.opacity(0.14))
                .frame(width: 0.5, height: 22)

            Button {
                withAnimation(.spring(response: 0.28, dampingFraction: 0.85)) {
                    proxy.confirmScripturePillDeletion()
                }
            } label: {
                HarvousFAGlyph(assetName: "Harvous.Trash", edgePt: 15)
                    .frame(width: 42, height: 42)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.red)
            #if os(macOS)
            .help("Remove scripture pill")
            #endif
            .accessibilityLabel("Remove scripture pill")

            Rectangle()
                .fill(Color.primary.opacity(0.14))
                .frame(width: 0.5, height: 22)

            Button {
                withAnimation(.spring(response: 0.28, dampingFraction: 0.85)) {
                    proxy.dismissScripturePillDeletionPrompt()
                }
            } label: {
                HarvousFAGlyph(assetName: "Harvous.Xmark", edgePt: 13)
                    .frame(width: 42, height: 42)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.primary.opacity(0.72))
            #if os(macOS)
            .help("Keep scripture pill")
            #endif
            .accessibilityLabel("Keep scripture pill")
        }
        .frame(height: 44)
        .background(
            Capsule()
                .fill(.regularMaterial)
        )
        .overlay(
            Capsule()
                .strokeBorder(Color.primary.opacity(0.1), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.14), radius: 8, y: 3)
        .shadow(color: .black.opacity(0.05), radius: 1, y: 1)
    }

    /// Persists parent note edits, inserts the quoted child note, then navigates (iOS pushes path; mac swaps selection).
    private func receiveStandaloneNoteFromSelection(_ notification: Notification) {
        guard let ui = notification.userInfo,
              let title = ui[HarvousStandaloneNoteSelectionUserInfo.titleKey] as? String,
              let body = ui[HarvousStandaloneNoteSelectionUserInfo.bodyKey] as? String else { return }

        let refs: [String] = {
            if let arr = ui[HarvousStandaloneNoteSelectionUserInfo.refsKey] as? [String] { return arr }
            if let arr = ui[HarvousStandaloneNoteSelectionUserInfo.refsKey] as? NSArray {
                return arr.compactMap { $0 as? String }
            }
            return []
        }()

        guard let parentNote = note else { return }
        autosave.cancel()
        persistEditorIntoNote(parentNote)

        let sid = parentNote.resolvedSpaceId()
        let created = Note(title: title, body: body, detectedRefs: refs, spaceId: sid)
        context.insert(created)
        NoteSimpleIDAssigner.assignIfMissing(created, in: context)
        do {
            try context.save()
        } catch {
            print("[NoteEditorView] save failed after standalone-note insert: \(error)")
            return
        }
        HarvousNoteSpotlightIndexer.reindex(note: created)
        HarvousVaultExporter.scheduleWrite(note: created, modelContext: context)

        // Auto-connect: anchor the new note back to the source selection on the parent (so the parent
        // shows the connection, both ends surface in the linked-notes sheet, and the anchored highlight paints).
        let sourceExcerpt = (ui[HarvousStandaloneNoteSelectionUserInfo.sourceExcerptKey] as? String) ?? ""
        let expandedLoc = (ui[HarvousStandaloneNoteSelectionUserInfo.expandedLocationKey] as? NSNumber)?.intValue
        let expandedLen = (ui[HarvousStandaloneNoteSelectionUserInfo.expandedLengthKey] as? NSNumber)?.intValue
        let connection: StudyThread = {
            if !sourceExcerpt.isEmpty, let loc = expandedLoc, let len = expandedLen, len > 0 {
                return ThreadStore.createConnectionMarker(
                    parent: parentNote,
                    spaceId: sid,
                    sourceSnippet: sourceExcerpt,
                    linked: created,
                    expandedAnchorUTF16Range: NSRange(location: loc, length: len),
                    expandedPlainForAnchor: editorState.plainText,
                    modelContext: context
                )
            }
            return ThreadStore.createUnanchoredConnection(
                parent: parentNote,
                linked: created,
                modelContext: context
            )
        }()
        ThreadStore.touchParentNoteIfNeeded(connection, modelContext: context)
        scheduleRefreshThreads(note: parentNote)

#if os(macOS)
        note = created
#else
        NotificationCenter.default.post(
            name: .harvousStandaloneNoteNavigateIOS,
            object: nil,
            userInfo: [HarvousStandaloneNoteNavigateUserInfo.noteIdKey: created.id.uuidString]
        )
#endif
    }

    // MARK: - Empty state

    private var emptyDetail: some View {
        VStack(spacing: 12) {
            HarvousFAGlyph(assetName: "Harvous.Note", edgePt: 40)
                .foregroundStyle(.quaternary)
            Text("Pick a note to open")
                .font(HarvousTypography.title)
                .foregroundStyle(.secondary)
            #if os(macOS)
            Text("Choose a note in the sidebar, or press ⌘N to start writing.")
                .font(HarvousTypography.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            #else
            // iPad split layout has a sidebar and hardware-keyboard ⌘N support — use Mac wording.
            Text(isIPadSplitLayout
                 ? "Choose a note in the sidebar, or press ⌘N to start writing."
                 : "Choose a note in the list to open it.")
                .font(HarvousTypography.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            #endif
        }
        .padding(.horizontal, 28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Editor canvas

    /// Capped width of the scrollable title + body column (centered in the window via leading/trailing `Spacer`s).
    private static let editorScrollSurfaceMaxWidthPoints: CGFloat = 794

    /// Mac shows formatting toolbar + connections bar at the bottom of the editor; iPhone uses the
    /// floating `MorphingChromeBar` instead; iPad reuses the Mac chrome when hosted in `iPadRootView`.
    private var shouldShowMacStyleBottomChrome: Bool {
        #if os(macOS)
        return true
        #else
        return isIPadSplitLayout
        #endif
    }

    /// Formatting `NoteToolbar` is shown inline whenever the body is the first responder.
    /// Connections moved to the right-panel inspector — the bottom chrome is now formatting-only.
    private var shouldShowFormatToolbarInline: Bool {
        proxy.isBodyFirstResponder
    }

    @ViewBuilder
    private func editorCanvas(note: Note) -> some View {
        GeometryReader { outerGeo in
            let viewportCol = max(outerGeo.size.height, 1)
            #if os(iOS)
            let dockViewportBudget = viewportCol
            let dockExpandedContentMaxHeight = HarvousDockExpandedContentLayout.expandedScrollMaxHeight(
                viewportHeight: max(dockViewportBudget, 1)
            )
            #else
            let dockExpandedContentMaxHeight = HarvousDockExpandedContentLayout.expandedScrollMaxHeight(viewportHeight: viewportCol)
            #endif

            VStack(spacing: 0) {
                // Scrollable writing surface — `minHeight` matches viewport so paper runs flush to the footer (no dead band).
                HStack(spacing: 0) {
                    Spacer(minLength: 0)
                    GeometryReader { geo in
                let viewportH = max(geo.size.height, 1)
                let paperClampW = max(geo.size.width - 40, 200)
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        // Title — Apple Notes style: large, bold, full-width
                        TextField("Title", text: $title, axis: .vertical)
                            .font(HarvousTypography.composeTitleFieldFont())
                            .foregroundStyle(.primary)
                            .textFieldStyle(.plain)
                            #if os(iOS)
                            .autocorrectionDisabled(false)
                            .textInputAutocapitalization(.sentences)
#endif
                            .focused($titleFocused)
                            .onChange(of: titleFocused) { _, focused in
                                guard focused else { return }
                                DispatchQueue.main.async {
                                    proxy.clearActiveScripturePill()
                                }
                            }
                            .padding(.horizontal, 20)
                            .padding(.top, 24)
                            .padding(.bottom, 12)
                            .onChange(of: title) { _, newValue in
                                if newValue.contains("\n") {
                                    title = newValue.replacingOccurrences(of: "\n", with: "")
                                    titleFocused = false
                                    DispatchQueue.main.async { proxy.refocusTextView() }
                                }
                                scheduleAutosave(note)
                            }

                        titleScripturePillsRow(note: note)

                        // Body — same horizontal inset as title (TextKit defaults add extra leading; zeroed in HarvousEditor)
                        #if os(macOS)
                        HarvousEditor(
                            state: $editorState,
                            proxy: proxy,
                            noteID: note.id,
                            documentBody: note.body,
                            placeholder: "Start writing…",
                            font: HarvousFonts.noteComposeBodyNSFont(),
                            scriptureTheme: scriptureTheme,
                            studyHighlightPaints: studyHighlightPaints,
                            studyHighlightFocusedThreadId: nil,
                            studyHighlightsAssumeDarkAppearance: colorScheme == .dark,
                            onScripturePillTap: { scripturePillTapped(reference: $0, translation: $1, range: $2) },
                            onURLPillTap: { urlPillTapped(href: $0, title: $1, label: $2, range: $3) },
                            onResolvedScripturePillPairs: { scheduleScripturePassagePrefetch(pairs: $0) },
                            pillAccentResolver: { [note] reference in
                                guard let raw = note.scripturePillAccentRaw(forReference: reference) else { return nil }
                                guard let token = StudyHighlightAccentToken(rawValue: raw), token != .auto else { return nil }
                                return token
                            },
                            onStudyHighlightClick: { userActivatedStudyHighlight(threadId: $0) },
                            onRemoveStudyHighlightThreadIds: { removeStudyHighlightThreads(ids: $0, parent: note) },
                            dynamicTypeSize: dynamicTypeSize
                        )
                        // Fresh `NSViewRepresentable` + TextKit stack per note avoids pathological incremental
                        // `updateNSView` when reusing one `NSTextView` across scripture-heavy bodies.
                        .id(note.id)
                        .frame(height: proxy.macBodyLayoutHeight)
                        .overlay(alignment: .topLeading) {
                            selectionAccessoryLayer(note: note, horizontalClampWidth: paperClampW)
                        }
                        .padding(.horizontal, 20)
                        .onChange(of: editorState.plainText) { _, _ in scheduleAutosave(note) }
                        #else
                        HarvousEditor(
                            state: $editorState,
                            noteID: note.id,
                            documentBody: note.body,
                            placeholder: "Start writing…",
                            scriptureTheme: scriptureTheme,
                            proxy: proxy,
                            onScripturePillTap: { scripturePillTapped(reference: $0, translation: $1, range: $2) },
                            onURLPillTap: { urlPillTapped(href: $0, title: $1, label: $2, range: $3) },
                            onResolvedScripturePillPairs: { scheduleScripturePassagePrefetch(pairs: $0) },
                            onStudyHighlightTap: { userActivatedStudyHighlight(threadId: $0) },
                            studyHighlightPaints: studyHighlightPaints,
                            studyHighlightFocusedThreadId: nil,
                            studyHighlightsAssumeDarkAppearance: colorScheme == .dark,
                            pillAccentResolver: { [note] reference in
                                guard let raw = note.scripturePillAccentRaw(forReference: reference) else { return nil }
                                guard let token = StudyHighlightAccentToken(rawValue: raw), token != .auto else { return nil }
                                return token
                            },
                            onRemoveStudyHighlightThreadIds: { removeStudyHighlightThreads(ids: $0, parent: note) },
                            dynamicTypeSize: dynamicTypeSize,
                            isIPadSplitLayout: isIPadSplitLayout
                        )
                        .frame(minHeight: 400)
                        .overlay(alignment: .topLeading) {
                            selectionAccessoryLayer(note: note, horizontalClampWidth: paperClampW)
                        }
                        .padding(.horizontal, 20)
                        .onChange(of: editorState.plainText) { _, _ in scheduleAutosave(note) }
                        #endif

                        #if os(macOS)
                        Spacer(minLength: 0)
                        #endif
                    }
                    #if os(macOS)
                    .frame(maxWidth: .infinity, minHeight: viewportH, alignment: .top)
                    #else
                    .frame(maxWidth: .infinity, alignment: .top)
                    .padding(.bottom, iosNoteEditorScrollContentBottomPadding)
                    #endif
                }
                #if os(iOS)
                .scrollDismissesKeyboard(.interactively)
                .contentMargins(.bottom, HarvousIOSMorphingChromeLayout.interChromeSpacing, for: .scrollContent)
                #endif
            }
#if os(macOS)
                    .overlay(alignment: .bottom) {
                        VStack(alignment: .leading, spacing: studyDockStackSpacing) {
                            activeStudyHighlightDock(note: note)
                            activeScripturePillDock(note: note)
                            activeURLPillDock(note: note)
                        }
                        .environment(\.harvousDockExpandedContentMaxHeight, dockExpandedContentMaxHeight)
                    }
#endif
                    .frame(maxWidth: Self.editorScrollSurfaceMaxWidthPoints, maxHeight: .infinity)
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                // Bottom bar: formatting toolbar only. Connections moved to the right-panel inspector.
                // Mac uses this always; iPad uses it when hosted in the split layout; iPhone uses the MorphingChromeBar.
                if shouldShowMacStyleBottomChrome, shouldShowFormatToolbarInline {
                    NoteToolbar(proxy: proxy)
                        .id("noteToolbar")
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            #if os(iOS)
            .safeAreaInset(edge: .bottom, spacing: HarvousIOSMorphingChromeLayout.interChromeSpacing) {
                if iosStudyDockOverlayChromeSuppressed {
                    VStack(alignment: .leading, spacing: studyDockStackSpacing) {
                        activeStudyHighlightDock(note: note)
                        activeScripturePillDock(note: note)
                        activeURLPillDock(note: note)
                    }
                    .environment(\.harvousDockExpandedContentMaxHeight, dockExpandedContentMaxHeight)
                    .animation(HarvousAnimation.spring, value: activePillDock != nil)
                    .animation(HarvousAnimation.spring, value: activeUrlPillDock != nil)
                    .animation(HarvousAnimation.spring, value: dockPinnedHighlightThreadId)
                    .animation(HarvousAnimation.spring, value: highlightCaptureSession != nil)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            #endif
        }
        .onDisappear {
            scripturePillPrefetchTask?.cancel()
            scripturePillPrefetchTask = nil
            reconcileStudyHighlightsTask?.cancel()
            reconcileStudyHighlightsTask = nil
            refreshThreadsTask?.cancel()
            refreshThreadsTask = nil
        }
        #if os(macOS)
        .sheet(isPresented: $proxy.showAddLinkSheet) {
            AddLinkSheetView(proxy: proxy)
        }
        .onChange(of: proxy.showAddLinkSheet) { _, open in
            if !open, proxy.hasActiveAddLinkSession {
                DispatchQueue.main.async {
                    proxy.cancelAddLinkSheet()
                }
            }
        }
        .animation(HarvousAnimation.spring, value: proxy.shouldShowNoteToolbar)
        .animation(HarvousAnimation.spring, value: proxy.activeScripturePill != nil)
        .animation(HarvousAnimation.spring, value: activePillDock != nil)
        .animation(HarvousAnimation.spring, value: activeUrlPillDock != nil)
        .animation(HarvousAnimation.spring, value: dockPinnedHighlightThreadId != nil)
        .animation(HarvousAnimation.spring, value: proxy.isBodyFirstResponder)
        .toolbar {}
        #else
        // Sheet (not `.inspector`) so `NavigationStack` shows inline title + trailing dismiss like You / passage sheets.
        .sheet(isPresented: $showInspectorIOS) {
            inspectorContent(note: note)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .onAppear {
            appRouter.iosRegisterNoteEditorChrome(proxy: proxy)
            scheduleSyncIOSNoteFooterSupplement()
        }
        .onDisappear {
            appRouter.iosUnregisterNoteEditorChrome(proxy: proxy)
        }
        .sheet(isPresented: $proxy.showIOSInlineImageImporter) {
            IOSInlineImagePickSheet(isPresented: $proxy.showIOSInlineImageImporter) { img in
                proxy.insertPhotoLibraryImage(img)
            }
        }
        .sheet(isPresented: $proxy.showAddLinkSheet) {
            AddLinkSheetView(proxy: proxy)
        }
        .onChange(of: proxy.showAddLinkSheet) { _, open in
            if !open, proxy.hasActiveAddLinkSession {
                DispatchQueue.main.async {
                    proxy.cancelAddLinkSheet()
                }
            }
        }
        .animation(HarvousAnimation.spring, value: proxy.shouldShowNoteToolbar)
        .animation(HarvousAnimation.spring, value: proxy.isBodyFirstResponder)
        .animation(HarvousAnimation.spring, value: proxy.activeScripturePill != nil)
        .animation(HarvousAnimation.spring, value: activePillDock != nil)
        .animation(HarvousAnimation.spring, value: activeUrlPillDock != nil)
        .animation(HarvousAnimation.spring, value: dockPinnedHighlightThreadId != nil)
        .animation(HarvousAnimation.spring, value: highlightCaptureSession != nil)
        // ToolbarSpacer (iOS 26+) keeps the folder chip from crowding the system back chevron.
        // The chip's tap target (44 pt square on icon-only, wider pill when named) is self-contained,
        // so no extra leading inset is needed — asymmetric padding shifts the glass orb off-center.
        .toolbar {
            if !isIPadSplitLayout {
                if #available(iOS 26, *) {
                    ToolbarSpacer(.fixed, placement: .topBarLeading)
                }
                ToolbarItem(placement: .topBarLeading) {
                    NoteTopBar(
                        note: note,
                        isFolderContextUpdating: isFolderContextUpdating,
                        showFolderToolbarText: showFolderToolbarText,
                        scriptureTheme: scriptureTheme
                    )
                }
                ToolbarItem(placement: .topBarTrailing) {
                    NoteShareDeleteBar(
                        note: note,
                        onDeleteConfirmed: { deleteCurrentNoteIfPossible() },
                        onOpenNoteDetails: {
                            withAnimation(HarvousAnimation.spring) { showInspectorIOS = true }
                        },
                        shareSnapshot: { NoteShareSnapshot(title: title, body: editorState.plainText) }
                    )
                }
            }
        }
        .sheet(item: $highlightCaptureSession, onDismiss: {
            // Interactive dismiss does not run `dismissHighlightCapture()`; reset bindings so the next capture is fresh.
            highlightAnnotationDraft = ""
            highlightAnnotationTitle = ""
            highlightAnnotationAccent = .warmAmber
        }) { session in
            iosHighlightAnnotationCaptureSheet(session: session)
        }
        #endif
        // Inspector pane — Mac always, iPad when hosted in `iPadRootView`, iPhone never (showInspector
        // stays `.constant(false)` and the in-editor "Note Details" button opens the `.sheet` above instead).
        .inspector(isPresented: showInspector) {
            inspectorContent(note: note)
        }
        .sheet(item: $highlightDetailThreadId) { item in
            highlightDetailSheet(for: item.threadId)
        }
        .sheet(item: $editingURLPillDraft) { draft in
            EditURLLinkSheetView(
                initialHref: draft.href,
                onSave: { newHref in
                    proxy.replaceURLPill(in: draft.range, newHref: newHref)
                    editingURLPillDraft = nil
                },
                onCancel: { editingURLPillDraft = nil }
            )
        }
        .sheet(item: $scripturePassageSheet) { item in
            NavigationStack {
                ScrollView {
                    ScripturePassageView(reference: item.reference, translation: item.translation, showHeader: true)
                        .padding(20)
                }
                .navigationTitle("Passage")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Done") { scripturePassageSheet = nil }
                    }
                }
            }
            .frame(minWidth: 420, minHeight: 460)
        }
        .sheet(isPresented: $showLinkPicker) {
            linkPickerSheetContent
        }
        .sheet(isPresented: $showWikiLinkPicker) {
            wikiLinkPickerSheetContent
        }
        .sheet(isPresented: $showRelatedNotes) {
            relatedNotesSheetContent
        }
    }

    @ViewBuilder
    private var linkPickerSheetContent: some View {
        if let n = note {
            NavigationStack {
                ConnectNotePicker(
                    spaceId: n.resolvedSpaceId(),
                    parentNoteId: n.id,
                    onPick: { picked in
                        _ = ThreadStore.createUnanchoredConnection(parent: n, linked: picked, modelContext: context)
                        scheduleRefreshThreads(note: n)
                        showLinkPicker = false
                    },
                    onCancel: {
                        showLinkPicker = false
                    }
                )
                .navigationTitle("Link to note")
                #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
                #endif
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Done") {
                            showLinkPicker = false
                        }
                    }
                }
            }
        } else {
            Color.clear.onAppear { showLinkPicker = false }
        }
    }

    @ViewBuilder
    private var wikiLinkPickerSheetContent: some View {
        if let n = note {
            NavigationStack {
                ConnectNotePicker(
                    spaceId: n.resolvedSpaceId(),
                    parentNoteId: n.id,
                    onPick: { picked in
                        let t = picked.title.trimmingCharacters(in: .whitespacesAndNewlines)
                        proxy.insertNoteWikilink(title: t.isEmpty ? "Untitled note" : t)
                        HarvousVaultExporter.scheduleWrite(note: n, modelContext: context)
                        showWikiLinkPicker = false
                    },
                    onCancel: {
                        showWikiLinkPicker = false
                    }
                )
                .navigationTitle("Insert note wikilink")
                #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
                #endif
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Done") {
                            showWikiLinkPicker = false
                        }
                    }
                }
            }
        } else {
            Color.clear.onAppear { showWikiLinkPicker = false }
        }
    }

    @ViewBuilder
    private var relatedNotesSheetContent: some View {
        if let n = note {
            RelatedNotesSheet(targetNoteId: n.id, spaceId: n.resolvedSpaceId()) { parentId in
                openNoteInPlace(id: parentId)
            }
        } else {
            Color.clear.onAppear { showRelatedNotes = false }
        }
    }

    private func deleteCurrentNoteIfPossible() {
        guard let n = note else { return }
        autosave.cancel()
        persistEditorIntoNote(n)
        let nid = n.id
        HarvousVaultExporter.removeMirrorFiles(for: n, modelContext: context)
        HarvousNoteSpotlightIndexer.removeNote(id: nid)
        ThreadStore.purgeLinkedNoteMarkers(referencingDeletedNote: nid, modelContext: context)
        HarvousSyncingDelete.delete(note: n, context: context)
        do {
            try context.save()
        } catch {
            print("[NoteEditorView] delete save failed: \(error)")
            return
        }
        note = nil
        onRequestDismissEditor?()
    }

    // MARK: - Study threads

    #if os(iOS)
    /// Publishes linked-note trail + callbacks for the root bottom chrome (`IOSNoteFooterHybridRow`).
    private func syncIOSNoteFooterSupplement() {
        guard appRouter.iosActiveNoteEditorChromeProxy === proxy else { return }
        guard let n = note else {
            appRouter.iosNoteFooterSupplement = nil
            return
        }
        let titleLine = title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Current note" : title
        let suppressBottomChromeForOverlay =
            activePillDock != nil || activeUrlPillDock != nil || dockPinnedHighlightThreadId != nil || highlightCaptureSession != nil
        appRouter.iosNoteFooterSupplement = HarvousIOSNoteFooterSupplement(
            note: n,
            trailSnapshot: trailSnapshot,
            connectionsTitleLine: titleLine,
            suppressScripturePillActionBar: suppressBottomChromeForOverlay,
            suppressesBottomMorphingChromeContent: suppressBottomChromeForOverlay,
            onRefreshConnections: { iosFooterRefreshConnectionsFromSupplement() },
            onOpenLinkedNote: { iosFooterOpenLinkedNoteFromSupplement($0) }
        )
    }

    /// `iosNoteFooterSupplement` is hosted on `@Published` chrome; assigning from synchronous `.onChange`
    /// can trigger SwiftUI “Modifying state during view update” runtime warnings — defer past layout.
    private func scheduleSyncIOSNoteFooterSupplement() {
        DispatchQueue.main.async {
            syncIOSNoteFooterSupplement()
        }
    }

    private func iosFooterRefreshConnectionsFromSupplement() {
        guard let n = note else { return }
        scheduleRefreshThreads(note: n)
    }

    private func iosFooterOpenLinkedNoteFromSupplement(_ id: UUID) {
        openNoteInPlace(id: id)
    }
    #endif

    private func refreshThreads(note: Note) {
        // Heal legacy orphans first — any `linkedNote` thread whose target Note no longer exists.
        // Otherwise stale pills + inline underlines persist on notes that pre-date the deletion fix.
        ThreadStore.purgeDanglingLinkedNoteMarkers(parentNoteId: note.id, modelContext: context)
        let active = ThreadStore.activeThreads(
            parentNoteId: note.id,
            spaceId: note.resolvedSpaceId(),
            modelContext: context
        )
        threadsForNote = active
        scheduleEastonsEntryPrefetch(note: note)
        trailSnapshot = ThreadStore.trailSnapshot(for: note, modelContext: context)
        reconcileStudyHighlightsPainting(for: note)
        // Tag refresh used to run synchronously inside `syncFromNote` on every note switch — ~300 regex
        // matches against the full body blocked the main thread. Now runs inside the debounced slot
        // (50 ms macOS / 150 ms iOS), well after the NavigationStack push transition, so the back-button
        // hit area isn't queued behind it. `allowPrimaryUpdate: false` matches the prior behavior.
        BibleStudyTagSuggester.applyToNote(note, allowPrimaryUpdate: false)
        #if os(iOS)
        syncIOSNoteFooterSupplement()
        #endif
    }

    /// Coalesces multiple rapid calls (note switch, scene-phase transition, highlight events firing together)
    /// into a single refreshThreads execution. Debounce is larger on iOS (150 ms) to clear the typical
    /// NavigationStack push transition (~250 ms) before doing the SwiftData + tag work.
    private func scheduleRefreshThreads(note: Note) {
        refreshThreadsTask?.cancel()
        refreshThreadsTask = Task { @MainActor in
            #if os(iOS)
            try? await Task.sleep(for: .milliseconds(150))
            #else
            try? await Task.sleep(for: .milliseconds(50))
            #endif
            guard !Task.isCancelled else { return }
            refreshThreads(note: note)
        }
    }

    private func anchoredHighlightOrdinal(for threadId: UUID) -> Int? {
        guard let idx = studyHighlightPaints.firstIndex(where: { $0.threadId == threadId }) else { return nil }
        return idx + 1
    }

    @ViewBuilder
    private func activeStudyHighlightDock(note: Note) -> some View {
        let dockThreadId: UUID? = {
            // Highlight dock yields to either scripture-pill or URL-pill dock so the user only
            // sees one piece of inline chrome at a time.
            guard activePillDock == nil, activeUrlPillDock == nil else { return nil }
            return dockPinnedHighlightThreadId
        }()
        if let dockThreadId,
           let dockThread = ThreadStore.fetch(id: dockThreadId, modelContext: context),
           StudyThread.anchoredHighlightKinds.contains(dockThread.entryKind),
           dockThread.hasPersistedHighlightAnchor {
            ActiveHighlightDock(
                thread: dockThread,
                isExpanded: $activeHighlightDockExpanded,
                scriptureTheme: scriptureTheme,
                onDismiss: dismissStudyHighlightDock,
                onAccentPersisted: { reconcileStudyHighlightsPainting(for: note) },
                onJumpToLinkedNote: { openNoteInPlace(id: $0) },
                onReadPassage: { ref, trans in
                    scripturePassageSheet = ScripturePassageSheetItem(reference: ref, translation: trans)
                },
                onRemoveHighlight: {
                    removeHighlightThread(dockThread, parent: note)
                    dismissStudyHighlightDock()
                },
                highlightOrdinal: anchoredHighlightOrdinal(for: dockThreadId)
            )
            // Per-thread identity so swapping highlights (UUID → UUID) re-triggers the transition
            // instead of the dock body silently re-rendering its content without animation.
            .id(dockThreadId)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    private func dismissStudyHighlightDock() {
        dockPinnedHighlightThreadId = nil
        activeHighlightDockExpanded = false
        // Mirrors `dismissActiveScripturePillDock` — avoids the scripture capsule / orb fighting the old caret-adjacent pill.
        proxy.activeScripturePill = nil
        proxy.preferOrbChromeUntilNextFormatSignal = true
        // Footer chrome sync follows from `.onChange(of: dockPinnedHighlightThreadId)` (deferred publish).
    }

    /// Permanently delete the highlight's backing `StudyThread`, then refresh paint state
    /// so the underline immediately disappears from the editor.
    private func removeHighlightThread(_ thread: StudyThread, parent: Note) {
        HarvousSyncingDelete.delete(thread: thread, context: context)
        try? context.saveWithLogging()
        scheduleRefreshThreads(note: parent)
        #if os(iOS)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        #endif
    }

    /// Deletes every anchored prose highlight in `ids` intersecting removal (bulk path for selection/menu).
    private func removeStudyHighlightThreads(ids: [UUID], parent note: Note) {
        let unique = Array(Set(ids))
        guard !unique.isEmpty else { return }
        let pinnedBefore = dockPinnedHighlightThreadId
        autosave.cancel()
        persistEditorIntoNote(note)
        for id in unique {
            guard let t = ThreadStore.fetch(id: id, modelContext: context),
                  StudyThread.anchoredHighlightKinds.contains(t.entryKind) else { continue }
            removeHighlightThread(t, parent: note)
        }
        if let pinned = pinnedBefore, unique.contains(pinned) {
            dismissStudyHighlightDock()
        }
    }

    /// Intersects current body caret/selection against painted highlights (`NSTextStorage`).
    private func threadIdsIntersectingCurrentBodySelection() -> [UUID] {
        guard let (_, storage) = proxy.textViewPair() else { return [] }
        let sel = proxy.bodySelectedUTF16Range
        return HarvousStudyHighlightMapper.threadIdsIntersectingBodySelection(
            sel,
            paints: studyHighlightPaints,
            storage: storage
        )
    }

    private func selectionIntersectsClearableRichFormatting() -> Bool {
        guard let (_, storage) = proxy.textViewPair() else { return false }
        let sel = proxy.bodySelectedUTF16Range
        return HarvousBodyRichTextDiagnostics.selectionIntersectsClearableFormatting(storage: storage, utf16Range: sel)
    }

    private func userActivatedStudyHighlight(threadId: UUID) {
        #if DEBUG
        print("[Harvous.highlight.activate] threadId=\(threadId) note=\(note?.id.uuidString.prefix(8) ?? "nil")")
        #endif
        guard let thread = ThreadStore.fetch(id: threadId, modelContext: context) else {
            #if DEBUG
            print("[Harvous.highlight.activate] FAIL — thread not found in modelContext")
            #endif
            return
        }
        guard StudyThread.anchoredHighlightKinds.contains(thread.entryKind),
              thread.hasPersistedHighlightAnchor else {
            #if DEBUG
            print("[Harvous.highlight.activate] FAIL — kind=\(thread.entryKind) hasAnchor=\(thread.hasPersistedHighlightAnchor)")
            #endif
            return
        }
        // Pin the inline `ActiveHighlightDock` — avoids SwiftUI sheet timing issues vs UITextView focus.
        dismissActiveScripturePillDock()
        dockPinnedHighlightThreadId = threadId
        activeHighlightDockExpanded = true
        highlightDetailThreadId = nil
        #if DEBUG
        print("[Harvous.highlight.activate] OK — pinned dock for threadId=\(threadId)")
        #endif
        #if os(iOS)
        proxy.resignBodyEditing()
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        #endif
    }

    /// Keystroke-driven entry point — coalesces rapid edits so the SwiftData fetch + sort does not run
    /// on every character. Also deferred long enough (≥80 ms) to clear the typical NavigationStack push
    /// transition window so back-button taps after first mount land in the system gesture's first frame.
    private func scheduleReconcileStudyHighlightsPainting(for note: Note) {
        reconcileStudyHighlightsTask?.cancel()
        let noteId = note.id
        reconcileStudyHighlightsTask = Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(120))
            guard !Task.isCancelled else { return }
            guard let n = self.note, n.id == noteId else { return }
            reconcileStudyHighlightsPainting(for: n)
        }
    }

    private func reconcileStudyHighlightsPainting(for note: Note) {
        let rows = ThreadStore.fetchAnchoredHighlights(parentNoteId: note.id, modelContext: context)
        let plain = editorState.plainText
        studyHighlightPaints =
            rows.compactMap { row in
                guard let rr = row.resolveHighlightRangeAgainstExpandedBody(plain) else { return nil }
                let accent = StudyHighlightAccentToken.decoding(row.highlightAccentRaw)
                return StudyHighlightPaint(threadId: row.id, entryKind: row.entryKind, accent: accent, expandedUTF16Range: rr)
            }
            .sorted {
                let lhs = $0.expandedUTF16Range.location
                let rhs = $1.expandedUTF16Range.location
                if lhs != rhs { return lhs < rhs }
                return $0.threadId.uuidString < $1.threadId.uuidString
            }
        // Read-only paint reconciliation; never persist here (was calling `saveWithLogging` on every body
        // change and note switch — main-thread stalls and SwiftData contention with no model mutations).
    }

    private func onBodySelectionHostChanged() {
        if !proxy.hasSelection {
            // iOS: choosing **Highlight** from the system edit menu clears the selection when the menu
            // closes; the capture session already frozen expanded range + excerpt in `consumeHighlightPrompt`.
            if highlightCaptureSession == nil {
                dismissHighlightCapture()
            }
        }
        reconcilePinnedHighlightDockWithBodySelection()
    }

    /// Defer past layout — `bodySelectionChangeToken` tracks `EditorProxy` selection; mutating `@State` in the
    /// same turn triggers SwiftUI “Modifying state during view update” (see `scheduleSyncIOSNoteFooterSupplement`).
    private func scheduleOnBodySelectionHostChanged() {
        DispatchQueue.main.async {
            onBodySelectionHostChanged()
        }
    }

    /// Clears the pinned highlight dock when its anchor no longer appears in the document (e.g. deleted range).
    /// Caret movement alone does not dismiss; the user closes the dock explicitly.
    private func reconcilePinnedHighlightDockWithBodySelection() {
        guard let pinned = dockPinnedHighlightThreadId else { return }
        guard !studyHighlightPaints.contains(where: { $0.threadId == pinned }) else { return }

        guard let n = note,
              let thread = ThreadStore.fetch(id: pinned, modelContext: context),
              StudyThread.anchoredHighlightKinds.contains(thread.entryKind),
              thread.hasPersistedHighlightAnchor,
              thread.resolveHighlightRangeAgainstExpandedBody(editorState.plainText) != nil else {
            dockPinnedHighlightThreadId = nil
            activeHighlightDockExpanded = false
            return
        }

        reconcileStudyHighlightsPainting(for: n)
    }

#if os(macOS)
    private func createConnectedNoteFromKeyboard() {
        guard let parent = note else { return }
        autosave.cancel()
        persistEditorIntoNote(parent)
        let created = Note(spaceId: parent.resolvedSpaceId())
        context.insert(created)
        NoteSimpleIDAssigner.assignIfMissing(created, in: context)
        let connection = ThreadStore.createUnanchoredConnection(parent: parent, linked: created, modelContext: context)
        ThreadStore.touchParentNoteIfNeeded(connection, modelContext: context)
        do {
            try context.save()
        } catch {
            print("[NoteEditorView] connected note save failed: \(error)")
            return
        }
        HarvousNoteSpotlightIndexer.reindex(note: created)
        HarvousVaultExporter.scheduleWrite(note: created, modelContext: context)
        scheduleRefreshThreads(note: parent)
        note = created
    }

    private func focusNextStudyHighlight() {
        guard let n = note else { return }
        let paints = studyHighlightPaints
        guard !paints.isEmpty else { return }
        let body = editorState.plainText
        let currentId = dockPinnedHighlightThreadId
        if let currentId, let idx = paints.firstIndex(where: { $0.threadId == currentId }) {
            let next = paints[(idx + 1) % paints.count]
            activateHighlightPaint(next, note: n, expandedPlain: body)
        } else if let first = paints.first {
            activateHighlightPaint(first, note: n, expandedPlain: body)
        }
    }

    private func focusPreviousStudyHighlight() {
        guard let n = note else { return }
        let paints = studyHighlightPaints
        guard !paints.isEmpty else { return }
        let body = editorState.plainText
        let currentId = dockPinnedHighlightThreadId
        if let currentId, let idx = paints.firstIndex(where: { $0.threadId == currentId }) {
            let prev = paints[(idx - 1 + paints.count) % paints.count]
            activateHighlightPaint(prev, note: n, expandedPlain: body)
        } else if let last = paints.last {
            activateHighlightPaint(last, note: n, expandedPlain: body)
        }
    }

    private func activateHighlightPaint(_ paint: StudyHighlightPaint, note: Note, expandedPlain: String) {
        userActivatedStudyHighlight(threadId: paint.threadId)
        proxy.scrollExpandedStudyHighlightIntoView(expandedUTF16Range: paint.expandedUTF16Range, expandedPlain: expandedPlain)
    }

    private func toggleStudyHighlightDockExpandedFromKeyboard() {
        guard dockPinnedHighlightThreadId != nil else { return }
        activeHighlightDockExpanded.toggle()
    }

    private func removeActiveHighlightFromKeyboard() {
        guard let n = note else { return }
        let intersecting = threadIdsIntersectingCurrentBodySelection()
        let clearFmt = selectionIntersectsClearableRichFormatting()
        if !intersecting.isEmpty || clearFmt {
            proxy.triggerRemoveIntersectingStudyHighlightsFromSelection?()
            return
        }
        guard let tid = dockPinnedHighlightThreadId,
              let thread = ThreadStore.fetch(id: tid, modelContext: context),
              StudyThread.anchoredHighlightKinds.contains(thread.entryKind) else { return }
        removeHighlightThread(thread, parent: n)
        dismissStudyHighlightDock()
    }
#endif

    @ViewBuilder
    private func titleScripturePillsRow(note: Note) -> some View {
        let matches = ScriptureDetector.detect(in: title)
        if matches.isEmpty {
            EmptyView()
        } else {
            FlowLayout(spacing: 8) {
                ForEach(Array(matches.enumerated()), id: \.offset) { _, match in
                    let accent = titleScripturePillAccent(forReference: match.displayText, note: note)
                    Button {
                        titleScripturePillTapped(note: note, match: match)
                    } label: {
                        Group {
                            #if os(macOS)
                            Image(nsImage: ScripturePillAttachment.renderPill(
                                reference: match.displayText,
                                translation: ScriptureReference.defaultTranslation,
                                accent: accent
                            ))
                            #else
                            Image(uiImage: ScripturePillAttachment.renderPill(
                                reference: match.displayText,
                                translation: ScriptureReference.defaultTranslation,
                                accent: accent
                            ))
                            #endif
                        }
                        .fixedSize()
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(match.displayText)
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 10)
            // `renderPill` bakes `NSColor.labelColor` / `UIColor.label` into a static raster at
            // call time, so a light↔dark toggle leaves stale label colors on screen even though
            // SwiftUI re-evaluates this body. Keying the row on the active color scheme forces
            // SwiftUI to discard the previous-mode `Image` and re-rasterize against the new
            // appearance. Editor-embedded pills are refreshed by the host text view's
            // `viewDidChangeEffectiveAppearance` / `traitCollectionDidChange` overrides.
            .id(colorScheme)
        }
    }

    private func titleScripturePillAccent(forReference reference: String, note: Note) -> StudyHighlightAccentToken? {
        guard let raw = note.scripturePillAccentRaw(forReference: reference) else { return nil }
        guard let token = StudyHighlightAccentToken(rawValue: raw), token != .auto else { return nil }
        return token
    }

    @ViewBuilder
    private func inspectorContent(note: Note) -> some View {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedTitle = trimmedTitle.isEmpty ? "Current note" : trimmedTitle
        #if os(macOS)
        NoteInspectorView(
            note: note,
            snapshot: trailSnapshot,
            currentNoteTitle: resolvedTitle,
            onOpenLinkedNote: { id in openNoteInPlace(id: id) },
            onConnectionsChanged: { scheduleRefreshThreads(note: note) }
        )
        .inspectorColumnWidth(min: 240, ideal: 280, max: 320)
        #else
        // Drag indicator + swipe-down handles dismissal (matches `FolderChipPopover` sheet) —
        // omitting the redundant blue Done button keeps the chrome quieter and consistent.
        NavigationStack {
            NoteInspectorView(
                note: note,
                snapshot: trailSnapshot,
                currentNoteTitle: resolvedTitle,
                onOpenLinkedNote: { id in openNoteInPlace(id: id) },
                onConnectionsChanged: { scheduleRefreshThreads(note: note) }
            )
            .navigationTitle("Note Details")
            .navigationBarTitleDisplayMode(.inline)
        }
        #endif
    }

    private func scripturePillTapped(reference: String, translation: String, range: NSRange) {
        dockPinnedHighlightThreadId = nil
        activeHighlightDockExpanded = false
        // Close the URL pill dock if it's open — only one pill dock at a time.
        if activeUrlPillDock != nil {
            dismissActiveURLPillDock()
        }
        #if os(iOS)
        titleFocused = false
        #endif

        activePillDock = ActiveScripturePillDockItem(
            reference: reference,
            translation: translation,
            anchor: .body(range)
        )
        activePillDockExpanded = true
        refreshScripturePassageHighlights(item: activePillDock)
        #if os(iOS)
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        #endif
    }

    private func titleScripturePillTapped(note: Note, match: ScriptureDetector.Match) {
        dockPinnedHighlightThreadId = nil
        activeHighlightDockExpanded = false
        titleFocused = false
        DispatchQueue.main.async {
            self.proxy.clearActiveScripturePill()
        }
        let translation = ScriptureReference.defaultTranslation
        activePillDock = ActiveScripturePillDockItem(
            reference: match.displayText,
            translation: translation,
            anchor: .title(refUTF16Range: match.range)
        )
        activePillDockExpanded = true
        refreshScripturePassageHighlights(item: activePillDock)
        scheduleScripturePassagePrefetch(pairs: [(match.displayText, translation)])
        #if os(iOS)
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        #endif
    }

    /// Parallel scripture passage prefetch once pills exist in storage (bounded concurrency; cancelled when the note/editor goes away).
    private func scheduleScripturePassagePrefetch(pairs: [(reference: String, translation: String)]) {
        scripturePillPrefetchTask?.cancel()
        scripturePillPrefetchTask = Task(priority: .utility) {
            await ScripturePassageCache.shared.prefetchDistinctPairs(pairs, maxConcurrency: 3)
        }
    }

    /// Bounded-concurrency Easton's prefetch for words on this note's existing reference highlights
    /// (mirrors `scheduleScripturePassagePrefetch`). Skipped if the slug index isn't loaded yet —
    /// `.onChange(of: eastonsService.indexLoadState)` re-fires this when it lands.
    private func scheduleEastonsEntryPrefetch(note: Note) {
        guard eastonsService.indexLoadState == .loaded else { return }
        var slugs: [String] = []
        for thread in threadsForNote where thread.entryKind == .reference {
            let word = thread.sourceSnippet.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !word.isEmpty else { continue }
            if let slug = eastonsService.matchedSlug(forWord: word) {
                slugs.append(slug)
            }
        }
        guard !slugs.isEmpty else { return }
        eastonsEntryPrefetchTask?.cancel()
        eastonsEntryPrefetchTask = Task(priority: .utility) {
            await EastonsDictionaryService.shared.prefetchEntries(slugs: slugs, maxConcurrency: 3)
        }
    }

    @ViewBuilder
    private func activeScripturePillDock(note: Note) -> some View {
        if let item = activePillDock {
            ActiveScripturePillDock(
                reference: item.reference,
                translation: Binding(
                    get: { activePillDock?.translation ?? item.translation },
                    set: { newTrans in
                        guard var current = activePillDock else { return }
                        guard current.translation != newTrans else { return }
                        current.translation = newTrans
                        activePillDock = current
                        applyScripturePillTranslationChange(from: current, newTranslation: newTrans, note: note)
                    }
                ),
                accent: Binding(
                    get: {
                        let ref = activePillDock?.reference ?? item.reference
                        guard let raw = note.scripturePillAccentRaw(forReference: ref) else { return nil }
                        guard let token = StudyHighlightAccentToken(rawValue: raw), token != .auto else { return nil }
                        return token
                    },
                    set: { newValue in
                        let ref = activePillDock?.reference ?? item.reference
                        note.setScripturePillAccent(newValue?.rawValue, forReference: ref)
                        try? context.saveWithLogging()
                        requestScripturePillRedetect()
                    }
                ),
                isExpanded: $activePillDockExpanded,
                onReferenceChanged: { newReference in
                    applyScripturePillReferenceChange(newReference: newReference, note: note)
                },
                onSavePassageHighlight: { excerpt, annotation, title, accent in
                    savePassageHighlightForPill(
                        excerptNormalized: excerpt,
                        annotation: annotation,
                        title: title,
                        accent: accent,
                        item: item,
                        note: note
                    )
                } as (String, String, String, StudyHighlightAccentToken) -> StudyThread?,
                onOpenPassageHighlight: { thread in
                    openPassageHighlightFromDock(thread)
                },
                onAccentPersistedForHighlight: {
                    refreshScripturePassageHighlights(item: activePillDock)
                },
                onRemovePassageHighlight: { thread in
                    removeHighlightThread(thread, parent: note)
                    refreshScripturePassageHighlights(item: activePillDock)
                },
                onReadPassageFromHighlight: { ref, trans in
                    scripturePassageSheet = ScripturePassageSheetItem(reference: ref, translation: trans)
                },
                passageHighlightPaints: scripturePassageHighlights.map {
                    ScripturePassageHighlightPaint(id: $0.id, excerpt: $0.scripturePassageExcerpt ?? "", accentRaw: $0.highlightAccentRaw)
                },
                scripturePassageHighlights: scripturePassageHighlights,
                parentNoteId: note.id,
                scriptureTheme: scriptureTheme,
                onDismiss: dismissActiveScripturePillDock
            )
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    private func dismissActiveScripturePillDock() {
        scripturePassageHighlights = []
        activePillDock = nil
        activePillDockExpanded = false
        // Also clear the selection-driven pill state so the old bottom action bar doesn't pop up
        // right after dismiss while the caret is still inside the pill attachment range.
        proxy.activeScripturePill = nil
        // Avoid flashing bottom format chrome while `showFormatBarForActivity` stays true from caret focus (iOS + macOS).
        proxy.preferOrbChromeUntilNextFormatSignal = true
    }

    /// URL-pill tap → opens the inline `ActiveURLPillDock`. Closes any other pill dock first so
    /// the two never stack on top of each other (mutual exclusion mirrors how `scripturePillTapped`
    /// supersedes a pinned highlight dock above).
    private func urlPillTapped(href: String, title: String?, label: String?, range: NSRange) {
        dockPinnedHighlightThreadId = nil
        activeHighlightDockExpanded = false
        // Close the scripture dock if it's open — only one pill dock at a time.
        if activePillDock != nil {
            dismissActiveScripturePillDock()
        }
        #if os(iOS)
        titleFocused = false
        #endif

        activeUrlPillDock = ActiveURLPillDockItem(
            href: href,
            title: title,
            label: label,
            range: range
        )
        #if os(iOS)
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        #endif
    }

    private func dismissActiveURLPillDock() {
        activeUrlPillDock = nil
        // Match the scripture-dock dismissal: avoid flashing bottom format chrome from caret focus.
        proxy.preferOrbChromeUntilNextFormatSignal = true
    }

    @ViewBuilder
    private func activeURLPillDock(note: Note) -> some View {
        if let item = activeUrlPillDock {
            ActiveURLPillDock(
                href: item.href,
                initialTitle: item.title,
                userLabel: item.label,
                onOpenInBrowser: {
                    guard let url = URL(string: item.href) else { return }
                    #if os(macOS)
                    NSWorkspace.shared.open(url)
                    #else
                    UIApplication.shared.open(url, options: [:], completionHandler: nil)
                    #endif
                    dismissActiveURLPillDock()
                },
                onEdit: {
                    // Capture current dock item before dismiss; sheet binds against the draft state.
                    editingURLPillDraft = item
                    dismissActiveURLPillDock()
                },
                onRemove: {
                    proxy.removeURLPill(in: item.range)
                    dismissActiveURLPillDock()
                },
                onDismiss: dismissActiveURLPillDock
            )
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    private func refreshScripturePassageHighlights(item: ActiveScripturePillDockItem?) {
        guard let item else {
            scripturePassageHighlights = []
            return
        }
        let canon = ThreadStore.canonicalScriptureDisplay(fromReferenceRaw: item.reference)
        scripturePassageHighlights = ThreadStore.fetchScripturePassageHighlights(
            canonicalReference: canon,
            translation: item.translation,
            modelContext: context
        )
    }

    /// Passage text highlight for the dock (no note-body anchor); pins the highlight dock and dismisses the pill chrome.
    @discardableResult
    private func savePassageHighlightForPill(
        excerptNormalized: String,
        annotation: String,
        title: String,
        accent: StudyHighlightAccentToken,
        item: ActiveScripturePillDockItem,
        note: Note
    ) -> StudyThread? {
        let normalized = StudyThread.normalizedPassageExcerpt(excerptNormalized)
        guard !normalized.isEmpty else { return nil }
        let thread = ThreadStore.createScripturePassageHighlight(
            parent: note,
            spaceId: note.resolvedSpaceId(),
            referenceRaw: item.reference,
            translation: item.translation,
            excerptRaw: normalized,
            annotation: annotation,
            focusTitle: title,
            highlightAccent: accent,
            modelContext: context
        )
        scheduleRefreshThreads(note: note)
        // Keep the scripture dock open so the new underline appears in place.
        // Refresh the passage highlight list so the underline paints immediately.
        refreshScripturePassageHighlights(item: activePillDock)
        return thread
    }

    private func scripturePillAccentToken(forReference reference: String, note: Note) -> StudyHighlightAccentToken {
        guard let raw = note.scripturePillAccentRaw(forReference: reference),
              let token = StudyHighlightAccentToken(rawValue: raw), token != .auto else { return .neutral }
        return token
    }

    /// Passage-highlight path when the editor is already showing the correct parent note (Highlights list, dock).
    private func activatePassageStudyHighlightForCurrentNote(_ thread: StudyThread) {
        dismissActiveScripturePillDock()
        dockPinnedHighlightThreadId = thread.id
        activeHighlightDockExpanded = true
        highlightDetailThreadId = nil
    }

    /// Retries briefly after Highlights list pushes a note — needs correct `note?.id`, body sync, then activation.
    private func scheduleConsumePendingStudyHighlightListActivation() {
        guard appRouter.pendingStudyHighlightActivation != nil else { return }
        let captured = appRouter.pendingStudyHighlightActivation
        DispatchQueue.main.async {
            guard let pending = captured, appRouter.pendingStudyHighlightActivation?.requestId == pending.requestId else {
                return
            }
            applyPendingStudyHighlightListActivation(pending)
        }
    }

    private func applyPendingStudyHighlightListActivation(_ pending: PendingStudyHighlightActivation) {
        guard appRouter.pendingStudyHighlightActivation?.requestId == pending.requestId else { return }
        guard let n = note, n.id == pending.noteId else { return }
        guard let thread = ThreadStore.fetch(id: pending.threadId, modelContext: context) else {
            appRouter.clearPendingStudyHighlightActivation()
            return
        }
        if StudyHighlightListIndex.isScripturePassageHighlight(thread) {
            activatePassageStudyHighlightForCurrentNote(thread)
        } else if thread.hasPersistedHighlightAnchor {
            userActivatedStudyHighlight(threadId: thread.id)
        } else {
            appRouter.clearPendingStudyHighlightActivation()
            return
        }
        appRouter.clearPendingStudyHighlightActivation()
    }

    private func openPassageHighlightFromDock(_ thread: StudyThread) {
        if thread.parentNoteId != note?.id {
            openNoteInPlace(id: thread.parentNoteId)
        }
        activatePassageStudyHighlightForCurrentNote(thread)
    }

    /// Update the inline pill attachment's translation in-place by routing through the existing
    /// `EditorProxy.replaceActiveScripturePill` path (it already preserves the accent attribute).
    private func applyScripturePillTranslationChange(from item: ActiveScripturePillDockItem,
                                                      newTranslation: String,
                                                      note: Note) {
        switch item.anchor {
        case .body(let range):
            proxy.activeScripturePill = ActiveScripturePill(
                attachmentRange: range,
                reference: item.reference,
                translation: item.translation
            )
            proxy.replaceActiveScripturePill(reference: item.reference, translation: newTranslation, theme: scriptureTheme)
            proxy.activeScripturePill = nil
            requestScripturePillRedetect()
        case .title:
            break
        }
    }

    /// Rewrite the inline pill attachment with a new reference (user picked different Book/Chapter/Verse
    /// in the dock). Keeps the current translation, carries over any per-reference accent the user had
    /// picked, and keeps the dock pinned on the new reference.
    private func applyScripturePillReferenceChange(newReference: String, note: Note) {
        guard let current = activePillDock else { return }
        guard newReference != current.reference else { return }

        // Migrate the accent map key so the color follows the edit.
        if let accentRaw = note.scripturePillAccentRaw(forReference: current.reference) {
            note.setScripturePillAccent(nil, forReference: current.reference)
            note.setScripturePillAccent(accentRaw, forReference: newReference)
            try? context.saveWithLogging()
        }

        switch current.anchor {
        case .title(let refRange):
            let nsTitle = title as NSString
            guard NSMaxRange(refRange) <= nsTitle.length else { return }
            title = nsTitle.replacingCharacters(in: refRange, with: newReference)
            let newLen = (newReference as NSString).length
            activePillDock = ActiveScripturePillDockItem(
                reference: newReference,
                translation: current.translation,
                anchor: .title(refUTF16Range: NSRange(location: refRange.location, length: newLen))
            )
            ScriptureApplyFeedback.notifyScripturePillApplied()
            scheduleAutosave(note)
        case .body(let range):
            proxy.activeScripturePill = ActiveScripturePill(
                attachmentRange: range,
                reference: current.reference,
                translation: current.translation
            )
            proxy.replaceActiveScripturePill(reference: newReference, translation: current.translation, theme: scriptureTheme)
            proxy.activeScripturePill = nil
            let titleBefore = title
            replaceTitlePassagesMatchingReference(current.reference, with: newReference)
            activePillDock = ActiveScripturePillDockItem(
                reference: newReference,
                translation: current.translation,
                anchor: .body(range)
            )
            ScriptureApplyFeedback.notifyScripturePillApplied()
            requestScripturePillRedetect()
            if title != titleBefore {
                scheduleAutosave(note)
            }
        }
    }

    /// When Book/Chapter/Verse changes on a **body** pill, mirror the same passage edit into the title if it matched.
    private func replaceTitlePassagesMatchingReference(_ oldReference: String, with newReference: String) {
        guard oldReference != newReference else { return }
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmedTitle.caseInsensitiveCompare(oldReference) == .orderedSame {
            title = newReference
            return
        }
        guard let oldParsed = ScriptureReferenceParser.parse(oldReference) else { return }
        var working = title
        while true {
            let matches = ScriptureDetector.detect(in: working)
            guard let m = matches.first(where: {
                guard let p = ScriptureReferenceParser.parse($0.displayText) else { return false }
                return p == oldParsed
            }) else { break }
            let ns = working as NSString
            working = ns.replacingCharacters(in: m.range, with: newReference)
        }
        title = working
    }

    /// Nudge `HarvousEditor` to re-insert pills so accent/translation changes repaint.
    /// SwiftUI diffing on `documentBody` already triggers `detectAndInsertPills` when body content
    /// changes; for accent-only changes we bump via a lightweight body-identity refresh.
    private func requestScripturePillRedetect() {
        NotificationCenter.default.post(name: .harvousForceScripturePillRedetect, object: note?.id)
    }

    private func openNoteInPlace(id: UUID) {
        guard let target = ThreadStore.fetchNote(id: id, modelContext: context) else { return }
        note = target
    }

    // MARK: - Autosave

    private func scheduleAutosave(_ note: Note) {
        guard !isNoteTransition else { return }
        let nextTitle = title
        let nextBody = editorState.plainText
        let allowPrimaryUpdate = shouldAllowPrimaryFolderUpdate(
            previousTitle: note.title,
            nextTitle: nextTitle,
            previousBody: note.body,
            nextBody: nextBody
        )
        let mergedRefs = ScriptureDetector.mergedDetectedRefs(title: nextTitle, bodyRefs: editorState.detectedRefs)
        autosave.updateSnapshot(title: nextTitle, body: nextBody, refs: mergedRefs)
        withAnimation(.easeOut(duration: 0.18)) {
            isFolderContextUpdating = shouldAnimateFolderContextFeedback && allowPrimaryUpdate
        }
        // Prevent a cancelled previous autosave task from clearing the fresh "updating" state
        // before we register the new token for this cycle.
        latestAutosaveToken = .max
        let token = autosave.schedule(
            note: note,
            context: context,
            allowPrimaryFolderUpdate: allowPrimaryUpdate,
            existingFolders: existingFolderNames(excluding: note)
        ) { settledToken in
            guard settledToken == latestAutosaveToken else { return }
            withAnimation(.easeOut(duration: 0.18)) {
                isFolderContextUpdating = false
            }
        }
        latestAutosaveToken = token
    }

    /// Writes the in-memory title/editor fields into a note row and commits the store.
    private func persistEditorIntoNote(_ n: Note) {
        let body = editorState.plainText
        let refs = ScriptureDetector.mergedDetectedRefs(title: title, bodyRefs: editorState.detectedRefs)
        guard n.title != title || n.body != body || n.detectedRefs != refs else {
            autosave.updateSnapshot(title: title, body: body, refs: refs)
            withAnimation(.easeOut(duration: 0.18)) {
                isFolderContextUpdating = false
            }
            return
        }
        let previousTitle = n.title
        let previousBody = n.body
        n.title = title
        n.body = body
        n.detectedRefs = refs
        n.markDirty()
        BibleStudyTagSuggester.applyToNote(
            n,
            allowPrimaryUpdate: shouldAllowPrimaryFolderUpdate(
                previousTitle: previousTitle,
                nextTitle: title,
                previousBody: previousBody,
                nextBody: body
            ),
            existingFolders: existingFolderNames(excluding: n)
        )
        try? context.saveWithLogging()
        HarvousNoteSpotlightIndexer.reindex(note: n)
        HarvousVaultExporter.scheduleWrite(note: n, modelContext: context)
        autosave.updateSnapshot(title: title, body: body, refs: refs)
        withAnimation(.easeOut(duration: 0.18)) {
            isFolderContextUpdating = false
        }
    }

    /// When the selected note changes (or clears), persist UI state to the *previous* note so
    /// a pending debounced save is not lost when work is cancelled.
    private func flushPendingEdits(forNoteId id: UUID, title: String, body: String, refs: [String]) {
        let targetId = id
        let descriptor = FetchDescriptor<Note>(predicate: #Predicate { $0.id == targetId })
        guard let previous = try? context.fetch(descriptor).first else { return }
        guard previous.title != title || previous.body != body || previous.detectedRefs != refs else {
            autosave.updateSnapshot(title: title, body: body, refs: refs)
            withAnimation(.easeOut(duration: 0.18)) {
                isFolderContextUpdating = false
            }
            return
        }
        let previousTitle = previous.title
        let previousBody = previous.body
        previous.title = title
        previous.body = body
        previous.detectedRefs = refs
        previous.markDirty()
        BibleStudyTagSuggester.applyToNote(
            previous,
            allowPrimaryUpdate: shouldAllowPrimaryFolderUpdate(
                previousTitle: previousTitle,
                nextTitle: title,
                previousBody: previousBody,
                nextBody: body
            ),
            existingFolders: existingFolderNames(excluding: previous)
        )
        try? context.saveWithLogging()
        HarvousNoteSpotlightIndexer.reindex(note: previous)
        HarvousVaultExporter.scheduleWrite(note: previous, modelContext: context)
        autosave.updateSnapshot(title: title, body: body, refs: refs)
        withAnimation(.easeOut(duration: 0.18)) {
            isFolderContextUpdating = false
        }
    }

    private var chipPrimaryLabel: String? {
        note?.folderChipPrimaryLabelText()
    }

    private func animateFolderTextReveal(for value: String?) {
        guard value != nil else {
            DispatchQueue.main.async {
                showFolderToolbarText = true
            }
            return
        }
        DispatchQueue.main.async {
            showFolderToolbarText = false
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
                withAnimation(.easeOut(duration: 0.18)) {
                    showFolderToolbarText = true
                }
            }
        }
    }

    private func existingFolderNames(excluding note: Note) -> [String] {
        let descriptor = FetchDescriptor<Note>()
        guard let notes = try? context.fetch(descriptor) else { return [] }
        let ownLower = Set(note.allFolderMembershipLabels().map { $0.lowercased() })
        var labels = Set<String>()
        for n in notes where n.id != note.id {
            for label in n.allFolderMembershipLabels() {
                let low = label.lowercased()
                if ownLower.contains(low) { continue }
                labels.insert(label)
            }
        }
        return Array(labels)
    }

    // MARK: - Sync

    private func syncFromNote() {
        if let note {
            title = note.title
            let bodyRefs = ScriptureDetector.uniqueDisplayRefs(in: note.body)
            editorState = EditorState(plainText: note.body, detectedRefs: bodyRefs)
            // Tag refresh moved to `refreshThreads` (deferred 50 ms via `scheduleRefreshThreads`) — see note there.
            autosave.updateSnapshot(
                title: title,
                body: editorState.plainText,
                refs: ScriptureDetector.mergedDetectedRefs(title: title, bodyRefs: bodyRefs)
            )
            isFolderContextUpdating = false
            showFolderToolbarText = chipPrimaryLabel != nil
        } else {
            title = ""
            editorState = EditorState()
            autosave.updateSnapshot(title: "", body: "", refs: [])
            isFolderContextUpdating = false
            showFolderToolbarText = true
        }
    }

    private var shouldAnimateFolderContextFeedback: Bool {
        // macOS: folder chip lives only in the window toolbar (`ContentView`); the in-note bar is format-only,
        // so suppressing feedback while `shouldShowNoteToolbar` hid the bounce entirely.
        true
    }

    private func shouldAllowPrimaryFolderUpdate(
        previousTitle: String,
        nextTitle: String,
        previousBody: String,
        nextBody: String
    ) -> Bool {
        if previousTitle != nextTitle { return true }
        if previousBody.isEmpty { return true }
        let previousNewlines = previousBody.filter { $0 == "\n" }.count
        let nextNewlines = nextBody.filter { $0 == "\n" }.count
        if nextNewlines > previousNewlines { return true }

        let sentencePunctuation: Set<Character> = [".", "!", "?", ";"]
        let previousSentenceMarkers = previousBody.filter { sentencePunctuation.contains($0) }.count
        let nextSentenceMarkers = nextBody.filter { sentencePunctuation.contains($0) }.count
        if nextSentenceMarkers > previousSentenceMarkers { return true }

        let growth = max(0, nextBody.count - previousBody.count)
        return growth >= 120
    }
}

/// Identifiable wrapper so `.sheet(item:)` can re-present the highlight sheet for a different thread.
struct HighlightDetailSheetItem: Identifiable, Hashable {
    let threadId: UUID
    var id: UUID { threadId }
}

/// Host for the highlight detail sheet so `navigationTitle` tracks `thread.focusTitle` edits via `@Bindable`.
private struct HighlightDetailSheetContainer: View {
    @Bindable var thread: StudyThread
    let highlightOrdinal: Int?
    let scriptureTheme: HarvousColors.ThemeVariant
    let onDone: () -> Void
    let onAccentPersisted: () -> Void
    let onJumpToLinkedNote: (UUID) -> Void
    let onReadPassage: (String, String) -> Void
    let onRemoveHighlight: () -> Void

    private var navigationHighlightTitle: String {
        let custom = thread.focusTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        if !custom.isEmpty { return custom }
        if let n = highlightOrdinal, n >= 1 { return "Highlight \(n)" }
        return "Highlight"
    }

    var body: some View {
        NavigationStack {
            GeometryReader { sheetGeo in
                let sheetCap = HarvousDockExpandedContentLayout.expandedScrollMaxHeight(
                    viewportHeight: max(sheetGeo.size.height, 220)
                )
                ActiveHighlightDock(
                    thread: thread,
                    isExpanded: .constant(true),
                    scriptureTheme: scriptureTheme,
                    onDismiss: onDone,
                    onAccentPersisted: onAccentPersisted,
                    onJumpToLinkedNote: onJumpToLinkedNote,
                    onReadPassage: onReadPassage,
                    onRemoveHighlight: onRemoveHighlight,
                    highlightOrdinal: highlightOrdinal
                )
                .environment(\.harvousDockExpandedContentMaxHeight, sheetCap)
                .frame(maxWidth: .infinity, alignment: .top)
                .padding(.horizontal, 4)
                .padding(.vertical, 20)
            }
            .navigationTitle(navigationHighlightTitle)
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done", action: onDone)
                }
            }
        }
        #if os(iOS)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        #else
        .frame(minWidth: 420, minHeight: 280)
        #endif
    }
}

extension NoteEditorView {
    /// Bottom sheet shown when the user clicks/taps a painted highlight. Mirrors the scripture passage sheet
    /// shape (NavigationStack + Done button) and reuses `ActiveHighlightDock` for the accent-themed chrome.
    @ViewBuilder
    fileprivate func highlightDetailSheet(for threadId: UUID) -> some View {
        if let thread = ThreadStore.fetch(id: threadId, modelContext: context), let parent = note {
            HighlightDetailSheetContainer(
                thread: thread,
                highlightOrdinal: anchoredHighlightOrdinal(for: threadId),
                scriptureTheme: scriptureTheme,
                onDone: { highlightDetailThreadId = nil },
                onAccentPersisted: { reconcileStudyHighlightsPainting(for: parent) },
                onJumpToLinkedNote: { nid in
                    highlightDetailThreadId = nil
                    openNoteInPlace(id: nid)
                },
                onReadPassage: { ref, trans in
                    highlightDetailThreadId = nil
                    scripturePassageSheet = ScripturePassageSheetItem(reference: ref, translation: trans)
                },
                onRemoveHighlight: {
                    removeHighlightThread(thread, parent: parent)
                    highlightDetailThreadId = nil
                }
            )
        } else {
            Color.clear.onAppear { highlightDetailThreadId = nil }
        }
    }
}

private struct HighlightCaptureSession: Identifiable {
    let id = UUID()
    let parentNoteId: UUID
    let excerpt: String
    let expandedUTF16Location: Int
    let expandedUTF16Length: Int
    /// Viewport-relative rect hint for popover/analytics (same space as selectionViewportRect).
    let anchorRect: CGRect?
}

/// Inline scripture-pill dock context: identifies the tapped pill and the translation currently shown.
struct ActiveScripturePillDockItem: Identifiable, Equatable {
    enum Anchor: Equatable {
        case body(NSRange)
        case title(refUTF16Range: NSRange)
    }

    let reference: String
    var translation: String
    let anchor: Anchor

    var id: String {
        switch anchor {
        case .body(let r):
            return "b|\(reference)|\(r.location)|\(r.length)|\(translation)"
        case .title(let r):
            return "t|\(reference)|\(r.location)|\(r.length)|\(translation)"
        }
    }

    static func == (lhs: ActiveScripturePillDockItem, rhs: ActiveScripturePillDockItem) -> Bool {
        lhs.reference == rhs.reference && lhs.translation == rhs.translation && lhs.anchor == rhs.anchor
    }
}

/// Inline URL-pill dock context. Identifies the tapped pill so Open / Remove / Edit actions
/// know which attachment range to mutate. Title is the cached resolved title at tap time —
/// the dock view also observes the title-resolved notification (Slice 3) for late updates.
/// Label is the user-specified display text from the Add Link sheet (Slice 4); when present, it
/// sits between the page title and the host in the dock headline / subline.
struct ActiveURLPillDockItem: Identifiable, Equatable {
    let href: String
    let title: String?
    let label: String?
    let range: NSRange

    var id: String { "u|\(href)|\(range.location)|\(range.length)" }

    static func == (lhs: ActiveURLPillDockItem, rhs: ActiveURLPillDockItem) -> Bool {
        lhs.href == rhs.href && lhs.title == rhs.title && lhs.label == rhs.label && NSEqualRanges(lhs.range, rhs.range)
    }
}

extension Notification.Name {
    /// Prompts `HarvousEditor` to re-run scripture pill detection so accent changes repaint in place.
    static let harvousForceScripturePillRedetect = Notification.Name("harvousForceScripturePillRedetect")
    /// Posted after a global cleanup of orphan study threads (e.g. dangling linked-note markers).
    /// Mounted editors observe this to drop stale paint + trail state without waiting for a note switch.
    static let harvousStudyThreadsPurged = Notification.Name("harvousStudyThreadsPurged")
}

#Preview {
    NoteEditorView(note: .constant(nil))
        .modelContainer(for: [Note.self, StudyThread.self], inMemory: true)
        .environmentObject(HarvousAppRouter())
        .frame(minWidth: 600, minHeight: 500)
}

// MARK: - ActiveURLPillDock
//
// Lightweight URL-pill dock paired visually with `ActiveScripturePillDock` but without the
// translation pickers / passage view. Title resolves async (Slice 3); until then we render the
// display host as the headline. The host is always shown as the secondary line.

/// Inline URL-pill chrome. Mirrors the rounded-rect glass styling of `ActiveScripturePillDock`
/// so users see the same visual idiom for any pill tap. Title resolution happens off this view —
/// observe the title-resolved notification to update late.
struct ActiveURLPillDock: View {
    @Environment(\.colorScheme) private var dockColorScheme

    let href: String
    /// Best-known title at present time (may be `nil`). When `nil`, dock shows the display host.
    let initialTitle: String?
    /// User-specified visible label (Add Link sheet). When set, it takes precedence over the
    /// auto-resolved page title in the headline so the dock always echoes what the pill itself
    /// shows in the body — minimizes "wait, what's this link?" confusion.
    let userLabel: String?
    let onOpenInBrowser: () -> Void
    let onEdit: () -> Void
    let onRemove: () -> Void
    let onDismiss: () -> Void

    /// Live title state: seeded from `initialTitle` + cache, then updated on
    /// `harvousURLLinkTitleResolved` while the dock is open. Lets users see the resolved title
    /// without re-tapping the pill.
    @State private var liveTitle: String?

    /// Display label = scheme-stripped host. Computed once per `href`; matches the pill's own label.
    private var displayHost: String { urlLinkPillDisplayHost(href) }

    /// Headline priority:
    ///   1. User label (what the pill shows in-body)
    ///   2. Resolved page title
    ///   3. Display host
    private var headline: String {
        if let userLabel, !userLabel.isEmpty { return userLabel }
        if let liveTitle, !liveTitle.isEmpty { return liveTitle }
        return displayHost
    }
    /// Subline showcases whichever piece of context isn't already the headline. Suppressed when
    /// headline already equals host (nothing extra to say).
    private var subline: String? {
        // User-label headline: prefer page title as context, else host.
        if let userLabel, !userLabel.isEmpty {
            if let liveTitle, !liveTitle.isEmpty, liveTitle != userLabel { return liveTitle }
            return displayHost == userLabel ? nil : displayHost
        }
        // Title headline: show host (already filtered when title == host below).
        if let liveTitle, !liveTitle.isEmpty, liveTitle != displayHost { return displayHost }
        return nil
    }

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            HarvousFAGlyph(assetName: "Harvous.Link", edgePt: 14)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 1) {
                Text(headline)
                    .font(.system(size: 14, weight: .semibold))
                    .lineLimit(1)
                    .truncationMode(.tail)
                if let subline {
                    Text(subline)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Button(action: onOpenInBrowser) {
                HarvousFAGlyph(assetName: "Harvous.ArrowUpRight", edgePt: 13)
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            .help("Open in browser")
            .accessibilityLabel("Open link in browser")

            Button(action: onEdit) {
                HarvousFAGlyph(assetName: "Harvous.PenToSquare", edgePt: 13)
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            .help("Edit link")
            .accessibilityLabel("Edit link")

            Button(action: onRemove) {
                HarvousFAGlyph(assetName: "Harvous.Trash", edgePt: 13)
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            .help("Remove link (keep text)")
            .accessibilityLabel("Remove link")

            Button(action: onDismiss) {
                HarvousFAGlyph(assetName: "Harvous.Xmark", edgePt: 11)
                    .frame(width: 24, height: 24)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            .accessibilityLabel("Close link dock")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(urlDockChrome)
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.10), lineWidth: 1.0)
                .allowsHitTesting(false)
        )
        .shadow(color: .black.opacity(0.10), radius: 12, y: 4)
        .shadow(color: .black.opacity(0.06), radius: 3, y: 1)
        .padding(.horizontal, 20)
        .padding(.top, 6)
        .padding(.bottom, 10)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Link controls for \(headline)")
        .onAppear {
            // Prefer the cached title over the value captured at tap time — the cache may have
            // resolved between the tap and dock mount on a fast network.
            let cached = URLLinkTitleService.shared.cachedTitle(for: href)
            liveTitle = cached ?? initialTitle
            // Kick the fetcher in case the dock opened from a pill inserted before the post-detect
            // resolution pass had a chance to run for this href (e.g. very fast tap).
            URLLinkTitleService.shared.ensureResolved(for: href)
        }
        .onReceive(NotificationCenter.default.publisher(for: .harvousURLLinkTitleResolved)) { note in
            guard let resolvedHref = note.userInfo?["href"] as? String, resolvedHref == href,
                  let resolvedTitle = note.userInfo?["title"] as? String else { return }
            liveTitle = resolvedTitle
        }
    }

    private var urlDockChrome: some View {
        ZStack {
            let shape = RoundedRectangle(cornerRadius: 18, style: .continuous)
            shape.fill(.background)
            if #available(macOS 26.0, iOS 26.0, *) {
                shape
                    .fill(.clear)
                    .glassEffect(in: shape)
            } else {
                shape.fill(.ultraThinMaterial)
            }
        }
        .allowsHitTesting(false)
    }
}

// MARK: - EditURLLinkSheetView
//
// Focused single-field URL editor presented from `ActiveURLPillDock`'s Edit action. Kept separate
// from `AddLinkSheetView` because that sheet drives the internal note-link flow (title + display
// name + proxy session state) — URL pill editing only needs an href, and the proxy normalizes
// scheme on save (`replaceURLPill(in:newHref:)`).

struct EditURLLinkSheetView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var href: String
    @FocusState private var focused: Bool

    let onSave: (String) -> Void
    let onCancel: () -> Void

    init(initialHref: String, onSave: @escaping (String) -> Void, onCancel: @escaping () -> Void) {
        _href = State(initialValue: initialHref)
        self.onSave = onSave
        self.onCancel = onCancel
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Edit Link")
                .font(.system(size: 15, weight: .semibold))
                .frame(maxWidth: .infinity)
                .padding(.bottom, 10)

            Text("URL")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.secondary)
                .padding(.bottom, 3)

            TextField("https://…", text: $href)
                .textFieldStyle(.plain)
                .font(.system(size: 14))
                .autocorrectionDisabled()
                #if os(iOS)
                .textInputAutocapitalization(.never)
                .keyboardType(.URL)
                #endif
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .strokeBorder(focused ? Color.harvousAccent : Color.secondary.opacity(0.35),
                                      lineWidth: focused ? 2.5 : 1)
                )
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(editFieldFill)
                )
                .focused($focused)
                .submitLabel(.done)
                .onSubmit { commit() }
                .padding(.bottom, 14)

            HStack(spacing: 8) {
                Spacer(minLength: 0)
                Button("Cancel") { cancel() }
                    #if os(macOS)
                    .keyboardShortcut(.cancelAction)
                    #endif
                    .buttonStyle(EditLinkSheetButtonStyle(role: .cancel))
                Button("Save") { commit() }
                    #if os(macOS)
                    .keyboardShortcut(.defaultAction)
                    #endif
                    .buttonStyle(EditLinkSheetButtonStyle(role: .ok))
                    .disabled(href.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(16)
        #if os(macOS)
        .frame(width: 320)
        #endif
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(editCardBackground)
                #if os(macOS)
                .shadow(color: .black.opacity(0.12), radius: 20, y: 8)
                #endif
        )
        #if os(iOS)
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        #endif
        .onAppear { focused = true }
    }

    private func commit() {
        let trimmed = href.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        onSave(trimmed)
        dismiss()
    }

    private func cancel() {
        onCancel()
        dismiss()
    }

    private var editFieldFill: Color {
        #if os(macOS)
        Color(nsColor: .textBackgroundColor).opacity(0.55)
        #else
        Color(uiColor: .secondarySystemFill)
        #endif
    }

    private var editCardBackground: Color {
        #if os(macOS)
        Color(nsColor: .windowBackgroundColor).opacity(0.96)
        #else
        Color(uiColor: .secondarySystemGroupedBackground)
        #endif
    }
}

private struct EditLinkSheetButtonStyle: ButtonStyle {
    enum Role { case cancel, ok }
    var role: Role

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .semibold))
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .background(
                Group {
                    switch role {
                    case .cancel:
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Self.cancelBacking)
                    case .ok:
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Color.harvousAccent)
                    }
                }
            )
            .foregroundStyle(role == .ok ? Color.white : Color.primary)
            .opacity(configuration.isPressed ? 0.88 : 1)
    }

    private static var cancelBacking: Color {
        #if os(macOS)
        Color(nsColor: .quaternaryLabelColor).opacity(0.35)
        #else
        Color(uiColor: .quaternaryLabel).opacity(0.35)
        #endif
    }
}
