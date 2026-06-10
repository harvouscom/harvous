import XCTest

@testable import Harvous

@MainActor
final class HarvousStudyHighlightMapperTests: XCTestCase {
    private func storageWithURLLinkPillBeforeBasketSentence() -> NSTextStorage {
        let bodyAttrs: [NSAttributedString.Key: Any] = [.font: HarvousFonts.noteComposeBodyPlatformFont()]
        let prefix = "My favorite is when "
        let suffix =
            " has shared about this book and how we talked about Moses, Noah, and the basket which means Ark."
        let full = NSMutableAttributedString(string: prefix, attributes: bodyAttrs)
        full.append(NSAttributedString(attachment: URLLinkPillAttachment(href: "https://faith.tools", label: "Ps Luke")))
        full.append(NSAttributedString(string: suffix, attributes: bodyAttrs))
        return NSTextStorage(attributedString: full)
    }

    func testExpandedPlainRangeForBasketMapsToBasketInStorageAfterURLLinkPill() {
        let storage = storageWithURLLinkPillBeforeBasketSentence()
        let plain = harvousExpandedPlainText(in: storage)
        let basketRange = (plain as NSString).range(of: "basket")
        XCTAssertNotEqual(basketRange.location, NSNotFound)

        let storageRanges = HarvousStudyHighlightMapper.storageRanges(forExpandedRange: basketRange, in: storage)
        XCTAssertEqual(storageRanges.count, 1)
        let painted = (storage.string as NSString).substring(with: storageRanges[0])
        XCTAssertEqual(painted, "basket")
        XCTAssertNotEqual(painted, "Moses")
    }

    func testStorageSelectionForBasketRoundTripsThroughExpandedPlain() {
        let storage = storageWithURLLinkPillBeforeBasketSentence()
        let plain = harvousExpandedPlainText(in: storage)
        let storageBasket = (storage.string as NSString).range(of: "basket")
        XCTAssertNotEqual(storageBasket.location, NSNotFound)

        switch HarvousStudyHighlightMapper.expandedRange(forStorageSelection: storageBasket, in: storage) {
        case .success(let expanded):
            XCTAssertEqual((plain as NSString).substring(with: expanded), "basket")
        case .failure:
            XCTFail("Expected basket selection to map into expanded plain")
        }
    }

    private func storageWithURLLinkPillAndPlainLukeSuffix() -> NSTextStorage {
        let bodyAttrs: [NSAttributedString.Key: Any] = [.font: HarvousFonts.noteComposeBodyPlatformFont()]
        let prefix = "When "
        let suffix = " Luke has shared about faith."
        let full = NSMutableAttributedString(string: prefix, attributes: bodyAttrs)
        full.append(NSAttributedString(attachment: URLLinkPillAttachment(href: "https://faith.tools", label: "Ps Luke")))
        full.append(NSAttributedString(string: suffix, attributes: bodyAttrs))
        return NSTextStorage(attributedString: full)
    }

    func testResolveSavePayloadUsesExpandedPlainAfterURLLinkPill() {
        let storage = storageWithURLLinkPillAndPlainLukeSuffix()
        let lukeStorage = (storage.string as NSString).range(of: "Luke")
        XCTAssertNotEqual(lukeStorage.location, NSNotFound)
        storage.addAttribute(.harvousReferenceSuggestion, value: "luke", range: lukeStorage)

        let payload = ReferenceSuggestionPainter.resolveSavePayload(
            slug: "luke",
            headword: "Luke",
            storageRange: lukeStorage,
            storage: storage
        )
        XCTAssertEqual(payload?.word, "Luke")
        XCTAssertNotEqual(payload?.word, "ke h")
        let plain = payload?.expandedPlain ?? ""
        XCTAssertTrue(plain.contains("[Ps Luke](https://faith.tools)"))
    }
}
