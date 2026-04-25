import SwiftUI

/// Menu bar commands and keyboard shortcuts — the Apple way.
struct HarvousCommands: Commands {
    @Binding var showCompose: Bool

    var body: some Commands {
        // File menu additions
        CommandGroup(after: .newItem) {
            Button("New Note") {
                showCompose = true
            }
            .keyboardShortcut("n", modifiers: .command)
        }

        // Help menu
        CommandGroup(replacing: .help) {
            Link("Harvous Website", destination: URL(string: "https://harvous.com")!)
        }

        // Remove the default toolbar / view items we don't need
        CommandGroup(replacing: .toolbar) { }
    }
}
