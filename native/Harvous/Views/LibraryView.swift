import SwiftUI
import SwiftData

struct LibraryView: View {
    @Query(sort: \Note.updatedAt, order: .reverse) private var notes: [Note]

    // Group notes by threadColor as a stand-in for thread grouping
    private var grouped: [(color: String, notes: [Note])] {
        let colorOrder = ["blue", "yellow", "green", "pink", "orange", "purple"]
        var dict: [String: [Note]] = [:]
        for note in notes {
            let key = note.threadColor ?? "blue"
            dict[key, default: []].append(note)
        }
        return colorOrder.compactMap { color in
            guard let group = dict[color], !group.isEmpty else { return nil }
            return (color: color, notes: group)
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
            ForEach(grouped, id: \.color) { group in
                Section {
                    ForEach(group.notes) { note in
                        NavigationLink { StatefulNoteEditorView(note: note) } label: {
                            HStack(spacing: 12) {
                                Circle()
                                    .fill(HarvousColors.thread(group.color) ?? .clear)
                                    .frame(width: 10, height: 10)
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
                        RoundedRectangle(cornerRadius: 3)
                            .fill(HarvousColors.thread(group.color) ?? .clear)
                            .frame(width: 14, height: 14)
                        Text("\(group.notes.count) note\(group.notes.count == 1 ? "" : "s")")
                            .font(HarvousTypography.caption)
                            .foregroundStyle(.secondary)
                        Spacer()
                        // In the real build this would be the named thread
                        Text("Auto-group")
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
