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

struct DeleteNoteActionKey: FocusedValueKey {
    typealias Value = () -> Void
}

struct ToggleInspectorActionKey: FocusedValueKey {
    typealias Value = () -> Void
}

struct NewConnectedNoteActionKey: FocusedValueKey {
    typealias Value = () -> Void
}

struct FocusNoteListActionKey: FocusedValueKey {
    typealias Value = () -> Void
}

struct NextStudyHighlightActionKey: FocusedValueKey {
    typealias Value = () -> Void
}

struct PreviousStudyHighlightActionKey: FocusedValueKey {
    typealias Value = () -> Void
}

struct ToggleStudyHighlightDockExpandedActionKey: FocusedValueKey {
    typealias Value = () -> Void
}

struct RemoveActiveStudyHighlightActionKey: FocusedValueKey {
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

    var deleteNoteAction: (() -> Void)? {
        get { self[DeleteNoteActionKey.self] }
        set { self[DeleteNoteActionKey.self] = newValue }
    }

    var toggleInspectorAction: (() -> Void)? {
        get { self[ToggleInspectorActionKey.self] }
        set { self[ToggleInspectorActionKey.self] = newValue }
    }

    var newConnectedNoteAction: (() -> Void)? {
        get { self[NewConnectedNoteActionKey.self] }
        set { self[NewConnectedNoteActionKey.self] = newValue }
    }

    var focusNoteListAction: (() -> Void)? {
        get { self[FocusNoteListActionKey.self] }
        set { self[FocusNoteListActionKey.self] = newValue }
    }

    var nextStudyHighlightAction: (() -> Void)? {
        get { self[NextStudyHighlightActionKey.self] }
        set { self[NextStudyHighlightActionKey.self] = newValue }
    }

    var previousStudyHighlightAction: (() -> Void)? {
        get { self[PreviousStudyHighlightActionKey.self] }
        set { self[PreviousStudyHighlightActionKey.self] = newValue }
    }

    var toggleStudyHighlightDockExpandedAction: (() -> Void)? {
        get { self[ToggleStudyHighlightDockExpandedActionKey.self] }
        set { self[ToggleStudyHighlightDockExpandedActionKey.self] = newValue }
    }

    var removeActiveStudyHighlightAction: (() -> Void)? {
        get { self[RemoveActiveStudyHighlightActionKey.self] }
        set { self[RemoveActiveStudyHighlightActionKey.self] = newValue }
    }
}

// MARK: - App-level menu commands

struct HarvousCommands: Commands {
    @FocusedValue(\.newNoteAction) private var newNoteAction
    @FocusedValue(\.showSearchAction) private var showSearchAction
    @FocusedValue(\.dailyNoteAction) private var dailyNoteAction
    @FocusedValue(\.randomRevisitAction) private var randomRevisitAction
    @FocusedValue(\.insertWikiLinkAction) private var insertWikiLinkAction
#if os(macOS)
    @FocusedObject private var editorProxy: EditorProxy?
#endif
    @FocusedValue(\.deleteNoteAction) private var deleteNoteAction
    @FocusedValue(\.toggleInspectorAction) private var toggleInspectorAction
    @FocusedValue(\.newConnectedNoteAction) private var newConnectedNoteAction
    @FocusedValue(\.focusNoteListAction) private var focusNoteListAction
    @FocusedValue(\.nextStudyHighlightAction) private var nextStudyHighlightAction
    @FocusedValue(\.previousStudyHighlightAction) private var previousStudyHighlightAction
    @FocusedValue(\.toggleStudyHighlightDockExpandedAction) private var toggleStudyHighlightDockExpandedAction
    @FocusedValue(\.removeActiveStudyHighlightAction) private var removeActiveStudyHighlightAction

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

            Button("Focus Note List") { focusNoteListAction?() }
                .keyboardShortcut("0", modifiers: .command)
                .disabled(focusNoteListAction == nil)
        }

        // Preferences use a `Window` scene (not `Settings`) so chrome matches the main window; wire ⌘, here.
        CommandGroup(replacing: .appSettings) {
            Button("Settings…") {
                NotificationCenter.default.post(name: .harvousOpenMacPreferences, object: nil)
            }
            .keyboardShortcut(",", modifiers: .command)
        }

        CommandMenu("Format") {
            Button("Strikethrough") { editorProxy?.strikethrough() }
                .keyboardShortcut("x", modifiers: [.command, .shift])
                .disabled(editorProxy == nil)

            Divider()

            Button("Heading 2") { editorProxy?.heading(2) }
                .keyboardShortcut("2", modifiers: [.command, .option])
                .disabled(editorProxy == nil)

            Button("Heading 3") { editorProxy?.heading(3) }
                .keyboardShortcut("3", modifiers: [.command, .option])
                .disabled(editorProxy == nil)

            Button("Heading 4") { editorProxy?.heading(4) }
                .keyboardShortcut("4", modifiers: [.command, .option])
                .disabled(editorProxy == nil)

            Button("Body") { editorProxy?.bodyText() }
                .keyboardShortcut("0", modifiers: [.command, .option])
                .disabled(editorProxy == nil)

            Divider()

            Button("Bulleted List") { editorProxy?.insertBullet() }
                .keyboardShortcut("8", modifiers: [.command, .shift])
                .disabled(editorProxy == nil)

            Button("Numbered List") { editorProxy?.insertNumbered() }
                .keyboardShortcut("7", modifiers: [.command, .shift])
                .disabled(editorProxy == nil)

            Divider()

            Button("Add Link…") { editorProxy?.addOrEditLink() }
                .keyboardShortcut("l", modifiers: .command)
                .disabled(editorProxy == nil)

            Button("Inline Code") { editorProxy?.insertCode() }
                .keyboardShortcut("c", modifiers: [.command, .option])
                .disabled(editorProxy == nil)
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

            #if os(macOS)
            Divider()

            Button("New Connected Note") { newConnectedNoteAction?() }
                .keyboardShortcut("n", modifiers: [.command, .option])
                .disabled(newConnectedNoteAction == nil)

            Button("Delete Note…") { deleteNoteAction?() }
                .keyboardShortcut(.delete, modifiers: [.command, .control])
                .disabled(deleteNoteAction == nil)

            Button("Toggle Note Details") { toggleInspectorAction?() }
                .keyboardShortcut("i", modifiers: [.command, .option])
                .disabled(toggleInspectorAction == nil)

            Divider()

            Button("Next Scripture Pill") { editorProxy?.focusNextScripturePill() }
                .keyboardShortcut("]", modifiers: [.command, .control])
                .disabled(editorProxy == nil)

            Button("Previous Scripture Pill") { editorProxy?.focusPreviousScripturePill() }
                .keyboardShortcut("[", modifiers: [.command, .control])
                .disabled(editorProxy == nil)

            Button("Toggle Scripture Pill Dock") { editorProxy?.postToggleActivePillDockExpanded() }
                .keyboardShortcut("p", modifiers: [.command, .option])
                .disabled(editorProxy == nil)

            Divider()

            Button("Next Study Highlight") { nextStudyHighlightAction?() }
                .keyboardShortcut("]", modifiers: [.command, .control, .shift])
                .disabled(nextStudyHighlightAction == nil)

            Button("Previous Study Highlight") { previousStudyHighlightAction?() }
                .keyboardShortcut("[", modifiers: [.command, .control, .shift])
                .disabled(previousStudyHighlightAction == nil)

            Button("Toggle Highlight Dock") { toggleStudyHighlightDockExpandedAction?() }
                .keyboardShortcut("h", modifiers: [.command, .option])
                .disabled(toggleStudyHighlightDockExpandedAction == nil)

            Button("Remove Highlight") { removeActiveStudyHighlightAction?() }
                .keyboardShortcut(.delete, modifiers: [.command, .option])
                .disabled(removeActiveStudyHighlightAction == nil)
            #endif
        }

        CommandGroup(replacing: .help) {
            Link("Harvous Website", destination: URL(string: "https://harvous.com")!)
        }

        CommandGroup(replacing: .toolbar) { }
    }
}
