import SwiftUI
import SwiftData

#if os(macOS)

struct SidebarView: View {
    @Binding var selection: SidebarItem
    @Query(sort: \Note.updatedAt, order: .reverse) private var notes: [Note]

    // Distinct thread color groups that have at least one note
    private var threadGroups: [(color: String, count: Int)] {
        let palette = ["blue", "yellow", "green", "pink", "orange", "purple"]
        return palette.compactMap { color in
            let count = notes.filter { $0.threadColor == color }.count
            return count > 0 ? (color: color, count: count) : nil
        }
    }

    private var scriptureCount: Int {
        notes.filter { !$0.detectedRefs.isEmpty }.count
    }

    var body: some View {
        List(selection: $selection) {
            // MARK: Smart Collections
            Section("Harvous") {
                Label("All Notes", systemImage: "note.text")
                    .tag(SidebarItem.allNotes)
                    .badge(notes.count)

                Label("Recent", systemImage: "clock")
                    .tag(SidebarItem.recent)

                if scriptureCount > 0 {
                    Label("Scripture", systemImage: "book.closed")
                        .tag(SidebarItem.scripture)
                        .badge(scriptureCount)
                }
            }

            // MARK: Thread Groups (auto-organized)
            if !threadGroups.isEmpty {
                Section("Library") {
                    ForEach(threadGroups, id: \.color) { group in
                        HStack(spacing: 8) {
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.thread(group.color) ?? .accentColor)
                                .frame(width: 14, height: 14)
                            Text(threadDisplayName(group.color))
                            Spacer()
                        }
                        .tag(SidebarItem.threadGroup(group.color))
                        .badge(group.count)
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .navigationTitle("Harvous")
    }

    private func threadDisplayName(_ color: String) -> String {
        // In the real build this would be the user-named thread
        // For the prototype, use the color as a placeholder name
        color.capitalized + " Study"
    }
}

#Preview {
    SidebarView(selection: .constant(.allNotes))
        .modelContainer(for: [Note.self], inMemory: true)
        .frame(width: 220)
}

#endif
