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

  func testBuildMarkdownEmitsFolderAndFoldersNotThreadColor() {
    let note = Note(title: "Romans 8", body: "No condemnation", spaceId: HarvousSpaceBootstrap.personalHomeSpaceId)
    note.primaryFolder = "Romans"
    note.secondaryFolders = ["Pauline Epistles", "New Testament"]
    note.threadColor = "#ff0000"
    let md = HarvousVaultMarkdown.buildMarkdown(note: note, spaceName: "Home")
    XCTAssertTrue(md.contains("folder: Romans"))
    XCTAssertTrue(md.contains("folders: [Pauline Epistles, New Testament]"))
    XCTAssertFalse(md.contains("threadColor:"))
  }

  func testParseDocumentFolders() {
    let md = """
---
title: Romans 8
folder: Romans
folders: ["Pauline Epistles", "New Testament"]
---
# Romans 8

No condemnation.

"""
    let doc = HarvousVaultMarkdown.parseDocument(md)
    XCTAssertEqual(doc.folder, "Romans")
    XCTAssertEqual(doc.folders, ["Pauline Epistles", "New Testament"])
  }

  func testParseDocumentLegacyCollectionsKey() {
    let md = """
---
title: X
collection: Romans
collections: ["Pauline Epistles"]
---
Body
"""
    let doc = HarvousVaultMarkdown.parseDocument(md)
    XCTAssertEqual(doc.folder, "Romans")
    XCTAssertEqual(doc.folders, ["Pauline Epistles"])
  }

  func testParseDocumentWebBlockStyleArrays() {
    // js-yaml dumps arrays as block sequences; native must parse them on web → native import.
    let md = """
---
id: note_a
title: Grace
folder: Romans
folders:
  - Pauline Epistles
  - New Testament
tags:
  - study
  - grace
refs:
  - Romans 8:1
---
# Grace

For by ==grace== you have been saved.

"""
    let doc = HarvousVaultMarkdown.parseDocument(md)
    XCTAssertEqual(doc.folder, "Romans")
    XCTAssertEqual(doc.folders, ["Pauline Epistles", "New Testament"])
    XCTAssertEqual(doc.tags, ["study", "grace"])
    XCTAssertEqual(doc.refs, ["Romans 8:1"])
  }

  func testCollectionsFromPath() {
    let r = HarvousVaultMarkdown.collectionsFromPath("Pauline Epistles/Romans/Chapter 8")
    XCTAssertEqual(r.primary, "Chapter 8")
    XCTAssertEqual(r.secondary, ["Pauline Epistles", "Romans"])

    let empty = HarvousVaultMarkdown.collectionsFromPath(nil)
    XCTAssertNil(empty.primary)
    XCTAssertTrue(empty.secondary.isEmpty)
  }

  func testResolveImportFoldersFrontmatterWins() {
    // Explicit frontmatter folder overrides directory structure.
    let r = HarvousVaultMarkdown.resolveImportFolders(
      metaFolder: "Grace",
      metaFolders: ["Theology"],
      folderPath: "Some/Other/Path"
    )
    XCTAssertEqual(r.primary, "Grace")
    XCTAssertEqual(r.secondary, ["Theology"])

    // No frontmatter → derive from path.
    let p = HarvousVaultMarkdown.resolveImportFolders(metaFolder: nil, metaFolders: [], folderPath: "Vault/Romans")
    XCTAssertEqual(p.primary, "Romans")
    XCTAssertEqual(p.secondary, ["Vault"])
  }

  func testNormalizeSecondaryFolderLabelsExcludesPrimaryAndDedupes() {
    let out = HarvousVaultMarkdown.normalizeSecondaryFolderLabels(
      ["Romans", "Theology", "theology", " ", "Grace"],
      primary: "Romans"
    )
    XCTAssertEqual(out, ["Theology", "Grace"])
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
