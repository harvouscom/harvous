import SwiftUI
import SwiftData

#if os(macOS)

/// Sidebar — simple note list. No tabs. Collapsible via ⌘\.
struct SidebarPanelView: View {
    @Binding var selectedNote: Note?

    var body: some View {
        NavigationStack {
            NoteListColumn(filter: .all, selectedNote: $selectedNote)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .toolbar {
                    ToolbarItem(placement: .navigation) {
                        SpaceSwitcherView()
                    }
                }
        }
    }
}

#Preview {
    NavigationSplitView {
        SidebarPanelView(selectedNote: .constant(nil))
    } detail: {
        Text("Editor")
    }
    .modelContainer(for: [Note.self], inMemory: true)
    .frame(width: 700, height: 500)
}

#endif
