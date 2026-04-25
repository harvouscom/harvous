import SwiftUI
import SwiftData

/// Shared note list — used in the macOS content column and iOS home tab.
struct NoteListView: View {
    let filter: SidebarItem
    @Binding var selectedNote: Note?

    @Query(sort: \Note.updatedAt, order: .reverse) private var allNotes: [Note]
    @Environment(\.modelContext) private var context
    @State private var searchText = ""

    private var notes: [Note] {
        let base: [Note]
        switch filter {
        case .allNotes:
            base = allNotes
        case .recent:
            let cutoff = Calendar.current.date(byAdding: .day, value: -7, to: Date()) ?? Date()
            base = allNotes.filter { $0.updatedAt >= cutoff }
        case .scripture:
            base = allNotes.filter { !$0.detectedRefs.isEmpty }
        case .threadGroup(let color):
            base = allNotes.filter { $0.threadColor == color }
        }

        guard !searchText.isEmpty else { return base }
        let q = searchText.lowercased()
        return base.filter {
            $0.title.lowercased().contains(q) ||
            $0.body.lowercased().contains(q) ||
            $0.detectedRefs.contains(where: { $0.lowercased().contains(q) }) ||
            $0.tags.contains(where: { $0.lowercased().contains(q) })
        }
    }

    var body: some View {
        Group {
            if allNotes.isEmpty {
                emptyLibrary
            } else if notes.isEmpty {
                emptySearch
            } else {
                noteList
            }
        }
        .navigationTitle(title)
        .searchable(text: $searchText, prompt: "Search notes")
        #if os(macOS)
        .navigationSubtitle("\(notes.count) note\(notes.count == 1 ? "" : "s")")
        #endif
    }

    // MARK: - List

    private var noteList: some View {
        List(selection: $selectedNote) {
            ForEach(notes) { note in
                #if os(macOS)
                NoteRowView(note: note)
                    .tag(note)
                    .swipeActions(edge: .trailing) {
                        deleteAction(note)
                    }
                #else
                NavigationLink {
                    NoteEditorView(note: note)
                } label: {
                    NoteRowView(note: note)
                }
                .swipeActions(edge: .trailing) {
                    deleteAction(note)
                }
                #endif
            }
        }
        #if os(macOS)
        .listStyle(.inset)
        #else
        .listStyle(.plain)
        #endif
    }

    @ViewBuilder
    private func deleteAction(_ note: Note) -> some View {
        Button(role: .destructive) {
            withAnimation {
                if selectedNote?.id == note.id { selectedNote = nil }
                context.delete(note)
            }
        } label: {
            Label("Delete", systemImage: "trash")
        }
    }

    // MARK: - Empty states (using Apple's ContentUnavailableView)

    private var emptyLibrary: some View {
        ContentUnavailableView {
            Label("No Notes Yet", systemImage: "note.text")
        } description: {
            Text("Start with what you're reading.\nScripture references will be detected automatically.")
        } actions: {
            // Compose is handled at the root level via toolbar/FAB
        }
    }

    private var emptySearch: some View {
        ContentUnavailableView.search(text: searchText)
    }

    // MARK: - Helpers

    private var title: String {
        switch filter {
        case .allNotes:       return "All Notes"
        case .recent:         return "Recent"
        case .scripture:      return "Scripture"
        case .threadGroup(let c): return c.capitalized + " Study"
        }
    }
}

// MARK: - Note row (Apple Notes–style)

struct NoteRowView: View {
    let note: Note

    private var dateString: String {
        let cal = Calendar.current
        if cal.isDateInToday(note.updatedAt) {
            return note.updatedAt.formatted(date: .omitted, time: .shortened)
        } else if cal.isDateInYesterday(note.updatedAt) {
            return "Yesterday"
        } else {
            return note.updatedAt.formatted(.dateTime.month(.abbreviated).day())
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            // Thread color stripe
            if let color = note.color {
                RoundedRectangle(cornerRadius: 2)
                    .fill(color)
                    .frame(width: 3)
                    .padding(.vertical, 2)
            }

            VStack(alignment: .leading, spacing: 3) {
                // Title row
                HStack(alignment: .firstTextBaseline) {
                    Text(note.title.isEmpty ? "New Note" : note.title)
                        .font(.headline)
                        .lineLimit(1)
                    Spacer()
                    Text(dateString)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }

                // Preview + primary scripture ref
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    if let ref = note.primaryRef {
                        Text(ref)
                            .font(.subheadline)
                            .foregroundStyle(.tint)
                            .lineLimit(1)
                        Text("·")
                            .font(.subheadline)
                            .foregroundStyle(.tertiary)
                    }
                    Text(note.excerpt.isEmpty ? "No additional text" : note.excerpt)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    NoteListView(filter: .allNotes, selectedNote: .constant(nil))
        .modelContainer(for: [Note.self], inMemory: true)
}
