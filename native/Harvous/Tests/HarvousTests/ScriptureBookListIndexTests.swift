import XCTest

@testable import Harvous

final class ScriptureBookListIndexTests: XCTestCase {
  func testRows_johnOnlyTwoNotes_oneRowCountTwo() {
    let n1 = Note(detectedRefs: ["John 3:16"])
    let n2 = Note(detectedRefs: ["John 1:1"])
    let rows = ScriptureBookListIndex.rows(from: [n1, n2])
    XCTAssertEqual(rows.count, 1)
    XCTAssertEqual(rows.first?.noteCount, 2)
    XCTAssertEqual(rows.first?.referenceCount, 2)
    XCTAssertEqual(rows.first?.title, "John")
  }

  func testRows_oneNoteTwoJohnRefs_referenceCountTwoNoteCountOne() {
    guard let johnIdx = ScriptureCanonicalBooks.titles.firstIndex(of: "John") else {
      XCTFail("missing John")
      return
    }
    let n = Note(detectedRefs: ["John 3:16", "John 1:1"])
    let rows = ScriptureBookListIndex.rows(from: [n])
    XCTAssertEqual(rows.count, 1)
    XCTAssertEqual(rows.first?.bookIndex, johnIdx)
    XCTAssertEqual(rows.first?.noteCount, 1)
    XCTAssertEqual(rows.first?.referenceCount, 2)
  }

  func testRows_genesisAndRevelation_canonicalOrder() {
    guard let genesisIdx = ScriptureCanonicalBooks.titles.firstIndex(of: "Genesis"),
      let revIdx = ScriptureCanonicalBooks.titles.firstIndex(of: "Revelation")
    else {
      XCTFail("missing books")
      return
    }
    let g = Note(detectedRefs: ["Genesis 1:1"])
    let r = Note(detectedRefs: ["Revelation 22:21"])
    let rows = ScriptureBookListIndex.rows(from: [r, g])
    XCTAssertEqual(rows.map(\.bookIndex), [genesisIdx, revIdx])
  }

  func testFiltered_titlePrefixKeepsMatchingRow() {
    guard let johnIdx = ScriptureCanonicalBooks.titles.firstIndex(of: "John") else {
      XCTFail("missing John")
      return
    }
    let notes = [Note(detectedRefs: ["John 3:16"])]
    let rows = ScriptureBookListIndex.rows(from: notes)
    let filtered = ScriptureBookListIndex.filtered(rows: rows, query: "joh", notesForBucketMatching: notes)
    XCTAssertEqual(filtered.count, 1)
    XCTAssertEqual(filtered.first?.bookIndex, johnIdx)
  }

  func testReferenceRows_ordersChapterVerseWithinBook() {
    guard let johnIdx = ScriptureCanonicalBooks.titles.firstIndex(of: "John") else {
      XCTFail("missing John")
      return
    }
    let n = Note(detectedRefs: ["John 3:16", "John 1:1"])
    let refs = ScriptureBookListIndex.referenceRows(bookIndex: johnIdx, notesInActiveSpace: [n])
    XCTAssertEqual(refs.count, 2)
    XCTAssertTrue(refs[0].title.contains("1:1"), "expected John 1:1 first, got \(refs[0].title)")
    XCTAssertTrue(refs[1].title.contains("3:16"), "expected John 3:16 second, got \(refs[1].title)")
  }

  func testReferenceRows_twoNotesSamePassage_noteCountTwo() {
    guard let johnIdx = ScriptureCanonicalBooks.titles.firstIndex(of: "John") else {
      XCTFail("missing John")
      return
    }
    let n1 = Note(detectedRefs: ["John 3:16"])
    let n2 = Note(detectedRefs: ["John 3:16"])
    let refs = ScriptureBookListIndex.referenceRows(bookIndex: johnIdx, notesInActiveSpace: [n1, n2])
    XCTAssertEqual(refs.count, 1)
    XCTAssertEqual(refs.first?.noteCount, 2)
  }
}
