import SwiftUI
import SwiftData

struct ContentView: View {
    @State private var showCompose = false

    var body: some View {
        #if os(macOS)
        MacRootView(showCompose: $showCompose)
        #else
        iOSRootView(showCompose: $showCompose)
        #endif
    }
}

// MARK: - macOS: NavigationSplitView (the Apple way)

#if os(macOS)
struct MacRootView: View {
    @Binding var showCompose: Bool
    @State private var sidebarSelection: SidebarItem = .allNotes
    @State private var selectedNote: Note?

    var body: some View {
        NavigationSplitView {
            SidebarView(selection: $sidebarSelection)
                .navigationSplitViewColumnWidth(min: 200, ideal: 220)
        } content: {
            NoteListView(filter: sidebarSelection, selectedNote: $selectedNote)
                .navigationSplitViewColumnWidth(min: 280, ideal: 320)
        } detail: {
            NoteEditorView(note: selectedNote)
        }
        .navigationTitle("")
        .toolbar {
            ToolbarItem(placement: .navigation) {
                Button {
                    showCompose = true
                } label: {
                    Label("New Note", systemImage: "square.and.pencil")
                }
                .keyboardShortcut("n", modifiers: .command)
                .help("New Note (⌘N)")
            }
        }
        .sheet(isPresented: $showCompose) {
            ComposeView()
                .frame(minWidth: 580, minHeight: 440)
        }
    }
}
#endif

// MARK: - iOS: TabView with overlay compose button

#if os(iOS)
struct iOSRootView: View {
    @Binding var showCompose: Bool
    @State private var selectedTab: iOSTab = .home

    enum iOSTab { case home, search, library }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            TabView(selection: $selectedTab) {
                NavigationStack {
                    NoteListView(filter: .allNotes, selectedNote: .constant(nil))
                        .navigationTitle("Harvous")
                }
                .tabItem { Label("Notes", systemImage: "note.text") }
                .tag(iOSTab.home)

                NavigationStack {
                    SearchView()
                        .navigationTitle("Search")
                }
                .tabItem { Label("Search", systemImage: "magnifyingglass") }
                .tag(iOSTab.search)

                NavigationStack {
                    LibraryView()
                        .navigationTitle("Library")
                }
                .tabItem { Label("Library", systemImage: "books.vertical") }
                .tag(iOSTab.library)
            }
            .tint(.harvousAccent)

            // Compose FAB — always reachable
            Button {
                let impact = UIImpactFeedbackGenerator(style: .medium)
                impact.impactOccurred()
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
            .padding(.bottom, 80) // clear tab bar
        }
        .sheet(isPresented: $showCompose) {
            ComposeView()
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
    }
}
#endif

// MARK: - Sidebar selection model

enum SidebarItem: Hashable {
    case allNotes
    case recent
    case scripture
    case threadGroup(String) // color key
}

#Preview {
    ContentView()
        .modelContainer(for: [Note.self], inMemory: true)
}
