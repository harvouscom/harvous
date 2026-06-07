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

    // MARK: - htmlToPlainBody structure

    func testHtmlToPlainBodyEmpty() {
        XCTAssertEqual(HarvousContentBridge.htmlToPlainBody(""), "")
        XCTAssertEqual(HarvousContentBridge.htmlToPlainBody("<p></p>"), "")
    }

    func testHtmlToPlainBodySingleParagraph() {
        XCTAssertEqual(HarvousContentBridge.htmlToPlainBody("<p>Hello world</p>"), "Hello world")
    }

    func testHtmlToPlainBodySoftLineBreaks() {
        XCTAssertEqual(
            HarvousContentBridge.htmlToPlainBody("<p>Line one<br>Line two</p>"),
            "Line one\nLine two"
        )
    }

    func testHtmlToPlainBodyParagraphBreaks() {
        XCTAssertEqual(
            HarvousContentBridge.htmlToPlainBody("<p>First</p><p>Second</p>"),
            "First\nSecond"
        )
    }

    func testHtmlToPlainBodyIntentionalBlankLine() {
        XCTAssertEqual(
            HarvousContentBridge.htmlToPlainBody("<p>First</p><p><br></p><p>Second</p>"),
            "First\n\nSecond"
        )
    }

    func testHtmlToPlainBodyMultipleBlankLines() {
        // Two stacked blank-line paragraphs (web user pressing Enter on empty lines)
        // must map to two blank lines (`\n\n\n`), not four newlines.
        XCTAssertEqual(
            HarvousContentBridge.htmlToPlainBody("<p>A</p><p><br></p><p><br></p><p>B</p>"),
            "A\n\n\nB"
        )
    }

    func testHtmlToPlainBodyHorizontalRule() {
        XCTAssertEqual(
            HarvousContentBridge.htmlToPlainBody("<p>Above</p><hr><p>Below</p>"),
            "Above\n---\nBelow"
        )
    }

    func testHtmlToPlainBodyBulletList() {
        XCTAssertEqual(
            HarvousContentBridge.htmlToPlainBody("<ul><li>apple</li><li>pear</li></ul>"),
            "\u{2022} apple\n\u{2022} pear"
        )
    }

    func testHtmlToPlainBodyOrderedList() {
        XCTAssertEqual(
            HarvousContentBridge.htmlToPlainBody("<ol><li>first</li><li>second</li></ol>"),
            "1. first\n2. second"
        )
    }

    func testHtmlToPlainBodyMixedBlocks() {
        let html = "<p>Intro</p><ul><li>one</li><li>two</li></ul><p>Outro</p>"
        XCTAssertEqual(
            HarvousContentBridge.htmlToPlainBody(html),
            "Intro\n\u{2022} one\n\u{2022} two\nOutro"
        )
    }

    func testHtmlToPlainBodyLabeledLink() {
        XCTAssertEqual(
            HarvousContentBridge.htmlToPlainBody("<p>See <a href=\"https://harvous.com\">Harvous</a></p>"),
            "See [Harvous](https://harvous.com)"
        )
    }

    func testHtmlToPlainBodyServerStylePill() {
        let html = "<p>Remember <span data-scripture-reference=\"John 3:16\" data-note-id=\"note_1\" class=\"scripture-pill\">John 3:16</span> today</p>"
        XCTAssertEqual(
            HarvousContentBridge.htmlToPlainBody(html),
            "Remember John 3:16 today"
        )
    }

    // MARK: - htmlToPlainBody ↔ markdownToHTML round-trip

    func testRoundTripSingleParagraph() {
        let body = "Hello world"
        XCTAssertEqual(
            HarvousContentBridge.htmlToPlainBody(HarvousContentBridge.markdownToHTML(body)),
            body
        )
    }

    func testRoundTripSoftLineBreaks() {
        let body = "Line one\nLine two"
        XCTAssertEqual(
            HarvousContentBridge.htmlToPlainBody(HarvousContentBridge.markdownToHTML(body)),
            body
        )
    }

    func testRoundTripParagraphBreaks() {
        let body = "First\n\nSecond"
        let html = HarvousContentBridge.markdownToHTML(body)
        XCTAssertEqual(html, "<p>First</p><p>Second</p>")
        // Pull uses single `\n` between paragraphs for NSTextView editing parity.
        XCTAssertEqual(HarvousContentBridge.htmlToPlainBody(html), "First\nSecond")
    }

    func testRoundTripHorizontalRule() {
        let body = "Above\n---\nBelow"
        XCTAssertEqual(
            HarvousContentBridge.htmlToPlainBody(HarvousContentBridge.markdownToHTML(body)),
            body
        )
    }

    func testRoundTripBulletList() {
        let body = "\u{2022} apple\n\u{2022} pear"
        XCTAssertEqual(
            HarvousContentBridge.htmlToPlainBody(HarvousContentBridge.markdownToHTML(body)),
            body
        )
    }

    func testRoundTripMixedBlocks() {
        let body = "Intro\n\n\u{2022} one\n\u{2022} two\n\nOutro"
        let html = HarvousContentBridge.markdownToHTML(body)
        XCTAssertEqual(
            HarvousContentBridge.htmlToPlainBody(html),
            "Intro\n\u{2022} one\n\u{2022} two\nOutro"
        )
    }

    func testRoundTripOrderedList() {
        let body = "1. first\n2. second"
        XCTAssertEqual(
            HarvousContentBridge.htmlToPlainBody(HarvousContentBridge.markdownToHTML(body)),
            body
        )
    }

    /// Soft line breaks (Shift+Enter) survive the round trip while a true paragraph
    /// break collapses to a single `\n` — the line-break-preservation contract the
    /// recent sync fix depends on.
    func testRoundTripSoftBreakWithParagraphBreak() {
        let body = "Alpha\nBeta\n\nGamma"
        let html = HarvousContentBridge.markdownToHTML(body)
        XCTAssertEqual(html, "<p>Alpha<br>Beta</p><p>Gamma</p>")
        XCTAssertEqual(HarvousContentBridge.htmlToPlainBody(html), "Alpha\nBeta\nGamma")
    }

    // MARK: - htmlToPlainBody regression (sign-in sync crash)

    func testHtmlToPlainBodyMixedCaseTags() {
        XCTAssertEqual(HarvousContentBridge.htmlToPlainBody("<P>Hello</P>"), "Hello")
    }

    func testHtmlToPlainBodyUnicodeBody() {
        XCTAssertEqual(
            HarvousContentBridge.htmlToPlainBody("<p>Café — İstanbul</p>"),
            "Café — İstanbul"
        )
        XCTAssertEqual(
            HarvousContentBridge.htmlToPlainBody("<p>ἀγάπη (love)</p>"),
            "ἀγάπη (love)"
        )
    }

    func testHtmlToPlainBodyWebRichHTMLDoesNotTrap() {
        let html = "<h2>Title</h2><p><strong>bold</strong></p>"
        let plain = HarvousContentBridge.htmlToPlainBody(html)
        XCTAssertTrue(plain.contains("bold"), plain)
    }

    func testHtmlToPlainBodyHighlightMarkupInsideParagraph() {
        let html = "<p>See <mark data-color=\"yellow\">highlight</mark> here</p>"
        XCTAssertEqual(
            HarvousContentBridge.htmlToPlainBody(html),
            "See highlight here"
        )
    }

    func testHtmlToPlainBodyPreBlockDoesNotTrap() {
        // Unsupported block type — must not trap on sign-in sync (must not match as `<p`).
        let plain = HarvousContentBridge.htmlToPlainBody("<pre><code>let x = 1</code></pre>")
        XCTAssertEqual(plain, "")
    }
}
