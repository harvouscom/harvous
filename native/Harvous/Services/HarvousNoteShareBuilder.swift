import Foundation
import SwiftUI

/// Live title + plain body for share (e.g. from `editorState.plainText`); copy-only — no mutation of recipient data.
struct NoteShareSnapshot: Equatable, Sendable {
    var title: String
    var body: String
}

/// Builds a single plain-string payload for the system share sheet. Copy-only — no URLs, IDs, or collaboration.
enum HarvousNoteShareBuilder {
    static func plainText(snapshot: NoteShareSnapshot) -> String {
        let title = snapshot.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = snapshot.body.trimmingCharacters(in: .whitespacesAndNewlines)

        switch (title.isEmpty, body.isEmpty) {
        case (true, true):
            return ""
        case (false, true):
            return title
        case (true, false):
            return body
        case (false, false):
            return "\(title)\n\n\(body)"
        }
    }
}

/// Upward from `NoteEditorView` so the macOS window toolbar can share the same live title/body as the editor (not debounced `note.body`).
struct NoteShareSnapshotPreferenceKey: PreferenceKey {
    static var defaultValue: NoteShareSnapshot {
        NoteShareSnapshot(title: "", body: "")
    }

    static func reduce(value: inout NoteShareSnapshot, nextValue: () -> NoteShareSnapshot) {
        value = nextValue()
    }
}
