import XCTest

@testable import Harvous

@MainActor
final class BibleStudyTagSuggesterFolderTests: XCTestCase {
    private let devotionalBody =
        "We trust in the Lord Jesus Christ and the Holy Spirit guides us. God is faithful and good. "
            .repeated(count: 8)

    func testResultDoesNotSuggestGodJesusOrHolySpiritAsPrimary() {
        let r = BibleStudyTagSuggester.result(title: "God is good", body: devotionalBody)
        let primary = r.primaryFolder?.lowercased()
        XCTAssertNotEqual(primary, "god")
        XCTAssertNotEqual(primary, "jesus")
        XCTAssertNotEqual(primary, "holy spirit")
    }

    func testResultDoesNotSuggestGodJesusOrHolySpiritAsSecondaries() {
        let r = BibleStudyTagSuggester.result(
            title: "Morning prayer",
            body: devotionalBody,
            currentPrimaryOverride: "Prayer"
        )
        let lower = r.secondaryFolders.map { $0.lowercased() }
        XCTAssertFalse(lower.contains("god"))
        XCTAssertFalse(lower.contains("jesus"))
        XCTAssertFalse(lower.contains("holy spirit"))
    }

    func testResultSkipsHonorificPersonNameForCharacterTags() {
        let body = "Ps Luke has shared about this book and how we talked about Moses, Noah, and the basket."
        let r = BibleStudyTagSuggester.result(title: "Notes", body: body)
        XCTAssertFalse(r.tags.contains(where: { $0.caseInsensitiveCompare("Luke") == .orderedSame }))
        XCTAssertFalse(r.tags.contains(where: { $0.caseInsensitiveCompare("John") == .orderedSame }))
    }

    func testResultSkipsLukeBookTagInHonorificContext() {
        let body = "Ps Luke has shared a story from church today."
        let r = BibleStudyTagSuggester.result(title: "Notes", body: body)
        XCTAssertFalse(r.tags.contains(where: { $0.caseInsensitiveCompare("Luke") == .orderedSame }))
    }

    func testResultStillTagsApostleLukeInBiblicalContext() {
        let body = "We studied how the apostle Luke wrote his gospel account for Theophilus."
        let r = BibleStudyTagSuggester.result(title: "Luke's Gospel", body: body)
        XCTAssertTrue(r.tags.contains(where: { $0.caseInsensitiveCompare("Luke") == .orderedSame }))
    }
}

private extension String {
    func repeated(count: Int) -> String {
        String(repeating: self, count: count)
    }
}
