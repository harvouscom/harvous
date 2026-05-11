import XCTest

@testable import Harvous

final class HarvousCSVImportTests: XCTestCase {
  func testParseHarvousCSVThreadsSixColumn() {
    let csv = """
Thread Title,Thread Color,Note Title,Note Content,Created Date,Tags
Romans,teal,Paul and the law,"Line one
Line two John 3:16",2024-01-15T12:00:00Z,"faith, hope"
"""
    let rows = HarvousVaultImportFormats.parseHarvousCSVThreads(csv)
    XCTAssertEqual(rows.count, 1)
    let r = rows[0]
    XCTAssertEqual(r.threadTitle, "Romans")
    XCTAssertEqual(r.threadColor, "teal")
    XCTAssertEqual(r.noteTitle, "Paul and the law")
    XCTAssertTrue(r.content.contains("John 3:16"))
    XCTAssertEqual(r.createdDate, "2024-01-15T12:00:00Z")
    XCTAssertEqual(r.tags, ["faith", "hope"])
  }

  func testParseHarvousCSVThreadsLegacyFiveColumn() {
    let csv = """
Thread Title,Note Title,Note Content,Created Date,Tags
My Pile,Untitled,See Phil 4:13,,
"""
    let rows = HarvousVaultImportFormats.parseHarvousCSVThreads(csv)
    XCTAssertEqual(rows.count, 1)
    XCTAssertNil(rows[0].threadColor)
    XCTAssertEqual(rows[0].noteTitle, "Untitled")
    XCTAssertEqual(rows[0].content, "See Phil 4:13")
  }

  func testIsMyPileDisplayTitle() {
    XCTAssertTrue(HarvousVaultImportFormats.isMyPileDisplayTitle("My Pile"))
    XCTAssertTrue(HarvousVaultImportFormats.isMyPileDisplayTitle("unorganized"))
    XCTAssertTrue(HarvousVaultImportFormats.isMyPileDisplayTitle("Sort Later"))
    XCTAssertFalse(HarvousVaultImportFormats.isMyPileDisplayTitle("Romans Study"))
  }

  func testStripLeadingBOM() {
    let withBom = "\u{FEFF}Thread Title,...\nA,B,,,,"
    XCTAssertFalse(HarvousVaultImportFormats.stripLeadingBOM(withBom).hasPrefix("\u{FEFF}"))
  }
}
