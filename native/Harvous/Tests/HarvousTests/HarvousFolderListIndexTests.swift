import XCTest

@testable import Harvous

final class HarvousFolderListIndexTests: XCTestCase {
    func testMemberCount_primaryFolder() {
        let work = Note(title: "A", body: "")
        work.primaryFolder = "Work"
        let personal = Note(title: "B", body: "")
        personal.primaryFolder = "Personal"
        let notes = [work, personal]

        XCTAssertEqual(HarvousFolderListIndex.memberCount(in: notes, bucket: "Work"), 1)
        XCTAssertEqual(HarvousFolderListIndex.memberCount(in: notes, bucket: "Personal"), 1)
        XCTAssertEqual(HarvousFolderListIndex.memberCount(in: notes, bucket: "Missing"), 0)
    }

    func testMemberCount_secondaryFolder() {
        let note = Note(title: "A", body: "")
        note.primaryFolder = "Work"
        note.secondaryFolders = ["Archive"]
        let archiveOnly = Note(title: "B", body: "")
        archiveOnly.secondaryFolders = ["Archive"]
        let notes = [note, archiveOnly]

        XCTAssertEqual(HarvousFolderListIndex.memberCount(in: notes, bucket: "Archive"), 2)
    }

    func testMemberCount_ungroupedBucket() {
        let unsorted = Note(title: "Loose", body: "")
        let filed = Note(title: "Filed", body: "")
        filed.primaryFolder = "Work"
        let notes = [unsorted, filed]

        XCTAssertEqual(HarvousFolderListIndex.memberCount(in: notes, bucket: nil), 1)
    }

    func testMemberCount_excludesMyPileFolderTitle() {
        let pile = Note(title: "Pile note", body: "")
        pile.primaryFolder = "My Pile"
        let notes = [pile]

        XCTAssertEqual(HarvousFolderListIndex.memberCount(in: notes, bucket: "My Pile"), 0)
        XCTAssertEqual(HarvousFolderListIndex.memberCount(in: notes, bucket: nil), 1)
    }
}
