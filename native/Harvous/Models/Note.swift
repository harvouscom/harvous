import SwiftUI
import SwiftData

@Model
final class Note {
    var id: UUID
    var title: String
    var body: String                    // plain text body, pills re-detected on open
    var detectedRefs: [String]          // e.g. ["John 3:16", "Phil 4:13"]
    var threadColor: String?            // color key: "blue", "yellow", etc.
    var threadName: String?
    var tags: [String]
    var createdAt: Date
    var updatedAt: Date

    init(
        title: String = "",
        body: String = "",
        detectedRefs: [String] = [],
        threadColor: String? = nil,
        threadName: String? = nil,
        tags: [String] = []
    ) {
        self.id = UUID()
        self.title = title
        self.body = body
        self.detectedRefs = detectedRefs
        self.threadColor = threadColor
        self.threadName = threadName
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

    /// SwiftUI Color from stored color key
    var color: Color? {
        guard let key = threadColor else { return nil }
        return HarvousColors.thread(key)
    }

    // Auto-assign a thread color from the palette on first save
    static func nextColor(existing: [Note]) -> String {
        let palette = ["blue", "yellow", "green", "pink", "orange", "purple"]
        let used = existing.compactMap(\.threadColor)
        return palette.first { !used.contains($0) } ?? palette[existing.count % palette.count]
    }
}
