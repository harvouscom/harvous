import SwiftUI

struct ContentView: View {
    @State private var selectedTab: Tab = .home
    @State private var showCompose = false

    enum Tab: String, CaseIterable {
        case home    = "Home"
        case search  = "Search"
        case library = "Library"

        var icon: String {
            switch self {
            case .home:    "house"
            case .search:  "magnifyingglass"
            case .library: "books.vertical"
            }
        }
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            TabView(selection: $selectedTab) {
                HomeView(showCompose: $showCompose)
                    .tabItem { Label("Home", systemImage: "house") }
                    .tag(Tab.home)

                SearchView()
                    .tabItem { Label("Search", systemImage: "magnifyingglass") }
                    .tag(Tab.search)

                LibraryView()
                    .tabItem { Label("Library", systemImage: "books.vertical") }
                    .tag(Tab.library)
            }

            // Floating compose button — always visible
            Button {
                showCompose = true
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 56, height: 56)
                    .background(Color.harvousAccent, in: Circle())
                    .shadow(color: Color.harvousAccent.opacity(0.35), radius: 12, y: 4)
            }
            .buttonStyle(.plain)
            .padding(.bottom, 24)
            .sheet(isPresented: $showCompose) {
                ComposeView()
            }
        }
    }
}

#Preview {
    ContentView()
        .modelContainer(for: [Note.self], inMemory: true)
}
