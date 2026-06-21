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
        // Books are folder-only-when-primary: the book "Luke" no longer becomes a secondary folder —
        // it surfaces as a tag instead.
        XCTAssertFalse(r.secondaryFolders.contains(where: { $0.caseInsensitiveCompare("Luke") == .orderedSame }))
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

    // MARK: - Primary-folder gate for passing person/place mentions

    func testSurveyNoteUsesTopicNotPassingName() {
        let title = "Women of the Bible"
        let body =
            "Women served a great purpose in God's plan as they were actually the first supporters of Jesus. "
            + "Ruth, Esther, Mary Magdalene, the Samaritan Woman, and the Virgin Mary. "
            + "I don't really know any scripture about women except the one that is about being quiet. Proverbs 31"
        let r = BibleStudyTagSuggester.result(title: title, body: body)
        XCTAssertEqual(r.primaryFolder, "Women of the Bible")
        XCTAssertNotEqual(r.primaryFolder, "Mary Magdalene")
        XCTAssertNotEqual(r.primaryFolder, "Ruth")
    }

    func testTitleNamedRecurringCharacterStaysPrimary() {
        let title = "Moses"
        let body =
            "Moses climbed the mountain to meet with the Lord. Moses spoke to the people below. "
            + "Moses carried the staff in his hand. Moses listened and Moses obeyed what he heard that day."
        let r = BibleStudyTagSuggester.result(title: title, body: body)
        XCTAssertEqual(r.primaryFolder, "Moses")
    }

    func testRecurringCharacterIsPrimaryWithoutTitle() {
        let title = ""
        let body =
            "David played the harp before the king. David fought the giant in the valley. "
            + "David became king over the land. David wrote many songs of his own. David danced before the ark."
        let r = BibleStudyTagSuggester.result(title: title, body: body)
        XCTAssertEqual(r.primaryFolder, "David")
    }

    func testLonePassingCharacterYieldsNoPrimary() {
        let title = ""
        let body =
            "Yesterday we walked along the shore and talked for a long while about many ordinary things "
            + "that happened during the week, and then someone mentioned Peter once before we all went home for dinner."
        let r = BibleStudyTagSuggester.result(title: title, body: body)
        XCTAssertNil(r.primaryFolder)
    }

    func testRecurringCharacterStillAllowedAsSecondary() {
        let title = "My salvation story"
        let body =
            "Salvation changed my life completely. I found salvation through grace alone. "
            + "Salvation is a free gift offered to everyone. "
            + "Paul wrote about it often. Paul explained grace clearly. Paul preached salvation boldly."
        let r = BibleStudyTagSuggester.result(title: title, body: body)
        XCTAssertEqual(r.primaryFolder?.lowercased(), "salvation")
        XCTAssertTrue(r.secondaryFolders.contains(where: { $0.caseInsensitiveCompare("Paul") == .orderedSame }))
    }

    // MARK: - Bible books are folder-only-when-primary

    // Uses a book whose name does not collide with a Bible character (Ephesians has no character
    // row), so the test isolates the books-never-secondary rule from book/character name dedup.
    func testCitedBookStaysOutOfSecondaryFoldersAndBecomesTag() {
        let title = "Notes on grace"
        let body =
            "This passage is really about grace. Grace meets us where we are, and grace keeps "
            + "working in us. We read Ephesians 2:8 and Ephesians 1:7 together."
        let r = BibleStudyTagSuggester.result(title: title, body: body)
        XCTAssertEqual(r.primaryFolder?.lowercased(), "grace")
        XCTAssertFalse(r.secondaryFolders.contains(where: { $0.caseInsensitiveCompare("Ephesians") == .orderedSame }))
        XCTAssertTrue(r.tags.contains(where: { $0.caseInsensitiveCompare("Ephesians") == .orderedSame }))
    }

    func testSingleBookPrimaryKeepsOtherCitedBookAsTagNotSecondary() {
        let title = "Study notes"
        let body =
            "We worked through Romans today. Romans builds its case carefully, and Romans returns "
            + "again to the same theme. We glanced once at Galatians 5:1 for comparison."
        let r = BibleStudyTagSuggester.result(title: title, body: body)
        XCTAssertEqual(r.primaryFolder?.lowercased(), "romans")
        XCTAssertFalse(r.secondaryFolders.contains(where: { $0.caseInsensitiveCompare("Galatians") == .orderedSame }))
    }

    func testBookStudyWinsPrimaryWhenBookIsInTitle() {
        let title = "Ephesians"
        // Body kept lowercase right after the title so "Ephesians" is not read as a first name
        // ahead of a capitalized surname (PersonNameContextGate).
        let body =
            "this letter, Ephesians, unfolds the riches of our calling. "
            + "Ephesians shows us how to walk worthy of what we have received."
        let r = BibleStudyTagSuggester.result(title: title, body: body)
        XCTAssertEqual(r.primaryFolder?.lowercased(), "ephesians")
    }

    // A thematic note that cites a numbered book must not turn the book into a folder; the book
    // becomes a tag. (Uses 1 Corinthians — a numbered book with no colliding character name.)
    func testNumberedBookCitationNeverBecomesAFolder() {
        let title = "Notes on grace"
        let body =
            "This passage is really about grace. Grace meets us where we are, and grace keeps "
            + "working in us. We read 1 Corinthians 13:4 and 1 Corinthians 1:4 together."
        let r = BibleStudyTagSuggester.result(title: title, body: body)
        XCTAssertEqual(r.primaryFolder?.lowercased(), "grace")
        XCTAssertFalse(r.secondaryFolders.contains(where: { $0.caseInsensitiveCompare("1 Corinthians") == .orderedSame }))
        XCTAssertTrue(r.tags.contains(where: { $0.caseInsensitiveCompare("1 Corinthians") == .orderedSame }))
    }

    // The user's exact case: citing 1 Peter must not leak the apostle "Peter" (whose name is the
    // tail of the book name) into a folder. The book "1 Peter" becomes a tag; no person folder.
    func testNumberedBookSharingACharacterNameDoesNotLeakThePerson() {
        let title = "Notes on grace"
        let body =
            "This passage is really about grace. Grace meets us where we are, and grace keeps "
            + "working in us. We read 1 Peter 2:9 and 1 Peter 1:3 together."
        let r = BibleStudyTagSuggester.result(title: title, body: body)
        XCTAssertEqual(r.primaryFolder?.lowercased(), "grace")
        let secondaryLower = r.secondaryFolders.map { $0.lowercased() }
        XCTAssertFalse(secondaryLower.contains("1 peter"))
        XCTAssertFalse(secondaryLower.contains("peter"))
        XCTAssertFalse(r.tags.contains(where: { $0.caseInsensitiveCompare("Peter") == .orderedSame }))
    }

    // A genuine reference to the apostle Peter (not part of a numbered book) is still counted.
    func testApostlePeterStillDetectedOutsideNumberedBook() {
        let title = "Peter restored"
        let body =
            "Peter denied the Lord three times. Later Peter wept bitterly, and Peter was restored "
            + "by the shore when Jesus asked Peter if he loved him."
        let r = BibleStudyTagSuggester.result(title: title, body: body)
        XCTAssertEqual(r.primaryFolder?.lowercased(), "peter")
    }

    func testApplyToNoteRespectsDismissedAutoTags() {
        let note = Note(
            title: "Salvation testimony",
            body: "Salvation changed my life. We trust in salvation through grace and prayer daily.",
            tags: ["Salvation", "Prayer"],
            dismissedAutoTags: ["salvation"]
        )
        BibleStudyTagSuggester.applyToNote(note, allowPrimaryUpdate: false, existingFolders: [])
        let lower = note.tags.map { $0.lowercased() }
        XCTAssertFalse(lower.contains("salvation"))
    }
}

private extension String {
    func repeated(count: Int) -> String {
        String(repeating: self, count: count)
    }
}
