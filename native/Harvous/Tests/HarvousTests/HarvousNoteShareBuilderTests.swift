import XCTest

@testable import Harvous

final class HarvousNoteShareBuilderTests: XCTestCase {
    func testEmptyTitleAndBody() {
        XCTAssertEqual(
            HarvousNoteShareBuilder.plainText(snapshot: NoteShareSnapshot(title: "", body: "")),
            ""
        )
    }

    func testWhitespaceOnlyTreatsAsEmpty() {
        XCTAssertEqual(
            HarvousNoteShareBuilder.plainText(snapshot: NoteShareSnapshot(title: "  \n", body: "  \t ")),
            ""
        )
    }

    func testTitleOnly() {
        XCTAssertEqual(
            HarvousNoteShareBuilder.plainText(snapshot: NoteShareSnapshot(title: " Hello ", body: "")),
            "Hello"
        )
    }

    func testBodyOnly() {
        XCTAssertEqual(
            HarvousNoteShareBuilder.plainText(snapshot: NoteShareSnapshot(title: "", body: " Line one \nLine two ")),
            "Line one \nLine two"
        )
    }

    func testTitleAndBody() {
        XCTAssertEqual(
            HarvousNoteShareBuilder.plainText(snapshot: NoteShareSnapshot(title: "T", body: "B")),
            "T\n\nB"
        )
    }

    func testBodyTrailingNewlinesPreservedAsideFromWhitespaceTrimEnds() {
        let out = HarvousNoteShareBuilder.plainText(snapshot: NoteShareSnapshot(title: "T", body: "A\n\nB"))
        XCTAssertEqual(out, "T\n\nA\n\nB")
    }
}
