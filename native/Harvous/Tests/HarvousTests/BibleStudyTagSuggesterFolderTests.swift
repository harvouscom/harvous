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

    func testSalvationTestimonyPrimaryOnlyNoSecondaryOrFolderTags() {
        let title = "10 years ago"
        let body =
            "10 years ago I raised my hand during a salvation call at a church I had been going to only a handful of times. I was invited"
        let r = BibleStudyTagSuggester.result(title: title, body: body)
        XCTAssertEqual(r.primaryFolder?.lowercased(), "salvation")
        XCTAssertTrue(r.secondaryFolders.isEmpty)
        XCTAssertFalse(r.tags.contains(where: { $0.caseInsensitiveCompare("Salvation") == .orderedSame }))
        XCTAssertFalse(r.tags.contains(where: { $0.caseInsensitiveCompare("Redemption") == .orderedSame }))
    }

    func testOnTopicMarriageStillAssignsMarriageFolder() {
        let r = BibleStudyTagSuggester.result(
            title: "Our wedding day",
            body: "We celebrated our marriage and wedding with family. My spouse and I made vows before God."
        )
        XCTAssertEqual(r.primaryFolder?.lowercased(), "marriage")
    }

    func testOnTopicFriendshipStillAssignsFriendshipFolder() {
        let r = BibleStudyTagSuggester.result(
            title: "Deep friendship",
            body: "True friendship and companionship have sustained me. Christian fellowship with close friends sharpens faith."
        )
        XCTAssertEqual(r.primaryFolder?.lowercased(), "friendship")
    }

    func testLutheranTestimonyDoesNotTagMarriageOrFriendship() {
        let body = """
            10 years ago I raised my hand during a salvation call at a church I had been going to only a handful of times. \
            Before this the only scripture I really remembered was John 3:16. \
            I didn't know you could have a relationship with God. \
            Prayer was this formal sounding way of talking to God. \
            I will say my favorite part was communion. \
            Outside of this, the smell of coffee in the fellowship hall.
            """
        let r = BibleStudyTagSuggester.result(title: "", body: body)
        XCTAssertFalse(r.tags.contains(where: { $0.caseInsensitiveCompare("Marriage") == .orderedSame }))
        XCTAssertFalse(r.tags.contains(where: { $0.caseInsensitiveCompare("Friendship") == .orderedSame }))
        XCTAssertTrue(r.tags.contains(where: { $0.caseInsensitiveCompare("John") == .orderedSame }))
    }
}

private extension String {
    func repeated(count: Int) -> String {
        String(repeating: self, count: count)
    }
}
