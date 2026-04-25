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

// MARK: - macOS: Two-column (Bear / Apple Notes style)

#if os(macOS)
struct MacRootView: View {
    @State private var selectedNote: Note?
    @State private var showCompose = false

    var body: some View {
        NavigationSplitView {
            NoteListColumn(selectedNote: $selectedNote, showCompose: $showCompose)
                .navigationSplitViewColumnWidth(min: 220, ideal: 268, max: 340)
        } detail: {
            NoteEditorView(note: $selectedNote)
        }
        .navigationSplitViewStyle(.balanced)
        // Remove default NavigationSplitView chrome — we draw our own headers
        .toolbar(removing: .sidebarToggle)
        .sheet(isPresented: $showCompose) {
            ComposeView()
                .frame(minWidth: 580, minHeight: 460)
        }
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
                    NoteListColumn(selectedNote: .constant(nil), showCompose: $showCompose)
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
