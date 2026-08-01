import XCTest

@testable import Harvous

final class HarvousEditorSyncGuardTests: XCTestCase {

    func testSkipsWhileTitleFocused() {
        // Regression: remote-refresh sync must not reseed `title` while the user is
        // typing in the title field ("can't type the title" bug).
        XCTAssertTrue(
            HarvousEditorSyncGuard.shouldSkipNonForceSync(
                titleFocused: true,
                bodyFirstResponder: false,
                hasPendingAutosave: false
            )
        )
    }

    func testSkipsWhileBodyFirstResponder() {
        XCTAssertTrue(
            HarvousEditorSyncGuard.shouldSkipNonForceSync(
                titleFocused: false,
                bodyFirstResponder: true,
                hasPendingAutosave: false
            )
        )
    }

    func testSkipsWhileAutosavePending() {
        XCTAssertTrue(
            HarvousEditorSyncGuard.shouldSkipNonForceSync(
                titleFocused: false,
                bodyFirstResponder: false,
                hasPendingAutosave: true
            )
        )
    }

    func testAllowsSyncWhenIdle() {
        // No focus and nothing pending: a remote refresh is safe to apply.
        XCTAssertFalse(
            HarvousEditorSyncGuard.shouldSkipNonForceSync(
                titleFocused: false,
                bodyFirstResponder: false,
                hasPendingAutosave: false
            )
        )
    }

    func testNeverSkipsForCoEditFollower() {
        // Native is read-only on co-edited notes, so there are no local edits to
        // protect — and the follower is open precisely to watch remote writes.
        XCTAssertFalse(
            HarvousEditorSyncGuard.shouldSkipNonForceSync(
                titleFocused: true,
                bodyFirstResponder: true,
                hasPendingAutosave: true,
                isCoEditFollower: true
            )
        )
    }
}
