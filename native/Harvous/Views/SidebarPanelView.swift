import SwiftUI
import SwiftData

#if os(macOS)

private enum SidebarToolbarLayout {
    /// Omit SwiftUI sidebar `toolbar` while measured width is in `(0 ..< this)` during split resize. When width is still `0`, chrome stays visible so expanding from `detailOnly` never blanks the space switcher.
    static let narrowColumnToolbarSuppressBelow: CGFloat = 210
}

private struct SidebarColumnWidthPreferenceKey: PreferenceKey {
    nonisolated static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

/// Sidebar — note list with a notes/collections toggle. Collapsible via ⌘\.
struct SidebarPanelView: View {
    private enum SidebarMode: String, CaseIterable, Identifiable {
        case notes
        case collections
        case highlights
        case scripture

        var id: String { rawValue }
        var title: String {
            switch self {
            case .notes: return "Notes"
            case .collections: return "Collections"
            case .highlights: return "Highlights"
            case .scripture: return "Scripture"
            }
        }

        var icon: String {
            switch self {
            case .notes: return "note.text"
            case .collections: return "rectangle.stack.fill"
            case .highlights: return "highlighter"
            case .scripture: return "book.closed.fill"
            }
        }
    }

    private enum CollectionsDrill: Equatable {
        case root
        /// `nil` means notes with no primary collection (matches `HarvousCollectionRow.collection`).
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
    @Query(sort: \Note.updatedAt, order: .reverse) private var notes: [Note]
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var spaceStore: SpaceStore
    @State private var mode: SidebarMode = .notes
    @State private var collectionsDrill: CollectionsDrill = .root
    @State private var scriptureDrill: ScriptureDrill = .root
    @State private var collectionSearchText = ""
    @State private var sidebarColumnMeasuredWidth: CGFloat = 0
    @State private var pinnedCollectionRowIds: [String] = []
    @State private var renameTarget: HarvousCollectionRow?
    @State private var renameDraft: String = ""
    @State private var removeConfirmRow: HarvousCollectionRow?

    @AppStorage(VotdService.passageCardDismissedDayUserDefaultsKey) private var votdPassageCardDismissedDay: String = ""

    private var unifiedSearchText: Binding<String> {
        Binding(
            get: { collectionSearchText },
            set: { collectionSearchText = $0 }
        )
    }

    private var notesInActiveSpace: [Note] {
        let sid = spaceStore.activeSpaceUUID()
        let scoped = notes.filter { $0.resolvedSpaceId() == sid }
        if scoped.isEmpty, !notes.isEmpty {
            return notes
        }
        return scoped
    }

    private var collectionRows: [HarvousCollectionRow] {
        HarvousCollectionListIndex.rows(from: notesInActiveSpace)
    }

    private var filteredCollectionRows: [HarvousCollectionRow] {
        HarvousCollectionListIndex.filtered(
            rows: collectionRows,
            query: collectionSearchText,
            notesForBucketMatching: notesInActiveSpace
        )
    }

    private var orderedFilteredCollectionRows: [HarvousCollectionRow] {
        HarvousCollectionListIndex.applyPinOrdering(
            filteredCollectionRows,
            pinnedIdsInOrder: pinnedCollectionRowIds
        )
    }

    private var scriptureBookRows: [ScriptureBookRow] {
        ScriptureBookListIndex.rows(from: notesInActiveSpace)
    }

    private var filteredScriptureBookRows: [ScriptureBookRow] {
        ScriptureBookListIndex.filtered(
            rows: scriptureBookRows,
            query: collectionSearchText,
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
                query: collectionSearchText,
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

    /// Match highlights list: hide VOTD while searching; respect dismiss for the day.
    private var showDailyPassageRow: Bool {
        collectionSearchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && votdPassageCardDismissedDay != VotdService.todayCalendarDayKey()
    }

    private var showSidebarToolbarChrome: Bool {
        guard splitColumnVisibility != .detailOnly else { return false }
        let w = sidebarColumnMeasuredWidth
        let threshold = SidebarToolbarLayout.narrowColumnToolbarSuppressBelow
        if w > 0, w < threshold {
            return false
        }
        return true
    }

    var body: some View {
        NavigationStack {
            Group {
                if mode == .notes {
                    NoteListColumn(filter: .all, selectedNote: $selectedNote, externalSearchText: unifiedSearchText)
                } else if mode == .highlights {
                    StudyHighlightListColumn(
                        selectedNote: $selectedNote,
                        externalSearchText: unifiedSearchText,
                        columnStyle: .macOSSidebar
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
                            externalSearchText: unifiedSearchText
                        )
                    }
                } else {
                    switch collectionsDrill {
                    case .root:
                        collectionsList
                    case .bucket(let collectionName):
                        NoteListColumn(filter: .collection(collectionName), selectedNote: $selectedNote, externalSearchText: unifiedSearchText)
                    }
                }
            }
            .searchable(text: $collectionSearchText, placement: .sidebar, prompt: "Search")
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(
                GeometryReader { proxy in
                    Color.clear.preference(key: SidebarColumnWidthPreferenceKey.self, value: proxy.size.width)
                }
            )
            .toolbar {
                if showSidebarToolbarChrome {
                    ToolbarItemGroup(placement: .automatic) {
                        SpaceSwitcherView()
                        if mode == .collections, collectionsDrill != .root {
                            Button {
                                collectionsDrill = .root
                            } label: {
                                Image(systemName: "chevron.left")
                            }
                            .buttonStyle(.bordered)
                            .help("Back to collections")
                        }
                        if mode == .scripture, scriptureDrill != .root {
                            Button {
                                switch scriptureDrill {
                                case .root: break
                                case .book:
                                    scriptureDrill = .root
                                case .passage(let p):
                                    scriptureDrill = .book(p.bookIndex)
                                }
                            } label: {
                                Image(systemName: "chevron.left")
                            }
                            .buttonStyle(.bordered)
                            .help(scriptureSidebarBackButtonHelp)
                        }
                        modeMenu
                    }
                }
            }
            .onPreferenceChange(SidebarColumnWidthPreferenceKey.self) { sidebarColumnMeasuredWidth = $0 }
            .onChange(of: splitColumnVisibility) { _, newVisibility in
                if newVisibility == .detailOnly {
                    sidebarColumnMeasuredWidth = 0
                }
            }
            .onChange(of: mode) { _, newMode in
                if newMode == .notes {
                    collectionsDrill = .root
                    scriptureDrill = .root
                    collectionSearchText = ""
                    return
                }
                if newMode != .collections {
                    collectionsDrill = .root
                }
                if newMode != .scripture {
                    scriptureDrill = .root
                }
            }
            .onAppear { reloadPinnedCollectionOrder() }
            .onChange(of: spaceStore.selectedSpaceId) { _, _ in reloadPinnedCollectionOrder() }
            .sheet(item: $renameTarget) { row in
                renameCollectionSheet(for: row)
            }
            .confirmationDialog(
                "Remove collection?",
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
                        confirmRemoveCollection(row)
                    }
                    Button("Cancel", role: .cancel) {}
                }
            } message: {
                Text("Notes are kept; only the collection label is removed from them.")
            }
        }
        .toolbarBackground(.clear, for: .automatic)
        .modifier(HarvousSidebarTransparentWindowToolbar())
    }

    private func reloadPinnedCollectionOrder() {
        let sid = spaceStore.activeSpaceUUID()
        var ids = HarvousPinnedCollectionsStore.loadOrderedIds(spaceId: sid)
        let beforeCount = ids.count
        ids.removeAll { $0 == HarvousCollectionRow.ungroupedRowId }
        if ids.count != beforeCount {
            HarvousPinnedCollectionsStore.saveOrderedIds(ids, spaceId: sid)
        }
        pinnedCollectionRowIds = ids
    }

    private func toggleCollectionListPin(rowId: String) {
        withAnimation {
            pinnedCollectionRowIds = HarvousPinnedCollectionsStore.togglePin(
                rowId: rowId,
                spaceId: spaceStore.activeSpaceUUID()
            )
        }
    }

    private func commitRename(from row: HarvousCollectionRow) {
        guard let oldName = row.collection else {
            renameTarget = nil
            return
        }
        let trimmed = renameDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != oldName else {
            renameTarget = nil
            return
        }
        let sid = spaceStore.activeSpaceUUID()
        HarvousCollectionBulkActions.renameCollection(
            from: oldName,
            to: trimmed,
            notesInActiveSpace: notesInActiveSpace,
            modelContext: modelContext
        )
        HarvousPinnedCollectionsStore.replacePinId(oldId: row.id, newId: trimmed, spaceId: sid)
        reloadPinnedCollectionOrder()
        renameTarget = nil
    }

    private func confirmRemoveCollection(_ row: HarvousCollectionRow) {
        guard let name = row.collection else {
            removeConfirmRow = nil
            return
        }
        let sid = spaceStore.activeSpaceUUID()
        HarvousCollectionBulkActions.removeCollection(
            named: name,
            notesInActiveSpace: notesInActiveSpace,
            modelContext: modelContext
        )
        HarvousPinnedCollectionsStore.removePinId(row.id, spaceId: sid)
        reloadPinnedCollectionOrder()
        removeConfirmRow = nil
    }

    @ViewBuilder
    private func renameCollectionSheet(for row: HarvousCollectionRow) -> some View {
        NavigationStack {
            Form {
                TextField("Collection name", text: $renameDraft)
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
                renameDraft = row.collection ?? ""
            }
        }
        .frame(minWidth: 360, minHeight: 200)
    }

    @ViewBuilder
    private func collectionRootListRow(_ row: HarvousCollectionRow) -> some View {
        let pinned = pinnedCollectionRowIds.contains(row.id)
        let openBucket = Button {
            collectionsDrill = .bucket(row.collection)
        } label: {
            CollectionFeedRow(
                title: row.title,
                noteCount: row.count,
                isPinned: pinned,
                variant: .sidebarCompact
            )
            .padding(.horizontal, 10)
            .padding(.vertical, 2)
        }
        .buttonStyle(.plain)

        if row.collection != nil {
            openBucket
                .contextMenu {
                    Button {
                        toggleCollectionListPin(rowId: row.id)
                    } label: {
                        Label(pinned ? "Unpin" : "Pin", systemImage: pinned ? "pin.slash" : "pin")
                    }
                    Button {
                        renameDraft = row.collection ?? ""
                        renameTarget = row
                    } label: {
                        Label("Rename…", systemImage: "pencil")
                    }
                    Button(role: .destructive) {
                        removeConfirmRow = row
                    } label: {
                        Label("Remove collection", systemImage: "trash")
                    }
                }
                .swipeActions(edge: .leading, allowsFullSwipe: true) {
                    Button {
                        toggleCollectionListPin(rowId: row.id)
                    } label: {
                        Label(pinned ? "Unpin" : "Pin", systemImage: pinned ? "pin.slash.fill" : "pin.fill")
                    }
                    .tint(.orange)
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    Button(role: .destructive) {
                        removeConfirmRow = row
                    } label: {
                        Label("Remove", systemImage: "trash")
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
                        Label(item.title, systemImage: item.icon)
                        Spacer(minLength: 8)
                        if mode == item {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            Image(systemName: mode.icon)
        }
        .buttonStyle(.bordered)
        .menuIndicator(.hidden)
        .help("List: \(mode.title)")
    }

    private var scriptureBooksList: some View {
        Group {
            if !showDailyPassageRow && scriptureBookRows.isEmpty {
                ContentUnavailableView {
                    Label("No Scripture References", systemImage: "book.closed")
                } description: {
                    Text("Add scripture references in your notes to build your index.")
                }
            } else if !showDailyPassageRow && filteredScriptureBookRows.isEmpty {
                ContentUnavailableView.search(text: collectionSearchText)
            } else {
                List {
                    if showDailyPassageRow {
                        DailyPassageCard { note in
                            macSelectNoteWithoutListAnimation(note)
                        }
                        .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 4, trailing: 0))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button {
                                votdPassageCardDismissedDay = VotdService.todayCalendarDayKey()
                            } label: {
                                Label("Dismiss", systemImage: "xmark.circle.fill")
                            }
                            .tint(.secondary)
                            .accessibilityLabel("Dismiss today's passage")
                        }
                    }
                    ForEach(filteredScriptureBookRows) { row in
                        scriptureBookRootListRow(row)
                            .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
    }

    @ViewBuilder
    private func scriptureBookRootListRow(_ row: ScriptureBookRow) -> some View {
        Button {
            scriptureDrill = .book(row.bookIndex)
        } label: {
            CollectionFeedRow(
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
            if !collectionSearchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && filteredScriptureReferenceRows.isEmpty {
                ContentUnavailableView.search(text: collectionSearchText)
            } else if scriptureReferenceRowsForBookDrill.isEmpty {
                ContentUnavailableView {
                    Label("No passages", systemImage: "text.book.closed")
                } description: {
                    Text("No parsed references for this book in the active space.")
                }
            } else {
                List {
                    ForEach(filteredScriptureReferenceRows) { row in
                        Button {
                            scriptureDrill = .passage(row.passage)
                        } label: {
                            CollectionFeedRow(
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
            }
        }
    }

    private var collectionsList: some View {
        Group {
            if !showDailyPassageRow && collectionRows.isEmpty {
                ContentUnavailableView {
                    Label("No Collections", systemImage: "rectangle.stack.fill")
                } description: {
                    Text("Collections created from your notes will appear here.")
                }
            } else if !showDailyPassageRow && orderedFilteredCollectionRows.isEmpty {
                ContentUnavailableView.search(text: collectionSearchText)
            } else {
                List {
                    if showDailyPassageRow {
                        DailyPassageCard { note in
                            macSelectNoteWithoutListAnimation(note)
                        }
                        .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 4, trailing: 0))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button {
                                votdPassageCardDismissedDay = VotdService.todayCalendarDayKey()
                            } label: {
                                Label("Dismiss", systemImage: "xmark.circle.fill")
                            }
                            .tint(.secondary)
                            .accessibilityLabel("Dismiss today's passage")
                        }
                    }
                    ForEach(orderedFilteredCollectionRows) { row in
                        collectionRootListRow(row)
                            .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
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
    .environmentObject(MacNoteListSelectionCoordinator())
    .modelContainer(for: [Note.self, StudyThread.self, Space.self, SpaceMember.self, SpaceInvite.self, SpaceJoinLink.self], inMemory: true)
    .frame(width: 700, height: 500)
}

#endif
