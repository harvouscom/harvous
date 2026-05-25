import Foundation
import LinkPresentation
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
        /// `nil` for auto-detected bare URLs; non-nil + non-empty for `[label](href)` matches whose
        /// pill should render the label instead of the host.
        let label: String?
    }

    /// Detects URL pills in `plain`. Two passes:
    ///
    /// 1. **Labeled links** (`[label](https?://…)`) via regex — these come from the AddLink sheet
    ///    serializer (`harvousExpandedPlainText`) and need to round-trip with their label intact.
    /// 2. **Bare URLs** via `NSDataDetector` — auto-detection for typed/pasted plain URLs.
    ///
    /// Labeled matches are emitted first; bare URL detection skips any range overlapping a labeled
    /// match (so the href inside `(…)` of a markdown link doesn't double-pill).
    ///
    /// Only emits ranges fully outside any of `protectedRanges` (existing scripture/URL pills).
    static func detect(in plain: String, protectedRanges: [NSRange] = []) -> [Match] {
        guard !plain.isEmpty else { return [] }
        let nsPlain = plain as NSString
        let fullRange = NSRange(location: 0, length: nsPlain.length)
        var out: [Match] = []
        // Track labeled-match ranges so bare-URL detection skips overlaps.
        var labeledRanges: [NSRange] = []

        // 1. `[label](href)` — non-greedy label, no nested brackets, only http(s) href.
        if let labeledRegex = try? NSRegularExpression(
            pattern: #"\[([^\]\n]+)\]\((https?://[^)\s]+)\)"#,
            options: []
        ) {
            for m in labeledRegex.matches(in: plain, options: [], range: fullRange) {
                guard m.numberOfRanges == 3 else { continue }
                let labelRange = m.range(at: 1)
                let hrefRange = m.range(at: 2)
                guard labelRange.location != NSNotFound, hrefRange.location != NSNotFound else { continue }
                if rangeIntersectsAny(m.range, protectedRanges) { continue }
                let label = nsPlain.substring(with: labelRange)
                let href = nsPlain.substring(with: hrefRange)
                out.append(Match(range: m.range, href: href, label: label))
                labeledRanges.append(m.range)
            }
        }

        // 2. Bare http(s) URLs via NSDataDetector.
        if let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) {
            let results = detector.matches(in: plain, options: [], range: fullRange)
            for r in results {
                guard let url = r.url else { continue }
                // Skip mailto:, tel:, etc. — only http(s) auto-link.
                guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else { continue }
                if rangeIntersectsAny(r.range, protectedRanges) { continue }
                // Skip URLs that live inside a labeled-link `(href)` group — already pilled above.
                if rangeIntersectsAny(r.range, labeledRanges) { continue }
                out.append(Match(range: r.range, href: url.absoluteString, label: nil))
            }
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
        let pill = URLLinkPillAttachment(href: match.href, title: title, label: match.label)
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

// MARK: - .link attribute → URL pill cleanup
//
// Defensive migration for sessions where the legacy `addLink` flow wrote `.link`-attributed runs
// before AddLink was rewired to insert URL pills. Run during detection so storage converges to a
// single representation — `URLLinkPillAttachment` for every URL link, period.

/// Walks `.link`-attributed runs and replaces each with a labeled `URLLinkPillAttachment`. Bare
/// runs whose label happens to equal the href are emitted without a label (auto-detected shape).
/// Caller owns `beginEditing`/`endEditing`.
@MainActor
func convertLinkAttributedRunsToURLLinkPills(in storage: NSTextStorage, bodyFont: HarvousPlatformFont) {
    let len = storage.length
    guard len > 0 else { return }
    let fullRange = NSRange(location: 0, length: len)

    // Collect first so mutation doesn't disturb enumeration.
    struct LinkRun { let range: NSRange; let href: String; let label: String }
    var runs: [LinkRun] = []
    let nsPlain = storage.string as NSString
    storage.enumerateAttribute(.link, in: fullRange, options: []) { value, range, _ in
        guard let value, range.length > 0 else { return }
        let href: String
        if let u = value as? URL { href = u.absoluteString }
        else if let s = value as? String { href = s }
        else if let s = value as? NSString { href = s as String }
        else { return }
        // Only http(s) — match the auto-detector scope so mailto:/tel: don't morph into pills.
        guard let scheme = URL(string: href)?.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else { return }
        let label = nsPlain.substring(with: range)
        runs.append(LinkRun(range: range, href: href, label: label))
    }

    guard !runs.isEmpty else { return }

    // Replace high-to-low so earlier ranges remain valid.
    for run in runs.sorted(by: { $0.range.location > $1.range.location }) {
        let labelForPill: String? = run.label == run.href ? nil : run.label
        let pill = URLLinkPillAttachment(href: run.href, title: nil, label: labelForPill)
        let pillStr = NSMutableAttributedString(attachment: pill)
        var attrs: [NSAttributedString.Key: Any] = [.font: bodyFont]
        if run.range.location < storage.length,
           let ps = storage.attribute(.paragraphStyle, at: run.range.location, effectiveRange: nil) as? NSParagraphStyle {
            attrs[.paragraphStyle] = ps
        }
        pillStr.addAttributes(attrs, range: NSRange(location: 0, length: pillStr.length))
        storage.replaceCharacters(in: run.range, with: pillStr)
    }
}

// MARK: - Platform font typealias

#if os(macOS)
typealias HarvousPlatformFont = NSFont
#else
typealias HarvousPlatformFont = UIFont
#endif

// MARK: - URL link title service
//
// Async page-title resolver for URL pills. Mirrors the web `LinkPreviewCard` title-only data path
// (favicons + open-graph images are intentionally excluded — we ignore `LPLinkMetadata.iconProvider`
// and `imageProvider`). Surface: synchronous cache read for the detection pass, async ensure-resolve
// for newly-inserted hrefs, and a notification observers can listen to for live UI refresh.

extension Notification.Name {
    /// Posted by `URLLinkTitleService` once `LPMetadataProvider` returns a non-empty title for an
    /// href. `userInfo`: `["href": String, "title": String]`. Observers (coordinators + active
    /// dock view) reconcile pills carrying this href.
    static let harvousURLLinkTitleResolved = Notification.Name("HarvousURLLinkTitleResolved")
}

/// Singleton title cache + fetcher. In-memory only; `LPMetadataProvider` re-runs after launch on
/// cache miss. Persistence is intentionally deferred — the per-launch fetch is cheap and avoids
/// stale titles when a page changes its `<title>`.
@MainActor
final class URLLinkTitleService {
    static let shared = URLLinkTitleService()
    private init() {}

    private var cache: [String: String] = [:]
    /// Dedupe in-flight fetches so rapid storage mutations (typing inside a URL → re-detection)
    /// don't fire multiple `LPMetadataProvider` requests for the same href.
    private var inFlight: Set<String> = []

    /// Synchronous cache read — passed to `detectAndInsertURLLinkPills` as `titleResolver` so
    /// pills picked up on the detection pass restore previously-fetched titles immediately.
    func cachedTitle(for href: String) -> String? { cache[href] }

    /// Kicks off `LPMetadataProvider.startFetchingMetadata` for `href` if not already cached or
    /// in-flight. Reads `metadata.title` only — does NOT request, fetch, or store any icon/image
    /// data. On success, updates the cache and posts `harvousURLLinkTitleResolved`.
    func ensureResolved(for href: String) {
        guard cache[href] == nil, !inFlight.contains(href), let url = URL(string: href) else { return }
        inFlight.insert(href)
        let provider = LPMetadataProvider()
        provider.startFetchingMetadata(for: url) { metadata, _ in
            // Completion runs on an arbitrary queue; extract the title (a Sendable String) here so
            // we never send the non-Sendable `LPLinkMetadata` across the MainActor boundary.
            let rawTitle = metadata?.title
            Task { @MainActor in
                URLLinkTitleService.shared.handleResolved(href: href, title: rawTitle)
            }
        }
    }

    /// Test/debug hook: returns true after a non-empty resolved title is cached.
    @discardableResult
    private func handleResolved(href: String, title: String?) -> Bool {
        inFlight.remove(href)
        guard let raw = title?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else {
            return false
        }
        cache[href] = raw
        NotificationCenter.default.post(
            name: .harvousURLLinkTitleResolved,
            object: nil,
            userInfo: ["href": href, "title": raw]
        )
        return true
    }
}

/// Walks the URL pill attachments in `storage` and writes `title` onto any pill whose `href`
/// matches. The pill image renders the display host only — `title` lives on the attachment so the
/// next tap can hand it to `ActiveURLPillDock`. Caller is responsible for `beginEditing` /
/// `endEditing` if the surrounding code is mid-mutation; this helper is read/write attribute-only
/// and does not modify storage characters, so it is safe to call without an edit block.
@MainActor
func applyResolvedURLLinkTitle(_ title: String, forHref href: String, in storage: NSTextStorage) {
    for range in rangesOfURLLinkPillAttachments(in: storage) {
        guard let pill = storage.attribute(.attachment, at: range.location, effectiveRange: nil) as? URLLinkPillAttachment,
              pill.href == href else { continue }
        pill.title = title
    }
}
