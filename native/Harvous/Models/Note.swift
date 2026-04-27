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
    var tags: [String]
    var createdAt: Date
    var updatedAt: Date

    init(
        title: String = "",
        body: String = "",
        detectedRefs: [String] = [],
        threadColor: String? = nil,
        threadName: String? = nil,
        primaryCollection: String? = nil,
        tags: [String] = []
    ) {
        self.id = UUID()
        self.title = title
        self.body = body
        self.detectedRefs = detectedRefs
        self.threadColor = threadColor
        self.threadName = threadName
        self.primaryCollection = primaryCollection
        self.tags = tags
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
