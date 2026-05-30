import XCTest

@testable import Harvous

final class HarvousContentBridgeTests: XCTestCase {

    // MARK: - markdownToHTML structure

    func testEmptyBodyYieldsEmptyParagraph() {
        XCTAssertEqual(HarvousContentBridge.markdownToHTML(""), "<p></p>")
        XCTAssertEqual(HarvousContentBridge.markdownToHTML("   \n  "), "<p></p>")
    }

    func testSingleParagraph() {
        XCTAssertEqual(HarvousContentBridge.markdownToHTML("Hello world"), "<p>Hello world</p>")
    }

    func testSoftLineBreaksBecomeBr() {
        XCTAssertEqual(
            HarvousContentBridge.markdownToHTML("Line one\nLine two"),
            "<p>Line one<br>Line two</p>"
        )
    }

    func testBlankLineSeparatesParagraphs() {
        XCTAssertEqual(
            HarvousContentBridge.markdownToHTML("First\n\nSecond"),
            "<p>First</p><p>Second</p>"
        )
    }

    func testHorizontalRule() {
        XCTAssertEqual(
            HarvousContentBridge.markdownToHTML("Above\n---\nBelow"),
            "<p>Above</p><hr><p>Below</p>"
        )
    }

    func testBulletList() {
        XCTAssertEqual(
            HarvousContentBridge.markdownToHTML("\u{2022} apple\n\u{2022} pear"),
            "<ul><li>apple</li><li>pear</li></ul>"
        )
    }

    func testOrderedList() {
        XCTAssertEqual(
            HarvousContentBridge.markdownToHTML("1. first\n2. second"),
            "<ol><li>first</li><li>second</li></ol>"
        )
    }

    func testMixedBlocks() {
        let body = "Intro\n\n\u{2022} one\n\u{2022} two\n\nOutro"
        XCTAssertEqual(
            HarvousContentBridge.markdownToHTML(body),
            "<p>Intro</p><ul><li>one</li><li>two</li></ul><p>Outro</p>"
        )
    }

    func testCRLFNormalized() {
        XCTAssertEqual(
            HarvousContentBridge.markdownToHTML("First\r\n\r\nSecond"),
            "<p>First</p><p>Second</p>"
        )
    }

    // MARK: - Inline: links

    func testLabeledLink() {
        XCTAssertEqual(
            HarvousContentBridge.markdownToHTML("See [Harvous](https://harvous.com)"),
            "<p>See <a href=\"https://harvous.com\">Harvous</a></p>"
        )
    }

    func testBareURL() {
        XCTAssertEqual(
            HarvousContentBridge.markdownToHTML("Visit https://harvous.com today"),
            "<p>Visit <a href=\"https://harvous.com\">https://harvous.com</a> today</p>"
        )
    }

    // MARK: - Inline: escaping

    func testHTMLEscaping() {
        XCTAssertEqual(
            HarvousContentBridge.markdownToHTML("a < b & c > d"),
            "<p>a &lt; b &amp; c &gt; d</p>"
        )
    }

    // MARK: - Accent pills

    func testAccentReferenceBecomesPendingPill() {
        let html = HarvousContentBridge.markdownToHTML(
            "Remember John 3:16 today",
            accents: ["John 3:16": "warmAmber"]
        )
        XCTAssertTrue(html.contains("data-scripture-reference=\"John 3:16\""), html)
        XCTAssertTrue(html.contains("data-pill-accent=\"warmAmber\""), html)
    }

    func testReferenceWithoutAccentStaysPlainText() {
        // No accent override → server re-pills from plain text; native must not hand-build a pill.
        let html = HarvousContentBridge.markdownToHTML("Remember John 3:16 today")
        XCTAssertFalse(html.contains("data-pill-accent"), html)
        XCTAssertFalse(html.contains("data-scripture-reference"), html)
        XCTAssertTrue(html.contains("John 3:16"), html)
    }

    // MARK: - extractPillAccents (download direction)

    func testExtractPillAccentsRoundTrip() {
        let html = HarvousContentBridge.markdownToHTML(
            "Love John 3:16 and Phil 4:13",
            accents: ["John 3:16": "warmAmber", "Phil 4:13": "coolTeal"]
        )
        let extracted = HarvousContentBridge.extractPillAccents(fromHTML: html)
        XCTAssertEqual(extracted, ["John 3:16": "warmAmber", "Phil 4:13": "coolTeal"])
    }

    func testExtractPillAccentsEmptyWhenAttributeAbsent() {
        XCTAssertEqual(
            HarvousContentBridge.extractPillAccents(fromHTML: "<p>plain text</p>"),
            [:]
        )
        XCTAssertEqual(HarvousContentBridge.extractPillAccents(fromHTML: ""), [:])
    }

    func testExtractPillAccentsFromServerStylePill() {
        let server = "<p><span data-scripture-reference=\"John 3:16\" data-note-id=\"note_1\" data-pill-accent=\"warmAmber\" class=\"scripture-pill\">John 3:16</span></p>"
        XCTAssertEqual(
            HarvousContentBridge.extractPillAccents(fromHTML: server),
            ["John 3:16": "warmAmber"]
        )
    }
}
