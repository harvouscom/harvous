import CoreSpotlight
import Foundation
import UniformTypeIdentifiers

enum HarvousNoteSpotlightIndexer {
    static let domainIdentifier = "com.harvous.notes"

    static func indexNote(id: UUID, title: String, body: String, tags: [String], scriptureRefs: [String]) {
        let attr = CSSearchableItemAttributeSet(contentType: UTType.plainText)
        let displayTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        attr.title = displayTitle.isEmpty ? "Harvous note" : displayTitle
        let trimmedBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
        attr.contentDescription = trimmedBody.count > 200 ? String(trimmedBody.prefix(200)) + "…" : trimmedBody
        var keywords = tags
        keywords.append(contentsOf: scriptureRefs)
        attr.keywords = keywords

        let item = CSSearchableItem(uniqueIdentifier: id.uuidString, domainIdentifier: domainIdentifier, attributeSet: attr)
        CSSearchableIndex.default().indexSearchableItems([item]) { _ in }
    }

    static func removeNote(id: UUID) {
        CSSearchableIndex.default().deleteSearchableItems(withIdentifiers: [id.uuidString]) { _ in }
    }
}
