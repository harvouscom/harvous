import Foundation
import SwiftData

@Model
final class Note {
    var id: UUID
    var title: String
    var body: String                    // plain text body, pills re-detected on open
    var detectedRefs: [String]          // e.g. ["John 3:16", "Phil 4:13"]
    /// Legacy — unused in UI; kept for SwiftData compatibility.
    var threadColor: String?
    var threadName: String?
    /// Smart collection label (theme / subject) from on-device keyword tagging.
    var primaryCollection: String?
    /// User-set collection should not be replaced by auto-tagging.
    var isCollectionUserOverride: Bool = false
    /// Optional user pin to keep current collection fixed.
    var isCollectionPinned: Bool = false
    /// Confidence of the last auto-assigned primary collection.
    var collectionAutoConfidence: Double? = nil
    /// Timestamp of the last auto-assignment of primary collection.
    var collectionLastAutoUpdatedAt: Date? = nil
    var tags: [String]
    /// User pin (note-level); surface in list/chrome and keep stable under auto-tag churn.
    var isPinned: Bool = false
    /// Scoped to a `Space.id`; `nil` is treated as the default personal home during migration.
    var spaceId: UUID?
    /// Server UUID when syncing (v2). Always `nil` in v1.
    var cloudId: UUID?
    /// Tracks rows pending upload in v2. Unused locally in v1.
    var needsSync: Bool = false
    /// Cached filename (no path) last written under the space folder in the Markdown vault mirror.
    var vaultFilename: String?
    /// Optional 1–7 “stickiness” score (Steph-style rating); `nil` means unset.
    var rating: Int?
    /// Local per-device sequential ID for human-readable labels (`N001`), assigned on create/backfill.
    /// TODO: When native cloud sync lands, reconcile with server `simpleNoteId` on conflict.
    var simpleNoteId: Int?
    var createdAt: Date
    var updatedAt: Date

    /// Per-note + per-reference scripture pill accent overrides.
    /// Encoded JSON: `{ "John 3:16": "amber", "Phil 4:13": "teal" }` — keys are the pill reference
    /// string (translation-agnostic), values are `StudyHighlightAccentToken.rawValue`. Pills with
    /// no entry here render with the neutral default palette (space theme intentionally ignored).
    var scripturePillAccentsJSON: String = "{}"

    @Relationship(deleteRule: .cascade, inverse: \StudyThread.parentNote)
    var studyThreads: [StudyThread] = []

    /// Time-Machine-style version history. Cascaded so deleting a note disposes of its snapshots.
    @Relationship(deleteRule: .cascade)
    var snapshots: [NoteSnapshot] = []

    init(
        title: String = "",
        body: String = "",
        detectedRefs: [String] = [],
        threadColor: String? = nil,
        threadName: String? = nil,
        primaryCollection: String? = nil,
        isCollectionUserOverride: Bool = false,
        isCollectionPinned: Bool = false,
        collectionAutoConfidence: Double? = nil,
        collectionLastAutoUpdatedAt: Date? = nil,
        tags: [String] = [],
        spaceId: UUID? = nil,
        cloudId: UUID? = nil,
        needsSync: Bool = false,
        isPinned: Bool = false,
        vaultFilename: String? = nil,
        rating: Int? = nil,
        simpleNoteId: Int? = nil
    ) {
        self.id = UUID()
        self.title = title
        self.body = body
        self.detectedRefs = detectedRefs
        self.threadColor = threadColor
        self.threadName = threadName
        self.primaryCollection = primaryCollection
        self.isCollectionUserOverride = isCollectionUserOverride
        self.isCollectionPinned = isCollectionPinned
        self.collectionAutoConfidence = collectionAutoConfidence
        self.collectionLastAutoUpdatedAt = collectionLastAutoUpdatedAt
        self.isPinned = isPinned
        self.tags = tags
        self.spaceId = spaceId
        self.cloudId = cloudId
        self.needsSync = needsSync
        self.vaultFilename = vaultFilename
        self.rating = rating
        self.simpleNoteId = simpleNoteId
        self.createdAt = Date()
        self.updatedAt = Date()
    }

    /// Short excerpt for card display
    var excerpt: String {
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count > 120 else { return trimmed }
        return String(trimmed.prefix(120)) + "…"
    }

    /// Primary scripture reference for card badge
    var primaryRef: String? { detectedRefs.first }

    // MARK: - Scripture pill accent map

    private var decodedScripturePillAccents: [String: String] {
        guard let data = scripturePillAccentsJSON.data(using: .utf8) else { return [:] }
        return (try? JSONDecoder().decode([String: String].self, from: data)) ?? [:]
    }

    private func encodeScripturePillAccents(_ map: [String: String]) {
        guard let data = try? JSONEncoder().encode(map),
              let str = String(data: data, encoding: .utf8) else { return }
        scripturePillAccentsJSON = str
    }

    /// Raw accent token value for a given reference, or `nil` if none set (use neutral default).
    func scripturePillAccentRaw(forReference reference: String) -> String? {
        decodedScripturePillAccents[reference]
    }

    /// Persist or clear a reference's accent. Pass `nil` to fall back to the neutral default.
    func setScripturePillAccent(_ accentRaw: String?, forReference reference: String) {
        var map = decodedScripturePillAccents
        if let accentRaw {
            map[reference] = accentRaw
        } else {
            map.removeValue(forKey: reference)
        }
        encodeScripturePillAccents(map)
        updatedAt = Date()
    }
}
