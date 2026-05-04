import SwiftUI
import SwiftData

#if os(macOS)

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

    private struct CollectionRow: Identifiable, Hashable {
        let collection: String?
        let count: Int
        let mostRecent: Date
        var id: String { collection ?? "__ungrouped__" }
        var title: String { collection ?? "No collection" }
    }

    @Binding var selectedNote: Note?
    var onCreateNewNote: (() -> Void)?
    @Query(sort: \Note.updatedAt, order: .reverse) private var notes: [Note]
    @EnvironmentObject private var spaceStore: SpaceStore
    @State private var mode: SidebarMode = .notes
    @State private var activeCollection: String? = nil
    @State private var collectionSearchText = ""

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

    private var collectionRows: [CollectionRow] {
        var buckets: [String?: [Note]] = [:]
        for note in notesInActiveSpace {
            let normalized = note.primaryCollection?.trimmingCharacters(in: .whitespacesAndNewlines)
            let collection = (normalized?.isEmpty == false) ? normalized : nil
            buckets[collection, default: []].append(note)
        }

        return buckets.map { key, values in
            CollectionRow(
                collection: key,
                count: values.count,
                mostRecent: values.map(\.updatedAt).max() ?? .distantPast
            )
        }
        .sorted { lhs, rhs in
            if lhs.collection == nil { return false }
            if rhs.collection == nil { return true }
            return lhs.mostRecent > rhs.mostRecent
        }
    }

    private var filteredCollectionRows: [CollectionRow] {
        let query = collectionSearchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return collectionRows }
        return collectionRows
            .compactMap { row -> (CollectionRow, Int)? in
                let normalized = row.collection?.trimmingCharacters(in: .whitespacesAndNewlines)
                let bucketNotes = notes.filter { note in
                    let candidate = note.primaryCollection?.trimmingCharacters(in: .whitespacesAndNewlines)
                    let normalizedCandidate = (candidate?.isEmpty == false) ? candidate : nil
                    return normalizedCandidate == normalized
                }

                var score = 0
                if row.title.localizedCaseInsensitiveContains(query) { score += 6 }
                if row.title.lowercased().hasPrefix(query.lowercased()) { score += 3 }

                if bucketNotes.contains(where: { $0.title.localizedCaseInsensitiveContains(query) }) { score += 2 }
                if bucketNotes.contains(where: { $0.body.localizedCaseInsensitiveContains(query) }) { score += 1 }
                if bucketNotes.contains(where: { $0.tags.contains(where: { $0.localizedCaseInsensitiveContains(query) }) }) { score += 1 }
                if bucketNotes.contains(where: { $0.detectedRefs.contains(where: { $0.localizedCaseInsensitiveContains(query) }) }) { score += 1 }

                guard score > 0 else { return nil }
                return (row, score)
            }
            .sorted { lhs, rhs in
                if lhs.1 != rhs.1 { return lhs.1 > rhs.1 }
                return lhs.0.mostRecent > rhs.0.mostRecent
            }
            .map(\.0)
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
            .toolbar {
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
        SidebarPanelView(selectedNote: .constant(nil), onCreateNewNote: nil)
    } detail: {
        Text("Editor")
    }
    .environmentObject(SpaceStore())
    .modelContainer(for: [Note.self, Space.self, SpaceMember.self, SpaceInvite.self, SpaceJoinLink.self], inMemory: true)
    .frame(width: 700, height: 500)
}

#endif
