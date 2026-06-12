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
        XCTAssertEqual(r.primaryFolder?.lowercased(), "gospel")
        XCTAssertTrue(r.secondaryFolders.contains(where: { $0.caseInsensitiveCompare("Luke") == .orderedSame }))
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

    func testFullLutheranTestimonyAssignsSalvationPrimaryNotPrayerOrFamily() {
        let title = "10 years ago"
        let body = """
            10 years ago I raised my hand during a salvation call at a church I had been going to only a handful of times. I was invited by my friends. Before this the only scripture I really remembered was John 3:16

            Raised Lutheran
            My family went to a local Lutheran church in my hometown, where I was born. I didn't know it at the time but now I know that we just went to this church to check a box, especially because our town was essentially closed on Sundays and it was expected to be in church.
            I didn't know you could have a relationship with God.
            Prayer was this formal sounding way of talking to God and for His honor we'd sit down and stand point numerous times while reading passages and singing hymns.
            I will say my favorite part was communion. I didn't fully understand what this meant. I just wanted to feel accepted and the juice and fresh bread made Sundays better. Outside of this, the smell of coffee in the fellowship hall and the opportunity to help design the new church building this is all I remember from my time at this church.
            Oh, before this church I believe my family and I went to this other Lutheran church in another city between being born and moving back to my hometown. The only thing I remember about this church is the stained glass, natural light, and trees.
            """
        let r = BibleStudyTagSuggester.result(title: title, body: body)
        XCTAssertEqual(r.primaryFolder?.lowercased(), "salvation")
        XCTAssertFalse(r.secondaryFolders.map { $0.lowercased() }.contains("family"))
        XCTAssertFalse(r.secondaryFolders.map { $0.lowercased() }.contains("prayer"))
    }

    func testLutheranTestimonyDoesNotTagMarriageOrFriendship() {
        let body = """
            10 years ago I raised my hand during a salvation call at a church I had been going to only a handful of times. I was invited by my friends. Before this the only scripture I really remembered was John 3:16

            Raised Lutheran

            My family went to a local Lutheran church in my hometown, where I was born. I didn't know it at the time but now I know that we just went to this church to check a box, especially because our town was essentially closed on Sundays and it was expected to be in church.

            I didn't know you could have a relationship with God.

            Prayer was this formal sounding way of talking to God and for His honor we'd sit down and stand point numerous times while reading passages and singing hymns. Oh and I was one of those kids that would walk down the aisle at start and end of service to light and put out the candles.

            I will say my favorite part was communion. I didn't fully understand what this meant. I just wanted to feel accepted and the juice and fresh bread made Sundays better. Outside of this, the smell of coffee in the fellowship hall and the opportunity to help design the new church building this is all I remember from my time at this church.

            Oh, before this church I believe my family and I went to this other Lutheran church in another city between being born and moving back to my hometown. The only thing I remember about this church is the stained glass, natural light, and trees.
            """
        let r = BibleStudyTagSuggester.result(title: "", body: body)
        XCTAssertFalse(r.tags.contains(where: { $0.caseInsensitiveCompare("Marriage") == .orderedSame }))
        XCTAssertFalse(r.tags.contains(where: { $0.caseInsensitiveCompare("Friendship") == .orderedSame }))
    }
}

private extension String {
    func repeated(count: Int) -> String {
        String(repeating: self, count: count)
    }
}
