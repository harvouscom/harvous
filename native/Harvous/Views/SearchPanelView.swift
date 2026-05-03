import SwiftUI
import SwiftData

#if os(macOS)

/// macOS search panel — full-text search across notes, tags, and scripture refs.
/// Sets `selectedNote` directly instead of navigating.
struct SearchPanelView: View {
    @Binding var selectedNote: Note?
    @Query private var notes: [Note]
    @EnvironmentObject private var spaceStore: SpaceStore
    @State private var query = ""
    @FocusState private var fieldFocused: Bool

    private var results: [Note] {
        guard !query.isEmpty else { return [] }
        let q = query.lowercased()
        return notes.filter {
            $0.title.lowercased().contains(q) ||
            $0.body.lowercased().contains(q) ||
            $0.detectedRefs.contains(where: { $0.lowercased().contains(q) }) ||
            $0.tags.contains(where: { $0.lowercased().contains(q) })
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            searchField
            Divider()
            resultContent
        }
        .onAppear { fieldFocused = true }
    }

    // MARK: - Search field

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
                .font(.system(size: 12))
            TextField("Notes, verses, tags…", text: $query)
                .textFieldStyle(.plain)
                .focused($fieldFocused)
            if !query.isEmpty {
                Button { query = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                        .font(.system(size: 12))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    // MARK: - Result content

    @ViewBuilder
    private var resultContent: some View {
        if query.isEmpty {
            emptyPrompt
        } else if results.isEmpty {
            noResults
        } else {
            resultList
        }
    }

    private var emptyPrompt: some View {
        VStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 32))
                .foregroundStyle(.quaternary)
            Text("Search your notes")
                .font(HarvousTypography.searchEmptyState)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var noResults: some View {
        VStack(spacing: 10) {
            Image(systemName: "doc.questionmark")
                .font(.system(size: 32))
                .foregroundStyle(.quaternary)
            Text("No results for \"\(query)\"")
                .font(HarvousTypography.searchEmptyState)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var resultList: some View {
        List {
            ForEach(results, id: \.id) { note in
                let isSelected = selectedNote?.id == note.id
                NoteFeedRow(note: note, variant: .sidebarCompact)
                    .listRowInsets(EdgeInsets(top: 4, leading: 6, bottom: 4, trailing: 8))
                    .listRowBackground(
                        RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight)
                            .fill(isSelected ? Color.accentColor.opacity(0.10) : Color.clear)
                    )
                    .listRowSeparator(.hidden)
                    .onTapGesture { selectedNote = note }
            }
        }
        .listStyle(.plain)
    }
}

#Preview {
    SearchPanelView(selectedNote: .constant(nil))
        .environmentObject(SpaceStore())
        .modelContainer(for: [Note.self, Space.self, SpaceMember.self, SpaceInvite.self, SpaceJoinLink.self], inMemory: true)
        .frame(width: 280, height: 600)
}

#endif
