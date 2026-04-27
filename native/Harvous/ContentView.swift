import SwiftUI
import SwiftData

struct ContentView: View {
    var body: some View {
        Group {
            #if os(macOS)
            MacRootView()
            #else
            iOSRootView()
            #endif
        }
    }
}

// MARK: - macOS: Sidebar + editor

#if os(macOS)
struct MacRootView: View {
    @State private var selectedNote: Note?
    @State private var lastSelectedNote: Note?
    @State private var showSearch = false
    @State private var showInspector = false
    @Environment(\.modelContext) private var context

    var body: some View {
        NavigationSplitView {
            SidebarPanelView(selectedNote: $selectedNote)
                .navigationSplitViewColumnWidth(min: 220, ideal: 260, max: 340)
        } detail: {
            NavigationStack {
                NoteEditorView(note: $selectedNote, showInspector: $showInspector as Binding<Bool>)
                    .toolbar {
                        // Different placements: multiple `.primaryAction` items are merged into one NSSegment; `.navigation` is its own slot (like the space switcher).
                        ToolbarItem(placement: .navigation) {
                            Button(action: createNewNote) {
                                Image(systemName: "square.and.pencil")
                            }
                            .buttonStyle(.bordered)
                            .help("New Note (⌘N)")
                        }
                        ToolbarItem(placement: .primaryAction) {
                            Menu {
                                Button {
                                    withAnimation(HarvousAnimation.spring) { showInspector = true }
                                } label: {
                                    Label("Note details", systemImage: "sidebar.right")
                                }
                                .disabled(selectedNote == nil || showInspector)

                                Button {
                                    withAnimation(HarvousAnimation.spring) { showInspector = false }
                                } label: {
                                    Label("Hide note details", systemImage: "sidebar.left")
                                }
                                .disabled(selectedNote == nil || !showInspector)
                            } label: {
                                Image(systemName: "ellipsis")
                                    .font(.system(size: 16, weight: .medium))
                            }
                            .buttonStyle(.bordered)
                            .menuIndicator(.hidden)
                            .help("More")
                            .disabled(selectedNote == nil)
                        }
                    }
            }
        }
        .navigationSplitViewStyle(.balanced)
        .focusedSceneValue(\.newNoteAction, createNewNote)
        .focusedSceneValue(\.showSearchAction, { showSearch = true })
        .onChange(of: selectedNote?.id) { _, _ in
            let newNote = selectedNote
            let previous = lastSelectedNote
            Task { @MainActor in
                if let prev = previous,
                   prev.id != newNote?.id,
                   prev.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                   prev.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    context.delete(prev)
                    try? context.save()
                }
                lastSelectedNote = newNote
            }
        }
        .overlay {
            if showSearch {
                SpotlightSearchView(isPresented: $showSearch, selectedNote: $selectedNote)
                    .ignoresSafeArea()
            }
        }
    }

    private func createNewNote() {
        let note = Note()
        context.insert(note)
        try? context.save()
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
