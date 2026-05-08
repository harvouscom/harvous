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

        var id: String { rawValue }
        var title: String {
            switch self {
            case .notes: return "Notes"
            case .collections: return "Collections"
            }
        }

        var icon: String {
            switch self {
            case .notes: return "note.text"
            case .collections: return "rectangle.stack.fill"
            }
        }
    }

    @Binding var selectedNote: Note?
    @Binding var splitColumnVisibility: NavigationSplitViewVisibility
    var onCreateNewNote: (() -> Void)?
    @Query(sort: \Note.updatedAt, order: .reverse) private var notes: [Note]
    @EnvironmentObject private var spaceStore: SpaceStore
    @State private var mode: SidebarMode = .notes
    @State private var activeCollection: String? = nil
    @State private var collectionSearchText = ""
    @State private var sidebarColumnMeasuredWidth: CGFloat = 0

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
            notesForBucketMatching: notes
        )
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
                } else {
                    if let activeCollection {
                        NoteListColumn(filter: .collection(activeCollection), selectedNote: $selectedNote, externalSearchText: unifiedSearchText)
                    } else {
                        collectionsList
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
                        if mode == .collections, activeCollection != nil {
                            Button {
                                activeCollection = nil
                            } label: {
                                Image(systemName: "chevron.left")
                            }
                            .buttonStyle(.bordered)
                            .help("Back to collections")
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
                    activeCollection = nil
                    collectionSearchText = ""
                }
            }
        }
        .toolbarBackground(.clear, for: .automatic)
        .modifier(HarvousSidebarTransparentWindowToolbar())
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
            Image(systemName: mode == .notes ? "note.text" : "rectangle.stack.fill")
        }
        .buttonStyle(.bordered)
        .menuIndicator(.hidden)
        .help("View by \(mode == .notes ? "notes" : "collections")")
    }

    private var collectionsList: some View {
        Group {
            if collectionRows.isEmpty {
                ContentUnavailableView {
                    Label("No Collections", systemImage: "rectangle.stack.fill")
                } description: {
                    Text("Collections created from your notes will appear here.")
                }
            } else {
                List {
                    ForEach(filteredCollectionRows) { row in
                        Button {
                            activeCollection = row.collection
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
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
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
    .environmentObject(MacNoteListSelectionCoordinator())
    .modelContainer(for: [Note.self, Space.self, SpaceMember.self, SpaceInvite.self, SpaceJoinLink.self], inMemory: true)
    .frame(width: 700, height: 500)
}

#endif
