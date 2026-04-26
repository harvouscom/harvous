import SwiftUI
import SwiftData

/// The note list column — Apple Notes-style rows with Harvous thread accents.
struct NoteListColumn: View {
    var filter: NoteFilter = .all
    @Binding var selectedNote: Note?
    /// Called when the user taps the compose button.
    /// On macOS: immediately creates a note in-place (Apple Notes style).
    /// On iOS: typically triggers a sheet.
    var onNewNote: () -> Void = {}

    @Query(sort: \Note.updatedAt, order: .reverse) private var notes: [Note]
    @Environment(\.modelContext) private var context

    @State private var searchText = ""

    // MARK: - Filtered notes

    private var baseNotes: [Note] {
        switch filter {
        case .all:
            return notes
        case .thread(let key):
            return notes.filter { $0.threadColor == key }
        }
    }

    private var filtered: [Note] {
        guard !searchText.isEmpty else { return baseNotes }
        let q = searchText.lowercased()
        return baseNotes.filter {
            $0.title.lowercased().contains(q) ||
            $0.body.lowercased().contains(q) ||
            $0.detectedRefs.contains(where: { $0.lowercased().contains(q) })
        }
    }

    private var showThreadLabel: Bool {
        if case .all = filter { return true }
        return false
    }

    // MARK: - Body

    var body: some View {
        Group {
            if filtered.isEmpty && baseNotes.isEmpty {
                emptyState
            } else if filtered.isEmpty {
                ContentUnavailableView.search(text: searchText)
            } else {
                noteList
            }
        }
        #if os(iOS)
        .background(Color.surfacePaper)
        #endif
        .navigationTitle(filter.displayName)
        .searchable(text: $searchText, prompt: "Search")
        #if os(iOS)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(action: onNewNote) {
                    Image(systemName: "square.and.pencil")
                }
                .help("New Note")
            }
        }
        #endif
    }

    // MARK: - Note list

    private var noteList: some View {
        List {
            ForEach(filtered) { note in
                let isSelected = selectedNote?.id == note.id
                NoteRow(note: note, showThreadLabel: showThreadLabel)
                    .listRowInsets(EdgeInsets(top: 5, leading: 6, bottom: 5, trailing: 8))
                    .listRowBackground(
                        RoundedRectangle(cornerRadius: HarvousRadius.rowHighlight)
                            .fill(isSelected ? Color.harvousAccent.opacity(0.12) : Color.clear)
                    )
                    .listRowSeparator(.hidden)
                    .onTapGesture { selectedNote = note }
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) {
                            withAnimation {
                                if selectedNote?.id == note.id { selectedNote = nil }
                                context.delete(note)
                            }
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
            }
        }
        #if os(macOS)
        .listStyle(.sidebar)   // matches the thread list sidebar style exactly
        #else
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        #endif
    }

    // MARK: - Empty state

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No Notes", systemImage: "note.text")
        } description: {
            Text("Tap the compose button to write your first note.")
        }
    }
}

// MARK: - Note row (Apple Notes style + Harvous thread accent)

struct NoteRow: View {
    let note: Note
    var showThreadLabel: Bool = true

    private var dateString: String {
        let cal = Calendar.current
        if cal.isDateInToday(note.updatedAt) {
            return note.updatedAt.formatted(date: .omitted, time: .shortened)
        } else {
            // Apple Notes style: M/D/YY
            return note.updatedAt.formatted(.dateTime.month().day().year(.twoDigits))
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            // Harvous addition: 3px thread color left accent
            if let color = note.color {
                color
                    .frame(width: 3)
                    .clipShape(RoundedRectangle(cornerRadius: 1.5))
                    .padding(.vertical, 6)
            } else {
                Color.clear.frame(width: 3)
            }

            VStack(alignment: .leading, spacing: 3) {
                // Title — bold, 1 line (Apple Notes)
                Text(note.title.isEmpty ? "New Note" : note.title)
                    .font(.system(size: 13, weight: .semibold))
                    .lineLimit(1)
                    .foregroundStyle(Color.inkPrimary)

                // Date + excerpt on same line (Apple Notes)
                HStack(spacing: 0) {
                    Text(dateString)
                        .font(.system(size: 12))
                        .foregroundStyle(Color.inkSecondary)
                        .monospacedDigit()

                    if !note.excerpt.isEmpty {
                        Text("  ")
                        Text(note.excerpt)
                            .font(.system(size: 12))
                            .foregroundStyle(Color.inkTertiary)
                            .lineLimit(1)
                    }
                }

                // Harvous addition: thread label (shown when in "All Notes")
                // or scripture ref badge
                if showThreadLabel, let color = note.color {
                    HStack(spacing: 4) {
                        Image(systemName: "folder.fill")
                            .font(.system(size: 9))
                            .foregroundStyle(color)
                        Text(note.threadName ?? (note.threadColor?.capitalized ?? ""))
                            .font(.system(size: 11))
                            .foregroundStyle(Color.inkTertiary)
                    }
                } else if let ref = note.primaryRef {
                    // Show scripture ref instead of thread when filter is thread-specific
                    HStack(spacing: 3) {
                        Image(systemName: "book.closed.fill")
                            .font(.system(size: 9))
                        Text(ref)
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundStyle(.tint)
                }
            }
            .padding(.leading, 10)
            .padding(.trailing, 6)
            .padding(.vertical, 9)

            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
    }
}

#Preview {
    NoteListColumn(selectedNote: .constant(nil))
        .modelContainer(for: [Note.self], inMemory: true)
        .frame(width: 300, height: 600)
}
