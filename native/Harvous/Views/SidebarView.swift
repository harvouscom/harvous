import SwiftUI
import SwiftData

// MARK: - Note filter (shared across all platforms)

enum NoteFilter: Hashable, Sendable {
    case all
    case thread(String)

    var displayName: String {
        switch self {
        case .all:             return "All Notes"
        case .thread(let k):   return k.capitalized
        }
    }
}

// MARK: - Sidebar view (macOS only — Apple Notes-style)

#if os(macOS)
struct SidebarView: View {
    @Binding var selectedFilter: NoteFilter
    @Query private var notes: [Note]

    private let threadOrder = ["blue", "yellow", "green", "pink", "orange", "purple"]

    private func count(for key: String) -> Int {
        notes.filter { $0.threadColor == key }.count
    }

    /// Prefer a user-set threadName; fall back to the color key capitalized.
    private func displayName(for key: String) -> String {
        notes.first { $0.threadColor == key && $0.threadName != nil }?.threadName
            ?? key.capitalized
    }

    private var activeThreads: [String] {
        threadOrder.filter { count(for: $0) > 0 }
    }

    var body: some View {
        List(selection: $selectedFilter) {
            // All Notes — top-level item like Apple Notes' "All iCloud"
            Label("All Notes", systemImage: "note.text")
                .badge(notes.count)
                .tag(NoteFilter.all)

            // Threads — each thread is a "folder" with a colored icon
            if !activeThreads.isEmpty {
                Section("Threads") {
                    ForEach(activeThreads, id: \.self) { key in
                        Label {
                            Text(displayName(for: key))
                        } icon: {
                            Image(systemName: "folder.fill")
                                .foregroundStyle(HarvousColors.thread(key) ?? .secondary)
                        }
                        .badge(count(for: key))
                        .tag(NoteFilter.thread(key))
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .navigationTitle("Harvous")
    }
}

#Preview {
    SidebarView(selectedFilter: .constant(.all))
        .modelContainer(for: [Note.self], inMemory: true)
        .frame(width: 220, height: 500)
}
#endif
