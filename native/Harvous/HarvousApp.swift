import SwiftUI
import SwiftData

@main
struct HarvousApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(for: [Note.self])
    }
}
