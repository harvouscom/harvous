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
        case dictionary

        var id: String { rawValue }
        var title: String {
            switch self {
            case .notes: return "Notes"
            case .folders: return "Folders"
            case .threads: return "Threads"
            case .highlights: return "Highlights"
            case .scripture: return "Scripture"
            case .dictionary: return "Dictionary"
            }
        }

        var icon: String {
            switch self {
            case .notes: return "Harvous.Note"
            case .folders: return "Harvous.Folder"
            case .threads: return "Harvous.ArrowRightArrowLeft"
            case .highlights: return "Harvous.Highlight"
            case .scripture: return "Harvous.BookOpen"
            case .dictionary: return "Harvous.LinesLeaning"
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

    private enum DictionaryDrill: Equatable {
        case root
        case entry(String) // slug
    }

    @Binding var selectedNote: Note?
    @Binding var splitColumnVisibility: NavigationSplitViewVisibility
    var onCreateNewNote: (() -> Void)?
    @Query(sort: \Note.updatedAt, order: .reverse) private var notes: [Note]
    @Environment(\.modelContext) private var modelContext
    @Environment(\.harvousIsIPadSplitLayout) private var isIPadSplitLayout
    @EnvironmentObject private var spaceStore: SpaceStore
    @State private var mode: SidebarMode = .notes
    @State private var foldersDrill: FoldersDrill = .root
    @State private var threadsDrill: ThreadsDrill = .root
    @State private var scriptureDrill: ScriptureDrill = .root
    @State private var dictionaryDrill: DictionaryDrill = .root
    @State private var folderListSearchText = ""
    @State private var pinnedFolderRowIds: [String] = []
    @State private var renameTarget: HarvousFolderRow?
    @State private var renameDraft: String = ""
    @State private var removeConfirmRow: HarvousFolderRow?
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

    private var threadClusters: [ThreadStore.NoteCluster] {
        ThreadStore.connectedClusters(from: notesInActiveSpace, modelContext: modelContext)
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

    private var sidebarSearchField: some View {
        HStack(spacing: 8) {
            HarvousFAGlyph(assetName: "Harvous.MagnifyingGlass", edgePt: 14)
                .foregroundStyle(.secondary)
            TextField("Search", text: $folderListSearchText)
                .textFieldStyle(.plain)
                .font(HarvousFonts.font(size: 15, weight: .regular, design: .default))
                .focused($searchFieldFocused)
            if !folderListSearchText.isEmpty {
                Button {
                    folderListSearchText = ""
                    searchFieldFocused = false
                } label: {
                    HarvousFAGlyph(assetName: "Harvous.CircleXmark", edgePt: 15)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.primary.opacity(0.07))
        )
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
    private var sidebarMacToolbarClusterBar: some View {
        HStack(spacing: SidebarToolbarLayout.borderedIconClusterSpacing) {
            if showSidebarToolbarChrome {
                SpaceSwitcherView()
                if mode == .folders, case .bucket(let key) = foldersDrill {
                    Button {
                        foldersDrill = .root
                    } label: {
                        HStack(spacing: 5) {
                            HarvousFAGlyph(assetName: "Harvous.ChevronLeft", edgePt: 13)
                            Text(NoteFilter.folder(key).displayName)
                                .font(HarvousFonts.font(size: 12, weight: .medium, design: .default))
                                .lineLimit(1)
                                .fixedSize(horizontal: true, vertical: false)
                        }
                    }
                    .buttonStyle(.bordered)
                    .help("Back to folders")
                    .accessibilityLabel("Back to folders, currently viewing \(NoteFilter.folder(key).displayName)")
                }
                if mode == .scripture, let bookLabel = scriptureDrillBookLabel {
                    Button {
                        switch scriptureDrill {
                        case .root: break
                        case .book:
                            scriptureDrill = .root
                        case .passage(let p):
                            scriptureDrill = .book(p.bookIndex)
                        }
                    } label: {
                        HStack(spacing: 5) {
                            HarvousFAGlyph(assetName: "Harvous.ChevronLeft", edgePt: 13)
                            Text(bookLabel)
                                .font(HarvousFonts.font(size: 12, weight: .medium, design: .default))
                                .lineLimit(1)
                                .fixedSize(horizontal: true, vertical: false)
                        }
                    }
                    .buttonStyle(.bordered)
                    .help(scriptureSidebarBackButtonHelp)
                    .accessibilityLabel(scriptureSidebarBackAccessibilityLabel(bookLabel: bookLabel))
                }
                if mode == .threads, case .cluster(_, let clusterTitle, _) = threadsDrill {
                    Button {
                        threadsDrill = .root
                    } label: {
                        HStack(spacing: 5) {
                            HarvousFAGlyph(assetName: "Harvous.ChevronLeft", edgePt: 13)
                            Text(clusterTitle)
                                .font(HarvousFonts.font(size: 12, weight: .medium, design: .default))
                                .lineLimit(1)
                                .fixedSize(horizontal: true, vertical: false)
                        }
                    }
                    .buttonStyle(.bordered)
                    .help("Back to threads")
                    .accessibilityLabel("Back to threads, currently viewing \(clusterTitle)")
                }
                if mode == .dictionary, dictionaryDrill != .root {
                    Button {
                        dictionaryDrill = .root
                    } label: {
                        HarvousFAGlyph(assetName: "Harvous.ChevronLeft", edgePt: 13)
                    }
                    .buttonStyle(.bordered)
                    .help("Back to dictionary")
                }
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

                if mode == .folders, case .bucket(let key) = foldersDrill {
                    Button { foldersDrill = .root } label: {
                        HStack(spacing: 5) {
                            HarvousFAGlyph(assetName: "Harvous.ChevronLeft", edgePt: 13)
                                .foregroundStyle(.primary)
                            Text(NoteFilter.folder(key).displayName)
                                .font(HarvousFonts.font(size: 14, weight: .medium, design: .default))
                                .lineLimit(1)
                        }
                    }
                    .buttonStyle(.bordered)
                    .accessibilityLabel("Back to folders, currently viewing \(NoteFilter.folder(key).displayName)")
                }

                if mode == .scripture, let bookLabel = scriptureDrillBookLabel {
                    Button {
                        switch scriptureDrill {
                        case .root: break
                        case .book: scriptureDrill = .root
                        case .passage(let p): scriptureDrill = .book(p.bookIndex)
                        }
                    } label: {
                        HStack(spacing: 5) {
                            HarvousFAGlyph(assetName: "Harvous.ChevronLeft", edgePt: 13)
                                .foregroundStyle(.primary)
                            Text(bookLabel)
                                .font(HarvousFonts.font(size: 14, weight: .medium, design: .default))
                                .lineLimit(1)
                        }
                    }
                    .buttonStyle(.bordered)
                    .accessibilityLabel(scriptureSidebarBackAccessibilityLabel(bookLabel: bookLabel))
                }

                if mode == .threads, case .cluster(_, let clusterTitle, _) = threadsDrill {
                    Button { threadsDrill = .root } label: {
                        HStack(spacing: 5) {
                            HarvousFAGlyph(assetName: "Harvous.ChevronLeft", edgePt: 13)
                                .foregroundStyle(.primary)
                            Text(clusterTitle)
                                .font(HarvousFonts.font(size: 14, weight: .medium, design: .default))
                                .lineLimit(1)
                        }
                    }
                    .buttonStyle(.bordered)
                    .accessibilityLabel("Back to threads, currently viewing \(clusterTitle)")
                }

                if mode == .dictionary, dictionaryDrill != .root {
                    Button { dictionaryDrill = .root } label: {
                        HarvousFAGlyph(assetName: "Harvous.ChevronLeft", edgePt: 13)
                            .foregroundStyle(.primary)
                    }
                    .buttonStyle(.bordered)
                    .accessibilityLabel("Back to dictionary")
                }

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
                sidebarSearchField

                Group {
                    if mode == .notes {
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
                    } else if mode == .dictionary {
                        switch dictionaryDrill {
                        case .root:
                            EastonsDictionaryListColumn(
                                externalSearchText: unifiedSearchText,
                                onSelectEntry: { slug in dictionaryDrill = .entry(slug) }
                            )
                        case .entry(let slug):
                            EastonsEntryDetailView(initialSlug: slug)
                        }
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
                            threadsMemberNoteList(memberIds: memberIds)
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
                // Give the list group priority so it fills remaining space before the Spacer;
                // on iPad the List doesn't expand naturally, so .layoutPriority(1) is needed.
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .layoutPriority(1)

                Spacer(minLength: 0)

                // Daily passage pill — pinned at the column bottom via Spacer above.
                DailyPassagePill(onStudyNow: { note in macSelectNoteWithoutListAnimation(note) })
                    .padding(.horizontal, HarvousFeedListLayout.listRowHorizontalInset)
                    .padding(.bottom, 8)
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
            .onPreferenceChange(SidebarColumnWidthPreferenceKey.self) { sidebarColumnMeasuredWidth = $0 }
            .onChange(of: splitColumnVisibility) { _, newVisibility in
                if newVisibility == .detailOnly {
                    sidebarColumnMeasuredWidth = 0
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
                if newMode != .dictionary {
                    dictionaryDrill = .root
                } else {
                    folderListSearchText = ""
                }
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
    private func folderRootListRow(_ row: HarvousFolderRow) -> some View {
        let pinned = pinnedFolderRowIds.contains(row.id)
        let openBucket = Button {
            foldersDrill = .bucket(row.folderLabel)
        } label: {
            FolderFeedRow(
                title: row.title,
                noteCount: row.count,
                isPinned: pinned,
                variant: .sidebarCompact
            )
            .padding(.horizontal, 10)
            .padding(.vertical, 2)
        }
        .buttonStyle(.plain)

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
                .swipeActions(edge: .leading, allowsFullSwipe: true) {
                    Button {
                        toggleFolderListPin(rowId: row.id)
                    } label: {
                        Label {
                            Text(pinned ? "Unpin" : "Pin")
                        } icon: {
                            HarvousFAGlyph(
                                assetName: pinned ? "Harvous.ThumbtackSlash" : "Harvous.Thumbtack",
                                edgePt: 14
                            )
                        }
                    }
                    .tint(.orange)
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    Button(role: .destructive) {
                        removeConfirmRow = row
                    } label: {
                        Label {
                            Text("Remove")
                        } icon: {
                            HarvousFAGlyph(assetName: "Harvous.Trash", edgePt: 14)
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
                ContentUnavailableView.search(text: folderListSearchText)
            } else {
                List {
                    ForEach(filteredScriptureBookRows) { row in
                        scriptureBookRootListRow(row)
                            .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                #if os(macOS)
                .harvousListDailyPassagePillScrollReserve()
                #endif
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    @ViewBuilder
    private func scriptureBookRootListRow(_ row: ScriptureBookRow) -> some View {
        Button {
            scriptureDrill = .book(row.bookIndex)
        } label: {
            FolderFeedRow(
                title: row.title,
                noteCount: row.noteCount,
                isPinned: false,
                customSubtitle: row.bookListSubtitle,
                variant: .sidebarCompact
            )
            .padding(.horizontal, 10)
            .padding(.vertical, 2)
        }
        .buttonStyle(.plain)
    }

    private var scripturePassagesList: some View {
        Group {
            if !folderListSearchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && filteredScriptureReferenceRows.isEmpty {
                ContentUnavailableView.search(text: folderListSearchText)
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
                            .padding(.horizontal, 10)
                            .padding(.vertical, 2)
                        }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                #if os(macOS)
                .harvousListDailyPassagePillScrollReserve()
                #endif
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
                ContentUnavailableView.search(text: folderListSearchText)
            } else {
                List {
                    ForEach(orderedFilteredFolderRows) { row in
                        folderRootListRow(row)
                            .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                #if os(macOS)
                .harvousListDailyPassagePillScrollReserve()
                #endif
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    // MARK: - Threads views

    private var threadsClusterList: some View {
        Group {
            let clusters = threadClusters
            if clusters.isEmpty {
                HarvousEmptyStateView(
                    iconAsset: "Harvous.ArrowRightArrowLeft",
                    title: "No Threads",
                    description: "Connect notes together to create threads.",
                    scale: .compact
                )
            } else {
                List {
                    ForEach(clusters) { cluster in
                        Button {
                            threadsDrill = .cluster(
                                representativeId: cluster.id,
                                title: cluster.title,
                                memberIds: cluster.memberIds
                            )
                        } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(cluster.title)
                                    .font(HarvousTypography.noteListTitle)
                                    .foregroundStyle(.primary)
                                    .lineLimit(1)
                                Text("\(cluster.noteCount) \(cluster.noteCount == 1 ? "note" : "notes")")
                                    .font(HarvousTypography.noteListPreview)
                                    .foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top: 6, leading: HarvousFeedListLayout.listRowHorizontalInset, bottom: 6, trailing: HarvousFeedListLayout.listRowHorizontalInset))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                #if os(macOS)
                .harvousListDailyPassagePillScrollReserve()
                #endif
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private func threadsMemberNoteList(memberIds: [UUID]) -> some View {
        let noteById = Dictionary(uniqueKeysWithValues: notesInActiveSpace.map { ($0.id, $0) })
        let members = memberIds.compactMap { noteById[$0] }
        return Group {
            if members.isEmpty {
                HarvousEmptyStateView(
                    iconAsset: "Harvous.Note",
                    title: "No Notes",
                    description: "Notes in this thread will appear here.",
                    scale: .compact
                )
            } else {
                List {
                    ForEach(members) { note in
                        Button {
                            selectedNote = note
                        } label: {
                            Text(note.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                 ? "Untitled"
                                 : note.title)
                                .font(HarvousTypography.noteListTitle)
                                .foregroundStyle(.primary)
                                .lineLimit(2)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top: 6, leading: HarvousFeedListLayout.listRowHorizontalInset, bottom: 6, trailing: HarvousFeedListLayout.listRowHorizontalInset))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                #if os(macOS)
                .harvousListDailyPassagePillScrollReserve()
                #endif
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
