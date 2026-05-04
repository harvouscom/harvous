import SwiftUI
import SwiftData

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
            BibleStudyTagSuggester.applyToNote(note, allowPrimaryUpdate: allowPrimaryCollectionUpdate)
            try? context.save()
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
    /// Pinned dock thread (inspector jump, tap, compose confirm).
    @State private var dockPinnedHighlightThreadId: UUID?
    /// Expanded state for bottom highlight morph capsule.
    @State private var activeHighlightDockExpanded = false
    /// Transient notice when the user tries to stack a highlight on anchored prose.
    @State private var overlapNotice: String?
    @State private var scripturePassageSheet: ScripturePassageSheetItem?
    /// When set, a modal bottom sheet opens showing the selected highlight's note (mirrors scripture-pill UX).
    @State private var highlightDetailThreadId: HighlightDetailSheetItem?
    @State private var showLinkPicker = false
    @State private var showWikiLinkPicker = false
    @State private var showRelatedNotes = false
    /// Inline highlight authoring (popover + floating bar triggers).
    @State private var highlightCaptureSession: HighlightCaptureSession?
    @State private var highlightAnnotationDraft = ""
    @State private var highlightAnnotationAccent: StudyHighlightAccentToken = .warmAmber
    @Namespace private var selectionAccessoryNamespace

    /// Inline expanded chrome for a tapped scripture pill (passage + accent + translation).
    /// Replaces the former bottom action bar as the primary click affordance; the old bar still
    /// drives selection-near-pill editing of book/chapter/verse.
    @State private var activePillDock: ActiveScripturePillDockItem?
    @State private var activePillDockExpanded: Bool = true
    /// Prefetch scripture HTML for pills in this note — cancelled when switching notes or on editor disappear.
    @State private var scripturePillPrefetchTask: Task<Void, Never>?

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
        noteEditorLifecycleStack
            .focusedObject(proxy)
            .focusedSceneValue(\.deleteNoteAction, note == nil ? nil : { deleteCurrentNoteIfPossible() })
            .focusedSceneValue(\.newConnectedNoteAction, note == nil ? nil : { createConnectedNoteFromKeyboard() })
            .focusedSceneValue(\.nextStudyHighlightAction, note == nil ? nil : { focusNextStudyHighlight() })
            .focusedSceneValue(\.previousStudyHighlightAction, note == nil ? nil : { focusPreviousStudyHighlight() })
            .focusedSceneValue(
                \.toggleStudyHighlightDockExpandedAction,
                note == nil ? nil : { toggleStudyHighlightDockExpandedFromKeyboard() }
            )
            .focusedSceneValue(\.removeActiveStudyHighlightAction, note == nil ? nil : { removeActiveHighlightFromKeyboard() })
            .onAppear {
                proxy.onScripturePillKeyboardFocus = { ref, trans, range in
                    scripturePillTapped(reference: ref, translation: trans, range: range)
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: .harvousToggleActivePillDockExpanded)) { _ in
                guard activePillDock != nil else { return }
                activePillDockExpanded.toggle()
            }
#else
        noteEditorLifecycleStack
#endif
    }

    /// Split from `body` so the type checker can finish within a reasonable time.
    private var noteEditorLifecycleStack: some View {
        Group {
            if let note {
                editorCanvas(note: note)
            } else {
                emptyDetail
            }
        }
        .onChange(of: note?.id) { oldId, _ in
            scripturePillPrefetchTask?.cancel()
            scripturePillPrefetchTask = nil
            previewHighlightThreadId = nil
            dockPinnedHighlightThreadId = nil
            activeHighlightDockExpanded = false
            activePillDock = nil
            activePillDockExpanded = false
            overlapNotice = nil
            studyHighlightPaints = []
#if os(macOS)
            proxy.hoveredStudyHighlightUUID = nil
#endif
            scripturePassageSheet = nil
            highlightDetailThreadId = nil
            dismissHighlightCapture()
            if let n = note {
                refreshThreads(note: n)
            } else {
                threadsForNote = []
                trailSnapshot = .init(incoming: [], outgoing: [])
            }
            autosave.cancel()
            // Capture UI before any child representable runs; avoids persisting wrong note after a switch.
            let snapshotTitle = title
            let snapshotBody = editorState.plainText
            let snapshotRefs = editorState.detectedRefs
            if let oldId {
                flushPendingEdits(forNoteId: oldId, title: snapshotTitle, body: snapshotBody, refs: snapshotRefs)
            }
            syncFromNote()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                if let n = note {
                    refreshThreads(note: n)
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
                refreshThreads(note: n)
            }
        }
        // Auto-focus title when a brand-new empty note is opened (Apple Notes UX)
        .task(id: note?.id) {
            guard let n = note, n.title.isEmpty, n.body.isEmpty else { return }
            try? await Task.sleep(for: .milliseconds(80))
            titleFocused = true
        }
        .onChange(of: currentCollectionLabel) { _, newValue in
            animateCollectionTextReveal(for: newValue)
        }
        .onChange(of: isCollectionContextUpdating) { _, updating in
            guard updating else { return }
            animateCollectionTextReveal(for: currentCollectionLabel)
        }
#if os(macOS)
        .onChange(of: proxy.hasSelection) { _, sel in bodySelectionAnchoringChanged(macHasSelection: sel) }
        .onChange(of: proxy.hoveredStudyHighlightUUID) { _, hovered in macUpdatePreviewForHoveredHighlight(hovered) }
#else
        .onChange(of: proxy.hasSelection) { _, sel in bodySelectionAnchoringChanged(iosHasSelection: sel) }
#endif
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

    // MARK: - Highlight capture (selection menu + floating bar)

    private func dismissHighlightCapture() {
        highlightCaptureSession = nil
        highlightAnnotationDraft = ""
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
            expandedUTF16Range: exp,
            expandedPlain: editorState.plainText,
            highlightAccent: highlightAnnotationAccent,
            modelContext: context
        )
        dismissHighlightCapture()
        refreshThreads(note: note)
    }

    /// Shared morph id — the bar and popover share their capsule chrome for a seamless grow animation.
    private static let selectionAccessoryCapsuleMorphID = "harvous-selection-accessory-capsule"

    @ViewBuilder
    private func selectionAccessoryLayer(note: Note, horizontalClampWidth: CGFloat) -> some View {
        let anchorRect = proxy.selectionViewportRect
        ZStack(alignment: .topLeading) {
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
            if let session = highlightCaptureSession, session.parentNoteId == note.id {
                let baseRect = session.anchorRect ?? anchorRect ?? CGRect(x: horizontalClampWidth / 2, y: 80, width: 0, height: 0)
                let panelW: CGFloat = 360
                let x = selectionAccessoryX(rect: baseRect, containerWidth: horizontalClampWidth, width: panelW)
                let y = selectionAccessoryY(rect: baseRect)
                HighlightAnnotationPopover(
                    excerptPreview: session.excerpt,
                    annotationText: $highlightAnnotationDraft,
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
        refreshThreads(note: parentNote)

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

    @ViewBuilder
    private func editorCanvas(note: Note) -> some View {
        VStack(spacing: 0) {
            // Scrollable writing surface — `minHeight` matches viewport so paper runs flush to the footer (no dead band).
            GeometryReader { geo in
                let viewportH = max(geo.size.height, 1)
                let paperClampW = max(geo.size.width - 64, 200)
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

                        #if os(iOS)
                        NoteConnectionsBar(
                            note: note,
                            snapshot: trailSnapshot,
                            currentNoteTitle: title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Current note" : title,
                            onOpenLinkedNote: { openNoteInPlace(id: $0) },
                            onConnectionsChanged: { refreshThreads(note: note) },
                            horizontalEdgePadding: 20
                        )
                        .padding(.bottom, 8)
                        #endif

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
                        .frame(minHeight: 400)
                        .overlay(alignment: .topLeading) {
                            selectionAccessoryLayer(note: note, horizontalClampWidth: paperClampW)
                        }
                        .overlay(alignment: .topTrailing) {
                            overlapNoticeBadge
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
                        .overlay(alignment: .topTrailing) {
                            overlapNoticeBadge
                        }
                        .padding(.horizontal, 20)
                        .onChange(of: editorState.plainText) { _, _ in scheduleAutosave(note) }
                        #endif

                        #if os(iOS)
                        Spacer().frame(height: 80)
                        #else
                        Spacer(minLength: 0)
                        #endif
                    }
                    .frame(maxWidth: .infinity, minHeight: viewportH, alignment: .top)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            // Dock layer pinned above the bottom action bar so a newly created/opened dock is always
            // visible without requiring the user to scroll down. Lives outside the `ScrollView`
            // intentionally — these are focus-mode overlays, not inline note content.
            activeStudyHighlightDock(note: note)
            activeScripturePillDock(note: note)

            #if os(macOS)
            // Bottom bar: format toolbar when selected, while typing, or when pointer is on the bar
            if proxy.shouldShowNoteToolbar {
                NoteToolbar(proxy: proxy)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            } else if proxy.activeScripturePill != nil && activePillDock == nil {
                ScripturePillActionBar(proxy: proxy)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            } else {
                VStack(spacing: 0) {
                    Color(nsColor: .separatorColor).frame(height: 0.5)
                    NoteConnectionsBar(
                        note: note,
                        snapshot: trailSnapshot,
                        currentNoteTitle: title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Current note" : title,
                        onOpenLinkedNote: { id in openNoteInPlace(id: id) },
                        onConnectionsChanged: { refreshThreads(note: note) }
                    )
                }
                .background(.thinMaterial)
                .transition(.move(edge: .bottom).combined(with: .opacity))
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
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                NoteTopBar(
                    note: note,
                    isCollectionContextUpdating: isCollectionContextUpdating,
                    showCollectionToolbarText: showCollectionToolbarText,
                    scriptureTheme: scriptureTheme
                )
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
                        refreshThreads(note: n)
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

    private func refreshThreads(note: Note) {
        let active = ThreadStore.activeThreads(
            parentNoteId: note.id,
            spaceId: note.resolvedSpaceId(),
            modelContext: context
        )
        threadsForNote = active
        trailSnapshot = ThreadStore.trailSnapshot(for: note, modelContext: context)
        reconcileStudyHighlightsPainting(for: note)
    }

    @ViewBuilder
    private var overlapNoticeBadge: some View {
        if let overlapNotice, !overlapNotice.isEmpty {
            Text(overlapNotice)
                .font(HarvousTypography.caption)
                .foregroundStyle(.primary)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color.orange.opacity(0.18)))
                .padding(.trailing, 8)
                .padding(.top, 4)
                .transition(.opacity)
        }
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
                }
            )
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
        try? context.save()
        refreshThreads(note: parent)
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
        try? context.save()
    }

#if os(macOS)

    private func bodySelectionAnchoringChanged(macHasSelection: Bool) {
        if !macHasSelection {
            dismissHighlightCapture()
            previewHighlightThreadId = nil
            return
        }
        dockPinnedHighlightThreadId = nil
        activeHighlightDockExpanded = false
    }

    private func macUpdatePreviewForHoveredHighlight(_ hoveredId: UUID?) {
        guard dockPinnedHighlightThreadId == nil else {
            if hoveredId == nil {
                previewHighlightThreadId = nil
            }
            return
        }
        previewHighlightThreadId = hoveredId
    }

#else

    private func bodySelectionAnchoringChanged(iosHasSelection: Bool) {
        if !iosHasSelection {
            dismissHighlightCapture()
            previewHighlightThreadId = nil
            return
        }
        dockPinnedHighlightThreadId = nil
        activeHighlightDockExpanded = false
    }

#endif

    private func bumpOverlapNotice(_ message: String) {
        overlapNotice = message
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(2.8))
            if overlapNotice == message {
                overlapNotice = nil
            }
        }
    }

    func jumpInspectorToHighlight(kind: StudyThread.EntryKind, inspectedNote: Note) {
        persistEditorIntoNote(inspectedNote)

        let rows = ThreadStore.fetchAnchoredHighlights(parentNoteId: inspectedNote.id, modelContext: context)
            .filter { $0.entryKind == kind }
        guard
            let first = rows.min(by: {
                (($0.anchorLocation ?? Int.max), $0.updatedAt.timeIntervalSince1970)
                    < (($1.anchorLocation ?? Int.max), $1.updatedAt.timeIntervalSince1970)
            })
        else {
            bumpOverlapNotice("No anchored highlights.")
            return
        }

        let body = editorState.plainText
        guard let exp = first.resolveHighlightRangeAgainstExpandedBody(body) else { return }

        dockPinnedHighlightThreadId = first.id
        previewHighlightThreadId = nil
        activeHighlightDockExpanded = true

#if os(macOS)
        proxy.scrollExpandedStudyHighlightIntoView(expandedUTF16Range: exp, expandedPlain: body)
#else
        proxy.scrollExpandedStudyHighlightIntoView(expandedUTF16Range: exp, expandedPlain: body)
#endif
    }

#if os(macOS)
    private func createConnectedNoteFromKeyboard() {
        guard let parent = note else { return }
        persistEditorIntoNote(parent)
        autosave.cancel()
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
        refreshThreads(note: parent)
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
    private func inspectorContent(note: Note) -> some View {
        #if os(macOS)
        NoteInspectorView(
            note: note,
            onJumpToHighlightedCaptures: {
                jumpInspectorToHighlight(kind: .miniNote, inspectedNote: note)
            }
        )
        .inspectorColumnWidth(min: 240, ideal: 280, max: 320)
        #else
        NavigationStack {
            NoteInspectorView(
                note: note,
                onJumpToHighlightedCaptures: {
                    jumpInspectorToHighlight(kind: .miniNote, inspectedNote: note)
                }
            )
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
        Task { @MainActor in
            // Close any open highlight dock so the two never overlap visually.
            dockPinnedHighlightThreadId = nil
            activeHighlightDockExpanded = false
            previewHighlightThreadId = nil

            activePillDock = ActiveScripturePillDockItem(reference: reference, translation: translation, range: range)
            activePillDockExpanded = true
            #if os(iOS)
            UIImpactFeedbackGenerator(style: .soft).impactOccurred()
            #endif
        }
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
                        try? context.save()
                        requestScripturePillRedetect()
                    }
                ),
                isExpanded: $activePillDockExpanded,
                onReferenceChanged: { newReference in
                    applyScripturePillReferenceChange(newReference: newReference, note: note)
                },
                onDismiss: dismissActiveScripturePillDock
            )
        }
    }

    private func dismissActiveScripturePillDock() {
        activePillDock = nil
        activePillDockExpanded = false
        // Also clear the selection-driven pill state so the old bottom action bar doesn't pop up
        // right after dismiss while the caret is still inside the pill attachment range.
        proxy.activeScripturePill = nil
        // Avoid flashing bottom format chrome while `showFormatBarForActivity` stays true from caret focus (iOS + macOS).
        proxy.preferOrbChromeUntilNextFormatSignal = true
    }

    /// Update the inline pill attachment's translation in-place by routing through the existing
    /// `EditorProxy.replaceActiveScripturePill` path (it already preserves the accent attribute).
    private func applyScripturePillTranslationChange(from item: ActiveScripturePillDockItem,
                                                      newTranslation: String,
                                                      note: Note) {
        // `EditorProxy.replaceActiveScripturePill` wants an `activeScripturePill` set first.
        proxy.activeScripturePill = ActiveScripturePill(
            attachmentRange: item.range,
            reference: item.reference,
            translation: item.translation
        )
        proxy.replaceActiveScripturePill(reference: item.reference, translation: newTranslation, theme: scriptureTheme)
        // After replacement the caret sits on the pill — clear `activeScripturePill` so the selection-
        // driven bottom bar doesn't appear on top of the inline dock.
        proxy.activeScripturePill = nil
        requestScripturePillRedetect()
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
            try? context.save()
        }

        proxy.activeScripturePill = ActiveScripturePill(
            attachmentRange: current.range,
            reference: current.reference,
            translation: current.translation
        )
        proxy.replaceActiveScripturePill(reference: newReference, translation: current.translation, theme: scriptureTheme)
        proxy.activeScripturePill = nil

        // Pin the dock to the new reference. Range may shift slightly because the pill's character
        // is still 1 `NSAttachment` wide, but we keep the old location as the best available anchor.
        activePillDock = ActiveScripturePillDockItem(
            reference: newReference,
            translation: current.translation,
            range: current.range
        )
        ScriptureApplyFeedback.notifyScripturePillApplied()
        requestScripturePillRedetect()
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
        autosave.updateSnapshot(title: nextTitle, body: nextBody, refs: editorState.detectedRefs)
        withAnimation(HarvousAnimation.spring) {
            isCollectionContextUpdating = shouldAnimateCollectionContextFeedback && allowPrimaryUpdate
        }
        // Prevent a cancelled previous autosave task from clearing the fresh "updating" state
        // before we register the new token for this cycle.
        latestAutosaveToken = .max
        let token = autosave.schedule(
            note: note,
            context: context,
            allowPrimaryCollectionUpdate: allowPrimaryUpdate
        ) { settledToken in
            guard settledToken == latestAutosaveToken else { return }
            withAnimation(HarvousAnimation.spring) {
                isCollectionContextUpdating = false
            }
        }
        latestAutosaveToken = token
    }

    /// Writes the in-memory title/editor fields into a note row and commits the store.
    private func persistEditorIntoNote(_ n: Note) {
        let body = editorState.plainText
        let refs = editorState.detectedRefs
        guard n.title != title || n.body != body || n.detectedRefs != refs else {
            autosave.updateSnapshot(title: title, body: body, refs: refs)
            withAnimation(HarvousAnimation.spring) {
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
            )
        )
        try? context.save()
        HarvousNoteSpotlightIndexer.reindex(note: n)
        HarvousVaultExporter.scheduleWrite(note: n, modelContext: context)
        autosave.updateSnapshot(title: title, body: body, refs: refs)
        withAnimation(HarvousAnimation.spring) {
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
            withAnimation(HarvousAnimation.spring) {
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
            )
        )
        try? context.save()
        HarvousNoteSpotlightIndexer.reindex(note: previous)
        HarvousVaultExporter.scheduleWrite(note: previous, modelContext: context)
        autosave.updateSnapshot(title: title, body: body, refs: refs)
        withAnimation(HarvousAnimation.spring) {
            isCollectionContextUpdating = false
        }
    }

    // MARK: - Sync

    private func syncFromNote() {
        if let note {
            title = note.title
            editorState = EditorState(plainText: note.body, detectedRefs: note.detectedRefs)
            BibleStudyTagSuggester.applyToNote(note, allowPrimaryUpdate: false)
            autosave.updateSnapshot(title: title, body: editorState.plainText, refs: editorState.detectedRefs)
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
        #if os(macOS)
        return !proxy.shouldShowNoteToolbar
        #else
        return true
        #endif
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

extension NoteEditorView {
    /// Bottom sheet shown when the user clicks/taps a painted highlight. Mirrors the scripture passage sheet
    /// shape (NavigationStack + Done button) and reuses `ActiveHighlightDock` for the accent-themed chrome.
    @ViewBuilder
    fileprivate func highlightDetailSheet(for threadId: UUID) -> some View {
        if let thread = ThreadStore.fetch(id: threadId, modelContext: context), let parent = note {
            NavigationStack {
                ScrollView {
                    ActiveHighlightDock(
                        thread: thread,
                        isExpanded: .constant(true),
                        scriptureTheme: scriptureTheme,
                        onDismiss: { highlightDetailThreadId = nil },
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
                    .padding(.horizontal, 4)
                    .padding(.vertical, 20)
                }
                .navigationTitle("Highlight")
                #if os(iOS)
                .navigationBarTitleDisplayMode(.inline)
                #endif
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Done") { highlightDetailThreadId = nil }
                    }
                }
            }
            #if os(iOS)
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
            #else
            .frame(minWidth: 420, minHeight: 280)
            #endif
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
    let reference: String
    var translation: String
    let range: NSRange

    var id: String { "\(reference)|\(range.location)|\(range.length)" }

    static func == (lhs: ActiveScripturePillDockItem, rhs: ActiveScripturePillDockItem) -> Bool {
        lhs.reference == rhs.reference && lhs.translation == rhs.translation && lhs.range == rhs.range
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
