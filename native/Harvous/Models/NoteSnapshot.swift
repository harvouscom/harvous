import Foundation
import SwiftData

/// Why a snapshot was captured. Stored as raw string for SwiftData portability.
enum SnapshotReason: String, Codable, CaseIterable {
    /// 5-minute active interval cadence.
    case autoInterval
    /// Idle flush ~30s after the last keystroke.
    case autoIdle
    /// User requested it explicitly (no v1 UI yet — reserved).
    case manual
    /// Captured automatically just before a restore so the restore is itself reversible.
    case preRestore
}

/// A point-in-time capture of a `Note`'s textual content. One-to-many from `Note`.
///
/// We store the full body as plain text (cheap; pills are re-detected on open) plus
/// the title and detected refs needed to reconstruct the editor view. Schema mirrors
/// what a future `note_snapshots` Supabase table would look like, so when the Swift
/// SDK lands, sync can be added by uploading rows where `needsSync == true` (same
/// pattern `Note.cloudId`/`needsSync` already anticipates).
@Model
final class NoteSnapshot {
    @Attribute(.unique) var id: UUID
    /// Mirror of the parent `Note.id` for fetch queries that don't traverse the relationship.
    var noteID: UUID
    var body: String
    var title: String
    var detectedRefs: [String]
    var capturedAt: Date
    /// Raw value of `SnapshotReason`. Use `reason` to access typed.
    var reasonRaw: String
    /// Server UUID when synced (mirrors `Note.cloudId`). Always `nil` in v1.
    var cloudId: UUID?
    /// Tracks rows pending upload once Supabase sync lands.
    var needsSync: Bool = false

    init(
        noteID: UUID,
        body: String,
        title: String,
        detectedRefs: [String],
        reason: SnapshotReason,
        capturedAt: Date = Date()
    ) {
        self.id = UUID()
        self.noteID = noteID
        self.body = body
        self.title = title
        self.detectedRefs = detectedRefs
        self.capturedAt = capturedAt
        self.reasonRaw = reason.rawValue
    }

    var reason: SnapshotReason {
        SnapshotReason(rawValue: reasonRaw) ?? .autoInterval
    }
}
