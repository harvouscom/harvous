import SwiftUI
import SwiftData

#if os(iOS)
import UIKit

/// iPhone threads: flat cluster list of connected notes, drill-in to `NoteListColumn`.
/// Mirrors `LibraryView` (Folders) but clusters are computed, not user-editable (no pin/rename/remove).
struct ThreadsHubView: View {
    @Binding var iosSelectedNoteId: UUID?
    var externalSearchText: Binding<String>? = nil
    @State private var fallbackSearchText = ""

    @Query(sort: \Note.updatedAt, order: .reverse) private var notes: [Note]
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var spaceStore: SpaceStore
    @EnvironmentObject private var appRouter: HarvousAppRouter

    /// Drill state lives on `HarvousAppRouter.iosThreadsDrill` so the bottom-chrome chip can read it.
    private var threadsDrill: HarvousIOSThreadsDrill {
        appRouter.iosThreadsDrill
    }

    private var notesInActiveSpace: [Note] {
        HarvousNoteListVisibility.notesInActiveSpace(
            from: notes,
            spaceId: spaceStore.activeSpaceUUID()
        )
    }

    private var activeSearchQuery: String {
        externalSearchText?.wrappedValue ?? fallbackSearchText
    }

    private var searchBinding: Binding<String> {
        externalSearchText ?? $fallbackSearchText
    }

    private var clusters: [ThreadStore.NoteCluster] {
        ThreadStore.connectedClusters(from: notesInActiveSpace, modelContext: modelContext)
    }

    private var filteredClusters: [ThreadStore.NoteCluster] {
        let q = activeSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return clusters }
        return clusters.filter { $0.title.localizedStandardContains(q) }
    }

    private var navigationTitleText: String {
        switch threadsDrill {
        case .root:
            return ""
        case .cluster(_, let title, _):
            return title
        }
    }

    var body: some View {
        Group {
            switch threadsDrill {
            case .root:
                Group { threadsRootContent }
                    .background(Color.clear)
            case .cluster(_, _, let memberIds):
                NoteListColumn(
                    filter: .thread(memberIds: Set(memberIds)),
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
        .harvousIOSGlassOverCanvasShell()
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                SpaceSwitcherView()
            }
            if #available(iOS 26, *) {
                ToolbarSpacer(.fixed, placement: .topBarLeading)
            }
            // When drilled into a cluster, the chip morphs into a chevron-back + cluster
            // name affordance (see `IOSListSurfaceChip`), so no separate back button is needed here.
            ToolbarItem(placement: .topBarLeading) {
                IOSListSurfaceChip()
            }
            HarvousIOSProfileToolbarTrailingItem {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                appRouter.selectIOSListSurface(.more)
            }
        }
    }

    @ViewBuilder
    private var threadsRootContent: some View {
        if clusters.isEmpty {
            HarvousEmptyStateView(
                iconAsset: "Harvous.ArrowRightArrowLeft",
                title: "No Threads",
                description: "Connect notes together to create threads.",
                scale: .compact
            )
        } else if !activeSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && filteredClusters.isEmpty {
            ContentUnavailableView.search(text: activeSearchQuery)
        } else {
            threadsFlatList
        }
    }

    private var threadsFlatList: some View {
        ScrollView {
            LazyVGrid(columns: HarvousCollectionGridLayout.columns, spacing: HarvousCollectionGridLayout.spacing) {
                ForEach(filteredClusters) { cluster in
                    Button {
                        appRouter.iosThreadsDrill = .cluster(
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
        }
        .scrollContentBackground(.hidden)
        .iosListBottomChromeReserve()
    }
}

#else

/// Built for iOS only; macOS sidebar uses `SidebarPanelView`.
struct ThreadsHubView: View {
    var body: some View {
        EmptyView()
    }
}

#endif

#if os(iOS)
#Preview {
    NavigationStack {
        ThreadsHubView(iosSelectedNoteId: .constant(nil))
            .environmentObject(HarvousAppRouter())
            .environmentObject(SpaceStore())
            .modelContainer(for: [Note.self, StudyThread.self, Space.self, SpaceMember.self, SpaceInvite.self, SpaceJoinLink.self], inMemory: true)
    }
}
#endif
