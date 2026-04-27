import SwiftUI
import SwiftData

struct LibraryView: View {
    @Query(sort: \Note.updatedAt, order: .reverse) private var notes: [Note]

    private var grouped: [(key: String, notes: [Note])] {
        var dict: [String: [Note]] = [:]
        for note in notes {
            let k = (note.primaryCollection?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 } ?? "Ungrouped"
            dict[k, default: []].append(note)
        }
        return dict
            .map { (key: $0.key, notes: $0.value) }
            .sorted { a, b in
                if a.key == "Ungrouped" { return false }
                if b.key == "Ungrouped" { return true }
                let aDate = a.notes.map(\.updatedAt).max() ?? .distantPast
                let bDate = b.notes.map(\.updatedAt).max() ?? .distantPast
                return aDate > bDate
            }
    }

    var body: some View {
        NavigationStack {
            Group {
                if notes.isEmpty {
                    emptyState
                } else {
                    groupedList
                }
            }
            .navigationTitle("Library")
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "books.vertical")
                .font(.system(size: 40))
                .foregroundStyle(.quaternary)
            Text("Your notes will organize here")
                .font(HarvousTypography.body)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var groupedList: some View {
        List {
            ForEach(grouped, id: \.key) { group in
                Section {
                    ForEach(group.notes) { note in
                        NavigationLink { StatefulNoteEditorView(note: note) } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "folder.fill")
                                    .font(.system(size: 12))
                                    .foregroundStyle(.secondary)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(note.title.isEmpty ? note.excerpt : note.title)
                                        .font(HarvousTypography.caption)
                                        .lineLimit(1)
                                    if let ref = note.primaryRef {
                                        Text(ref)
                                            .font(HarvousTypography.footnote)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                } header: {
                    HStack(spacing: 6) {
                        Text(group.key)
                            .font(HarvousTypography.caption)
                            .foregroundStyle(.primary)
                        Spacer()
                        Text("\(group.notes.count) note\(group.notes.count == 1 ? "" : "s")")
                            .font(HarvousTypography.footnote)
                            .foregroundStyle(.tertiary)
                    }
                }
            }
        }
        #if os(macOS)
        .listStyle(.sidebar)
        #endif
    }
}

#Preview {
    LibraryView()
        .modelContainer(for: [Note.self], inMemory: true)
}
