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

// MARK: - Sidebar (macOS only)
// Shows the thread/folder list. Tapping an item sets selectedFilter,
// which causes MacRootView to swap the sidebar content to the note list.

#if os(macOS)
struct SidebarView: View {
    /// nil = this view is showing (root). Non-nil = note list is showing for that filter.
    @Binding var selectedFilter: NoteFilter?
    var onNewNote: () -> Void = {}

    @Query private var notes: [Note]

    private let threadOrder = ["blue", "yellow", "green", "pink", "orange", "purple"]

    private func count(for key: String) -> Int {
        notes.filter { $0.threadColor == key }.count
    }

    private func displayName(for key: String) -> String {
        notes.first { $0.threadColor == key && $0.threadName != nil }?.threadName
            ?? key.capitalized
    }

    private var activeThreads: [String] {
        threadOrder.filter { count(for: $0) > 0 }
    }

    var body: some View {
        List {
            // All Notes
            SidebarRow(
                label: "All Notes",
                icon: "note.text",
                iconColor: .secondary,
                count: notes.count
            )
            .contentShape(Rectangle())
            .onTapGesture {
                withAnimation(HarvousAnimation.spring) { selectedFilter = .all }
            }

            // Threads
            if !activeThreads.isEmpty {
                Section("Threads") {
                    ForEach(activeThreads, id: \.self) { key in
                        SidebarRow(
                            label: displayName(for: key),
                            icon: "folder.fill",
                            iconColor: HarvousColors.thread(key) ?? .secondary,
                            count: count(for: key)
                        )
                        .contentShape(Rectangle())
                        .onTapGesture {
                            withAnimation(HarvousAnimation.spring) { selectedFilter = .thread(key) }
                        }
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .navigationTitle("Harvous")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(action: onNewNote) {
                    Image(systemName: "square.and.pencil")
                }
                .keyboardShortcut("n", modifiers: .command)
                .help("New Note (⌘N)")
            }
        }
    }
}

// MARK: - Sidebar row

private struct SidebarRow: View {
    let label: String
    let icon: String
    let iconColor: Color
    let count: Int

    var body: some View {
        HStack {
            Label {
                Text(label)
            } icon: {
                Image(systemName: icon)
                    .foregroundStyle(iconColor)
            }
            Spacer()
            if count > 0 {
                Text("\(count)")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.secondary)
            }
        }
    }
}

#Preview {
    SidebarView(selectedFilter: .constant(nil))
        .modelContainer(for: [Note.self], inMemory: true)
        .frame(width: 240, height: 500)
}
#endif
