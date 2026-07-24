import SwiftUI
import SwiftData

#if os(macOS)
private enum SidebarToolbarLayout {
    /// Omit SwiftUI sidebar `toolbar` while measured width is in `(0 ..< this)` during split resize. When width is still `0`, chrome stays visible so expanding from `detailOnly` never blanks the space switcher.
    static let narrowColumnToolbarSuppressBelow: CGFloat = 210
    /// ToolbarItemGroup allocates wide gaps between sibling views (separate placements). Cluster in one `HStack` instead.
    static let borderedIconClusterSpacing: CGFloat = 7
}

#endif

/// Sidebar — note list with a notes/folders toggle. Collapsible via ⌘\.
struct SidebarPanelView: View {
    private enum SidebarMode: String, CaseIterable, Identifiable {
        case notes
        case folders
        case threads
        case scripture
        case highlights

        var id: String { rawValue }
        var title: String {
            switch self {
            case .notes: return "Notes"
            case .folders: return "Folders"
            case .threads: return "Threads"
            case .highlights: return "Highlights"
            case .scripture: return "Scripture"
            }
        }

        var icon: String {
            switch self {
            case .notes: return "Harvous.Note"
            case .folders: return "Harvous.Folder"
            case .threads: return "Harvous.ArrowRightArrowLeft"
            case .highlights: return "Harvous.Highlight"
            case .scripture: return "Harvous.BookOpen"
            }
        }
    }

    private enum ThreadsDrill: Equatable {
        case root
        case cluster(representativeId: UUID, title: String, memberIds: [UUID])
    }

    private enum FoldersDrill: Equatable {
        case root
        /// `nil` means notes with no primary folder bucket (matches `HarvousFolderRow.folderLabel`).
        case bucket(String?)
    }

    private enum ScriptureDrill: Equatable {
        case root
        case book(Int)
        case passage(ParsedScriptureFields)
    }

    @Binding var selectedNote: Note?
    @Binding var splitColumnVisibility: NavigationSplitViewVisibility
    var onCreateNewNote: (() -> Void)?
    #if os(macOS)
    /// Optional sink for live sidebar column width (split divider drag) — used by detail-toolbar identity refresh.
    var reportedSidebarColumnWidth: Binding<CGFloat>? = nil
    #endif
    @Query(sort: \Note.updatedAt, order: .reverse) private var notes: [Note]
    @Query(
        sort: [
            SortDescriptor(\StudyThread.createdAt, order: .reverse),
            SortDescriptor(\StudyThread.id, order: .forward),
        ]
    )
    private var studyThreads: [StudyThread]
    @Environment(\.modelContext) private var modelContext
    @Environment(\.harvousIsIPadSplitLayout) private var isIPadSplitLayout
    @EnvironmentObject private var spaceStore: SpaceStore
    @State private var mode: SidebarMode = .notes
    @State private var foldersDrill: FoldersDrill = .root
    @State private var threadsDrill: ThreadsDrill = .root
    @State private var scriptureDrill: ScriptureDrill = .root
    @State private var folderListSearchText = ""
    @State private var pinnedFolderRowIds: [String] = []
    @State private var renameTarget: HarvousFolderRow?
    @State private var renameDraft: String = ""
    @State private var removeConfirmRow: HarvousFolderRow?
    @State private var folderDrillMemberCountPrev: Int? = nil
    @FocusState private var searchFieldFocused: Bool
    #if os(macOS)
    @State private var sidebarColumnMeasuredWidth: CGFloat = 0
    #endif

    private var unifiedSearchText: Binding<String> {
        Binding(
            get: { folderListSearchText },
            set: { folderListSearchText = $0 }
        )
    }

    private var notesInActiveSpace: [Note] {
        HarvousNoteListVisibility.notesInActiveSpace(
            from: notes,
            spaceId: spaceStore.activeSpaceUUID()
        )
    }

    private var folderRows: [HarvousFolderRow] {
        HarvousFolderListIndex.rows(from: notesInActiveSpace)
    }

    private var activeFolderBucketMemberCount: Int? {
        guard mode == .folders else { return nil }
        if case .bucket(let key) = foldersDrill {
            return HarvousFolderListIndex.memberCount(in: notesInActiveSpace, bucket: key)
        }
        return nil
    }

    private var threadClusters: [ThreadStore.NoteCluster] {
        ThreadStore.connectedClusters(from: notesInActiveSpace, modelContext: modelContext)
    }

    private var filteredThreadClusters: [ThreadStore.NoteCluster] {
        let q = folderListSearchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return threadClusters }
        return threadClusters.filter { $0.title.localizedStandardContains(q) }
    }

    private var isSidebarSearchActive: Bool {
        !folderListSearchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var highlightThreadsForSearch: [StudyThread] {
        let sid = spaceStore.activeSpaceUUID()
        let scoped = StudyHighlightListIndex.rowsInActiveSpace(
            threads: studyThreads,
            activeSpaceId: sid,
            allowUnscopedFallback: true
        )
        return StudyHighlightListIndex.sortedForList(
            scoped.filter { StudyHighlightListIndex.isEligibleListHighlight($0) }
        )
    }

    private var threadDrillNotesForSearch: [Note] {
        if case .cluster(_, _, let memberIds) = threadsDrill {
            let idSet = Set(memberIds)
            return notesInActiveSpace.filter { idSet.contains($0.id) }
        }
        return []
    }

    private var scripturePassageNotesForSearch: [Note] {
        if case .passage(let p) = scriptureDrill {
            return notesInActiveSpace.filter { $0.noteBelongsToScripturePassage(p) }
        }
        return []
    }

    private var universalSearchData: SidebarUniversalSearchIndex.SearchData {
        SidebarUniversalSearchIndex.SearchData(
            notes: notesInActiveSpace,
            folderRows: folderRows,
            highlightThreads: highlightThreadsForSearch,
            scriptureBookRows: scriptureBookRows,
            threadClusters: threadClusters,
            threadDrillNotes: threadDrillNotesForSearch,
            scripturePassageNotes: scripturePassageNotesForSearch
        )
    }

    private var universalSearchActiveContext: SidebarUniversalSearchIndex.ActiveContext {
        var ctx = SidebarUniversalSearchIndex.ActiveContext(
            mode: mapSidebarMode(mode),
            folderDrillLabel: nil,
            folderDrilledIn: false,
            threadDrillTitle: nil,
            threadDrilledIn: false,
            scriptureBookTitle: nil,
            scriptureBookIndex: nil,
            scripturePassageTitle: nil,
            scriptureDrillLevel: .root,
            highlightKindFilter: .all
        )

        switch mode {
        case .folders:
            if case .bucket(let key) = foldersDrill {
                ctx.folderDrilledIn = true
                ctx.folderDrillLabel = NoteFilter.folder(key).displayName
            }
        case .threads:
            if case .cluster(_, let title, _) = threadsDrill {
                ctx.threadDrilledIn = true
                ctx.threadDrillTitle = title
            }
        case .scripture:
            switch scriptureDrill {
            case .root:
                ctx.scriptureDrillLevel = .root
            case .book(let idx):
                ctx.scriptureDrillLevel = .book
                ctx.scriptureBookIndex = idx
                ctx.scriptureBookTitle = NoteFilter.scriptureBook(bookIndex: idx).displayName
            case .passage(let p):
                ctx.scriptureDrillLevel = .passage
                ctx.scriptureBookIndex = p.bookIndex
                ctx.scripturePassageTitle = NoteFilter.scripturePassage(p).displayName
            }
        default:
            break
        }

        return ctx
    }

    private func mapSidebarMode(_ mode: SidebarMode) -> SidebarUniversalSearchIndex.ActiveContext.SidebarPanelViewMode {
        switch mode {
        case .notes: return .notes
        case .folders: return .folders
        case .threads: return .threads
        case .scripture: return .scripture
        case .highlights: return .highlights
        }
    }

    private func activateUniversalSearchResult(_ result: SidebarSearchResult) {
        switch result.kind {
        case .note:
            if let id = result.noteId,
               let note = notesInActiveSpace.first(where: { $0.id == id }) {
                macSelectNoteWithoutListAnimation(note)
            }
        case .folder:
            mode = .folders
            foldersDrill = .bucket(result.folderLabel)
        case .threadCluster:
            if let repId = result.threadClusterRepresentativeId,
               let cluster = threadClusters.first(where: { $0.id == repId }) {
                mode = .threads
                threadsDrill = .cluster(
                    representativeId: cluster.id,
                    title: cluster.title,
                    memberIds: cluster.memberIds
                )
            }
        case .highlight:
            if let tid = result.highlightThreadId,
               let thread = studyThreads.first(where: { $0.id == tid }),
               let parent = thread.parentNote ?? notesInActiveSpace.first(where: { $0.id == thread.parentNoteId }) {
                macSelectNoteWithoutListAnimation(parent)
            }
        case .scriptureBook:
            if let idx = result.scriptureBookIndex {
                mode = .scripture
                scriptureDrill = .book(idx)
            }
        case .scripturePassage:
            if let passage = result.scripturePassage {
                mode = .scripture
                scriptureDrill = .passage(passage)
            }
        }
    }

    private var filteredFolderRows: [HarvousFolderRow] {
        HarvousFolderListIndex.filtered(
            rows: folderRows,
            query: folderListSearchText,
            notesForBucketMatching: notesInActiveSpace
        )
    }

    private var orderedFilteredFolderRows: [HarvousFolderRow] {
        HarvousFolderListIndex.applyPinOrdering(
            filteredFolderRows,
            pinnedIdsInOrder: pinnedFolderRowIds
        )
    }

    private var scriptureBookRows: [ScriptureBookRow] {
        ScriptureBookListIndex.rows(from: notesInActiveSpace)
    }

    private var filteredScriptureBookRows: [ScriptureBookRow] {
        ScriptureBookListIndex.filtered(
            rows: scriptureBookRows,
            query: folderListSearchText,
            notesForBucketMatching: notesInActiveSpace
        )
    }

    private var scriptureReferenceRowsForBookDrill: [ScriptureReferenceRow] {
        if case .book(let bookIdx) = scriptureDrill {
            return ScriptureBookListIndex.referenceRows(bookIndex: bookIdx, notesInActiveSpace: notesInActiveSpace)
        }
        return []
    }

    private var filteredScriptureReferenceRows: [ScriptureReferenceRow] {
        if case .book = scriptureDrill {
            return ScriptureBookListIndex.filteredReferenceRows(
                rows: scriptureReferenceRowsForBookDrill,
                query: folderListSearchText,
                notesForBucketMatching: notesInActiveSpace
            )
        }
        return []
    }

    private var scriptureSidebarBackButtonHelp: String {
        switch scriptureDrill {
        case .root: return ""
        case .book: return "Back to Scripture index"
        case .passage: return "Back to passages"
        }
    }

    private var scriptureDrillBookLabel: String? {
        switch scriptureDrill {
        case .root:
            return nil
        case .book(let idx):
            return NoteFilter.scriptureBook(bookIndex: idx).displayName
        case .passage(let p):
            return NoteFilter.scriptureBook(bookIndex: p.bookIndex).displayName
        }
    }

    private func scriptureSidebarBackAccessibilityLabel(bookLabel: String) -> String {
        switch scriptureDrill {
        case .root:
            return ""
        case .book:
            return "Back to Scripture index, currently viewing \(bookLabel)"
        case .passage(let p):
            let passageLabel = NoteFilter.scripturePassage(p).displayName
            return "Back to passages, currently viewing \(passageLabel)"
        }
    }

    private struct SidebarBackTarget {
        let label: String
        /// Short type word shown as a pill before the label (e.g. "Folder", "Thread").
        /// `nil` when the label already names the kind (e.g. dictionary).
        let kind: String?
        let help: String
        let accessibilityLabel: String
        let action: () -> Void
    }

    /// The drill-in "back" affordance for the current mode, or nil when at root.
    /// Consolidates the per-mode back conditions so the back row has one source of truth.
    private var sidebarBackTarget: SidebarBackTarget? {
        switch mode {
        case .folders:
            if case .bucket(let key) = foldersDrill {
                let name = NoteFilter.folder(key).displayName
                return SidebarBackTarget(
                    label: name,
                    kind: "Folder",
                    help: "Back to folders",
                    accessibilityLabel: "Back to folders, currently viewing \(name)"
                ) { foldersDrill = .root }
            }
        case .scripture:
            if let bookLabel = scriptureDrillBookLabel {
                // Drilled to a book → label is the book title; to a passage → the passage.
                let kind: String = { if case .passage = scriptureDrill { return "Passage" } else { return "Book" } }()
                return SidebarBackTarget(
                    label: bookLabel,
                    kind: kind,
                    help: scriptureSidebarBackButtonHelp,
                    accessibilityLabel: scriptureSidebarBackAccessibilityLabel(bookLabel: bookLabel)
                ) {
                    switch scriptureDrill {
                    case .root: break
                    case .book: scriptureDrill = .root
                    case .passage(let p): scriptureDrill = .book(p.bookIndex)
                    }
                }
            }
        case .threads:
            if case .cluster(_, let clusterTitle, _) = threadsDrill {
                return SidebarBackTarget(
                    label: clusterTitle,
                    kind: "Thread",
                    help: "Back to threads",
                    accessibilityLabel: "Back to threads, currently viewing \(clusterTitle)"
                ) { threadsDrill = .root }
            }
        default:
            break
        }
        return nil
    }

    /// Small muted pill naming the view type ("Folder", "Thread", …), shown before
    /// the back-row label so same-named folders and threads stay distinguishable.
    @ViewBuilder
    private func sidebarBackKindChip(_ kind: String) -> some View {
        Text(kind)
            .font(HarvousFonts.font(size: 11, weight: .medium, design: .default))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 6)
            .padding(.vertical, 1)
            .background(Color.secondary.opacity(0.12), in: Capsule())
    }

    /// Full-width back row shown above the search field when drilled in (both macOS and iOS).
    /// Lives in the body (not the title-bar toolbar) so its variable-width label has room to
    /// breathe and never truncates the way a width-capped toolbar button would.
    @ViewBuilder
    private var sidebarBackRow: some View {
        if let target = sidebarBackTarget {
            Button(action: target.action) {
                HStack(spacing: 5) {
                    HarvousFAGlyph(assetName: "Harvous.ChevronLeft", edgePt: 13)
                        .foregroundStyle(.secondary)
                    if let kind = target.kind {
                        sidebarBackKindChip(kind)
                    }
                    Text(target.label)
                        .font(HarvousFonts.font(size: 13, weight: .medium, design: .default))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help(target.help)
            .accessibilityLabel(target.accessibilityLabel)
            .padding(.horizontal, HarvousFeedListLayout.listRowHorizontalInset)
            // Uniform breathing room: 8pt above; below is 6 + the search field's own
            // top padding of 2, so the gap reads as 8pt on both sides of the row.
            .padding(.top, 8)
            .padding(.bottom, 6)
        }
    }

    private var sidebarSearchField: some View {
        HarvousSearchField(text: $folderListSearchText, placeholder: "Search", isFocused: $searchFieldFocused)
            .padding(.horizontal, HarvousFeedListLayout.listRowHorizontalInset)
            .padding(.top, 2)
            .padding(.bottom, 6)
            .background(
                Button("") { searchFieldFocused = true }
                    .keyboardShortcut("f", modifiers: .command)
                    .opacity(0)
            )
    }

    #if os(macOS)
    private var showSidebarToolbarChrome: Bool {
        guard splitColumnVisibility != .detailOnly else { return false }
        let w = sidebarColumnMeasuredWidth
        let threshold = SidebarToolbarLayout.narrowColumnToolbarSuppressBelow
        if w > 0, w < threshold {
            return false
        }
        return true
    }

    @ToolbarContentBuilder
    private var sidebarMacToolbarItems: some ToolbarContent {
        // `ToolbarSpacer` is ToolbarContent-only (not a View); sibling before the group pushes the chrome cluster toward the splitter.
        if splitColumnVisibility != .detailOnly {
            if #available(macOS 26.0, *) {
                ToolbarSpacer(.flexible)
            }
            ToolbarItemGroup(placement: .automatic) {
                sidebarMacToolbarClusterBar
            }
        }
    }

    /// One `ToolbarItemGroup` slot: SwiftUI separates siblings with wide gutters; nested `HStack` keeps bordered controls tight.
    /// The drill-in back affordance lives in the full-width `sidebarBackRow` (body), not here,
    /// so the toolbar always shows the standard chrome and never truncates a long label.
    private var sidebarMacToolbarClusterBar: some View {
        HStack(spacing: SidebarToolbarLayout.borderedIconClusterSpacing) {
            if showSidebarToolbarChrome {
                SpaceSwitcherView()
                modeMenu
            }
            sidebarHideSidebarToolbarButton
        }
    }

    private var sidebarHideSidebarToolbarButton: some View {
        Button {
            splitColumnVisibility = .detailOnly
        } label: {
            Label {
                Text("Hide sidebar")
            } icon: {
                HarvousFAGlyph(
                    assetName: "Harvous.LayoutSidebarLeft",
                    edgePt: HarvousFAIconMetrics.catalogGlyphBoxPt
                )
                .frame(
                    width: HarvousFAIconMetrics.catalogGlyphBoxPt,
                    height: HarvousFAIconMetrics.catalogGlyphBoxPt
                )
            }
        }
        .labelStyle(.iconOnly)
        .buttonStyle(.bordered)
        .help("Hide sidebar")
        .accessibilityLabel("Hide sidebar")
    }
    #endif

    #if os(iOS)
    @ToolbarContentBuilder
    private var sidebarIPadToolbarItems: some ToolbarContent {
        // Cluster all sidebar controls in one tight HStack — mirrors the Mac `sidebarMacToolbarClusterBar`.
        // Using ToolbarItemGroup + HStack avoids the wide inter-item gaps that separate ToolbarItems produce.
        // Explicitly pass isIPadSplitLayout into SpaceSwitcherView: toolbar items may not inherit env values
        // from the surrounding view hierarchy on iOS (UIKit hosts them separately).
        ToolbarItemGroup(placement: .topBarLeading) {
            HStack(spacing: 7) {
                SpaceSwitcherView()
                    .environment(\.harvousIsIPadSplitLayout, isIPadSplitLayout)

                modeMenu

                // iPad split layout: custom hide-sidebar glyph matching Mac's `sidebarHideSidebarToolbarButton`.
                if isIPadSplitLayout {
                    Button {
                        splitColumnVisibility = .detailOnly
                    } label: {
                        Label {
                            Text("Hide sidebar")
                        } icon: {
                            HarvousFAGlyph(
                                assetName: "Harvous.LayoutSidebarLeft",
                                edgePt: HarvousFAIconMetrics.catalogGlyphBoxPt
                            )
                            .frame(
                                width: HarvousFAIconMetrics.catalogGlyphBoxPt,
                                height: HarvousFAIconMetrics.catalogGlyphBoxPt
                            )
                            .foregroundStyle(.primary)
                        }
                    }
                    .labelStyle(.iconOnly)
                    .buttonStyle(.bordered)
                    .help("Hide sidebar")
                    .accessibilityLabel("Hide sidebar")
                }
            }
        }
    }
    #endif

    private func cycleSidebarMode(step: Int) {
        let modes = SidebarMode.allCases
        guard let idx = modes.firstIndex(of: mode) else { return }
        let next = (idx + step + modes.count) % modes.count
        mode = modes[next]
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                sidebarBackRow
                sidebarSearchField

                Group {
                    if isSidebarSearchActive {
                        SidebarUniversalSearchResultsView(
                            query: folderListSearchText,
                            activeContext: universalSearchActiveContext,
                            searchData: universalSearchData,
                            onSelect: activateUniversalSearchResult
                        )
                    } else if mode == .notes {
                        NoteListColumn(
                            filter: .all,
                            selectedNote: $selectedNote,
                            externalSearchText: unifiedSearchText,
                            columnStyle: .macOSSidebar,
                            ownsSidebarChrome: false
                        )
                    } else if mode == .highlights {
                        StudyHighlightListColumn(
                            selectedNote: $selectedNote,
                            externalSearchText: unifiedSearchText,
                            columnStyle: .macOSSidebar,
                            ownsSidebarChrome: false
                        )
                    } else if mode == .scripture {
                        switch scriptureDrill {
                        case .root:
                            scriptureBooksList
                        case .book:
                            scripturePassagesList
                        case .passage(let passage):
                            NoteListColumn(
                                filter: .scripturePassage(passage),
                                selectedNote: $selectedNote,
                                externalSearchText: unifiedSearchText,
                                columnStyle: .macOSSidebar,
                                ownsSidebarChrome: false
                            )
                        }
                    } else if mode == .threads {
                        switch threadsDrill {
                        case .root:
                            threadsClusterList
                        case .cluster(_, _, let memberIds):
                            NoteListColumn(
                                filter: .thread(memberIds: Set(memberIds)),
                                selectedNote: $selectedNote,
                                externalSearchText: unifiedSearchText,
                                columnStyle: .macOSSidebar,
                                ownsSidebarChrome: false
                            )
                        }
                    } else {
                        switch foldersDrill {
                        case .root:
                            foldersList
                        case .bucket(let folderBucketKey):
                            NoteListColumn(
                                filter: .folder(folderBucketKey),
                                selectedNote: $selectedNote,
                                externalSearchText: unifiedSearchText,
                                columnStyle: .macOSSidebar,
                                ownsSidebarChrome: false
                            )
                        }
                    }
                }
                // Give the list group priority so it fills the remaining space; on iPad the List
                // doesn't expand naturally, so .layoutPriority(1) is needed.
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .layoutPriority(1)
                // Daily passage pill *floats* over the bottom of the list (matching iOS + web).
                // Every sidebar list/scroll surface applies bottom scroll reserve so the last row
                // scrolls out from under the card rather than being hidden behind it.
                .overlay(alignment: .bottom) {
                    DailyPassagePill(onStudyNow: { note in macSelectNoteWithoutListAnimation(note) })
                        .padding(.horizontal, HarvousFeedListLayout.listRowHorizontalInset)
                        .padding(.bottom, 8)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.clear)
            // Suppress any automatic navigation title (prevents "Home" / space name appearing as bar title).
            #if os(iOS)
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            #endif
            // Suppress system sidebar toggle on both platforms; we supply our own custom glyph button.
            .toolbar(removing: .sidebarToggle)
            .background {
                #if os(macOS)
                // Width tracker
                GeometryReader { proxy in
                    Color.clear.preference(key: SidebarColumnWidthPreferenceKey.self, value: proxy.size.width)
                }
                // Unified sidebar chrome — canvas-tinted glass (see `HarvousSidebarColumnGlassBackdrop`).
                GeometryReader { proxy in
                    let lead: CGFloat = 1
                    let w = proxy.size.width
                    let h = proxy.size.height
                    HarvousSidebarColumnGlassBackdrop(shape: HarvousSidebarColumnGlassBackdropShape.macOSColumn())
                        .frame(width: max(0, w - lead), height: h)
                        .padding(.leading, lead)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                }
                .ignoresSafeArea()
                #else
                HarvousSidebarColumnGlassBackdrop(shape: Rectangle())
                    .ignoresSafeArea()
                #endif
            }
            .toolbar {
                #if os(macOS)
                sidebarMacToolbarItems
                #else
                sidebarIPadToolbarItems
                #endif
            }
            #if os(macOS)
            .onPreferenceChange(SidebarColumnWidthPreferenceKey.self) { width in
                sidebarColumnMeasuredWidth = width
                // Parent (`MacRootView`) only needs 1pt steps for compose toolbar `.id` — skip sub-pixel
                // ticks so `focusedSceneValue` is not republished multiple times per frame during drag.
                guard let reported = reportedSidebarColumnWidth else { return }
                let newIdentity = Int(width.rounded())
                let oldIdentity = Int(reported.wrappedValue.rounded())
                if newIdentity != oldIdentity {
                    reported.wrappedValue = width
                }
            }
            .onChange(of: splitColumnVisibility) { _, newVisibility in
                if newVisibility == .detailOnly {
                    sidebarColumnMeasuredWidth = 0
                    reportedSidebarColumnWidth?.wrappedValue = 0
                }
            }
            #endif
            .onReceive(NotificationCenter.default.publisher(for: .harvousCycleSidebarMode)) { notification in
                let step = notification.userInfo?["step"] as? Int ?? 1
                cycleSidebarMode(step: step)
            }
            .onChange(of: mode) { _, newMode in
                if newMode == .notes {
                    foldersDrill = .root
                    scriptureDrill = .root
                    threadsDrill = .root
                    folderListSearchText = ""
                    return
                }
                if newMode != .folders {
                    foldersDrill = .root
                }
                if newMode != .threads {
                    threadsDrill = .root
                }
                if newMode != .scripture {
                    scriptureDrill = .root
                }
            }
            .onChange(of: foldersDrill) { _, _ in
                folderDrillMemberCountPrev = nil
            }
            .onChange(of: activeFolderBucketMemberCount) { _, count in
                guard let count else {
                    folderDrillMemberCountPrev = nil
                    return
                }
                if let prev = folderDrillMemberCountPrev, prev > 0, count == 0 {
                    let bucketKey: String?
                    if case .bucket(let key) = foldersDrill {
                        bucketKey = key
                    } else {
                        bucketKey = nil
                    }
                    dismissEmptyFolderDrillIfNeeded(bucket: bucketKey)
                }
                folderDrillMemberCountPrev = count
            }
            .onAppear {
                reloadPinnedFolderOrder()
            }
            .onChange(of: spaceStore.selectedSpaceId) { _, _ in reloadPinnedFolderOrder() }
            .sheet(item: $renameTarget) { row in
                renameFolderSheet(for: row)
            }
            .confirmationDialog(
                "Remove folder?",
                isPresented: Binding(
                    get: { removeConfirmRow != nil },
                    set: { if !$0 { removeConfirmRow = nil } }
                ),
                titleVisibility: .visible
            ) {
                if let row = removeConfirmRow {
                    Button(
                        "Remove from \(row.count) note\(row.count == 1 ? "" : "s")",
                        role: .destructive
                    ) {
                        confirmRemoveFolder(row)
                    }
                    Button("Cancel", role: .cancel) {}
                }
            } message: {
                Text("Notes are kept; only the folder label is removed from them.")
            }
            .harvousListMenuTypography()
        }
        #if os(macOS)
        .toolbarBackground(.clear, for: .automatic)
        .modifier(HarvousSidebarTransparentWindowToolbar())
        #endif
    }

    private func reloadPinnedFolderOrder() {
        let sid = spaceStore.activeSpaceUUID()
        var ids = HarvousPinnedFoldersStore.loadOrderedIds(spaceId: sid)
        let beforeCount = ids.count
        ids.removeAll { $0 == HarvousFolderRow.ungroupedRowId }
        if ids.count != beforeCount {
            HarvousPinnedFoldersStore.saveOrderedIds(ids, spaceId: sid)
        }
        pinnedFolderRowIds = ids
    }

    private func toggleFolderListPin(rowId: String) {
        withAnimation {
            pinnedFolderRowIds = HarvousPinnedFoldersStore.togglePin(
                rowId: rowId,
                spaceId: spaceStore.activeSpaceUUID()
            )
        }
    }

    private func commitRename(from row: HarvousFolderRow) {
        guard let oldName = row.folderLabel else {
            renameTarget = nil
            return
        }
        let trimmed = renameDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != oldName else {
            renameTarget = nil
            return
        }
        let sid = spaceStore.activeSpaceUUID()
        HarvousFolderBulkActions.renameFolder(
            from: oldName,
            to: trimmed,
            notesInActiveSpace: notesInActiveSpace,
            modelContext: modelContext
        )
        HarvousPinnedFoldersStore.replacePinId(oldId: row.id, newId: trimmed, spaceId: sid)
        reloadPinnedFolderOrder()
        renameTarget = nil
    }

    private func confirmRemoveFolder(_ row: HarvousFolderRow) {
        guard let name = row.folderLabel else {
            removeConfirmRow = nil
            return
        }
        let sid = spaceStore.activeSpaceUUID()
        HarvousFolderBulkActions.removeFolder(
            named: name,
            notesInActiveSpace: notesInActiveSpace,
            modelContext: modelContext
        )
        HarvousPinnedFoldersStore.removePinId(row.id, spaceId: sid)
        reloadPinnedFolderOrder()
        removeConfirmRow = nil
    }

    private func dismissEmptyFolderDrillIfNeeded(bucket: String?) {
        foldersDrill = .root
        folderListSearchText = ""
        if let bucket {
            let sid = spaceStore.activeSpaceUUID()
            HarvousPinnedFoldersStore.removePinId(bucket, spaceId: sid)
            reloadPinnedFolderOrder()
        }
    }

    @ViewBuilder
    private func renameFolderSheet(for row: HarvousFolderRow) -> some View {
        NavigationStack {
            Form {
                TextField("Folder name", text: $renameDraft)
            }
            .formStyle(.grouped)
            .navigationTitle("Rename")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { renameTarget = nil }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        commitRename(from: row)
                    }
                    .disabled(renameDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .onAppear {
                renameDraft = row.folderLabel ?? ""
            }
        }
        #if os(macOS)
        .frame(minWidth: 360, minHeight: 200)
        #endif
    }

    @ViewBuilder
    private func folderRootGridCard(_ row: HarvousFolderRow) -> some View {
        let pinned = pinnedFolderRowIds.contains(row.id)
        let openBucket = Button {
            foldersDrill = .bucket(row.folderLabel)
        } label: {
            CollectionGridCard(
                iconAssetName: "Harvous.Folder",
                title: row.title,
                subtitle: "\(row.count) note\(row.count == 1 ? "" : "s")",
                isPinned: pinned
            )
        }
        .buttonStyle(.plain)

        // Grid cells can't host `swipeActions`; Pin / Rename / Remove stay in the context menu.
        if row.folderLabel != nil {
            openBucket
                .contextMenu {
                    Button {
                        toggleFolderListPin(rowId: row.id)
                    } label: {
                        Label {
                            Text(pinned ? "Unpin" : "Pin")
                        } icon: {
                            HarvousFAGlyph(
                                assetName: pinned ? "Harvous.ThumbtackSlash" : "Harvous.Thumbtack",
                                edgePt: HarvousFAIconMetrics.menuRowLeadingGlyphPt
                            )
                        }
                    }
                    Button {
                        renameDraft = row.folderLabel ?? ""
                        renameTarget = row
                    } label: {
                        Label {
                            Text("Rename…")
                        } icon: {
                            HarvousFAGlyph(assetName: "Harvous.Pencil", edgePt: HarvousFAIconMetrics.menuRowLeadingGlyphPt)
                        }
                    }
                    Button(role: .destructive) {
                        removeConfirmRow = row
                    } label: {
                        Label {
                            Text("Remove folder")
                        } icon: {
                            HarvousFAGlyph(assetName: "Harvous.Trash", edgePt: HarvousFAIconMetrics.menuRowLeadingGlyphPt)
                        }
                    }
                }
        } else {
            openBucket
        }
    }

    private var modeMenu: some View {
        Menu {
            ForEach(SidebarMode.allCases) { item in
                Button {
                    mode = item
                } label: {
                    HStack {
                        Label {
                            Text(item.title)
                                .font(HarvousTypography.settingsListRow)
                        } icon: {
                            HarvousFAGlyph(assetName: item.icon, edgePt: HarvousFAIconMetrics.compactMenuRowLeadingGlyphPt)
                        }
                        Spacer(minLength: 8)
                        if mode == item {
                            HarvousFAGlyph(assetName: "Harvous.Check", edgePt: HarvousFAIconMetrics.menuRowCheckGlyphPt)
                        }
                    }
                }
            }
        } label: {
            HarvousFAGlyph(assetName: mode.icon)
                .fixedSize(horizontal: true, vertical: true)
                .foregroundStyle(.primary)
        }
        .buttonStyle(.bordered)
        .menuIndicator(.hidden)
        .help("List: \(mode.title)")
    }

    private var scriptureBooksList: some View {
        Group {
            if scriptureBookRows.isEmpty {
                HarvousEmptyStateView(
                    iconAsset: "Harvous.BookOpen",
                    title: "No Scripture References",
                    description: "Add scripture references in your notes to build your index.",
                    scale: .compact
                )
            } else if filteredScriptureBookRows.isEmpty {
                HarvousEmptyStateView.searchNoMatch(title: SidebarNoMatchCopy.noScriptureMatch)
            } else {
                ScrollView {
                    LazyVGrid(columns: HarvousCollectionGridLayout.columns, spacing: HarvousCollectionGridLayout.spacing) {
                        ForEach(filteredScriptureBookRows) { row in
                            scriptureBookRootGridCard(row)
                        }
                    }
                    .padding(.horizontal, HarvousCollectionGridLayout.horizontalPadding)
                    .padding(.top, HarvousCollectionGridLayout.topPadding)
                    .harvousDailyPassagePillScrollContentBottomPadding()
                }
                .scrollContentBackground(.hidden)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    @ViewBuilder
    private func scriptureBookRootGridCard(_ row: ScriptureBookRow) -> some View {
        Button {
            scriptureDrill = .book(row.bookIndex)
        } label: {
            CollectionGridCard(
                iconAssetName: "Harvous.BookOpen",
                title: row.title,
                subtitle: row.bookListSubtitle
            )
        }
        .buttonStyle(.plain)
    }

    private var scripturePassagesList: some View {
        Group {
            if !folderListSearchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && filteredScriptureReferenceRows.isEmpty {
                HarvousEmptyStateView.searchNoMatch(title: SidebarNoMatchCopy.noScriptureMatch)
            } else if scriptureReferenceRowsForBookDrill.isEmpty {
                HarvousEmptyStateView(
                    iconAsset: "Harvous.BookOpen",
                    title: "No passages",
                    description: "No parsed references for this book in the active space.",
                    scale: .compact
                )
            } else {
                List {
                    ForEach(filteredScriptureReferenceRows) { row in
                        Button {
                            scriptureDrill = .passage(row.passage)
                        } label: {
                            FolderFeedRow(
                                title: row.title,
                                noteCount: row.noteCount,
                                isPinned: false,
                                variant: .sidebarCompact
                            )
                            .padding(.horizontal, HarvousFeedListLayout.sidebarRowContentHInset)
                            .padding(.vertical, HarvousFeedListLayout.sidebarRowContentVInset)
                        }
                        .buttonStyle(.plain)
                        .listRowInsets(
                            EdgeInsets(
                                top: HarvousFeedListLayout.sidebarListRowInsetVertical,
                                leading: 0,
                                bottom: HarvousFeedListLayout.sidebarListRowInsetVertical,
                                trailing: 0
                            )
                        )
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .harvousListDailyPassagePillScrollReserve()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private var foldersList: some View {
        Group {
            if folderRows.isEmpty {
                HarvousEmptyStateView(
                    iconAsset: "Harvous.Folder",
                    title: "No Folders",
                    description: "Folders created from your notes will appear here.",
                    scale: .compact
                )
            } else if orderedFilteredFolderRows.isEmpty {
                HarvousEmptyStateView.searchNoMatch(title: SidebarNoMatchCopy.noFoldersMatch)
            } else {
                ScrollView {
                    LazyVGrid(columns: HarvousCollectionGridLayout.columns, spacing: HarvousCollectionGridLayout.spacing) {
                        ForEach(orderedFilteredFolderRows) { row in
                            folderRootGridCard(row)
                        }
                    }
                    .padding(.horizontal, HarvousCollectionGridLayout.horizontalPadding)
                    .padding(.top, HarvousCollectionGridLayout.topPadding)
                    .harvousDailyPassagePillScrollContentBottomPadding()
                }
                .scrollContentBackground(.hidden)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    // MARK: - Threads views

    private var threadsClusterList: some View {
        Group {
            if threadClusters.isEmpty {
                HarvousEmptyStateView(
                    iconAsset: "Harvous.ArrowRightArrowLeft",
                    title: "No Threads",
                    description: "Connect notes together to create threads.",
                    scale: .compact
                )
            } else if filteredThreadClusters.isEmpty {
                HarvousEmptyStateView.searchNoMatch(title: SidebarNoMatchCopy.noThreadsMatch)
            } else {
                ScrollView {
                    LazyVGrid(columns: HarvousCollectionGridLayout.columns, spacing: HarvousCollectionGridLayout.spacing) {
                        ForEach(filteredThreadClusters) { cluster in
                            Button {
                                threadsDrill = .cluster(
                                    representativeId: cluster.id,
                                    title: cluster.title,
                                    memberIds: cluster.memberIds
                                )
                            } label: {
                                CollectionGridCard(
                                    iconAssetName: "Harvous.ArrowRightArrowLeft",
                                    title: cluster.title,
                                    subtitle: "\(cluster.noteCount) note\(cluster.noteCount == 1 ? "" : "s")"
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, HarvousCollectionGridLayout.horizontalPadding)
                    .padding(.top, HarvousCollectionGridLayout.topPadding)
                    .harvousDailyPassagePillScrollContentBottomPadding()
                }
                .scrollContentBackground(.hidden)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private func macSelectNoteWithoutListAnimation(_ note: Note) {
        var txn = Transaction()
        txn.disablesAnimations = true
        withTransaction(txn) {
            selectedNote = note
        }
    }
}

#Preview {
    NavigationSplitView {
        SidebarPanelView(selectedNote: .constant(nil), splitColumnVisibility: .constant(.all), onCreateNewNote: nil)
    } detail: {
        Text("Editor")
    }
    .environmentObject(SpaceStore())
    .environmentObject(HarvousAppRouter())
    #if os(macOS)
    .environmentObject(MacNoteListSelectionCoordinator())
    #endif
    .modelContainer(for: [Note.self, StudyThread.self, Space.self, SpaceMember.self, SpaceInvite.self, SpaceJoinLink.self], inMemory: true)
    #if os(macOS)
    .frame(width: 700, height: 500)
    #endif
}
