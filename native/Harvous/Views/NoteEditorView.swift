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
            HarvousRecallOSIntegration.afterNotePersisted(note: note, modelContext: context)
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

    /// When set, pushes `ThreadWorkspaceView` for this thread id (macOS split column + iOS nested stack).
    var onNavigateToStudyThread: ((UUID) -> Void)? = nil
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
    /// Marker id that just got created — used to scroll to and momentarily flash the new row.
    @State private var recentlyCreatedThreadID: UUID? = nil
    /// Highlights painted in the editor plain-body coordinate space.
    @State private var studyHighlightPaints: [StudyHighlightPaint] = []
    /// Captured body selection when the floating chip appears (UTF-16 indices in `NSTextStorage`/`UITextStorage`).
    @State private var pendingHighlightStorageRange: NSRange?
    /// Bump so the floating capsule snaps back whenever a new non-empty selection anchors the menu.
    @State private var selectionMenuGeneration: UInt64 = 0
    /// Hover-only highlight preview for the bottom dock (when nothing is pinned).
    @State private var previewHighlightThreadId: UUID?
    /// Pinned dock thread (inspector jump, tap, compose confirm).
    @State private var dockPinnedHighlightThreadId: UUID?
    /// Expanded state for bottom highlight morph capsule.
    @State private var activeHighlightDockExpanded = false
    /// Transient notice when the user tries to stack a highlight on anchored prose.
    @State private var overlapNotice: String?
    @State private var scripturePassageSheet: ScripturePassageSheetItem?

    #if os(macOS)
    @StateObject private var proxy = EditorProxy()
    var showInspector: Binding<Bool> = .constant(false)
    #else
    @EnvironmentObject private var appRouter: HarvousAppRouter
    @State private var showInspectorIOS = false
    @StateObject private var proxy = EditorProxy()
    @State private var showScriptureEditorSheet = false
    #endif

    // MARK: - Body

    var body: some View {
        Group {
            if let note {
                editorCanvas(note: note)
            } else {
                emptyDetail
            }
        }
        .onChange(of: note?.id) { oldId, _ in
            previewHighlightThreadId = nil
            dockPinnedHighlightThreadId = nil
            activeHighlightDockExpanded = false
            pendingHighlightStorageRange = nil
            overlapNotice = nil
            recentlyCreatedThreadID = nil
            selectionMenuGeneration = 0
            studyHighlightPaints = []
#if os(macOS)
            proxy.hoveredStudyHighlightUUID = nil
#endif
            scripturePassageSheet = nil
            if let n = note {
                refreshThreads(note: n)
            } else {
                threadsForNote = []
                trailSnapshot = .init(incoming: [], outgoing: [])
            }
            #if os(iOS)
            showScriptureEditorSheet = false
            DispatchQueue.main.async {
                proxy.resetFormatBarStateForNewNote()
            }
            #endif
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
                ScrollViewReader { scrollProxy in
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
                            .padding(.horizontal, 32)
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
                            onConnectionsChanged: { refreshThreads(note: note) }
                        )
                        .padding(.horizontal, 32)
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
                            onStudyHighlightClick: { userActivatedStudyHighlight(threadId: $0) }
                        )
                        .frame(minHeight: 400)
                        .overlay(alignment: .topLeading) {
                            if let caretRect = proxy.selectionCaretViewportRect ?? proxy.selectionViewportRect,
                               proxy.hasSelection,
                               proxy.activeScripturePill == nil {
                                let menuWidth: CGFloat = 340
                                let menuHeight: CGFloat = 108
                                let editorWidth = max(geo.size.width - 64, 1)
                                let offset = ThreadChipLayout.overlayOffset(
                                    caretRect: caretRect,
                                    bodyWidth: editorWidth,
                                    overlayWidth: menuWidth,
                                    overlayHeight: menuHeight
                                )
                                StudySelectionFloatingMenu(
                                    selectionGeneration: selectionMenuGeneration,
                                    onConfirm: { handleStudySelectionConfirmed($0, note: note) },
                                    onDismiss: { dismissStudyFloatingMenu() }
                                )
                                .fixedSize()
                                .offset(x: offset.x, y: offset.y)
                                .scaleEffect(proxy.hasSelection ? 1 : 0.9, anchor: .center)
                                .opacity(proxy.hasSelection ? 1 : 0)
                                .animation(.easeOut(duration: 0.12), value: proxy.hasSelection)
                                .allowsHitTesting(proxy.hasSelection)
                            }
                        }
                        .overlay(alignment: .topTrailing) {
                            overlapNoticeBadge
                        }
                        .padding(.horizontal, 32)
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
                            onStudyHighlightTap: { userActivatedStudyHighlight(threadId: $0) },
                            studyHighlightPaints: studyHighlightPaints,
                            studyHighlightsAssumeDarkAppearance: colorScheme == .dark
                        )
                        .frame(minHeight: 400)
                        .overlay(alignment: .topLeading) {
                            if let rect = proxy.selectionCaretViewportRect ?? proxy.selectionViewportRect,
                               proxy.hasSelection,
                               proxy.activeScripturePill == nil {
                                let menuWidth: CGFloat = 340
                                let menuHeight: CGFloat = 112
                                let editorWidth = max(geo.size.width - 64, 1)
                                let offset = ThreadChipLayout.overlayOffset(
                                    caretRect: rect,
                                    bodyWidth: editorWidth,
                                    overlayWidth: menuWidth,
                                    overlayHeight: menuHeight
                                )
                                StudySelectionFloatingMenu(
                                    selectionGeneration: selectionMenuGeneration,
                                    onConfirm: { handleStudySelectionConfirmed($0, note: note) },
                                    onDismiss: { dismissStudyFloatingMenu() }
                                )
                                .fixedSize()
                                .offset(x: offset.x, y: offset.y)
                                .scaleEffect(proxy.hasSelection ? 1 : 0.9, anchor: .center)
                                .opacity(proxy.hasSelection ? 1 : 0)
                                .animation(.easeOut(duration: 0.12), value: proxy.hasSelection)
                                .allowsHitTesting(proxy.hasSelection)
                            }
                        }
                        .overlay(alignment: .topTrailing) {
                            overlapNoticeBadge
                        }
                        .padding(.horizontal, 32)
                        .onChange(of: editorState.plainText) { _, _ in scheduleAutosave(note) }
                        #endif

                        if let recentHighlightScrollId = recentlyCreatedThreadID {
                            Color.clear.frame(height: 8).opacity(0.001).id(recentHighlightScrollId)
                        }

                        activeStudyHighlightDock(note: note)

                        #if os(iOS)
                        Spacer().frame(height: 80)
                        #else
                        Spacer(minLength: 0)
                        #endif
                    }
                    .frame(maxWidth: .infinity, minHeight: viewportH, alignment: .top)
                }
                .onChange(of: recentlyCreatedThreadID) { _, newID in
                    guard let newID else { return }
                    withAnimation(.easeOut(duration: 0.35)) {
                        scrollProxy.scrollTo(newID, anchor: .center)
                    }
                }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            #if os(macOS)
            // Bottom bar: format toolbar when selected, while typing, or when pointer is on the bar
            if proxy.shouldShowNoteToolbar {
                NoteToolbar(proxy: proxy)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            } else if proxy.activeScripturePill != nil {
                ScripturePillActionBar(proxy: proxy)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            } else {
                NoteActionBar(
                    note: note,
                    trailSnapshot: trailSnapshot,
                    currentNoteTitle: title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Current note" : title,
                    onOpenLinkedNote: { id in openNoteInPlace(id: id) },
                    onConnectionsChanged: { refreshThreads(note: note) },
                    isCollectionContextUpdating: isCollectionContextUpdating
                )
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            #endif
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
        .inspector(isPresented: showInspector) {
            inspectorContent(note: note)
        }
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
        .sheet(isPresented: $showScriptureEditorSheet) {
            ScripturePillEditorSheet(proxy: proxy) { ref, trans in
                scripturePassageSheet = ScripturePassageSheetItem(reference: ref, translation: trans)
            }
        }
        .onChange(of: showScriptureEditorSheet) { _, open in
            if !open {
                DispatchQueue.main.async {
                    proxy.clearActiveScripturePill()
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button {
                    withAnimation(HarvousAnimation.spring) { showInspectorIOS = true }
                } label: {
                    HStack(spacing: 6) {
                        CollectionSymbol(
                            isContextUpdating: isCollectionContextUpdating,
                            font: .system(size: 14)
                        )
                        if let label = currentCollectionLabel {
                            Text(label)
                                .font(HarvousFonts.font(size: 16, weight: 500, design: .default))
                                .lineLimit(1)
                                .minimumScaleFactor(1)
                                .fixedSize(horizontal: true, vertical: false)
                                .opacity(showCollectionToolbarText ? 1 : 0)
                                .offset(x: showCollectionToolbarText ? 0 : -8)
                                .animation(.easeOut(duration: 0.18), value: showCollectionToolbarText)
                        }
                    }
                }
                .tint(
                    currentCollectionLabel != nil
                        ? HarvousColors.themeAccent(scriptureTheme)
                        : Color.secondary
                )
                .accessibilityLabel(
                    currentCollectionLabel.map { "Collection: \($0)" } ?? "No collection"
                )
                .accessibilityHint(
                    currentCollectionLabel != nil
                        ? "Opens note details to edit collection"
                        : "Opens note details to add a collection"
                )
            }
            ToolbarItemGroup(placement: .primaryAction) {
                Button {
                    withAnimation(HarvousAnimation.spring) { showInspectorIOS.toggle() }
                } label: {
                    if showInspectorIOS {
                        Label("Hide note details", systemImage: "sidebar.left")
                    } else {
                        Label("Note details", systemImage: "sidebar.right")
                    }
                }
                .accessibilityHint(showInspectorIOS ? "Closes the note details panel" : "Opens tags, collection, and info")
            }
        }
        #endif
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
                }
            )
        }
    }

    private func dismissStudyHighlightDock() {
        dockPinnedHighlightThreadId = nil
        activeHighlightDockExpanded = false
        previewHighlightThreadId = nil
    }

    private func userActivatedStudyHighlight(threadId: UUID) {
        guard let thread = ThreadStore.fetch(id: threadId, modelContext: context) else { return }
        guard StudyThread.anchoredHighlightKinds.contains(thread.entryKind),
              thread.hasPersistedHighlightAnchor else { return }
        if dockPinnedHighlightThreadId == threadId {
            activeHighlightDockExpanded.toggle()
        } else {
            dockPinnedHighlightThreadId = threadId
            activeHighlightDockExpanded = true
            previewHighlightThreadId = nil
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
        try? context.save()
    }

#if os(macOS)

    private func bodySelectionAnchoringChanged(macHasSelection: Bool) {
        guard macHasSelection else {
            pendingHighlightStorageRange = nil
            previewHighlightThreadId = nil
            return
        }
        dockPinnedHighlightThreadId = nil
        activeHighlightDockExpanded = false
        snapshotPendingMacSelection()
    }

    private func snapshotPendingMacSelection() {
        guard let tv = proxy.textView, let storage = tv.textStorage else {
            pendingHighlightStorageRange = nil
            return
        }
        let r = tv.selectedRange()
        guard r.length > 0 else {
            pendingHighlightStorageRange = nil
            return
        }
        if HarvousStudyHighlightMapper.selectionIntersectsUnresolvedAttachment(r, in: storage) {
            pendingHighlightStorageRange = nil
            return
        }
        guard case .success = HarvousStudyHighlightMapper.expandedRange(forStorageSelection: r, in: storage) else {
            pendingHighlightStorageRange = nil
            return
        }
        pendingHighlightStorageRange = r
        selectionMenuGeneration &+= 1
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
        guard iosHasSelection else {
            pendingHighlightStorageRange = nil
            previewHighlightThreadId = nil
            return
        }
        dockPinnedHighlightThreadId = nil
        activeHighlightDockExpanded = false
        snapshotPendingIOSSelection()
    }

    private func snapshotPendingIOSSelection() {
        guard let tv = proxy.textView else {
            pendingHighlightStorageRange = nil
            return
        }
        if tv.textColor == .tertiaryLabel {
            pendingHighlightStorageRange = nil
            return
        }
        let storage = tv.textStorage
        let r = tv.selectedRange
        guard r.length > 0 else {
            pendingHighlightStorageRange = nil
            return
        }
        if HarvousStudyHighlightMapper.selectionIntersectsUnresolvedAttachment(r, in: storage) {
            pendingHighlightStorageRange = nil
            return
        }
        guard case .success = HarvousStudyHighlightMapper.expandedRange(forStorageSelection: r, in: storage) else {
            pendingHighlightStorageRange = nil
            return
        }
        pendingHighlightStorageRange = r
        selectionMenuGeneration &+= 1
    }

#endif

    private func overlapsExistingAnchoredHighlights(note: Note, expandedSelection: NSRange, expandedPlain: String) -> Bool {
        let anchored = ThreadStore.fetchAnchoredHighlights(parentNoteId: note.id, modelContext: context)
        let nsExpanded = expandedPlain as NSString
        guard expandedSelection.location >= 0, NSMaxRange(expandedSelection) <= nsExpanded.length else { return false }

        for marker in anchored where StudyThread.anchoredHighlightKinds.contains(marker.entryKind) {
            guard marker.hasPersistedHighlightAnchor else { continue }
            guard let markerRange = marker.resolveHighlightRangeAgainstExpandedBody(expandedPlain) else { continue }
            if NSIntersectionRange(expandedSelection, markerRange).length > 0 { return true }
        }
        return false
    }

    private func bumpOverlapNotice(_ message: String) {
        overlapNotice = message
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(2.8))
            if overlapNotice == message {
                overlapNotice = nil
            }
        }
    }

    private func dismissStudyFloatingMenu() {
        pendingHighlightStorageRange = nil
        selectionMenuGeneration &+= 1
        clearEditorSelectionAfterAction()
    }

    private func handleStudySelectionConfirmed(_ payload: StudySelectionInput, note: Note) {
        persistEditorIntoNote(note)
        defer {
            pendingHighlightStorageRange = nil
            clearEditorSelectionAfterAction()
        }

#if os(macOS)
        guard let storage = proxy.textView?.textStorage else {
            bumpOverlapNotice("Editor isn't ready.")
            return
        }
#else
        guard let tv = proxy.textView, tv.textColor != .tertiaryLabel else {
            bumpOverlapNotice("Editor isn't ready.")
            return
        }
        let storage = tv.textStorage
#endif

        guard let storSel = pendingHighlightStorageRange, storSel.length > 0 else {
            bumpOverlapNotice("Lost the highlight selection.")
            return
        }

        guard !HarvousStudyHighlightMapper.selectionIntersectsUnresolvedAttachment(storSel, in: storage),
              case let .success(expandedSel) = HarvousStudyHighlightMapper.expandedRange(forStorageSelection: storSel, in: storage)
        else {
            bumpOverlapNotice("Can't split scripture pills.")
            return
        }

        let expandedPlain = harvousExpandedPlainText(in: storage)
        guard expandedPlain == editorState.plainText else {
            bumpOverlapNotice("Body changed — retry.")
            return
        }

        if overlapsExistingAnchoredHighlights(note: note, expandedSelection: expandedSel, expandedPlain: expandedPlain) {
            bumpOverlapNotice("Overlaps another highlight.")
            return
        }

        let nsExpandedPlain = expandedPlain as NSString
        guard expandedSel.location >= 0, NSMaxRange(expandedSel) <= nsExpandedPlain.length else {
            bumpOverlapNotice("Mapping failed.")
            return
        }

        let sourceSnippet = ThreadEditorSnippet.clampSource(nsExpandedPlain.substring(with: expandedSel))

        let createdThread = ThreadStore.createMiniNote(
            parent: note,
            spaceId: note.resolvedSpaceId(),
            sourceSnippet: sourceSnippet,
            body: payload.body,
            highlightAccent: payload.accent,
            expandedAnchorUTF16Range: expandedSel,
            expandedPlainForAnchor: expandedPlain,
            modelContext: context
        )

        bumpRecentlyCreatedScroller(threadId: createdThread.id)

        dockPinnedHighlightThreadId = createdThread.id
        activeHighlightDockExpanded = true
        previewHighlightThreadId = nil

#if os(macOS)
        proxy.hoveredStudyHighlightUUID = nil
#endif

        reconcileStudyHighlightsPainting(for: note)
        refreshThreads(note: note)
    }

    private func bumpRecentlyCreatedScroller(threadId: UUID) {
        recentlyCreatedThreadID = threadId
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(1750))
            if recentlyCreatedThreadID == threadId {
                recentlyCreatedThreadID = nil
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

    private func clearEditorSelectionAfterAction() {
        #if os(macOS)
        if let tv = proxy.textView {
            let end = tv.selectedRange().location + tv.selectedRange().length
            tv.setSelectedRange(NSRange(location: end, length: 0))
        }
        proxy.hasSelection = false
        #else
        if let tv = proxy.textView {
            let end = tv.selectedRange.location + tv.selectedRange.length
            tv.selectedRange = NSRange(location: end, length: 0)
        }
        proxy.hasSelection = false
        proxy.selectionViewportRect = nil
        #endif
    }

    @ViewBuilder
    private func inspectorContent(note: Note) -> some View {
        #if os(macOS)
        NoteInspectorView(
            note: note,
            onJumpToAnchoredHighlight: { entryKind in
                jumpInspectorToHighlight(kind: entryKind, inspectedNote: note)
            }
        )
        .inspectorColumnWidth(min: 240, ideal: 280, max: 320)
        #else
        NavigationStack {
            NoteInspectorView(
                note: note,
                onJumpToAnchoredHighlight: { entryKind in
                    jumpInspectorToHighlight(kind: entryKind, inspectedNote: note)
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
            let pill = ActiveScripturePill(attachmentRange: range, reference: reference, translation: translation)
            #if os(macOS)
            proxy.activeScripturePill = pill
            #else
            proxy.activeScripturePill = pill
            showScriptureEditorSheet = true
            #endif
        }
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
        HarvousRecallOSIntegration.afterNotePersisted(note: n, modelContext: context)
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
        HarvousRecallOSIntegration.afterNotePersisted(note: previous, modelContext: context)
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

private enum ThreadChipLayout {
    /// Places the floating context menu near the active selection/caret.
    /// Prefers positioning above the selected line, but falls back to below
    /// when there isn't enough room above (e.g. selection near top of editor)
    /// so the menu never covers the selected text.
    static func overlayOffset(
        caretRect rect: CGRect,
        bodyWidth: CGFloat,
        overlayWidth: CGFloat,
        overlayHeight: CGFloat = 40
    ) -> CGPoint {
        let gap: CGFloat = 8
        let inset: CGFloat = 6
        let centeredX = rect.midX - (overlayWidth / 2)
        let overlayX = min(max(centeredX, inset), bodyWidth - overlayWidth - inset)
        let aboveY = rect.minY - overlayHeight - gap
        let belowY = rect.maxY + gap
        let overlayY = aboveY >= inset ? aboveY : belowY
        return CGPoint(x: overlayX, y: overlayY)
    }
}

#Preview {
    NoteEditorView(note: .constant(nil))
        .modelContainer(for: [Note.self, StudyThread.self], inMemory: true)
        .frame(minWidth: 600, minHeight: 500)
}
