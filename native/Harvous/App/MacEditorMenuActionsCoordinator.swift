#if os(macOS)
import SwiftUI

/// Bridges note-editor menu shortcuts to `ContentView` without re-publishing `.focusedSceneValue`
/// on every `NoteEditorView` render (e.g. study dock expand/collapse animations).
@MainActor
final class MacEditorMenuActionsCoordinator: ObservableObject {
    private var deleteNote: (() -> Void)?
    private var newConnectedNote: (() -> Void)?
    private var nextStudyHighlight: (() -> Void)?
    private var previousStudyHighlight: (() -> Void)?
    private var toggleStudyHighlightDockExpanded: (() -> Void)?
    private var removeActiveStudyHighlight: (() -> Void)?

    @Published private(set) var isRegistered = false

    var deleteNoteAction: (() -> Void)? { isRegistered ? deleteNote : nil }
    var newConnectedNoteAction: (() -> Void)? { isRegistered ? newConnectedNote : nil }
    var nextStudyHighlightAction: (() -> Void)? { isRegistered ? nextStudyHighlight : nil }
    var previousStudyHighlightAction: (() -> Void)? { isRegistered ? previousStudyHighlight : nil }
    var toggleStudyHighlightDockExpandedAction: (() -> Void)? { isRegistered ? toggleStudyHighlightDockExpanded : nil }
    var removeActiveStudyHighlightAction: (() -> Void)? { isRegistered ? removeActiveStudyHighlight : nil }

    func register(
        deleteNote: @escaping () -> Void,
        newConnectedNote: @escaping () -> Void,
        nextStudyHighlight: @escaping () -> Void,
        previousStudyHighlight: @escaping () -> Void,
        toggleStudyHighlightDockExpanded: @escaping () -> Void,
        removeActiveStudyHighlight: @escaping () -> Void
    ) {
        self.deleteNote = deleteNote
        self.newConnectedNote = newConnectedNote
        self.nextStudyHighlight = nextStudyHighlight
        self.previousStudyHighlight = previousStudyHighlight
        self.toggleStudyHighlightDockExpanded = toggleStudyHighlightDockExpanded
        self.removeActiveStudyHighlight = removeActiveStudyHighlight
        isRegistered = true
    }

    func unregister() {
        deleteNote = nil
        newConnectedNote = nil
        nextStudyHighlight = nil
        previousStudyHighlight = nil
        toggleStudyHighlightDockExpanded = nil
        removeActiveStudyHighlight = nil
        isRegistered = false
    }
}

#endif
