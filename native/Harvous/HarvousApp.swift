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
        .defaultSize(width: 1200, height: 740)
        .windowResizability(.contentMinSize)
        #endif
    }
}
