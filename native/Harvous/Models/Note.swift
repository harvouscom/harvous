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
    /// Scoped to a `Space.id`; `nil` is treated as the default personal home during migration.
    var spaceId: UUID?
    var createdAt: Date
    var updatedAt: Date

    @Relationship(deleteRule: .cascade, inverse: \StudyThread.parentNote)
    var studyThreads: [StudyThread] = []

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
        spaceId: UUID? = nil
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
        self.tags = tags
        self.spaceId = spaceId
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
}
