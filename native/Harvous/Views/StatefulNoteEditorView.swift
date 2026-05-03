import SwiftUI

/// Thin wrapper for iOS push navigation — owns the @State binding
/// so NoteEditorView's @Binding var note works correctly.
struct StatefulNoteEditorView: View {
    #if os(iOS)
    @State private var threadPath = NavigationPath()
    #endif

    @State private var note: Note?

    init(note: Note) {
        _note = State(initialValue: note)
    }

    var body: some View {
        #if os(iOS)
        NavigationStack(path: $threadPath) {
            NoteEditorView(
                note: $note,
                onNavigateToStudyThread: { threadPath.append($0) }
            )
            .navigationDestination(for: UUID.self) { id in
                ThreadWorkspaceView(threadID: id)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        #else
        NoteEditorView(note: $note)
        #endif
    }
}
