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

// MARK: - macOS: Two-column — sidebar navigates, editor is the canvas

#if os(macOS)
struct MacRootView: View {
    /// nil = sidebar showing thread list.
    /// non-nil = sidebar showing note list for that filter.
    @State private var selectedFilter: NoteFilter? = nil
    @State private var selectedNote: Note?
    @State private var lastSelectedNote: Note?
    @Environment(\.modelContext) private var context

    var body: some View {
        NavigationSplitView {
            // Single sidebar column — swaps between thread list and note list
            sidebarContent
                .navigationSplitViewColumnWidth(min: 240, ideal: 280, max: 340)
        } detail: {
            NoteEditorView(note: $selectedNote)
        }
        .navigationSplitViewStyle(.balanced)
        // Empty note cleanup on navigate-away
        .onChange(of: selectedNote?.id) { _, _ in
            if let prev = lastSelectedNote,
               prev.id != selectedNote?.id,
               prev.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
               prev.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                context.delete(prev)
            }
            lastSelectedNote = selectedNote
        }
    }

    // MARK: - Sidebar content (dynamic — thread list or note list)

    @ViewBuilder
    private var sidebarContent: some View {
        if let filter = selectedFilter {
            // Note list — fills the sidebar when user is browsing a thread/filter
            NoteListColumn(
                filter: filter,
                selectedNote: $selectedNote,
                onNewNote: createNewNote
            )
            .toolbar {
                // Back button returns to thread list
                ToolbarItem(placement: .navigation) {
                    Button {
                        withAnimation(HarvousAnimation.spring) { selectedFilter = nil }
                    } label: {
                        Label("Threads", systemImage: "chevron.backward")
                    }
                }
                // Compose button stays accessible
                ToolbarItem(placement: .primaryAction) {
                    Button(action: createNewNote) {
                        Image(systemName: "square.and.pencil")
                    }
                    .keyboardShortcut("n", modifiers: .command)
                    .help("New Note (⌘N)")
                }
            }
        } else {
            // Thread list — default sidebar view
            SidebarView(selectedFilter: $selectedFilter, onNewNote: createNewNote)
        }
    }

    // MARK: - Create note inline (Apple Notes style)

    private func createNewNote() {
        // If we're at the root, drill into "All Notes" first so user sees the new note
        if selectedFilter == nil {
            withAnimation(HarvousAnimation.spring) { selectedFilter = .all }
        }
        let note = Note()
        if case .thread(let key) = selectedFilter { note.threadColor = key }
        context.insert(note)
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
