import SwiftUI
import SwiftData

/// Wrapper for linked-note marker IDs used in navigation / sheet presentation.
struct LinkedNoteDestination: Hashable, Identifiable {
    let id: UUID
}

/// Thin wrapper for iOS push navigation — owns the `@State` binding
/// so NoteEditorView's @Binding var note works correctly.
struct StatefulNoteEditorView: View {
    #if os(iOS)
    @State private var linkedNoteSheet: LinkedNoteDestination?
    @Environment(\.dismiss) private var dismiss
    #endif

    @State private var note: Note?

    init(note: Note) {
        _note = State(initialValue: note)
    }

    var body: some View {
        #if os(iOS)
        NoteEditorView(
            note: $note,
            onNavigateToLinkedNotes: { id in
                linkedNoteSheet = LinkedNoteDestination(id: id)
            },
            onRequestDismissEditor: { dismiss() }
        )
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .sheet(item: $linkedNoteSheet) { dest in
            NavigationStack {
                LinkedNotesView(linkedNoteMarkerId: dest.id)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Done") { linkedNoteSheet = nil }
                        }
                    }
            }
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
        }
        #else
        NoteEditorView(note: $note)
        #endif
    }
}
