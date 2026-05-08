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
    @EnvironmentObject private var spaceStore: SpaceStore
    @EnvironmentObject private var appRouter: HarvousAppRouter

    @AppStorage(VotdService.passageCardDismissedDayUserDefaultsKey) private var votdPassageCardDismissedDay: String = ""

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
    }

    @ViewBuilder
    private var collectionsRootContent: some View {
        if notesInActiveSpace.isEmpty {
            emptyState
        } else if collectionRows.isEmpty {
            ContentUnavailableView {
                Label("No Collections", systemImage: "rectangle.stack.fill")
            } description: {
                Text("Collections created from your notes will appear here.")
            }
        } else if !activeSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && filteredCollectionRows.isEmpty {
            ContentUnavailableView.search(text: activeSearchQuery)
        } else {
            collectionsFlatList
        }
    }

    private var collectionsFlatList: some View {
        List {
            if votdPassageCardDismissedDay != VotdService.todayCalendarDayKey() {
                DailyPassageCard { note in
                    iosNoteNavigationPath.wrappedValue.append(note.id)
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
            ForEach(filteredCollectionRows) { row in
                Button {
                    collectionsDrill = .bucket(row.collection)
                } label: {
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(row.title)
                                .font(HarvousTypography.noteListTitle)
                                .lineLimit(1)
                                .foregroundStyle(.primary)
                            Text("\(row.count) note\(row.count == 1 ? "" : "s")")
                                .font(HarvousTypography.noteListPreview)
                                .foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.tertiary)
                    }
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .listRowInsets(IOSCollectionsListLayout.rowInsets)
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
    }

    /// Match `IOSHubConversationNoteListLayout.rowInsets` in `NoteListColumn` so hubs align visually.
    private enum IOSCollectionsListLayout {
        static let rowInsets = EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16)
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
