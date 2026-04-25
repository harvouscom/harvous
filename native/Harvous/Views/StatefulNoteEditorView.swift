import SwiftUI

/// Thin wrapper for iOS push navigation — owns the @State binding
/// so NoteEditorView's @Binding var note works correctly.
struct StatefulNoteEditorView: View {
    @State private var note: Note?

    init(note: Note) {
        _note = State(initialValue: note)
    }

    var body: some View {
        NoteEditorView(note: $note)
        #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
        #endif
    }
}
