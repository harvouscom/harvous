import SwiftUI
import SwiftData

#if os(iOS)
import UIKit

/// iPhone collections: flat Mac-style list, drill-in to `NoteListColumn`, search from bottom chrome only.
struct LibraryView: View {
    @Binding var iosNoteNavigationPath: [UUID]
    var externalSearchText: Binding<String>? = nil
    @State private var fallbackSearchText = ""
    @State private var collectionsDrill: CollectionsDrill = .root

    @Query(sort: \Note.updatedAt, order: .reverse) private var notes: [Note]
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var spaceStore: SpaceStore
    @EnvironmentObject private var appRouter: HarvousAppRouter

    @AppStorage(VotdService.passageCardDismissedDayUserDefaultsKey) private var votdPassageCardDismissedDay: String = ""

    @State private var pinnedCollectionRowIds: [String] = []
    @State private var renameTarget: HarvousCollectionRow?
    @State private var renameDraft: String = ""
    @State private var removeConfirmRow: HarvousCollectionRow?

    private enum CollectionsDrill: Equatable {
        case root
        /// `nil` means notes with no primary collection (same as macOS bucket key).
        case bucket(String?)
    }

    private var notesInActiveSpace: [Note] {
        let sid = spaceStore.activeSpaceUUID()
        let scoped = notes.filter { $0.resolvedSpaceId() == sid }
        if scoped.isEmpty, !notes.isEmpty {
            return notes
        }
        return scoped
    }

    private var activeSearchQuery: String {
        externalSearchText?.wrappedValue ?? fallbackSearchText
    }

    private var collectionRows: [HarvousCollectionRow] {
        HarvousCollectionListIndex.rows(from: notesInActiveSpace)
    }

    private var filteredCollectionRows: [HarvousCollectionRow] {
        HarvousCollectionListIndex.filtered(
            rows: collectionRows,
            query: activeSearchQuery,
            notesForBucketMatching: notesInActiveSpace
        )
    }

    private var orderedFilteredCollectionRows: [HarvousCollectionRow] {
        HarvousCollectionListIndex.applyPinOrdering(
            filteredCollectionRows,
            pinnedIdsInOrder: pinnedCollectionRowIds
        )
    }

    /// Hide passage while searching; respect dismiss for the day (same key as Notes/Highlights).
    private var showDailyPassageRow: Bool {
        activeSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && votdPassageCardDismissedDay != VotdService.todayCalendarDayKey()
    }

    private var navigationTitleText: String {
        switch collectionsDrill {
        case .root:
            return ""
        case .bucket(let name):
            return NoteFilter.collection(name).displayName
        }
    }

    private var searchBinding: Binding<String> {
        externalSearchText ?? $fallbackSearchText
    }

    var body: some View {
        Group {
            switch collectionsDrill {
            case .root:
                // Match `NoteListColumn` iOS: grouped chrome behind plain `List` + `.scrollContentBackground(.hidden)`.
                Group { collectionsRootContent }
                    .background(Color(.systemGroupedBackground))
            case .bucket(let collectionName):
                NoteListColumn(
                    filter: .collection(collectionName),
                    selectedNote: .constant(nil),
                    externalSearchText: searchBinding,
                    columnStyle: .iOSTabNoteList,
                    navigationTitleOverride: nil,
                    searchPresentationBinding: nil,
                    iosNoteNavPath: $iosNoteNavigationPath,
                    onNewNote: {}
                )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .navigationTitle(navigationTitleText)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                SpaceSwitcherView()
            }
            if collectionsDrill != .root {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        collectionsDrill = .root
                    } label: {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 17, weight: .medium))
                            .foregroundStyle(.primary)
                    }
                    .buttonStyle(.plain)
                    .tint(.primary)
                    .accessibilityLabel("Back to collections")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    appRouter.selectIOSListSurface(.more)
                } label: {
                    Image(systemName: "person.fill")
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(.primary)
                        .frame(width: 32, height: 32)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .tint(.primary)
                .accessibilityLabel("More")
            }
        }
        .onChange(of: appRouter.iosListSurface) { _, newSurface in
            if newSurface != .collections {
                collectionsDrill = .root
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
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(true)
            }
            .navigationTitle("Rename")
            .navigationBarTitleDisplayMode(.inline)
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
                variant: .conversation
            )
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

    @ViewBuilder
    private var collectionsRootContent: some View {
        if !showDailyPassageRow && notesInActiveSpace.isEmpty {
            emptyState
        } else if !showDailyPassageRow && collectionRows.isEmpty {
            ContentUnavailableView {
                Label("No Collections", systemImage: "rectangle.stack.fill")
            } description: {
                Text("Collections created from your notes will appear here.")
            }
        } else if !showDailyPassageRow && !activeSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && filteredCollectionRows.isEmpty {
            ContentUnavailableView.search(text: activeSearchQuery)
        } else {
            collectionsFlatList
        }
    }

    private var collectionsFlatList: some View {
        List {
            if showDailyPassageRow {
                DailyPassageCard { note in
                    iosNoteNavigationPath.append(note.id)
                }
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 4, trailing: 16))
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
                    .listRowInsets(IOSCollectionsListLayout.rowInsets)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
    }

    /// Match hub note row insets in `NoteListColumn` (conversation rows use leading/trailing 14).
    private enum IOSCollectionsListLayout {
        static let rowInsets = EdgeInsets(top: 4, leading: 14, bottom: 4, trailing: 14)
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "rectangle.stack")
                .font(.system(size: 40))
                .foregroundStyle(.quaternary)
            Text("Your notes will organize here")
                .font(HarvousTypography.body)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#else

/// Built for iOS only; macOS sidebar uses `SidebarPanelView`.
struct LibraryView: View {
    var body: some View {
        EmptyView()
    }
}

#endif

#if os(iOS)
#Preview {
    NavigationStack {
        LibraryView(iosNoteNavigationPath: .constant([]))
            .environmentObject(HarvousAppRouter())
            .environmentObject(SpaceStore())
            .modelContainer(for: [Note.self, Space.self, SpaceMember.self, SpaceInvite.self, SpaceJoinLink.self], inMemory: true)
    }
}
#endif
