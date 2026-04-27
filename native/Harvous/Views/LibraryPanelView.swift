import SwiftUI
import SwiftData

#if os(macOS)

/// Library panel — notes auto-grouped by detected scripture reference (book + chapter).
/// No manual thread assignment. Scripture IS the organisation.
struct LibraryPanelView: View {
    @Binding var selectedNote: Note?
    @Query(sort: \Note.updatedAt, order: .reverse) private var notes: [Note]

    // MARK: - Auto-grouping by scripture

    /// Extracts "Book Chapter" from a full reference, e.g. "Philippians 4:13" → "Philippians 4"
    private func groupKey(for note: Note) -> String {
        guard let ref = note.primaryRef else { return "Untagged" }
        return ref.components(separatedBy: ":").first.map {
            $0.trimmingCharacters(in: .whitespaces)
        } ?? ref
    }

    private var groups: [(key: String, notes: [Note])] {
        var dict: [String: [Note]] = [:]
        for note in notes {
            let key = groupKey(for: note)
            dict[key, default: []].append(note)
        }
        // Sort groups by most-recently-updated note within the group
        return dict
            .sorted { a, b in
                let aDate = a.value.first?.updatedAt ?? .distantPast
                let bDate = b.value.first?.updatedAt ?? .distantPast
                if a.key == "Untagged" { return false }
                if b.key == "Untagged" { return true }
                return aDate > bDate
            }
            .map { (key: $0.key, notes: $0.value) }
    }

    // MARK: - Body

    var body: some View {
        Group {
            if notes.isEmpty {
                emptyState
            } else {
                libraryList
            }
        }
        .navigationTitle("Library")
    }

    private var libraryList: some View {
        List {
            ForEach(groups, id: \.key) { group in
                Section(group.key) {
                    ForEach(group.notes) { note in
                        let isSelected = selectedNote?.id == note.id
                        NoteRow(note: note)
                            .listRowInsets(EdgeInsets(top: 4, leading: 6, bottom: 4, trailing: 8))
                            .listRowBackground(
                                RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight)
                                    .fill(isSelected ? Color.accentColor.opacity(0.10) : Color.clear)
                            )
                            .listRowSeparator(.hidden)
                            .onTapGesture { selectedNote = note }
                    }
                }
            }
        }
        .listStyle(.plain)
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No Notes Yet", systemImage: "books.vertical")
        } description: {
            Text("Start writing — scripture references will automatically organise your notes.")
        }
    }
}

#Preview {
    NavigationStack {
        LibraryPanelView(selectedNote: .constant(nil))
    }
    .modelContainer(for: [Note.self], inMemory: true)
    .frame(width: 280, height: 600)
}

#endif
