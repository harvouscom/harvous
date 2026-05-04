import Foundation
import SwiftUI

// MARK: - Focused value keys

struct NewNoteActionKey: FocusedValueKey {
    typealias Value = () -> Void
}

struct ShowSearchActionKey: FocusedValueKey {
    typealias Value = () -> Void
}

struct DailyNoteActionKey: FocusedValueKey {
    typealias Value = () -> Void
}

struct RandomRevisitActionKey: FocusedValueKey {
    typealias Value = () -> Void
}

struct InsertWikiLinkActionKey: FocusedValueKey {
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

    var dailyNoteAction: (() -> Void)? {
        get { self[DailyNoteActionKey.self] }
        set { self[DailyNoteActionKey.self] = newValue }
    }

    var randomRevisitAction: (() -> Void)? {
        get { self[RandomRevisitActionKey.self] }
        set { self[RandomRevisitActionKey.self] = newValue }
    }

    var insertWikiLinkAction: (() -> Void)? {
        get { self[InsertWikiLinkActionKey.self] }
        set { self[InsertWikiLinkActionKey.self] = newValue }
    }
}

// MARK: - App-level menu commands

struct HarvousCommands: Commands {
    @FocusedValue(\.newNoteAction) private var newNoteAction
    @FocusedValue(\.showSearchAction) private var showSearchAction
    @FocusedValue(\.dailyNoteAction) private var dailyNoteAction
    @FocusedValue(\.randomRevisitAction) private var randomRevisitAction
    @FocusedValue(\.insertWikiLinkAction) private var insertWikiLinkAction

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

        // Preferences use a `Window` scene (not `Settings`) so chrome matches the main window; wire ⌘, here.
        CommandGroup(replacing: .appSettings) {
            Button("Settings…") {
                NotificationCenter.default.post(name: .harvousOpenMacPreferences, object: nil)
            }
            .keyboardShortcut(",", modifiers: .command)
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

        CommandMenu("Note") {
            Button("Daily Note") {
                if let a = dailyNoteAction {
                    a()
                } else {
                    NotificationCenter.default.post(name: .requestDailyNote, object: nil)
                }
            }
            .keyboardShortcut("t", modifiers: .command)

            Button("Random Revisit") {
                if let a = randomRevisitAction {
                    a()
                } else {
                    NotificationCenter.default.post(name: .requestRandomRevisit, object: nil)
                }
            }
            .keyboardShortcut("r", modifiers: [.control, .command])

            Button("Insert Note Wikilink…") {
                if let a = insertWikiLinkAction {
                    a()
                } else {
                    NotificationCenter.default.post(name: .harvousRequestInsertWikiLink, object: nil)
                }
            }
            .keyboardShortcut("l", modifiers: [.command, .shift])
        }

        CommandGroup(replacing: .help) {
            Link("Harvous Website", destination: URL(string: "https://harvous.com")!)
        }

        CommandGroup(replacing: .toolbar) { }
    }
}
