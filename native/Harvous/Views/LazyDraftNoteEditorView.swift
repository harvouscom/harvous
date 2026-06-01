#if os(iOS)
import SwiftUI
import SwiftData

/// Push destination for lazy compose — persists to SwiftData on first non-empty save.
struct LazyDraftNoteEditorView: View {
    @Binding var selectedNoteId: UUID?

    @State private var note: Note?
    @State private var isLazyDraftComposeActive = true

    var body: some View {
        NoteEditorView(
            note: $note,
            isLazyDraftComposeActive: $isLazyDraftComposeActive,
            onRequestDismissEditor: {
                selectedNoteId = nil
            }
        )
        .onChange(of: note?.id) { _, newId in
            guard let newId,
                  let current = selectedNoteId,
                  HarvousLazyComposeDraft.isDraftNavigationId(current) else { return }
            selectedNoteId = newId
        }
    }
}
#endif
