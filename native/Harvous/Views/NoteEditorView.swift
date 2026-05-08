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
        allowPrimaryCollectionUpdate: Bool = true,
        existingCollections: [String] = [],
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
            BibleStudyTagSuggester.applyToNote(note, allowPrimaryUpdate: allowPrimaryCollectionUpdate, existingCollections: existingCollections)
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

    /// When set, pushes `LinkedNotesView` for this linked-notes entry id (macOS split column + iOS nested stack).
    var onNavigateToLinkedNotes: ((UUID) -> Void)? = nil
    /// iOS stacked editor: pop after delete.
    var onRequestDismissEditor: (() -> Void)? = nil
    @State private var editorState = EditorState()
    @State private var title = ""
    /// Reference-type debounce — must not use `@State` timestamps keyed to each keypress (that remounts the editor).
    @State private var autosave = EditorAutosaveDebouncer()
    @State private var latestAutosaveToken: UInt64 = 0
    @State private var isCollectionContextUpdating = false
    @State private var newNoteTiltTrigger = false
    @State private var showCollectionToolbarText = true
    @FocusState private var titleFocused: Bool

    /// Study threads anchored to this note (refreshed on appear / note change / returning active).
    @State private var threadsForNote: [StudyThread] = []
    /// Conditional trail snapshot (incoming + outgoing linked-note markers).
    @State private var trailSnapshot = ThreadStore.TrailSnapshot(incoming: [], outgoing: [])
    /// Transient notice for inspector jump / tooling.
    @State private var studyHighlightPaints: [StudyHighlightPaint] = []
    /// Hover-only highlight preview for the bottom dock (when nothing is pinned).
    @State private var previewHighlightThreadId: UUID?
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
    /// Passage highlights for the active pill dock reference + translation (library-wide).
    @State private var scripturePassageHighlights: [StudyThread] = []
    /// Prefetch scripture HTML for pills in this note — cancelled when switching notes or on editor disappear.
    @State private var scripturePillPrefetchTask: Task<Void, Never>?
    /// Coalesces rapid back-to-back refreshThreads() calls (note switch, scene phase, highlight events)
    /// into a single execution within the same event turn.
    @State private var refreshThreadsTask: Task<Void, Never>?

    #if os(macOS)
    @StateObject private var proxy = EditorProxy()
    var showInspector: Binding<Bool> = .constant(false)
    #else
    @EnvironmentObject private var appRouter: HarvousAppRouter
    @State private var showInspectorIOS = false
    @StateObject private var proxy = EditorProxy()
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
        .focusedSceneValue(\.collectionContextUpdating, isCollectionContextUpdating)
        .focusedSceneValue(\.showCollectionToolbarText, showCollectionToolbarText)
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
            // pill / format state can lag one turn and `syncInlineScriptureDockFromProxyPill` may briefly
            // pair a stale pill attachment with the new note (`refreshScripturePassageHighlights` + SwiftData).
            proxy.resetFormatBarStateForNewNote()
            scripturePillPrefetchTask?.cancel()
            scripturePillPrefetchTask = nil
            previewHighlightThreadId = nil
            dockPinnedHighlightThreadId = nil
            activeHighlightDockExpanded = false
            activePillDock = nil
            activePillDockExpanded = false
            studyHighlightPaints = []
#if os(macOS)
            proxy.hoveredStudyHighlightUUID = nil
#endif
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
            syncIOSNoteFooterSupplement()
            #endif
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
        }
        // Auto-focus title when a brand-new empty note is opened (Apple Notes UX)
        .task(id: note?.id) {
            guard let n = note, n.title.isEmpty, n.body.isEmpty else { return }
            try? await Task.sleep(for: .milliseconds(80))
            titleFocused = true
            newNoteTiltTrigger.toggle()
        }
        .onChange(of: currentCollectionLabel) { _, newValue in
            animateCollectionTextReveal(for: newValue)
        }
        .onChange(of: isCollectionContextUpdating) { _, updating in
            guard updating else { return }
            animateCollectionTextReveal(for: currentCollectionLabel)
        }
    }

    private var noteEditorLifecycleStack: some View {
        noteEditorStateObservers
#if os(macOS)
            .onChange(of: bodySelectionChangeToken) { _, _ in onBodySelectionHostChanged() }
            .onChange(of: proxy.hoveredStudyHighlightUUID) { _, hovered in macUpdatePreviewForHoveredHighlight(hovered) }
#else
            .onChange(of: bodySelectionChangeToken) { _, _ in onBodySelectionHostChanged() }
            .onChange(of: title) { _, _ in syncIOSNoteFooterSupplement() }
#endif
            .onChange(of: proxy.activeScripturePill) { _, new in
                #if os(iOS)
                guard appRouter.iosActiveNoteEditorChromeProxy === proxy else { return }
                #endif
                syncInlineScriptureDockFromProxyPill(new)
            }
            .onChange(of: activePillDock) { _, new in
                refreshScripturePassageHighlights(item: new)
                #if os(iOS)
                syncIOSNoteFooterSupplement()
                #endif
            }
            .onChange(of: editorState.plainText) { _, _ in
                guard let note else { return }
                reconcileStudyHighlightsPainting(for: note)
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
            .onReceive(NotificationCenter.default.publisher(for: .harvousRequestInsertWikiLink)) { _ in
                guard note != nil else { return }
                #if os(iOS)
                guard appRouter.iosActiveNoteEditorChromeProxy === proxy else { return }
                #else
                proxy.refocusTextView()
                #endif
                showWikiLinkPicker = true
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

    private func saveHighlightFromPanel(for note: Note) {
        guard let session = highlightCaptureSession, session.parentNoteId == note.id else { return }
        let trimmed = highlightAnnotationDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
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

    /// Shared morph id — the bar and popover share their capsule chrome for a seamless grow animation.
    private static let selectionAccessoryCapsuleMorphID = "harvous-selection-accessory-capsule"

    @ViewBuilder
    private func selectionAccessoryLayer(note: Note, horizontalClampWidth: CGFloat) -> some View {
        let anchorRect = proxy.selectionViewportRect
        ZStack(alignment: .topLeading) {
            #if os(macOS)
            // iOS: highlight + new note live in UITextView’s system edit menu (`HarvousBodyTextView.editMenu`).
            if highlightCaptureSession == nil, proxy.hasSelection, let rect = anchorRect {
                let width: CGFloat = 92
                let x = selectionAccessoryX(rect: rect, containerWidth: horizontalClampWidth, width: width)
                let y = selectionAccessoryY(rect: rect)
                SelectionActionBar(
                    morphNamespace: selectionAccessoryNamespace,
                    morphID: Self.selectionAccessoryCapsuleMorphID,
                    onHighlight: {
                        withAnimation(.spring(response: 0.36, dampingFraction: 0.82)) {
                            proxy.triggerHighlightCapturePrompt?()
                        }
                    },
                    onNewStandaloneNote: { proxy.triggerStandaloneNoteFromSelection?() }
                )
                .offset(x: x, y: y)
                .transition(.asymmetric(
                    insertion: .opacity.combined(with: .scale(scale: 0.9, anchor: .top)),
                    removal: .opacity
                ))
            }
            #endif
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
        }
        .animation(.spring(response: 0.36, dampingFraction: 0.82), value: highlightCaptureSession != nil)
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
        ContentUnavailableView {
            Label("No Note Selected", systemImage: "note.text")
        } description: {
            Text("Select a note from the list, or press ⌘N to compose a new one.")
        }
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
            let dockViewportBudget = viewportCol - HarvousIOSMorphingChromeLayout.studyDockOverlayBottomInset
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
                            .font(HarvousTypography.composeTitleField)
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
                            font: HarvousFonts.system(size: 16, weight: 400, design: .default),
                            scriptureTheme: scriptureTheme,
                            studyHighlightPaints: studyHighlightPaints,
                            studyHighlightFocusedThreadId: dockPinnedHighlightThreadId ?? previewHighlightThreadId,
                            studyHighlightsAssumeDarkAppearance: colorScheme == .dark,
                            onScripturePillTap: { scripturePillTapped(reference: $0, translation: $1, range: $2) },
                            onResolvedScripturePillPairs: { scheduleScripturePassagePrefetch(pairs: $0) },
                            pillAccentResolver: { [note] reference in
                                guard let raw = note.scripturePillAccentRaw(forReference: reference) else { return nil }
                                guard let token = StudyHighlightAccentToken(rawValue: raw), token != .auto else { return nil }
                                return token
                            },
                            onStudyHighlightClick: { userActivatedStudyHighlight(threadId: $0) }
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
                            studyHighlightFocusedThreadId: dockPinnedHighlightThreadId ?? previewHighlightThreadId,
                            studyHighlightsAssumeDarkAppearance: colorScheme == .dark,
                            pillAccentResolver: { [note] reference in
                                guard let raw = note.scripturePillAccentRaw(forReference: reference) else { return nil }
                                guard let token = StudyHighlightAccentToken(rawValue: raw), token != .auto else { return nil }
                                return token
                            }
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
                    #endif
                }
                #if os(iOS)
                .scrollDismissesKeyboard(.interactively)
                #endif
            }
            .overlay(alignment: .bottom) {
                VStack(alignment: .leading, spacing: studyDockStackSpacing) {
                    activeStudyHighlightDock(note: note)
                    activeScripturePillDock(note: note)
                }
                .environment(\.harvousDockExpandedContentMaxHeight, dockExpandedContentMaxHeight)
                #if os(iOS)
                .padding(.bottom, HarvousIOSMorphingChromeLayout.studyDockOverlayBottomInset)
                #endif
            }
            .frame(maxWidth: Self.editorScrollSurfaceMaxWidthPoints, maxHeight: .infinity)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            #if os(macOS)
            // Bottom bar: format toolbar, scripture pill editor, or connections — iPhone uses root `safeAreaInset` instead.
            if proxy.shouldShowNoteToolbar {
                NoteToolbar(proxy: proxy)
                    .id("noteToolbar")
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            } else if proxy.activeScripturePill != nil && activePillDock == nil {
                ScripturePillActionBar(proxy: proxy)
                    .id("scripturePillBar")
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            } else {
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
        .animation(HarvousAnimation.spring, value: previewHighlightThreadId != nil)
        .inspector(isPresented: showInspector) {
            inspectorContent(note: note)
        }
        .toolbar {}
        #else
        // Sheet (not `.inspector`) so `NavigationStack` shows title + Cancel like `ComposeView`.
        .sheet(isPresented: $showInspectorIOS) {
            inspectorContent(note: note)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .onAppear {
            appRouter.iosRegisterNoteEditorChrome(proxy: proxy)
            syncIOSNoteFooterSupplement()
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
        .animation(HarvousAnimation.spring, value: previewHighlightThreadId != nil)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                NoteTopBar(
                    note: note,
                    isCollectionContextUpdating: isCollectionContextUpdating,
                    showCollectionToolbarText: showCollectionToolbarText,
                    scriptureTheme: scriptureTheme
                )
            }
            ToolbarItemGroup(placement: .topBarTrailing) {
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
        appRouter.iosNoteFooterSupplement = HarvousIOSNoteFooterSupplement(
            note: n,
            trailSnapshot: trailSnapshot,
            connectionsTitleLine: titleLine,
            suppressScripturePillActionBar: activePillDock != nil,
            onRefreshConnections: { iosFooterRefreshConnectionsFromSupplement() },
            onOpenLinkedNote: { iosFooterOpenLinkedNoteFromSupplement($0) }
        )
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
        let dockThreadId = dockPinnedHighlightThreadId ?? previewHighlightThreadId
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
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    private func dismissStudyHighlightDock() {
        dockPinnedHighlightThreadId = nil
        activeHighlightDockExpanded = false
        previewHighlightThreadId = nil
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
        // Pin the inline `ActiveHighlightDock` — this is the same view the hover-preview path uses
        // successfully, so it sidesteps all of SwiftUI's sheet-presentation timing issues and is
        // guaranteed to appear right below the editor regardless of UITextView first-responder state.
        dismissActiveScripturePillDock()
        dockPinnedHighlightThreadId = threadId
        activeHighlightDockExpanded = true
        previewHighlightThreadId = nil
        highlightDetailThreadId = nil
        #if DEBUG
        print("[Harvous.highlight.activate] OK — pinned dock for threadId=\(threadId)")
        #endif
        #if os(iOS)
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
            previewHighlightThreadId = nil
        }
        reconcilePinnedHighlightDockWithBodySelection()
    }

    /// Clears the pinned highlight dock when the body selection / caret moves outside that highlight’s storage spans.
    private func reconcilePinnedHighlightDockWithBodySelection() {
        guard let pinned = dockPinnedHighlightThreadId else { return }
        guard let paint = studyHighlightPaints.first(where: { $0.threadId == pinned }) else {
            dockPinnedHighlightThreadId = nil
            activeHighlightDockExpanded = false
            return
        }
        if !proxy.bodySelectionIsContainedInStudyHighlightStorageSpans(expandedPlainHighlightRange: paint.expandedUTF16Range) {
            dockPinnedHighlightThreadId = nil
            activeHighlightDockExpanded = false
        }
    }

#if os(macOS)

    private func macUpdatePreviewForHoveredHighlight(_ hoveredId: UUID?) {
        guard dockPinnedHighlightThreadId == nil else {
            if hoveredId == nil {
                previewHighlightThreadId = nil
            }
            return
        }
        previewHighlightThreadId = hoveredId
    }

#endif

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
        let currentId = dockPinnedHighlightThreadId ?? previewHighlightThreadId
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
        let currentId = dockPinnedHighlightThreadId ?? previewHighlightThreadId
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
        guard dockPinnedHighlightThreadId != nil || previewHighlightThreadId != nil else { return }
        activeHighlightDockExpanded.toggle()
    }

    private func removeActiveHighlightFromKeyboard() {
        guard let tid = dockPinnedHighlightThreadId,
              let n = note,
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
        NavigationStack {
            NoteInspectorView(note: note)
            .navigationTitle("Note Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        showInspectorIOS = false
                    }
                }
            }
        }
        #endif
    }

    private func scripturePillTapped(reference: String, translation: String, range: NSRange) {
        // Sync: selection already applies `activeScripturePill` via a deferred `Task`; deferring here too
        // lets that task run first with `activePillDock == nil`, flashing the legacy action bar.
        dockPinnedHighlightThreadId = nil
        activeHighlightDockExpanded = false
        previewHighlightThreadId = nil

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
        previewHighlightThreadId = nil
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

    /// When the editor reports a focused pill (e.g. right after detection replaces plain text with an attachment),
    /// open or retarget the inline dock — otherwise `activeScripturePill != nil` with a stale/missing dock shows the legacy bottom bar.
    private func syncInlineScriptureDockFromProxyPill(_ pill: ActiveScripturePill?) {
        guard let pill else { return }
        if let dock = activePillDock {
            if case .title = dock.anchor { return }
        }
        guard let (_, storage) = proxy.textViewPair() else { return }
        guard pill.attachmentRange.location != NSNotFound,
              NSMaxRange(pill.attachmentRange) <= storage.length
        else { return }
        if let dock = activePillDock,
           case .body(let bodyRange) = dock.anchor,
           bodyRange == pill.attachmentRange,
           dock.reference == pill.reference,
           dock.translation == pill.translation {
            return
        }
        dockPinnedHighlightThreadId = nil
        activeHighlightDockExpanded = false
        previewHighlightThreadId = nil
        activePillDock = ActiveScripturePillDockItem(
            reference: pill.reference,
            translation: pill.translation,
            anchor: .body(pill.attachmentRange)
        )
        activePillDockExpanded = true
        refreshScripturePassageHighlights(item: activePillDock)
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
        previewHighlightThreadId = nil
        return thread
    }

    private func scripturePillAccentToken(forReference reference: String, note: Note) -> StudyHighlightAccentToken {
        guard let raw = note.scripturePillAccentRaw(forReference: reference),
              let token = StudyHighlightAccentToken(rawValue: raw), token != .auto else { return .neutral }
        return token
    }

    private func openPassageHighlightFromDock(_ thread: StudyThread) {
        if thread.parentNoteId != note?.id {
            openNoteInPlace(id: thread.parentNoteId)
        }
        dismissActiveScripturePillDock()
        dockPinnedHighlightThreadId = thread.id
        activeHighlightDockExpanded = true
        previewHighlightThreadId = nil
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
        let allowPrimaryUpdate = shouldAllowPrimaryCollectionUpdate(
            previousTitle: note.title,
            nextTitle: nextTitle,
            previousBody: note.body,
            nextBody: nextBody
        )
        let mergedRefs = ScriptureDetector.mergedDetectedRefs(title: nextTitle, bodyRefs: editorState.detectedRefs)
        autosave.updateSnapshot(title: nextTitle, body: nextBody, refs: mergedRefs)
        withAnimation(.easeOut(duration: 0.18)) {
            isCollectionContextUpdating = shouldAnimateCollectionContextFeedback && allowPrimaryUpdate
        }
        // Prevent a cancelled previous autosave task from clearing the fresh "updating" state
        // before we register the new token for this cycle.
        latestAutosaveToken = .max
        let token = autosave.schedule(
            note: note,
            context: context,
            allowPrimaryCollectionUpdate: allowPrimaryUpdate,
            existingCollections: existingCollectionNames(excluding: note)
        ) { settledToken in
            guard settledToken == latestAutosaveToken else { return }
            withAnimation(.easeOut(duration: 0.18)) {
                isCollectionContextUpdating = false
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
                isCollectionContextUpdating = false
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
            allowPrimaryUpdate: shouldAllowPrimaryCollectionUpdate(
                previousTitle: previousTitle,
                nextTitle: title,
                previousBody: previousBody,
                nextBody: body
            ),
            existingCollections: existingCollectionNames(excluding: n)
        )
        try? context.saveWithLogging()
        HarvousNoteSpotlightIndexer.reindex(note: n)
        HarvousVaultExporter.scheduleWrite(note: n, modelContext: context)
        autosave.updateSnapshot(title: title, body: body, refs: refs)
        withAnimation(.easeOut(duration: 0.18)) {
            isCollectionContextUpdating = false
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
                isCollectionContextUpdating = false
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
            allowPrimaryUpdate: shouldAllowPrimaryCollectionUpdate(
                previousTitle: previousTitle,
                nextTitle: title,
                previousBody: previousBody,
                nextBody: body
            ),
            existingCollections: existingCollectionNames(excluding: previous)
        )
        try? context.saveWithLogging()
        HarvousNoteSpotlightIndexer.reindex(note: previous)
        HarvousVaultExporter.scheduleWrite(note: previous, modelContext: context)
        autosave.updateSnapshot(title: title, body: body, refs: refs)
        withAnimation(.easeOut(duration: 0.18)) {
            isCollectionContextUpdating = false
        }
    }

    /// Returns all distinct primaryCollection values in the current model context, excluding the given note's
    /// own collection. Used to ground auto-collection suggestions in collections the user has already established.
    private func existingCollectionNames(excluding note: Note) -> [String] {
        let descriptor = FetchDescriptor<Note>(predicate: #Predicate { $0.primaryCollection != nil })
        guard let notes = try? context.fetch(descriptor) else { return [] }
        let ownCollection = note.primaryCollection?.trimmingCharacters(in: .whitespacesAndNewlines)
        var seen = Set<String>()
        for n in notes {
            guard let col = n.primaryCollection?.trimmingCharacters(in: .whitespacesAndNewlines), !col.isEmpty else { continue }
            if col == ownCollection { continue }
            seen.insert(col)
        }
        return Array(seen)
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
            isCollectionContextUpdating = false
            showCollectionToolbarText = currentCollectionLabel != nil
        } else {
            title = ""
            editorState = EditorState()
            autosave.updateSnapshot(title: "", body: "", refs: [])
            isCollectionContextUpdating = false
            showCollectionToolbarText = true
        }
    }

    private var currentCollectionLabel: String? {
        let trimmed = note?.primaryCollection?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    private func animateCollectionTextReveal(for value: String?) {
        guard value != nil else {
            showCollectionToolbarText = true
            return
        }
        showCollectionToolbarText = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
            withAnimation(.easeOut(duration: 0.18)) {
                showCollectionToolbarText = true
            }
        }
    }

    private var shouldAnimateCollectionContextFeedback: Bool {
        // macOS: collection lives only in the window toolbar (`ContentView`); the in-note bar is format-only,
        // so suppressing feedback while `shouldShowNoteToolbar` hid the bounce entirely.
        true
    }

    private func shouldAllowPrimaryCollectionUpdate(
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
}

#Preview {
    NoteEditorView(note: .constant(nil))
        .modelContainer(for: [Note.self, StudyThread.self], inMemory: true)
        .frame(minWidth: 600, minHeight: 500)
}
