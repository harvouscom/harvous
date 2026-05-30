import SwiftData
import SwiftUI

/// Resolves a `Note` by id for `NavigationStack` destinations (FAB + deep links share the path).
struct NoteEditorById: View {
    let noteId: UUID

    @Query private var candidates: [Note]

    init(noteId: UUID) {
        self.noteId = noteId
        _candidates = Query(filter: #Predicate<Note> { $0.id == noteId })
    }

    var body: some View {
        Group {
            if let note = candidates.first {
                StatefulNoteEditorView(note: note)
            } else {
                HarvousEmptyStateView(
                    iconAsset: "Harvous.Note",
                    title: "Note unavailable",
                    description: "This note may have been deleted.",
                    scale: .compact
                )
            }
        }
        #if os(iOS)
        .harvousIOSGlassOverCanvasShell()
        #endif
    }
}
