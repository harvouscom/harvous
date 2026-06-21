import XCTest
#if canImport(AppKit)
import AppKit
#elseif canImport(UIKit)
import UIKit
#endif

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

  func testParseCrossChapterRange() {
    guard let exodusIdx = ScriptureCanonicalBooks.titles.firstIndex(of: "Exodus") else {
      XCTFail("missing Exodus")
      return
    }
    guard let p = ScriptureReferenceParser.parse("Exodus 6:28-7:7") else {
      XCTFail("parse failed")
      return
    }
    XCTAssertEqual(p.bookIndex, exodusIdx)
    XCTAssertEqual(p.chapter, 6)
    XCTAssertEqual(p.verseStart, 28)
    XCTAssertEqual(p.verseEnd, 7)
    XCTAssertEqual(p.endChapter, 7)
    XCTAssertEqual(
      ScriptureReferenceParser.format(bookIndex: exodusIdx, chapter: 6, verseStart: 28, verseEnd: 7, endChapter: 7),
      "Exodus 6:28-7:7"
    )
  }

  func testDetectCrossChapterRangeAsSinglePill() {
    let matches = ScriptureDetector.detect(in: "Read Exodus 6:28-7:7 tonight")
    XCTAssertEqual(matches.count, 1)
    XCTAssertEqual(matches.first?.displayText, "Exodus 6:28-7:7")
  }

  func testCrossChapterOverlapAcrossChapters() {
    guard let exodusIdx = ScriptureCanonicalBooks.titles.firstIndex(of: "Exodus") else {
      XCTFail("missing Exodus")
      return
    }
    // A note tagged "Exodus 7:1" should be found by a query spanning Exodus 6:28-7:7.
    let query = ParsedScriptureFields(bookIndex: exodusIdx, chapter: 6, verseStart: 28, verseEnd: 7, endChapter: 7)
    XCTAssertTrue(ScriptureReferenceParser.anyDetectedReference(["Exodus 7:1"], overlapsStructured: query))
    XCTAssertFalse(ScriptureReferenceParser.anyDetectedReference(["Exodus 8:1"], overlapsStructured: query))
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

  func testDetectReferenceEndingAtSpace() {
    let text = "Reading John 3:16 "
    let match = ScriptureDetector.detectReferenceEnding(in: text, beforeCursorUTF16: (text as NSString).length)
    XCTAssertEqual(match?.displayText, "John 3:16")
    XCTAssertEqual(match?.range.location, 8)
  }

  func testDetectReferenceEndingChapterOnlyAtBoundary() {
    let text = "See Exodus 5 "
    let match = ScriptureDetector.detectReferenceEnding(in: text, beforeCursorUTF16: (text as NSString).length)
    XCTAssertEqual(match?.displayText, "Exodus 5")
  }

  func testDetectReferenceEndingSkipsChapterOnlyMidStream() {
    // A bare chapter-only reference ("Exodus 5", no trailing space) is found at the cursor, but the
    // boundary gate must withhold the pill until a word boundary follows — mid-stream it stays text.
    let text = "Exodus 5"
    let match = ScriptureDetector.detectReferenceEnding(in: text, beforeCursorUTF16: (text as NSString).length)
    XCTAssertEqual(match?.displayText, "Exodus 5")
    XCTAssertFalse(ScriptureDetector.shouldCreatePillAtBoundary(match: match, isBoundary: false))
    XCTAssertTrue(ScriptureDetector.shouldCreatePillAtBoundary(match: match, isBoundary: true))
  }

  func testDetectLastReferenceInWindowForComma() {
    let text = "Romans 8:1,"
    let match = ScriptureDetector.detectLastReferenceInWindow(
      in: text,
      beforeCursorUTF16: (text as NSString).length
    )
    XCTAssertEqual(match?.displayText, "Romans 8:1")
  }

  func testShouldCreatePillAtBoundaryVerseIgnoresBoundaryChapterRequiresIt() {
    // Verse refs may pill mid-stream (no word boundary needed).
    let verse = ScriptureDetector.detect(in: "John 3:16").first
    XCTAssertNotNil(verse)
    XCTAssertTrue(ScriptureDetector.shouldCreatePillAtBoundary(match: verse, isBoundary: false))
    XCTAssertTrue(ScriptureDetector.shouldCreatePillAtBoundary(match: verse, isBoundary: true))

    // Chapter-only refs only pill at a boundary.
    let chapter = ScriptureDetector.detect(in: "Exodus 5").first
    XCTAssertNotNil(chapter)
    XCTAssertFalse(ScriptureDetector.shouldCreatePillAtBoundary(match: chapter, isBoundary: false))
    XCTAssertTrue(ScriptureDetector.shouldCreatePillAtBoundary(match: chapter, isBoundary: true))
  }

  func testCursorIntersectsScripturePill() {
    let storage = NSTextStorage(string: "See ")
    let pill = ScripturePillAttachment(reference: "John 3:16")
    storage.append(NSAttributedString(attachment: pill)) // pill occupies index 4 (U+FFFC)
    storage.append(NSAttributedString(string: " end"))

    // Cursor flush against the pill on either side intersects it (guards against double-pilling).
    XCTAssertTrue(cursorIntersectsScripturePill(in: storage, cursorUTF16: 4))
    XCTAssertTrue(cursorIntersectsScripturePill(in: storage, cursorUTF16: 5))
    // Cursor out in plain text does not.
    XCTAssertFalse(cursorIntersectsScripturePill(in: storage, cursorUTF16: 2))
    XCTAssertFalse(cursorIntersectsScripturePill(in: storage, cursorUTF16: storage.length))
  }
}
