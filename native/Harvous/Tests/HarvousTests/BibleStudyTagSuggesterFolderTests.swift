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
}

private extension String {
    func repeated(count: Int) -> String {
        String(repeating: self, count: count)
    }
}
