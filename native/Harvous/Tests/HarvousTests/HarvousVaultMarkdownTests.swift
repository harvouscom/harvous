import XCTest

@testable import Harvous

final class HarvousVaultMarkdownTests: XCTestCase {
  func testSanitizeSpaceFolderName() {
    XCTAssertEqual(HarvousVaultMarkdown.sanitizeSpaceFolderName("  Study "), "Study")
    XCTAssertEqual(HarvousVaultMarkdown.sanitizeSpaceFolderName(""), "Space")
    XCTAssertEqual(HarvousVaultMarkdown.sanitizeSpaceFolderName("A/B"), "A_B")
  }

  func testSlugTitleForFilename() {
    XCTAssertEqual(HarvousVaultMarkdown.slugTitleForFilename("Hello"), "Hello")
    XCTAssertEqual(HarvousVaultMarkdown.slugTitleForFilename(""), "Untitled")
    XCTAssertEqual(HarvousVaultMarkdown.slugTitleForFilename("bad:name"), "bad_name")
    XCTAssertTrue(HarvousVaultMarkdown.slugTitleForFilename(String(repeating: "x", count: 120)).count <= 80)
  }

  func testParseDocumentFrontmatter() {
    let md = """
---
id: "550E8400-E29B-41D4-A716-446655440000"
title: Gospel
space: "Home"
tags: [study, prayer]
refs: ["John 3:16"]
pinned: true
rating: 5
highlightsJSON: "[{\\"kind\\":\\"miniNote\\",\\"accent\\":\\"warmAmber\\",\\"anchorText\\":\\"grace\\",\\"annotation\\":\\"Saved by faith\\"}]"
---
# Gospel

We are saved by ==grace== alone.

"""

    let doc = HarvousVaultMarkdown.parseDocument(md)
    XCTAssertEqual(doc.title, "Gospel")
    XCTAssertEqual(doc.spaceName, "Home")
    XCTAssertEqual(doc.tags, ["study", "prayer"])
    XCTAssertEqual(doc.refs, ["John 3:16"])
    XCTAssertTrue(doc.pinned)
    XCTAssertEqual(doc.rating, 5)
    XCTAssertEqual(doc.body, "We are saved by ==grace== alone.")
    XCTAssertEqual(doc.id?.uuidString.lowercased(), "550e8400-e29b-41d4-a716-446655440000")
    XCTAssertEqual(doc.highlights.count, 1)
    XCTAssertEqual(doc.highlights[0].anchorText, "grace")
    XCTAssertEqual(doc.highlights[0].annotation, "Saved by faith")
  }

  func testBuildMarkdownIncludesHighlightsJSON() {
    let note = Note(title: "Test", body: "Body with grace", spaceId: HarvousSpaceBootstrap.personalHomeSpaceId)
    let thread = StudyThread(
      spaceId: note.resolvedSpaceId(),
      parentNoteId: note.id,
      sourceSnippet: "grace",
      focusTitle: "",
      entryKindRaw: StudyThread.EntryKind.miniNote.rawValue,
      miniNoteBody: "Saved",
      anchorTextSnapshot: "grace",
      highlightAccentRaw: StudyHighlightAccentToken.warmAmber.rawValue,
      parentNote: note
    )
    note.studyThreads = [thread]
    let md = HarvousVaultMarkdown.buildMarkdown(note: note, spaceName: "Home")
    XCTAssertTrue(md.contains("highlightsJSON:"))
    XCTAssertTrue(md.contains("==grace=="))
    XCTAssertTrue(md.contains("[!note]"))
  }

  func testParseDocumentWithoutFrontmatterReturnsBody() {
    let raw = "Just prose"
    let doc = HarvousVaultMarkdown.parseDocument(raw)
    XCTAssertEqual(doc.body, raw)
    XCTAssertTrue(doc.tags.isEmpty)
  }

  func testDatePrefixGregorianYMD() {
    let cal = Calendar(identifier: .gregorian)
    var comps = DateComponents()
    comps.year = 2025
    comps.month = 3
    comps.day = 7
    guard let date = cal.date(from: comps) else {
      XCTFail("date")
      return
    }
    XCTAssertEqual(HarvousVaultMarkdown.datePrefix(for: date), "2025-03-07")
  }
}
