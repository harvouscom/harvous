import SwiftUI

// MARK: - Focused value keys

struct NewNoteActionKey: FocusedValueKey {
    typealias Value = () -> Void
}

struct ShowSearchActionKey: FocusedValueKey {
    typealias Value = () -> Void
}

extension FocusedValues {
    var newNoteAction: (() -> Void)? {
        get { self[NewNoteActionKey.self] }
        set { self[NewNoteActionKey.self] = newValue }
    }

    var showSearchAction: (() -> Void)? {
        get { self[ShowSearchActionKey.self] }
        set { self[ShowSearchActionKey.self] = newValue }
    }
}

// MARK: - App-level menu commands

struct HarvousCommands: Commands {
    @FocusedValue(\.newNoteAction)   private var newNoteAction
    @FocusedValue(\.showSearchAction) private var showSearchAction

    var body: some Commands {
        // macOS: `WindowGroup` registers "New Window" with ⌘N under `.newItem`. Adding our items *after*
        // that group leaves two ⌘N bindings; the system window command wins. Replace the group so ⌘N
        // creates a new note. iPadOS: keep `.after` so we do not strip platform defaults we do not own.
        #if os(macOS)
        CommandGroup(replacing: .newItem) {
            Button("New Note") { newNoteAction?() }
                .keyboardShortcut("n", modifiers: .command)
                .disabled(newNoteAction == nil)

            Button("Search") { showSearchAction?() }
                .keyboardShortcut("k", modifiers: .command)
                .disabled(showSearchAction == nil)
        }
        #else
        CommandGroup(after: .newItem) {
            Button("New Note") { newNoteAction?() }
                .keyboardShortcut("n", modifiers: .command)
                .disabled(newNoteAction == nil)

            Button("Search") { showSearchAction?() }
                .keyboardShortcut("k", modifiers: .command)
                .disabled(showSearchAction == nil)
        }
        #endif

        CommandGroup(replacing: .help) {
            Link("Harvous Website", destination: URL(string: "https://harvous.com")!)
        }

        CommandGroup(replacing: .toolbar) { }
    }
}
