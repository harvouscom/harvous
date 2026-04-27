import CoreText
import Foundation

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// HTML importers may set either Foundation/AppKit/UIKit `NSSuperscript` or CoreText `kCTSuperscriptAttributeName`.
/// We normalize both to an explicit smaller font + `baselineOffset` for AppKit/UIKit text views.
private let scriptureSuperscriptAppKitAttribute = NSAttributedString.Key("NSSuperscript")
private let scriptureSuperscriptCoreTextAttribute = NSAttributedString.Key(kCTSuperscriptAttributeName as String)

private func scriptureSuperscriptLevel(from attributes: [NSAttributedString.Key: Any]) -> Int {
    if let ns = attributes[scriptureSuperscriptAppKitAttribute] as? NSNumber {
        return ns.intValue
    }
    if let ct = attributes[scriptureSuperscriptCoreTextAttribute] as? NSNumber {
        return ct.intValue
    }
    return 0
}

private func scriptureBaselineOffset(from attributes: [NSAttributedString.Key: Any]) -> CGFloat {
    if let n = attributes[.baselineOffset] as? NSNumber {
        return CGFloat(truncating: n)
    }
    if let g = attributes[.baselineOffset] as? CGFloat {
        return g
    }
    if let d = attributes[.baselineOffset] as? Double {
        return CGFloat(d)
    }
    if let f = attributes[.baselineOffset] as? Float {
        return CGFloat(f)
    }
    return 0
}

/// Shared HTML → `NSAttributedString` for passage views and prefetch.
/// **Important:** SwiftUI `Text(AttributedString)` does not reliably honor `baselineOffset`, so UI uses `NSTextView` / `UITextView`.
/// Post-processes WebKit HTML import into dictionary-style reading typography (serif body, verse numerals, spacing).
enum ScripturePassageHTMLParser {
    /// Verse numerals use a **much** smaller point size than body (~19pt) so they read clearly as superscript, not mini-body.
    private static let verseNumeralToBodyScale: CGFloat = 0.64
    private static let verseNumeralMinSize: CGFloat = 6
    /// Baseline lift scales slightly with body size (positive = superscript).
    private static let baselineToBodyScale: CGFloat = 0.185
    // Verse numbers can merge with the next word (e.g. "1Afterward") with no superscript attribute; match digit runs before a letter.
    /// `^` must match after each newline (`anchorsMatchLines`); allow leading spaces (HTML often strips &lt;sup&gt; merge).
    private static let leadingVerseDigitRegex: NSRegularExpression? = {
        try? NSRegularExpression(
            pattern: #"^\s*(\d{1,3})(?=\s*[A-Za-z\u{2018}\u{2019}\u{201C}\u{201D}])"#,
            options: [.anchorsMatchLines]
        )
    }()
    private static let spacedVerseDigitRegex: NSRegularExpression? = {
        try? NSRegularExpression(
            pattern: #"(\s)(\d{1,3})(?=\s*[A-Za-z\u{2018}\u{2019}\u{201C}\u{201D}])"#,
            options: []
        )
    }()
    /// Catch verse numbers after punctuation/quotes, e.g. `”2But`.
    private static let punctuatedVerseDigitRegex: NSRegularExpression? = {
        try? NSRegularExpression(
            pattern: #"([”"'’\)\]\}\-–—,:;.!?\s])(\d{1,3})(?=\s*[A-Za-z\u{2018}\u{2019}\u{201C}\u{201D}])"#,
            options: []
        )
    }()
    /// WebKit sometimes emits Unicode superscript ¹²³ (not ASCII) in &lt;sup&gt;.
    private static let leadingUnicodeSupRegex: NSRegularExpression? = {
        try? NSRegularExpression(
            pattern: #"^\s*([\u{00B9}\u{00B2}\u{00B3}\u{2070}\u{2074}\u{2075}\u{2076}\u{2077}\u{2078}\u{2079}]+)(?=\s*[A-Za-z\u{2018}\u{2019}\u{201C}\u{201D}])"#,
            options: [.anchorsMatchLines]
        )
    }()
    private static let spacedUnicodeSupRegex: NSRegularExpression? = {
        try? NSRegularExpression(
            pattern: #"(\s)([\u{00B9}\u{00B2}\u{00B3}\u{2070}\u{2074}\u{2075}\u{2076}\u{2077}\u{2078}\u{2079}]+)(?=\s*[A-Za-z\u{2018}\u{2019}\u{201C}\u{201D}])"#,
            options: []
        )
    }()
    private static let punctuatedUnicodeSupRegex: NSRegularExpression? = {
        try? NSRegularExpression(
            pattern: #"([”"'’\)\]\}\-–—,:;.!?\s])([\u{00B9}\u{00B2}\u{00B3}\u{2070}\u{2074}\u{2075}\u{2076}\u{2077}\u{2078}\u{2079}]+)(?=\s*[A-Za-z\u{2018}\u{2019}\u{201C}\u{201D}])"#,
            options: []
        )
    }()
    /// Broad fallback: verse numeral after any whitespace/punctuation boundary, including NBSP before body text.
    private static let broadVerseDigitRegex: NSRegularExpression? = {
        try? NSRegularExpression(
            pattern: #"(^|[\s\p{P}])(\d{1,3})(?=[\s\u{00A0}]*\p{L})"#,
            options: [.anchorsMatchLines]
        )
    }()
    private static let broadUnicodeSupRegex: NSRegularExpression? = {
        try? NSRegularExpression(
            pattern: #"(^|[\s\p{P}])([\u{00B9}\u{00B2}\u{00B3}\u{2070}\u{2074}\u{2075}\u{2076}\u{2077}\u{2078}\u{2079}]+)(?=[\s\u{00A0}]*\p{L})"#,
            options: [.anchorsMatchLines]
        )
    }()

    /// Merged "1Afterward" (no &lt;sup&gt; run) and multi-verse "… 2The" digit spans, reverse order for stable mutation.
    private static func collectVerseDigitSubrangesInPlainText(_ s: String) -> [NSRange] {
        let full = NSRange(location: 0, length: (s as NSString).length)
        var ranges: [NSRange] = []
        if let re = leadingVerseDigitRegex {
            re.enumerateMatches(in: s, options: [], range: full) { m, _, _ in
                guard let m, m.numberOfRanges > 1 else { return }
                let d = m.range(at: 1)
                if d.length > 0 { ranges.append(d) }
            }
        }
        if let re = spacedVerseDigitRegex {
            re.enumerateMatches(in: s, options: [], range: full) { m, _, _ in
                guard let m, m.numberOfRanges > 2 else { return }
                let d = m.range(at: 2)
                if d.length > 0 { ranges.append(d) }
            }
        }
        if let re = punctuatedVerseDigitRegex {
            re.enumerateMatches(in: s, options: [], range: full) { m, _, _ in
                guard let m, m.numberOfRanges > 2 else { return }
                let d = m.range(at: 2)
                if d.length > 0 { ranges.append(d) }
            }
        }
        if let re = broadVerseDigitRegex {
            re.enumerateMatches(in: s, options: [], range: full) { m, _, _ in
                guard let m, m.numberOfRanges > 2 else { return }
                let d = m.range(at: 2)
                if d.length > 0 { ranges.append(d) }
            }
        }
        if let re = leadingUnicodeSupRegex {
            re.enumerateMatches(in: s, options: [], range: full) { m, _, _ in
                guard let m, m.numberOfRanges > 1 else { return }
                let d = m.range(at: 1)
                if d.length > 0 { ranges.append(d) }
            }
        }
        if let re = spacedUnicodeSupRegex {
            re.enumerateMatches(in: s, options: [], range: full) { m, _, _ in
                guard let m, m.numberOfRanges > 2 else { return }
                let d = m.range(at: 2)
                if d.length > 0 { ranges.append(d) }
            }
        }
        if let re = punctuatedUnicodeSupRegex {
            re.enumerateMatches(in: s, options: [], range: full) { m, _, _ in
                guard let m, m.numberOfRanges > 2 else { return }
                let d = m.range(at: 2)
                if d.length > 0 { ranges.append(d) }
            }
        }
        if let re = broadUnicodeSupRegex {
            re.enumerateMatches(in: s, options: [], range: full) { m, _, _ in
                guard let m, m.numberOfRanges > 2 else { return }
                let d = m.range(at: 2)
                if d.length > 0 { ranges.append(d) }
            }
        }
        ranges.append(contentsOf: collectVerseDigitSubrangesByScan(s))
        return ranges.sorted { $0.location > $1.location }
    }

    /// Deterministic fallback for native rendering: boundary + 1-3 digits + optional spaces + ASCII letter.
    /// Handles strings like `1 Afterward`, `”2But`, and ` 3Then` even when HTML import metadata is inconsistent.
    private static func collectVerseDigitSubrangesByScan(_ s: String) -> [NSRange] {
        let ns = s as NSString
        let len = ns.length
        if len == 0 { return [] }

        let letters = CharacterSet.letters
        let whitespaces = CharacterSet.whitespacesAndNewlines
        let digits = CharacterSet.decimalDigits
        let punctuation = CharacterSet(charactersIn: "\"'”’)]}-–—,:;.!?")

        func scalar(at i: Int) -> UnicodeScalar? {
            guard i >= 0, i < len else { return nil }
            return UnicodeScalar(ns.character(at: i))
        }

        var out: [NSRange] = []
        var i = 0
        while i < len {
            guard let cur = scalar(at: i) else { i += 1; continue }
            guard digits.contains(cur) else { i += 1; continue }

            // Left boundary must be start, whitespace, or punctuation.
            let leftOK: Bool = {
                if i == 0 { return true }
                guard let prev = scalar(at: i - 1) else { return false }
                return whitespaces.contains(prev) || punctuation.contains(prev)
            }()
            if !leftOK { i += 1; continue }

            // Consume up to 3 digits.
            var j = i
            var digitCount = 0
            while j < len, let u = scalar(at: j), digits.contains(u), digitCount < 3 {
                j += 1
                digitCount += 1
            }
            if digitCount == 0 || digitCount > 3 { i += 1; continue }

            // Skip optional spaces/NBSP before first letter.
            var k = j
            while k < len {
                guard let u = scalar(at: k) else { break }
                if whitespaces.contains(u) || u.value == 0x00A0 {
                    k += 1
                } else {
                    break
                }
            }

            guard k < len, let next = scalar(at: k), letters.contains(next) else {
                i = j
                continue
            }

            out.append(NSRange(location: i, length: digitCount))
            i = j
        }
        return out
    }

    private static func numeralBaselineOffset(bodyPointSize: CGFloat) -> CGFloat {
        max(2, (bodyPointSize * baselineToBodyScale).rounded())
    }

    static func nsAttributedString(fromHTML html: String) throws -> NSAttributedString {
        let data = Data(html.utf8)
        let opts: [NSAttributedString.DocumentReadingOptionKey: Any] = [
            .documentType: NSAttributedString.DocumentType.html,
            .characterEncoding: String.Encoding.utf8.rawValue,
        ]
        let base = try NSAttributedString(data: data, options: opts, documentAttributes: nil)
        let m = NSMutableAttributedString(attributedString: base)
        #if os(macOS)
        Self.applyMacDictionaryPassageStyle(to: m)
        #elseif os(iOS)
        Self.applyIOSDictionaryPassageStyle(to: m)
        #endif
        return NSAttributedString(attributedString: m)
    }

    /// Final guard pass used at display time: always enforce smaller verse numeral sizing.
    static func enforceVerseNumeralDisplaySizing(_ attributed: NSAttributedString) -> NSAttributedString {
        let m = NSMutableAttributedString(attributedString: attributed)
        #if os(macOS)
        let bodyFont = serifSystem(size: 19, weight: .regular)
        let numFont = macVerseNumeralFont(fromBody: bodyFont)
        let bo = numeralBaselineOffset(bodyPointSize: bodyFont.pointSize)
        let full = NSRange(location: 0, length: m.length)
        m.enumerateAttributes(in: full, options: []) { attrs, range, _ in
            let hasSuperscript = scriptureSuperscriptLevel(from: attrs) != 0
            let hasLift = scriptureBaselineOffset(from: attrs) > 0.1
            guard hasSuperscript || hasLift else { return }
            m.removeAttribute(scriptureSuperscriptAppKitAttribute, range: range)
            m.removeAttribute(scriptureSuperscriptCoreTextAttribute, range: range)
            m.removeAttribute(.baselineOffset, range: range)
            m.addAttributes([
                .font: numFont,
                .foregroundColor: NSColor.secondaryLabelColor,
                .baselineOffset: bo,
            ], range: range)
        }
        for r in collectVerseDigitSubrangesInPlainText(m.string) {
            m.removeAttribute(scriptureSuperscriptAppKitAttribute, range: r)
            m.removeAttribute(scriptureSuperscriptCoreTextAttribute, range: r)
            m.removeAttribute(.baselineOffset, range: r)
            m.addAttributes([
                .font: numFont,
                .foregroundColor: NSColor.secondaryLabelColor,
                .baselineOffset: bo,
            ], range: r)
        }
        #elseif os(iOS)
        let bodyFont = serifSystem(size: 19, weight: .regular)
        let numFont = iosVerseNumeralFont(fromBody: bodyFont)
        let bo = numeralBaselineOffset(bodyPointSize: bodyFont.pointSize)
        let full = NSRange(location: 0, length: m.length)
        m.enumerateAttributes(in: full, options: []) { attrs, range, _ in
            let hasSuperscript = scriptureSuperscriptLevel(from: attrs) != 0
            let hasLift = scriptureBaselineOffset(from: attrs) > 0.1
            guard hasSuperscript || hasLift else { return }
            m.removeAttribute(scriptureSuperscriptAppKitAttribute, range: range)
            m.removeAttribute(scriptureSuperscriptCoreTextAttribute, range: range)
            m.removeAttribute(.baselineOffset, range: range)
            m.addAttributes([
                .font: numFont,
                .foregroundColor: UIColor.secondaryLabel,
                .baselineOffset: bo,
            ], range: range)
        }
        for r in collectVerseDigitSubrangesInPlainText(m.string) {
            m.removeAttribute(scriptureSuperscriptAppKitAttribute, range: r)
            m.removeAttribute(scriptureSuperscriptCoreTextAttribute, range: r)
            m.removeAttribute(.baselineOffset, range: r)
            m.addAttributes([
                .font: numFont,
                .foregroundColor: UIColor.secondaryLabel,
                .baselineOffset: bo,
            ], range: r)
        }
        #endif
        return NSAttributedString(attributedString: m)
    }

    #if os(macOS)
    private static func serifSystem(size: CGFloat, weight: NSFont.Weight) -> NSFont {
        let base = NSFont.systemFont(ofSize: size, weight: weight)
        if let d = base.fontDescriptor.withDesign(.serif) {
            return NSFont(descriptor: d, size: size) ?? base
        }
        return base
    }

    private static func macVerseNumeralFont(fromBody body: NSFont) -> NSFont {
        let s = max(verseNumeralMinSize, (body.pointSize * verseNumeralToBodyScale).rounded())
        return NSFontManager.shared.convert(body, toSize: s)
    }

    /// macOS: serif body; verse numerals use **small font + positive baselineOffset** (SwiftUI-reliable superscript).
    private static func applyMacDictionaryPassageStyle(to m: NSMutableAttributedString) {
        let full = NSRange(location: 0, length: m.length)
        guard full.length > 0 else { return }

        m.enumerateAttribute(.link, in: full, options: []) { _, range, _ in
            m.removeAttribute(.link, range: range)
        }

        let bodyFont = serifSystem(size: 19, weight: .regular)
        let naturalLine = bodyFont.ascender + abs(bodyFont.descender) + bodyFont.leading
        let lineHeight = max(ceil(naturalLine * 1.36), naturalLine + 5)

        let para = NSMutableParagraphStyle()
        para.minimumLineHeight = lineHeight
        para.maximumLineHeight = lineHeight
        para.paragraphSpacing = 14
        para.alignment = .natural
        m.addAttribute(.paragraphStyle, value: para, range: full)

        let mgr = NSFontManager.shared
        var i = full.location
        let end = NSMaxRange(full)
        while i < end {
            var eff = NSRange()
            let attrs = m.attributes(at: i, effectiveRange: &eff)
            let font = attrs[.font] as? NSFont
            let superscriptLevel = scriptureSuperscriptLevel(from: attrs)
            let preexistingBaseline = scriptureBaselineOffset(from: attrs)
            let isVerseNumeralSuperscript = superscriptLevel != 0 || preexistingBaseline > 0.1
            let traits = font.map { mgr.traits(of: $0) } ?? []
            let isBold = traits.contains(.boldFontMask)
            let isItalic = traits.contains(.italicFontMask)
                || ((attrs[.obliqueness] as? CGFloat).map { abs($0) > 0.01 } ?? false)

            if isVerseNumeralSuperscript {
                let numFont = macVerseNumeralFont(fromBody: bodyFont)
                let bo = numeralBaselineOffset(bodyPointSize: bodyFont.pointSize)
                m.removeAttribute(scriptureSuperscriptAppKitAttribute, range: eff)
                m.removeAttribute(scriptureSuperscriptCoreTextAttribute, range: eff)
                m.removeAttribute(.baselineOffset, range: eff)
                m.addAttributes([
                    .font: numFont,
                    .foregroundColor: NSColor.secondaryLabelColor,
                    .baselineOffset: bo,
                ], range: eff)
            } else if isBold && !isItalic {
                let labelFont = serifSystem(size: 15, weight: .medium)
                m.addAttributes([
                    .font: labelFont,
                    .foregroundColor: NSColor.labelColor,
                ], range: eff)
            } else if isItalic {
                let body = serifSystem(size: 17, weight: .regular)
                let ob = mgr.convert(body, toHaveTrait: .italicFontMask)
                m.addAttributes([
                    .font: ob,
                    .foregroundColor: NSColor.secondaryLabelColor,
                ], range: eff)
            } else {
                m.addAttributes([
                    .font: bodyFont,
                    .foregroundColor: NSColor.labelColor,
                ], range: eff)
            }

            let next = NSMaxRange(eff)
            if next <= i { break }
            i = next
        }

        // HTML import often merges a verse digit with the next word ("1Afterward" / "¹Afterward") with no &lt;sup&gt; run.
        let numFont = macVerseNumeralFont(fromBody: bodyFont)
        let bo = numeralBaselineOffset(bodyPointSize: bodyFont.pointSize)
        for r in collectVerseDigitSubrangesInPlainText(m.string) {
            m.removeAttribute(scriptureSuperscriptAppKitAttribute, range: r)
            m.removeAttribute(scriptureSuperscriptCoreTextAttribute, range: r)
            m.removeAttribute(.baselineOffset, range: r)
            m.addAttributes([
                .font: numFont,
                .foregroundColor: NSColor.secondaryLabelColor,
                .baselineOffset: bo,
            ], range: r)
        }

        m.addAttribute(.paragraphStyle, value: para, range: full)
    }

    #elseif os(iOS)
    private static func serifSystem(size: CGFloat, weight: UIFont.Weight) -> UIFont {
        let base = UIFont.systemFont(ofSize: size, weight: weight)
        if let d = base.fontDescriptor.withDesign(.serif) {
            return UIFont(descriptor: d, size: size)
        }
        return base
    }

    private static func iosVerseNumeralFont(fromBody body: UIFont) -> UIFont {
        let s = max(verseNumeralMinSize, (body.pointSize * verseNumeralToBodyScale).rounded())
        return UIFont(descriptor: body.fontDescriptor, size: s)
    }

    private static func applyIOSDictionaryPassageStyle(to m: NSMutableAttributedString) {
        let full = NSRange(location: 0, length: m.length)
        guard full.length > 0 else { return }

        m.enumerateAttribute(.link, in: full, options: []) { _, range, _ in
            m.removeAttribute(.link, range: range)
        }

        let bodyFont = serifSystem(size: 19, weight: .regular)
        let lineHeight = max(ceil(bodyFont.lineHeight * 1.36), bodyFont.lineHeight + 5)

        let para = NSMutableParagraphStyle()
        para.minimumLineHeight = lineHeight
        para.maximumLineHeight = lineHeight
        para.paragraphSpacing = 14
        para.alignment = .natural
        m.addAttribute(.paragraphStyle, value: para, range: full)

        var i = full.location
        let end = NSMaxRange(full)
        while i < end {
            var eff = NSRange()
            let attrs = m.attributes(at: i, effectiveRange: &eff)
            let superscriptLevel = scriptureSuperscriptLevel(from: attrs)
            let preexistingBaseline = scriptureBaselineOffset(from: attrs)
            let isVerseNumeralSuperscript = superscriptLevel != 0 || preexistingBaseline > 0.1
            let traits = (attrs[.font] as? UIFont)?.fontDescriptor.symbolicTraits ?? []
            let isBold = traits.contains(.traitBold)
            let isItalic = traits.contains(.traitItalic)
                || ((attrs[.obliqueness] as? CGFloat).map { abs($0) > 0.01 } ?? false)

            if isVerseNumeralSuperscript {
                let numFont = iosVerseNumeralFont(fromBody: bodyFont)
                let bo = numeralBaselineOffset(bodyPointSize: bodyFont.pointSize)
                m.removeAttribute(scriptureSuperscriptAppKitAttribute, range: eff)
                m.removeAttribute(scriptureSuperscriptCoreTextAttribute, range: eff)
                m.removeAttribute(.baselineOffset, range: eff)
                m.addAttributes([
                    .font: numFont,
                    .foregroundColor: UIColor.secondaryLabel,
                    .baselineOffset: bo,
                ], range: eff)
            } else if isBold && !isItalic {
                let labelFont = serifSystem(size: 15, weight: .medium)
                m.addAttributes([
                    .font: labelFont,
                    .foregroundColor: UIColor.label,
                ], range: eff)
            } else if isItalic {
                let base = serifSystem(size: 17, weight: .regular)
                let d = base.fontDescriptor
                let merged = d.symbolicTraits.union(.traitItalic)
                let ob: UIFont = {
                    guard let nd = d.withSymbolicTraits(merged) else { return base }
                    return UIFont(descriptor: nd, size: 17)
                }()
                m.addAttributes([
                    .font: ob,
                    .foregroundColor: UIColor.secondaryLabel,
                ], range: eff)
            } else {
                m.addAttributes([
                    .font: bodyFont,
                    .foregroundColor: UIColor.label,
                ], range: eff)
            }

            let next = NSMaxRange(eff)
            if next <= i { break }
            i = next
        }

        let numFont = iosVerseNumeralFont(fromBody: bodyFont)
        let bo = numeralBaselineOffset(bodyPointSize: bodyFont.pointSize)
        for r in collectVerseDigitSubrangesInPlainText(m.string) {
            m.removeAttribute(scriptureSuperscriptAppKitAttribute, range: r)
            m.removeAttribute(scriptureSuperscriptCoreTextAttribute, range: r)
            m.removeAttribute(.baselineOffset, range: r)
            m.addAttributes([
                .font: numFont,
                .foregroundColor: UIColor.secondaryLabel,
                .baselineOffset: bo,
            ], range: r)
        }

        m.addAttribute(.paragraphStyle, value: para, range: full)
    }
    #endif
}

@MainActor
final class ScripturePassageCache {
    static let shared = ScripturePassageCache()

    private let capacity = 20
    private var order: [String] = []
    private var storage: [String: NSAttributedString] = [:]

    private init() {}

    private static func cacheKey(reference: String, translation: String) -> String {
        let r = reference.trimmingCharacters(in: .whitespacesAndNewlines)
        let t = translation.trimmingCharacters(in: .whitespacesAndNewlines)
        return "v17|\(r)|\(t)"
    }

    func value(reference: String, translation: String) -> NSAttributedString? {
        storage[Self.cacheKey(reference: reference, translation: translation)]
    }

    func insert(_ attributed: NSAttributedString, reference: String, translation: String) {
        let key = Self.cacheKey(reference: reference, translation: translation)
        if let idx = order.firstIndex(of: key) {
            order.remove(at: idx)
        }
        order.append(key)
        storage[key] = attributed
        while order.count > capacity, let first = order.first {
            order.removeFirst()
            storage.removeValue(forKey: first)
        }
    }

    /// Best-effort background fetch for snappier passage popover / revisits.
    func prefetch(reference: String, translation: String) async {
        let trimmedRef = reference.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedRef.isEmpty else { return }
        do {
            let html = try await ScriptureVerseFetch.fetchVerseHTML(reference: reference, translation: translation)
            let parsed = try ScripturePassageHTMLParser.nsAttributedString(fromHTML: html)
            insert(parsed, reference: reference, translation: translation)
        } catch {
            // Prefetch is optional; failures are ignored.
        }
    }
}
