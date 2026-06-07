import Foundation

/// Policy for discarding local-only draft notes when the user switches selection.
/// Never applies to notes that have synced to the server (`serverId` set).
enum HarvousUnsyncedDraftCleanup {
    /// Returns true when a note may be discarded after selection changes (post editor flush).
    static func shouldDiscardOnSelectionChange(serverId: String?, title: String, body: String) -> Bool {
        if let serverId, !serverId.isEmpty { return false }
        return HarvousNoteListVisibility.isEffectivelyEmpty(title: title, body: body)
    }

    static func shouldDiscardOnSelectionChange(_ note: Note) -> Bool {
        shouldDiscardOnSelectionChange(serverId: note.serverId, title: note.title, body: note.body)
    }
}
