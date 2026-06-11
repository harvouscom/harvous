import XCTest

@testable import Harvous

@MainActor
final class ReferenceSuggestionPainterTests: XCTestCase {
    private func entryLookup(_ word: String) -> EastonsSlugIndexEntry? {
        switch word.lowercased() {
        case "bethlehem": return EastonsSlugIndexEntry(slug: "bethlehem", headword: "Bethlehem", category: "place")
        case "paul": return EastonsSlugIndexEntry(slug: "paul", headword: "Paul", category: "person")
        case "egypt": return EastonsSlugIndexEntry(slug: "egypt", headword: "Egypt", category: "place")
        case "water": return EastonsSlugIndexEntry(slug: "water", headword: "Water", category: "thing")
        case "abaddon": return EastonsSlugIndexEntry(slug: "abaddon", headword: "Abaddon", category: "thing")
        case "a": return EastonsSlugIndexEntry(slug: "a", headword: "A", category: "thing")
        case "ai": return EastonsSlugIndexEntry(slug: "ai", headword: "Ai", category: "place")
        case "ed": return EastonsSlugIndexEntry(slug: "ed", headword: "Ed", category: "place")
        case "god": return EastonsSlugIndexEntry(slug: "god", headword: "God", category: "person")
        default: return nil
        }
    }

    func testMatchesCapitalizedProperNoun() {
        XCTAssertEqual(ReferenceSuggestionPainter.suggestedSlug(for: "Bethlehem", entryLookup: entryLookup), "bethlehem")
        XCTAssertEqual(ReferenceSuggestionPainter.suggestedSlug(for: "Paul", entryLookup: entryLookup), "paul")
    }

    func testMatchesCapitalizedThingWhenMinLengthMet() {
        XCTAssertEqual(ReferenceSuggestionPainter.suggestedSlug(for: "Water", entryLookup: entryLookup), "water")
        XCTAssertEqual(ReferenceSuggestionPainter.suggestedSlug(for: "Abaddon", entryLookup: entryLookup), "abaddon")
    }

    func testMatchesLowercaseThings() {
        XCTAssertEqual(ReferenceSuggestionPainter.suggestedSlug(for: "water", entryLookup: entryLookup), "water")
    }

    func testSkipsLowercasePersonAndPlace() {
        XCTAssertNil(ReferenceSuggestionPainter.suggestedSlug(for: "bethlehem", entryLookup: entryLookup))
        XCTAssertNil(ReferenceSuggestionPainter.suggestedSlug(for: "paul", entryLookup: entryLookup))
    }

    func testSkipsShortDictionaryRowsAndTokens() {
        XCTAssertEqual(ReferenceSuggestionPainter.minLength, 3)
        XCTAssertNil(ReferenceSuggestionPainter.suggestedSlug(for: "A", entryLookup: entryLookup))
        XCTAssertNil(ReferenceSuggestionPainter.suggestedSlug(for: "Ai", entryLookup: entryLookup))
        XCTAssertNil(ReferenceSuggestionPainter.suggestedSlug(for: "Ed", entryLookup: entryLookup))
    }

    func testSkipsStoplistedName() {
        XCTAssertTrue(ReferenceSuggestionPainter.stoplist.contains("god"))
        XCTAssertNil(ReferenceSuggestionPainter.suggestedSlug(for: "God", entryLookup: entryLookup))
    }

    func testSkipsUnknownWord() {
        XCTAssertNil(ReferenceSuggestionPainter.suggestedSlug(for: "Spaceship", entryLookup: entryLookup))
    }

    func testIsCapitalized() {
        XCTAssertTrue(ReferenceSuggestionPainter.isCapitalized("Egypt"))
        XCTAssertFalse(ReferenceSuggestionPainter.isCapitalized("egypt"))
        XCTAssertFalse(ReferenceSuggestionPainter.isCapitalized("123"))
        XCTAssertFalse(ReferenceSuggestionPainter.isCapitalized(""))
    }

    func testShouldSkipPersonNameContextWithHonorificPrefix() {
        let text = "Ps Luke has shared"
        let range = (text as NSString).range(of: "Luke")
        XCTAssertNotEqual(range.location, NSNotFound)
        guard let swiftRange = Range(range, in: text) else {
            XCTFail("Expected Swift range for Luke")
            return
        }
        XCTAssertTrue(ReferenceSuggestionPainter.shouldSkipPersonNameContext(in: text, wordRange: swiftRange))
    }

    func testShouldSkipPersonNameContextWithCapitalizedSurname() {
        let text = "Luke Smith arrived"
        let range = (text as NSString).range(of: "Luke")
        XCTAssertNotEqual(range.location, NSNotFound)
        guard let swiftRange = Range(range, in: text) else {
            XCTFail("Expected Swift range for Luke")
            return
        }
        XCTAssertTrue(ReferenceSuggestionPainter.shouldSkipPersonNameContext(in: text, wordRange: swiftRange))
    }

    func testShouldNotSkipStandaloneApostleName() {
        let text = "the apostle Paul wrote"
        let range = (text as NSString).range(of: "Paul")
        XCTAssertNotEqual(range.location, NSNotFound)
        guard let swiftRange = Range(range, in: text) else {
            XCTFail("Expected Swift range for Paul")
            return
        }
        XCTAssertFalse(ReferenceSuggestionPainter.shouldSkipPersonNameContext(in: text, wordRange: swiftRange))
    }

    func testApplySuggestionsPaintsDottedUnderlineAttributes() {
        let storage = NSTextStorage(string: "Paul went to Bethlehem.")
        ReferenceSuggestionPainter.applySuggestions(storage: storage, isDark: false, entryLookup: entryLookup)

        let paulRange = (storage.string as NSString).range(of: "Paul")
        XCTAssertNotEqual(paulRange.location, NSNotFound)
        XCTAssertEqual(storage.attribute(.harvousReferenceSuggestion, at: paulRange.location, effectiveRange: nil) as? String, "paul")
        let underlineStyle = storage.attribute(.underlineStyle, at: paulRange.location, effectiveRange: nil) as? Int
        XCTAssertNotNil(underlineStyle)
        XCTAssertNotEqual(underlineStyle! & NSUnderlineStyle.patternDot.rawValue, 0)

        let bethlehemRange = (storage.string as NSString).range(of: "Bethlehem")
        XCTAssertNotEqual(bethlehemRange.location, NSNotFound)
        XCTAssertEqual(storage.attribute(.harvousReferenceSuggestion, at: bethlehemRange.location, effectiveRange: nil) as? String, "bethlehem")
    }
}
