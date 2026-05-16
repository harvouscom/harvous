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
        task = Task { @MainActor in
            defer { onSettled(token) }
            let nanos = UInt64((delay * 1_000_000_000).rounded())
            try? await Task.sleep(nanoseconds: nanos)
            guard !Task.isCancelled else { return }
            let unchanged =
                note.title == self.latestTitle && note.body == self.latestBody && note.detectedRefs == self.latestRefs
            guard !unchanged else { return }
            note.title = self.latestTitle
            note.body = self.latestBody
            note.detectedRefs = self.latestRefs
            note.updatedAt = Date()
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

    /// When set, pushes `LinkedNotesView` for this linked-notes entry id (macOS split column + iOS nested stack).
    var onNavigateToLinkedNotes: ((UUID) -> Void)? = nil
    /// iOS stacked editor: pop after delete.
    var onRequestDismissEditor: (() -> Void)? = nil
    @State private var editorState = EditorState()
    @State private var title = ""
    /// Reference-type debounce — must not use `@State` timestamps keyed to each keypress (that remounts the editor).
    @State private var autosave = EditorAutosaveDebouncer()
    @State private var latestAutosaveToken: UInt64 = 0
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
    /// Observed to drive the action bar's Look up button visibility (the bar checks slug index
    /// existence inside `onLookup` closure conditional).
    @ObservedObject private var eastonsService = EastonsDictionaryService.shared
    /// Passage highlights for the active pill dock reference + translation (library-wide).
    @State private var scripturePassageHighlights: [StudyThread] = []
    /// Prefetch scripture HTML for pills in this note — cancelled when switching notes or on editor disappear.
    @State private var scripturePillPrefetchTask: Task<Void, Never>?
    /// Coalesces rapid back-to-back refreshThreads() calls (note switch, scene phase, highlight events)
    /// into a single execution within the same event turn.
    @State private var refreshThreadsTask: Task<Void, Never>?

    #if os(macOS)
    @StateObject private var proxy = EditorProxy()
    @EnvironmentObject private var appRouter: HarvousAppRouter
    var showInspector: Binding<Bool> = .constant(false)
    @AppStorage("harvous.macNoteFooterCollapsed") private var macNoteFooterCollapsed: Bool = false
    #else
    @EnvironmentObject private var appRouter: HarvousAppRouter
    @State private var showInspectorIOS = false
    @StateObject private var proxy = EditorProxy()

    /// Matches `syncIOSNoteFooterSupplement` suppress flag (pill dock, pinned highlight, highlight capture)—not router timing alone.
    private var iosStudyDockOverlayChromeSuppressed: Bool {
        activePillDock != nil || dockPinnedHighlightThreadId != nil || highlightCaptureSession != nil
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
        .onChange(of: note?.id) { oldId, newId in
            // Synchronous: `HarvousEditor` also resets async on `boundNoteID` change; without this, proxy
            // pill / format state can lag one turn and briefly pair stale UI with the new note.
            proxy.resetFormatBarStateForNewNote()
            scripturePillPrefetchTask?.cancel()
            scripturePillPrefetchTask = nil
            dockPinnedHighlightThreadId = nil
            activeHighlightDockExpanded = false
            activePillDock = nil
            activePillDockExpanded = false
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
                DispatchQueue.main.async {
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
                reconcileStudyHighlightsPainting(for: note)
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
                Task { @MainActor in consumeHighlightPrompt(payload) }
            }
            .onReceive(NotificationCenter.default.publisher(for: .harvousLookupWordRequested)) { payload in
                Task { @MainActor in consumeLookupWordRequested(payload) }
            }
            .onReceive(NotificationCenter.default.publisher(for: .harvousRequestInsertWikiLink)) { _ in
                guard note != nil else { return }
                #if os(iOS)
                guard appRouter.iosActiveNoteEditorChromeProxy === proxy else { return }
                #else
                proxy.refocusTextView()
                #endif
                showWikiLinkPicker = true
            }
            .onReceive(NotificationCenter.default.publisher(for: .harvousStudyThreadsPurged)) { _ in
                // A global purge happened — drop any pinned dock that may now reference a deleted
                // thread, then refresh so trail snapshot + paints reflect the cleaned DB.
                if let pinned = dockPinnedHighlightThreadId,
                   ThreadStore.fetch(id: pinned, modelContext: context) == nil {
                    dismissStudyHighlightDock()
                }
                if let n = note { refreshThreads(note: n) }
            }
            .onAppear {
                proxy.onScripturePillAttachmentRemoved = { ranges in
                    DispatchQueue.main.async {
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
        SelectionHighlightCreator.create(
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
            Text("Choose a note in the list to open it.")
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

    /// Hairline above bottom chrome (`NoteConnectionsBar` stack) — platform-appropriate system separator.
    @ViewBuilder
    private func editorBottomChromeSeparatorLine() -> some View {
        #if os(macOS)
        Color(nsColor: .separatorColor).frame(height: 0.5)
        #else
        Color(uiColor: .separator).frame(height: 0.5)
        #endif
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
                            dynamicTypeSize: dynamicTypeSize
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
                        }
                        .environment(\.harvousDockExpandedContentMaxHeight, dockExpandedContentMaxHeight)
                    }
#endif
                    .frame(maxWidth: Self.editorScrollSurfaceMaxWidthPoints, maxHeight: .infinity)
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                #if os(macOS)
                // Bottom bar: format toolbar or connections — scripture pickers/passage live only in the inline dock
                // after an explicit pill tap (not when the caret sits next to a pill). Collapse orb floats as an overlay
                // on the outer VStack so it stays anchored bottom-right whether the connections bar is shown or hidden.
                if proxy.shouldShowNoteToolbar {
                    NoteToolbar(proxy: proxy)
                        .id("noteToolbar")
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                } else if !macNoteFooterCollapsed {
                    VStack(spacing: 0) {
                        editorBottomChromeSeparatorLine()
                        NoteConnectionsBar(
                            note: note,
                            snapshot: trailSnapshot,
                            currentNoteTitle: title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Current note" : title,
                            onOpenLinkedNote: { id in openNoteInPlace(id: id) },
                            onConnectionsChanged: { scheduleRefreshThreads(note: note) }
                        )
                    }
                    .id("connectionsBar")
                    .background(.thinMaterial)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
                #endif
            }
            #if os(macOS)
            .overlay(alignment: .bottomTrailing) {
                if !proxy.shouldShowNoteToolbar {
                    Button {
                        macNoteFooterCollapsed.toggle()
                    } label: {
                        HarvousFAGlyph(
                            assetName: macNoteFooterCollapsed ? "Harvous.ChevronUp" : "Harvous.ChevronDown",
                            edgePt: 11
                        )
                        .foregroundStyle(.primary)
                        .frame(width: 28, height: 28)
                        .background(.regularMaterial, in: Circle())
                        .overlay(Circle().strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.5))
                        .shadow(color: .black.opacity(0.18), radius: 4, x: 0, y: 2)
                    }
                    .buttonStyle(.plain)
                    .padding(.trailing, 12)
                    .padding(.bottom, 12)
                    .accessibilityLabel(macNoteFooterCollapsed ? "Show note connections" : "Hide note connections")
                    .transition(.opacity)
                }
            }
            #endif
            #if os(iOS)
            .safeAreaInset(edge: .bottom, spacing: HarvousIOSMorphingChromeLayout.interChromeSpacing) {
                if iosStudyDockOverlayChromeSuppressed {
                    VStack(alignment: .leading, spacing: studyDockStackSpacing) {
                        activeStudyHighlightDock(note: note)
                        activeScripturePillDock(note: note)
                    }
                    .environment(\.harvousDockExpandedContentMaxHeight, dockExpandedContentMaxHeight)
                    .animation(HarvousAnimation.spring, value: activePillDock != nil)
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
        .animation(HarvousAnimation.spring, value: dockPinnedHighlightThreadId != nil)
        // Asymmetric animation for the connections-bar collapse: expanding snaps in fast, collapsing settles slower.
        // `macNoteFooterCollapsed` here is the value AFTER the toggle, so `true` means we just collapsed.
        .animation(
            macNoteFooterCollapsed
                ? .spring(response: 0.46, dampingFraction: 0.88)
                : .spring(response: 0.28, dampingFraction: 0.82),
            value: macNoteFooterCollapsed
        )
        .inspector(isPresented: showInspector) {
            inspectorContent(note: note)
        }
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
        .animation(HarvousAnimation.spring, value: proxy.activeScripturePill != nil)
        .animation(HarvousAnimation.spring, value: activePillDock != nil)
        .animation(HarvousAnimation.spring, value: dockPinnedHighlightThreadId != nil)
        .animation(HarvousAnimation.spring, value: highlightCaptureSession != nil)
        .toolbar {
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
                    scriptureTheme: scriptureTheme,
                    onDeleteConfirmed: { deleteCurrentNoteIfPossible() },
                    onOpenNoteDetails: {
                        withAnimation(HarvousAnimation.spring) { showInspectorIOS = true }
                    }
                )
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
        .sheet(item: $highlightDetailThreadId) { item in
            highlightDetailSheet(for: item.threadId)
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
        context.delete(n)
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
            activePillDock != nil || dockPinnedHighlightThreadId != nil || highlightCaptureSession != nil
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
        trailSnapshot = ThreadStore.trailSnapshot(for: note, modelContext: context)
        reconcileStudyHighlightsPainting(for: note)
        // Tag refresh used to run synchronously inside `syncFromNote` on every note switch — that meant
        // ~300 regex matches against the full body (200 keyword rows + 66 book names) blocking the main
        // thread on each click. Moved here so it runs in the deferred 50ms slot via `scheduleRefreshThreads`,
        // off the critical note-switch path. `allowPrimaryUpdate: false` matches the prior behavior.
        BibleStudyTagSuggester.applyToNote(note, allowPrimaryUpdate: false)
        #if os(iOS)
        syncIOSNoteFooterSupplement()
        #endif
    }

    /// Coalesces multiple rapid calls (note switch, scene-phase transition, highlight events firing together)
    /// into a single refreshThreads execution 50 ms later.
    private func scheduleRefreshThreads(note: Note) {
        refreshThreadsTask?.cancel()
        refreshThreadsTask = Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(50))
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
            guard activePillDock == nil else { return nil }
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
        context.delete(thread)
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
        #if os(macOS)
        NoteInspectorView(note: note)
        .inspectorColumnWidth(min: 240, ideal: 280, max: 320)
        #else
        // Drag indicator + swipe-down handles dismissal (matches `FolderChipPopover` sheet) —
        // omitting the redundant blue Done button keeps the chrome quieter and consistent.
        NavigationStack {
            NoteInspectorView(note: note)
                .navigationTitle("Note Details")
                .navigationBarTitleDisplayMode(.inline)
        }
        #endif
    }

    private func scripturePillTapped(reference: String, translation: String, range: NSRange) {
        dockPinnedHighlightThreadId = nil
        activeHighlightDockExpanded = false
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
        n.updatedAt = Date()
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
        previous.updatedAt = Date()
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
