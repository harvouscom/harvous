import XCTest

@testable import Harvous

@MainActor
final class HarvousHorizontalRuleRoundTripTests: XCTestCase {

    private func storageWithDividerBetween(above: String, below: String) -> NSTextStorage {
        let bodyAttrs: [NSAttributedString.Key: Any] = [.font: HarvousFonts.noteComposeBodyPlatformFont()]
        let full = NSMutableAttributedString(string: above, attributes: bodyAttrs)
        full.append(NSAttributedString(string: "\n", attributes: bodyAttrs))
        full.append(NSAttributedString(attachment: HorizontalRuleAttachment()))
        full.append(NSAttributedString(string: "\n", attributes: bodyAttrs))
        full.append(NSAttributedString(string: below, attributes: bodyAttrs))
        return NSTextStorage(attributedString: full)
    }

    func testExpandedPlainTextCollapsesWrapperNewlines() {
        let storage = storageWithDividerBetween(above: "Above", below: "Below")
        XCTAssertEqual(harvousExpandedPlainText(in: storage), "Above\n---\nBelow")
    }

    func testExpandedPlainTextIsIdempotent() {
        let storage = storageWithDividerBetween(above: "Above", below: "Below")
        let once = harvousExpandedPlainText(in: storage)
        let twice = harvousExpandedPlainText(in: storage)
        XCTAssertEqual(once, "Above\n---\nBelow")
        XCTAssertEqual(twice, once)
    }

    func testRehydrateRepairsLegacyDoubleNewlines() {
        let storage = NSTextStorage(string: "Above\n\n---\n\nBelow")
        rehydrateHorizontalRules(in: storage)
        XCTAssertEqual(harvousExpandedPlainText(in: storage), "Above\n---\nBelow")
    }

    func testRehydrateRepairsLegacyDoubleNewlinesIdempotently() {
        let storage = NSTextStorage(string: "Above\n\n---\n\nBelow")
        rehydrateHorizontalRules(in: storage)
        rehydrateHorizontalRules(in: storage)
        XCTAssertEqual(harvousExpandedPlainText(in: storage), "Above\n---\nBelow")
    }

    func testRehydrateLeadingDivider() {
        let storage = NSTextStorage(string: "---\nBelow")
        rehydrateHorizontalRules(in: storage)
        XCTAssertEqual(harvousExpandedPlainText(in: storage), "\n---\nBelow")
    }

    func testRehydrateBodyOnlyDivider() {
        let storage = NSTextStorage(string: "---")
        rehydrateHorizontalRules(in: storage)
        XCTAssertTrue(storage.string.contains("\u{FFFC}"))
    }
}
