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
        if let note = candidates.first {
            StatefulNoteEditorView(note: note)
        } else {
            VStack(spacing: 8) {
                Image(systemName: "note.text")
                    .font(.largeTitle)
                    .foregroundStyle(.secondary)
                Text("Note unavailable")
                    .font(HarvousTypography.body)
                Text("This note may have been deleted.")
                    .font(HarvousTypography.caption)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}
