import XCTest

@testable import Harvous

final class ScriptureReferenceParserTests: XCTestCase {
  func testBookIndexAliases() {
    XCTAssertEqual(ScriptureCanonicalBooks.bookIndex(matchingRaw: "John"), ScriptureCanonicalBooks.titles.firstIndex(of: "John"))
    XCTAssertEqual(ScriptureCanonicalBooks.bookIndex(matchingRaw: "jn"), ScriptureCanonicalBooks.titles.firstIndex(of: "John"))
    XCTAssertEqual(ScriptureCanonicalBooks.bookIndex(matchingRaw: "1 Cor"), ScriptureCanonicalBooks.titles.firstIndex(of: "1 Corinthians"))
    XCTAssertNil(ScriptureCanonicalBooks.bookIndex(matchingRaw: ""))
    XCTAssertNil(ScriptureCanonicalBooks.bookIndex(matchingRaw: "   "))
  }

  func testParseSimpleReference() {
    guard let johnIdx = ScriptureCanonicalBooks.titles.firstIndex(of: "John") else {
      XCTFail("missing John")
      return
    }
    guard let p = ScriptureReferenceParser.parse("John 3:16") else {
      XCTFail("parse failed")
      return
    }
    XCTAssertEqual(p.bookIndex, johnIdx)
    XCTAssertEqual(p.chapter, 3)
    XCTAssertEqual(p.verseStart, 16)
    XCTAssertNil(p.verseEnd)
  }

  func testParseVerseRange() {
    guard let p = ScriptureReferenceParser.parse("Psalms 23:1-6") else {
      XCTFail("parse failed")
      return
    }
    XCTAssertEqual(ScriptureCanonicalBooks.titles[p.bookIndex], "Psalms")
    XCTAssertEqual(p.chapter, 23)
    XCTAssertEqual(p.verseStart, 1)
    XCTAssertEqual(p.verseEnd, 6)
  }

  func testOverlapDetection() {
    guard let johnIdx = ScriptureCanonicalBooks.titles.firstIndex(of: "John") else {
      XCTFail("missing John")
      return
    }
    let query = ParsedScriptureFields(bookIndex: johnIdx, chapter: 3, verseStart: 14, verseEnd: 18)
    XCTAssertTrue(ScriptureReferenceParser.anyDetectedReference(["John 3:16"], overlapsStructured: query))
    XCTAssertFalse(ScriptureReferenceParser.anyDetectedReference(["John 4:1"], overlapsStructured: query))
    XCTAssertFalse(ScriptureReferenceParser.anyDetectedReference(["not-a-ref"], overlapsStructured: query))
  }

  func testFormatRoundTripShape() {
    guard let johnIdx = ScriptureCanonicalBooks.titles.firstIndex(of: "Romans") else {
      XCTFail("missing Romans")
      return
    }
    XCTAssertEqual(ScriptureReferenceParser.format(bookIndex: johnIdx, chapter: 8, verseStart: 28, verseEnd: nil), "Romans 8:28")
    XCTAssertEqual(ScriptureReferenceParser.format(bookIndex: johnIdx, chapter: 8, verseStart: 28, verseEnd: 30), "Romans 8:28-30")
  }

  func testParseChapterOnlyReference() {
    guard let exodusIdx = ScriptureCanonicalBooks.titles.firstIndex(of: "Exodus") else {
      XCTFail("missing Exodus")
      return
    }
    guard let p = ScriptureReferenceParser.parse("Exodus 3") else {
      XCTFail("parse failed")
      return
    }
    XCTAssertEqual(p.bookIndex, exodusIdx)
    XCTAssertEqual(p.chapter, 3)
    XCTAssertEqual(p.verseStart, 1)
    XCTAssertEqual(p.verseEnd, 22)
    XCTAssertEqual(ScriptureDetector.normalizeChapterReference(bookIndex: exodusIdx, chapter: 3), "Exodus 3:1-22")
  }

  func testDetectChapterOnlyInText() {
    let matches = ScriptureDetector.detect(in: "Reading Exodus 3 today")
    XCTAssertEqual(matches.count, 1)
    XCTAssertEqual(matches.first?.displayText, "Exodus 3")
  }

  func testDetectSkipsFalsePositiveYears() {
    let matches = ScriptureDetector.detect(in: "John 3 years ago")
    XCTAssertTrue(matches.isEmpty)
  }
}
