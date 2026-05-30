import SwiftUI
import SwiftData

#if os(iOS)
import UIKit

/// iPhone folders: flat Mac-style list, drill-in to `NoteListColumn`, search from bottom chrome only.
struct LibraryView: View {
    @Binding var iosSelectedNoteId: UUID?
    var externalSearchText: Binding<String>? = nil
    @State private var fallbackSearchText = ""

    @Query(sort: \Note.updatedAt, order: .reverse) private var notes: [Note]
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var spaceStore: SpaceStore
    @EnvironmentObject private var appRouter: HarvousAppRouter


    @State private var pinnedFolderRowIds: [String] = []
    @State private var renameTarget: HarvousFolderRow?
    @State private var renameDraft: String = ""
    @State private var removeConfirmRow: HarvousFolderRow?

    /// Drill state lives on `HarvousAppRouter.iosFoldersDrill` so the bottom-chrome chip can read it.
    private var foldersDrill: HarvousIOSFoldersDrill {
        appRouter.iosFoldersDrill
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

    private var folderRows: [HarvousFolderRow] {
        HarvousFolderListIndex.rows(from: notesInActiveSpace)
    }

    private var filteredFolderRows: [HarvousFolderRow] {
        HarvousFolderListIndex.filtered(
            rows: folderRows,
            query: activeSearchQuery,
            notesForBucketMatching: notesInActiveSpace
        )
    }

    private var orderedFilteredFolderRows: [HarvousFolderRow] {
        HarvousFolderListIndex.applyPinOrdering(
            filteredFolderRows,
            pinnedIdsInOrder: pinnedFolderRowIds
        )
    }

    private var navigationTitleText: String {
        switch foldersDrill {
        case .root:
            return ""
        case .bucket(let name):
            return NoteFilter.folder(name).displayName
        }
    }

    private var searchBinding: Binding<String> {
        externalSearchText ?? $fallbackSearchText
    }

    var body: some View {
        Group {
            switch foldersDrill {
            case .root:
                // Match `NoteListColumn` iOS: grouped chrome behind plain `List` + `.scrollContentBackground(.hidden)`.
                Group { foldersRootContent }
                    .background(Color(.systemGroupedBackground))
            case .bucket(let folderBucketKey):
                NoteListColumn(
                    filter: .folder(folderBucketKey),
                    selectedNote: .constant(nil),
                    externalSearchText: searchBinding,
                    columnStyle: .iOSTabNoteList,
                    navigationTitleOverride: nil,
                    searchPresentationBinding: nil,
                    iosSelectedNoteId: $iosSelectedNoteId,
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
            if #available(iOS 26, *) {
                ToolbarSpacer(.fixed, placement: .topBarLeading)
            }
            // When drilled into a folder, the chip itself morphs into a chevron-back + folder
            // name affordance (see `IOSListSurfaceChip`), so no separate back button is needed here.
            ToolbarItem(placement: .topBarLeading) {
                IOSListSurfaceChip()
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    appRouter.selectIOSListSurface(.more)
                } label: {
                    HarvousFAGlyph(assetName: "Harvous.UserFilled", edgePt: 17)
                        .foregroundStyle(.primary)
                        .frame(width: 32, height: 32)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .tint(.primary)
                .accessibilityLabel("Account, profile, and settings")
            }
        }
        .onAppear { reloadPinnedFolderOrder() }
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
                renameDraft = row.folderLabel ?? ""
            }
        }
    }

    @ViewBuilder
    private func folderRootListRow(_ row: HarvousFolderRow) -> some View {
        let pinned = pinnedFolderRowIds.contains(row.id)
        let openBucket = Button {
            appRouter.iosFoldersDrill = .bucket(row.folderLabel)
        } label: {
            FolderFeedRow(
                title: row.title,
                noteCount: row.count,
                isPinned: pinned,
                variant: .conversation
            )
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

    @ViewBuilder
    private var foldersRootContent: some View {
        if notesInActiveSpace.isEmpty {
            emptyState
        } else if folderRows.isEmpty {
            HarvousEmptyStateView(
                iconAsset: "Harvous.Folder",
                title: "No Folders",
                description: "Folders created from your notes will appear here.",
                scale: .compact
            )
        } else if !activeSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && filteredFolderRows.isEmpty {
            ContentUnavailableView.search(text: activeSearchQuery)
        } else {
            foldersFlatList
        }
    }

    private var foldersFlatList: some View {
        List {
            ForEach(orderedFilteredFolderRows) { row in
                folderRootListRow(row)
                    .listRowInsets(IOSFoldersListLayout.rowInsets)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .iosListBottomChromeReserve()
    }

    /// Match hub note row insets in `NoteListColumn` (conversation rows use leading/trailing 14).
    private enum IOSFoldersListLayout {
        static let rowInsets = EdgeInsets(top: 4, leading: HarvousFeedListLayout.listRowHorizontalInset, bottom: 4, trailing: HarvousFeedListLayout.listRowHorizontalInset)
    }

    private var emptyState: some View {
        HarvousEmptyStateView(
            iconAsset: "Harvous.Folder",
            title: "Your notes will organize here",
            scale: .compact
        )
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
        LibraryView(iosSelectedNoteId: .constant(nil))
            .environmentObject(HarvousAppRouter())
            .environmentObject(SpaceStore())
            .modelContainer(for: [Note.self, Space.self, SpaceMember.self, SpaceInvite.self, SpaceJoinLink.self], inMemory: true)
    }
}
#endif
