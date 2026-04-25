import SwiftUI
import SwiftData

struct ContentView: View {
    var body: some View {
        #if os(macOS)
        MacRootView()
        #else
        iOSRootView()
        #endif
    }
}

// MARK: - macOS root view

#if os(macOS)
struct MacRootView: View {
    @State private var selectedFilter: NoteFilter = .all
    @State private var selectedNote: Note?
    @State private var lastSelectedNote: Note?

    /// Drives which columns are visible.
    /// .doubleColumn = sidebar + editor (note list hidden — the default).
    /// .all           = sidebar + note list + editor (peeks in when browsing).
    /// .detailOnly would also hide the sidebar, which we don't want.
    @State private var columnVisibility: NavigationSplitViewVisibility = .doubleColumn

    @Environment(\.modelContext) private var context

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            // Column 1: Sidebar — always visible, very narrow
            SidebarView(
                selectedFilter: $selectedFilter,
                onNewNote: createNewNote
            )
            .navigationSplitViewColumnWidth(min: 180, ideal: 220, max: 260)
        } content: {
            // Column 2: Note list — peeks in on browse, collapses on note-select
            NoteListColumn(
                filter: selectedFilter,
                selectedNote: $selectedNote,
                onNewNote: createNewNote
            )
            .navigationSplitViewColumnWidth(min: 260, ideal: 300, max: 380)
        } detail: {
            // Column 3: Editor — the main canvas
            NoteEditorView(note: $selectedNote)
        }
        .navigationSplitViewStyle(.balanced)
        // Sidebar filter tapped → show note list so user can browse
        .onChange(of: selectedFilter) { _, _ in
            selectedNote = nil
            withAnimation(HarvousAnimation.spring) { columnVisibility = .all }
        }
        // Note selected → slide the note list back away, keep sidebar
        .onChange(of: selectedNote?.id) { _, newID in
            if newID != nil {
                withAnimation(HarvousAnimation.spring) { columnVisibility = .doubleColumn }
            }
            // Discard empty notes when navigating away (Apple Notes behavior)
            if let prev = lastSelectedNote,
               prev.id != selectedNote?.id,
               prev.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
               prev.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                context.delete(prev)
            }
            lastSelectedNote = selectedNote
        }
    }

    // MARK: - Create note inline (Apple Notes style — no sheet)
    private func createNewNote() {
        let note = Note()
        if case .thread(let key) = selectedFilter { note.threadColor = key }
        context.insert(note)
        // Selecting triggers onChange which collapses back to .doubleColumn
        selectedNote = note
    }
}
#endif

// MARK: - iOS: Tab bar with overlay FAB

#if os(iOS)
struct iOSRootView: View {
    @State private var showCompose = false

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            TabView {
                NavigationStack {
                    NoteListColumn(
                        selectedNote: .constant(nil),
                        onNewNote: { showCompose = true }
                    )
                    .navigationTitle("Harvous")
                }
                .tabItem { Label("Notes", systemImage: "note.text") }

                NavigationStack {
                    SearchView()
                        .navigationTitle("Search")
                }
                .tabItem { Label("Search", systemImage: "magnifyingglass") }

                NavigationStack {
                    LibraryView()
                        .navigationTitle("Library")
                }
                .tabItem { Label("Library", systemImage: "books.vertical") }
            }
            .tint(.harvousAccent)

            Button {
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                showCompose = true
            } label: {
                Image(systemName: "square.and.pencil")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 56, height: 56)
                    .background(Color.harvousAccent, in: Circle())
                    .shadow(color: Color.harvousAccent.opacity(0.4), radius: 12, y: 4)
            }
            .padding(.trailing, 20)
            .padding(.bottom, 80)
        }
        .sheet(isPresented: $showCompose) {
            ComposeView()
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
    }
}
#endif

#Preview {
    ContentView()
        .modelContainer(for: [Note.self], inMemory: true)
}
