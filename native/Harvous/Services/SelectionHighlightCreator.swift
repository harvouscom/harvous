import Foundation
import SwiftData

enum SelectionHighlightCreator {
    /// Persist a anchored `StudyThread` mini-note (inline highlight paint) from an expanded-plain range.
    @MainActor
    @discardableResult
    static func create(
        parent: Note,
        excerpt: String,
        annotation: String,
        expandedUTF16Range: NSRange,
        expandedPlain: String,
        highlightAccent: StudyHighlightAccentToken = .warmAmber,
        modelContext: ModelContext
    ) -> StudyThread {
        let thread = ThreadStore.createMiniNote(
            parent: parent,
            spaceId: parent.resolvedSpaceId(),
            sourceSnippet: excerpt,
            body: annotation,
            highlightAccent: highlightAccent,
            expandedAnchorUTF16Range: expandedUTF16Range,
            expandedPlainForAnchor: expandedPlain,
            modelContext: modelContext
        )
        ThreadStore.touchParentNoteIfNeeded(thread, modelContext: modelContext)
        return thread
    }
}
