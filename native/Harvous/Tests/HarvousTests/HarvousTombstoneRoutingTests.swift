import XCTest

@testable import Harvous

final class HarvousTombstoneRoutingTests: XCTestCase {

    func testNcLinkedNoteRoutesToNoteConnection() {
        let plan = HarvousTombstoneRouting.plan(
            serverId: "nc_note_1780538202921",
            entryKindRaw: StudyThread.EntryKind.linkedNote.rawValue,
            fromNoteServerId: "note_111",
            toNoteServerId: "note_222"
        )
        XCTAssertEqual(plan?.kind, .noteConnection)
        XCTAssertEqual(plan?.serverId, "")
        XCTAssertEqual(plan?.fromNoteServerId, "note_111")
        XCTAssertEqual(plan?.toNoteServerId, "note_222")
    }

    func testStudyLinkedNoteRoutesToStudyThread() {
        let plan = HarvousTombstoneRouting.plan(
            serverId: "study_1780538202921",
            entryKindRaw: StudyThread.EntryKind.linkedNote.rawValue,
            fromNoteServerId: "note_111",
            toNoteServerId: "note_222"
        )
        XCTAssertEqual(plan?.kind, .studyThread)
        XCTAssertEqual(plan?.serverId, "study_1780538202921")
        XCTAssertNil(plan?.fromNoteServerId)
        XCTAssertNil(plan?.toNoteServerId)
    }

    func testHighlightRoutesToStudyThread() {
        let plan = HarvousTombstoneRouting.plan(
            serverId: "study_999",
            entryKindRaw: StudyThread.EntryKind.miniNote.rawValue,
            fromNoteServerId: nil,
            toNoteServerId: nil
        )
        XCTAssertEqual(plan?.kind, .studyThread)
        XCTAssertEqual(plan?.serverId, "study_999")
    }

    func testNcLinkedNoteWithoutNoteServerIdsReturnsNil() {
        XCTAssertNil(
            HarvousTombstoneRouting.plan(
                serverId: "nc_note_1780538202921",
                entryKindRaw: StudyThread.EntryKind.linkedNote.rawValue,
                fromNoteServerId: nil,
                toNoteServerId: "note_222"
            )
        )
        XCTAssertNil(
            HarvousTombstoneRouting.plan(
                serverId: "nc_note_1780538202921",
                entryKindRaw: StudyThread.EntryKind.linkedNote.rawValue,
                fromNoteServerId: "note_111",
                toNoteServerId: ""
            )
        )
    }

    func testEmptyServerIdReturnsNil() {
        XCTAssertNil(
            HarvousTombstoneRouting.plan(
                serverId: nil,
                entryKindRaw: StudyThread.EntryKind.linkedNote.rawValue,
                fromNoteServerId: "note_111",
                toNoteServerId: "note_222"
            )
        )
        XCTAssertNil(
            HarvousTombstoneRouting.plan(
                serverId: "",
                entryKindRaw: StudyThread.EntryKind.linkedNote.rawValue,
                fromNoteServerId: "note_111",
                toNoteServerId: "note_222"
            )
        )
    }
}
