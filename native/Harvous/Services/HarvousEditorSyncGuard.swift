import Foundation

/// Decides when `NoteEditorView.syncFromNote` must NOT run because doing so would
/// overwrite in-progress local edits with (possibly stale) note state.
///
/// A non-forced sync fires on remote refreshes (`note.updatedAt` changes). If the user
/// is actively editing, reseeding `title`/`editorState` from the note reverts their
/// keystrokes. Historically only the BODY first responder was protected, so typing in
/// the TITLE field could be clobbered by a remote refresh — felt as "can't type the
/// title." This guard protects the title and body equally, plus any debounced autosave
/// that hasn't flushed yet.
enum HarvousEditorSyncGuard {
    /// `true` when a non-forced `syncFromNote` should be skipped to avoid clobbering
    /// active local edits.
    ///
    /// - Parameters:
    ///   - titleFocused: The title text field currently holds focus.
    ///   - bodyFirstResponder: The body text view currently holds first responder.
    ///   - hasPendingAutosave: A debounced autosave is scheduled but not yet flushed.
    ///   - isCoEditFollower: The note is open for co-editing in a shared space. Native
    ///     is read-only on these, so there are no local edits to protect — and the
    ///     whole point of having it open is to watch someone else write. Skipping the
    ///     refresh would freeze the follower on a stale copy.
    static func shouldSkipNonForceSync(
        titleFocused: Bool,
        bodyFirstResponder: Bool,
        hasPendingAutosave: Bool,
        isCoEditFollower: Bool = false
    ) -> Bool {
        if isCoEditFollower { return false }
        return titleFocused || bodyFirstResponder || hasPendingAutosave
    }
}
