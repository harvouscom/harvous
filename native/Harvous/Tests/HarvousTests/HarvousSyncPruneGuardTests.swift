import XCTest

@testable import Harvous

final class HarvousSyncPruneGuardTests: XCTestCase {

    // MARK: - shouldKeepDespiteServerDelete

    func testKeepsServerDeletedNoteWithUnsyncedLocalEdits() {
        // Server says "deleted" but the user has local edits we haven't pushed: keep it.
        XCTAssertTrue(
            HarvousSyncPruneGuard.shouldKeepDespiteServerDelete(
                userTombstoned: false,
                hasUnsyncedLocalEdits: true
            )
        )
    }

    func testPrunesUserTombstonedNoteEvenWithUnsyncedEdits() {
        // The user explicitly deleted it locally — honor that regardless of edit state.
        XCTAssertFalse(
            HarvousSyncPruneGuard.shouldKeepDespiteServerDelete(
                userTombstoned: true,
                hasUnsyncedLocalEdits: true
            )
        )
    }

    func testPrunesServerDeletedNoteWithNoLocalEdits() {
        XCTAssertFalse(
            HarvousSyncPruneGuard.shouldKeepDespiteServerDelete(
                userTombstoned: false,
                hasUnsyncedLocalEdits: false
            )
        )
    }

    // MARK: - serverBulkDeleteLooksSuspicious

    func testSmallDeleteIsNeverSuspicious() {
        // A handful of deletes from a large library is normal.
        XCTAssertFalse(
            HarvousSyncPruneGuard.serverBulkDeleteLooksSuspicious(
                serverDrivenDeleteCount: 3,
                totalLocalNotes: 400
            )
        )
    }

    func testBelowFloorIsNeverSuspicious() {
        // Even deleting most of a tiny library stays under the absolute floor.
        XCTAssertFalse(
            HarvousSyncPruneGuard.serverBulkDeleteLooksSuspicious(
                serverDrivenDeleteCount: 10,
                totalLocalNotes: 12
            )
        )
    }

    func testLargeFractionAboveFloorIsSuspicious() {
        // 300 of 400 server-driven deletes in one pull looks like a bad payload.
        XCTAssertTrue(
            HarvousSyncPruneGuard.serverBulkDeleteLooksSuspicious(
                serverDrivenDeleteCount: 300,
                totalLocalNotes: 400
            )
        )
    }

    func testEmptyLibraryIsNeverSuspicious() {
        XCTAssertFalse(
            HarvousSyncPruneGuard.serverBulkDeleteLooksSuspicious(
                serverDrivenDeleteCount: 0,
                totalLocalNotes: 0
            )
        )
    }
}
