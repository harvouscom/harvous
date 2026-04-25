import SwiftUI
import SwiftData

@main
struct HarvousApp: App {
    @State private var showCompose = false

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(for: [Note.self])
        .commands {
            HarvousCommands(showCompose: $showCompose)
        }
        #if os(macOS)
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 1100, height: 700)
        .windowResizability(.contentMinSize)
        #endif
    }
}
