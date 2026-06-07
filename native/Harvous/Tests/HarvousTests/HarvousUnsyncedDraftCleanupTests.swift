import XCTest

@testable import Harvous

final class HarvousUnsyncedDraftCleanupTests: XCTestCase {

    func testNeverDiscardsSyncedNoteEvenWhenEmpty() {
        XCTAssertFalse(
            HarvousUnsyncedDraftCleanup.shouldDiscardOnSelectionChange(
                serverId: "note_123",
                title: "",
                body: ""
            )
        )
    }

    func testDiscardsUnsyncedEmptyDraft() {
        XCTAssertTrue(
            HarvousUnsyncedDraftCleanup.shouldDiscardOnSelectionChange(
                serverId: nil,
                title: "",
                body: ""
            )
        )
        XCTAssertTrue(
            HarvousUnsyncedDraftCleanup.shouldDiscardOnSelectionChange(
                serverId: "",
                title: "Untitled Note 2",
                body: ""
            )
        )
    }

    func testKeepsUnsyncedDraftWithBody() {
        XCTAssertFalse(
            HarvousUnsyncedDraftCleanup.shouldDiscardOnSelectionChange(
                serverId: nil,
                title: "",
                body: "Some study notes"
            )
        )
    }

    func testKeepsUnsyncedDraftWithUserTitle() {
        XCTAssertFalse(
            HarvousUnsyncedDraftCleanup.shouldDiscardOnSelectionChange(
                serverId: nil,
                title: "Romans study",
                body: ""
            )
        )
    }
}
