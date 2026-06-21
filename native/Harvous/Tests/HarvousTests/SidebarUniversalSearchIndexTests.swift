import XCTest

@testable import Harvous

final class SidebarUniversalSearchIndexTests: XCTestCase {
    func testBuildActiveResults_notesMode() {
        let note = Note(title: "Romans study", body: "Grace and faith")
        let data = SidebarUniversalSearchIndex.SearchData(
            notes: [note],
            folderRows: [],
            highlightThreads: [],
            scriptureBookRows: [],
            threadClusters: [],
            threadDrillNotes: [],
            scripturePassageNotes: []
        )
        let ctx = SidebarUniversalSearchIndex.ActiveContext(
            mode: .notes,
            folderDrillLabel: nil,
            folderDrilledIn: false,
            threadDrillTitle: nil,
            threadDrilledIn: false,
            scriptureBookTitle: nil,
            scriptureBookIndex: nil,
            scripturePassageTitle: nil,
            scriptureDrillLevel: .root,
            highlightKindFilter: .all
        )
        let results = SidebarUniversalSearchIndex.buildActiveResults(
            query: "romans",
            ctx: ctx,
            data: data
        )
        XCTAssertEqual(results.count, 1)
        XCTAssertEqual(results.first?.kind, .note)
    }

    func testBuildElsewhereResults_excludesActiveIds() {
        let note = Note(title: "Romans study", body: "Grace")
        let folderRows = HarvousFolderListIndex.rows(from: [note])
        let data = SidebarUniversalSearchIndex.SearchData(
            notes: [note],
            folderRows: folderRows,
            highlightThreads: [],
            scriptureBookRows: [],
            threadClusters: [],
            threadDrillNotes: [],
            scripturePassageNotes: []
        )
        let ctx = SidebarUniversalSearchIndex.ActiveContext(
            mode: .notes,
            folderDrillLabel: nil,
            folderDrilledIn: false,
            threadDrillTitle: nil,
            threadDrilledIn: false,
            scriptureBookTitle: nil,
            scriptureBookIndex: nil,
            scripturePassageTitle: nil,
            scriptureDrillLevel: .root,
            highlightKindFilter: .all
        )
        let active = SidebarUniversalSearchIndex.buildActiveResults(query: "romans", ctx: ctx, data: data)
        let exclude = Set(active.map(\.id))
        let elsewhere = SidebarUniversalSearchIndex.buildElsewhereResults(
            query: "romans",
            data: data,
            excluding: exclude,
            typeFilter: .all
        )
        XCTAssertFalse(elsewhere.contains(where: { exclude.contains($0.id) }))
    }

    func testActiveSectionHeader_folderDrill() {
        let ctx = SidebarUniversalSearchIndex.ActiveContext(
            mode: .folders,
            folderDrillLabel: "Work",
            folderDrilledIn: true,
            threadDrillTitle: nil,
            threadDrilledIn: false,
            scriptureBookTitle: nil,
            scriptureBookIndex: nil,
            scripturePassageTitle: nil,
            scriptureDrillLevel: .root,
            highlightKindFilter: .all
        )
        XCTAssertEqual(SidebarUniversalSearchIndex.activeSectionHeader(ctx), "In “Work”")
    }

    func testElsewhereEmptyStateTitle_foldersAllFilter() {
        let ctx = SidebarUniversalSearchIndex.ActiveContext(
            mode: .folders,
            folderDrillLabel: nil,
            folderDrilledIn: false,
            threadDrillTitle: nil,
            threadDrilledIn: false,
            scriptureBookTitle: nil,
            scriptureBookIndex: nil,
            scripturePassageTitle: nil,
            scriptureDrillLevel: .root,
            highlightKindFilter: .all
        )
        XCTAssertEqual(
            SidebarUniversalSearchIndex.elsewhereEmptyStateTitle(ctx, typeFilter: .all),
            "Nothing outside Folders"
        )
    }

    func testElsewhereEmptyStateTitle_foldersNotesFilter() {
        let ctx = SidebarUniversalSearchIndex.ActiveContext(
            mode: .folders,
            folderDrillLabel: nil,
            folderDrilledIn: false,
            threadDrillTitle: nil,
            threadDrilledIn: false,
            scriptureBookTitle: nil,
            scriptureBookIndex: nil,
            scripturePassageTitle: nil,
            scriptureDrillLevel: .root,
            highlightKindFilter: .all
        )
        XCTAssertEqual(
            SidebarUniversalSearchIndex.elsewhereEmptyStateTitle(ctx, typeFilter: .notes),
            SidebarNoMatchCopy.noNotesMatch
        )
    }

    func testElsewhereEmptyStateTitle_folderDrillAllFilter() {
        let ctx = SidebarUniversalSearchIndex.ActiveContext(
            mode: .folders,
            folderDrillLabel: "Work",
            folderDrilledIn: true,
            threadDrillTitle: nil,
            threadDrilledIn: false,
            scriptureBookTitle: nil,
            scriptureBookIndex: nil,
            scripturePassageTitle: nil,
            scriptureDrillLevel: .root,
            highlightKindFilter: .all
        )
        XCTAssertEqual(
            SidebarUniversalSearchIndex.elsewhereEmptyStateTitle(ctx, typeFilter: .all),
            "Nothing outside “Work”"
        )
    }

    func testElsewhereEmptyStateTitle_threadsFilter() {
        let ctx = SidebarUniversalSearchIndex.ActiveContext(
            mode: .threads,
            folderDrillLabel: nil,
            folderDrilledIn: false,
            threadDrillTitle: nil,
            threadDrilledIn: false,
            scriptureBookTitle: nil,
            scriptureBookIndex: nil,
            scripturePassageTitle: nil,
            scriptureDrillLevel: .root,
            highlightKindFilter: .all
        )
        XCTAssertEqual(
            SidebarUniversalSearchIndex.elsewhereEmptyStateTitle(ctx, typeFilter: .threads),
            SidebarNoMatchCopy.noThreadsMatch
        )
    }
}
