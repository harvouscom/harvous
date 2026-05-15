import Foundation
#if os(macOS)
import AppKit
#else
import UIKit
#endif

// MARK: - URL pill helpers
// These mirror the scripture pill helpers in `ScriptureDetectionCoordinator.swift` for URL pills.
// They are pure helpers over `NSTextStorage` and contain no Coordinator state.

/// Ranges of `URLLinkPillAttachment` in document order.
func rangesOfURLLinkPillAttachments(in storage: NSTextStorage) -> [NSRange] {
    var ranges: [NSRange] = []
    let end = storage.length
    var idx = 0
    while idx < end {
        var eff = NSRange()
        let value = storage.attribute(.attachment, at: idx, effectiveRange: &eff)
        if value is URLLinkPillAttachment { ranges.append(eff) }
        let next = NSMaxRange(eff)
        if next <= idx { break }
        idx = next
    }
    return ranges
}

/// Document-ordered `(href, title?)` for each `URLLinkPillAttachment`. Useful when re-running
/// detection so the previous title is preserved.
func urlLinkPillRefPairs(in storage: NSTextStorage) -> [(href: String, title: String?)] {
    rangesOfURLLinkPillAttachments(in: storage).compactMap { range -> (String, String?)? in
        guard let pill = storage.attribute(.attachment, at: range.location, effectiveRange: nil) as? URLLinkPillAttachment else { return nil }
        return (pill.href, pill.title)
    }
}

// MARK: - URL detector

enum URLLinkDetector {
    struct Match: Equatable {
        let range: NSRange
        let href: String
    }

    /// Detects bare URLs in `plain` using `NSDataDetector`. Only emits ranges fully outside any
    /// of `protectedRanges`. Protected ranges typically come from existing scripture-pill or
    /// URL-pill attachments, so detection never tries to re-pill inside an attachment glyph.
    static func detect(in plain: String, protectedRanges: [NSRange] = []) -> [Match] {
        guard !plain.isEmpty else { return [] }
        let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        guard let detector else { return [] }
        let fullRange = NSRange(location: 0, length: (plain as NSString).length)
        let results = detector.matches(in: plain, options: [], range: fullRange)
        var out: [Match] = []
        out.reserveCapacity(results.count)
        for r in results {
            guard let url = r.url else { continue }
            // Skip mailto:, tel:, etc. — only http(s) auto-link in slice 1.
            guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else { continue }
            if rangeIntersectsAny(r.range, protectedRanges) { continue }
            out.append(Match(range: r.range, href: url.absoluteString))
        }
        return out
    }

    private static func rangeIntersectsAny(_ r: NSRange, _ blocks: [NSRange]) -> Bool {
        for b in blocks {
            if NSIntersectionRange(r, b).length > 0 { return true }
        }
        return false
    }
}

// MARK: - URL detection + insertion pass
//
// Run AFTER `ScripturePillAttachment` insertion in the editor's pill pipeline. Scripture pills win
// any overlap (e.g. a verse reference inside a URL path component — unlikely but defensive).

/// Replaces bare URL substrings with `URLLinkPillAttachment` attachments. Existing URL pills are
/// preserved (this function only inserts NEW pills for plain-text URL runs). The caller is
/// responsible for `beginEditing`/`endEditing`.
///
/// `bodyFont` is applied to the inserted attachment run so subsequent typing inherits body
/// styling (matches scripture pill insertion in `detectAndInsertPills`).
@MainActor
func detectAndInsertURLLinkPills(
    in storage: NSTextStorage,
    bodyFont: HarvousPlatformFont,
    titleResolver: ((String) -> String?)? = nil
) {
    // 1. Collect protected ranges (existing scripture pills + existing URL pills).
    var protected = rangesOfScripturePillAttachments(in: storage)
    protected.append(contentsOf: rangesOfURLLinkPillAttachments(in: storage))

    // 2. Run detection on the current plain text (storage.string contains U+FFFC for attachments
    //    — that's fine, NSDataDetector ignores them).
    let plain = storage.string
    let matches = URLLinkDetector.detect(in: plain, protectedRanges: protected)
    guard !matches.isEmpty else { return }

    // 3. Insert pills from last to first so earlier ranges remain valid as we mutate.
    let sortedDesc = matches.sorted { $0.range.location > $1.range.location }
    for match in sortedDesc {
        let title = titleResolver?(match.href)
        let pill = URLLinkPillAttachment(href: match.href, title: title)
        let pillStr = NSMutableAttributedString(attachment: pill)
        var pillAttrs: [NSAttributedString.Key: Any] = [.font: bodyFont]
        let pillLoc = match.range.location
        if pillLoc < storage.length,
           let ps = storage.attribute(.paragraphStyle, at: pillLoc, effectiveRange: nil) as? NSParagraphStyle {
            pillAttrs[.paragraphStyle] = ps
        }
        pillStr.addAttributes(pillAttrs, range: NSRange(location: 0, length: pillStr.length))
        storage.replaceCharacters(in: match.range, with: pillStr)
    }
}

// MARK: - Platform font typealias

#if os(macOS)
typealias HarvousPlatformFont = NSFont
#else
typealias HarvousPlatformFont = UIFont
#endif
