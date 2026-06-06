import XCTest

@testable import Harvous

@MainActor
final class ReferenceSuggestionPainterTests: XCTestCase {
    // Fake dictionary: word → slug for capitalized person/place entries only. Mirrors the
    // category-filtered service lookup so the test exercises capitalize + stoplist logic.
    private func lookup(_ word: String) -> String? {
        switch word.lowercased() {
        case "bethlehem": return "bethlehem"
        case "paul": return "paul"
        case "egypt": return "egypt"
        case "god": return "god"  // present, but stoplisted
        default: return nil       // "water"/"the"/etc. resolve to nothing or non-place categories
        }
    }

    func testMatchesCapitalizedProperNoun() {
        XCTAssertEqual(ReferenceSuggestionPainter.suggestedSlug(for: "Bethlehem", lookup: lookup), "bethlehem")
        XCTAssertEqual(ReferenceSuggestionPainter.suggestedSlug(for: "Paul", lookup: lookup), "paul")
    }

    func testSkipsLowercase() {
        XCTAssertNil(ReferenceSuggestionPainter.suggestedSlug(for: "bethlehem", lookup: lookup))
    }

    func testSkipsStoplistedName() {
        XCTAssertTrue(ReferenceSuggestionPainter.stoplist.contains("god"))
        XCTAssertNil(ReferenceSuggestionPainter.suggestedSlug(for: "God", lookup: lookup))
    }

    func testSkipsUnknownWord() {
        XCTAssertNil(ReferenceSuggestionPainter.suggestedSlug(for: "Spaceship", lookup: lookup))
        XCTAssertNil(ReferenceSuggestionPainter.suggestedSlug(for: "Water", lookup: lookup))
    }

    func testIsCapitalized() {
        XCTAssertTrue(ReferenceSuggestionPainter.isCapitalized("Egypt"))
        XCTAssertFalse(ReferenceSuggestionPainter.isCapitalized("egypt"))
        XCTAssertFalse(ReferenceSuggestionPainter.isCapitalized("123"))
        XCTAssertFalse(ReferenceSuggestionPainter.isCapitalized(""))
    }
}
