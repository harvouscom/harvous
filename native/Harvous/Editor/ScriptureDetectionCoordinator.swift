import Foundation
#if os(macOS)
import AppKit
#else
import UIKit
#endif

// MARK: - NSTextStorage scripture-pill utilities
// These functions are pure helpers over NSTextStorage and contain no Coordinator state.
// They are shared by both the macOS and iOS Coordinator implementations in HarvousEditor.swift.

/// Ranges of `ScripturePillAttachment` in document order.
func rangesOfScripturePillAttachments(in storage: NSTextStorage) -> [NSRange] {
    var ranges: [NSRange] = []
    let end = storage.length
    var idx = 0
    while idx < end {
        var eff = NSRange()
        let value = storage.attribute(.attachment, at: idx, effectiveRange: &eff)
        if value is ScripturePillAttachment { ranges.append(eff) }
        let next = NSMaxRange(eff)
        if next <= idx { break }
        idx = next
    }
    return ranges
}

/// Document-ordered `(reference, translation)` for each `ScripturePillAttachment`.
/// Used when re-detecting so existing translations are not reset to the default.
func scripturePillRefTransPairs(in storage: NSTextStorage) -> [(reference: String, translation: String)] {
    rangesOfScripturePillAttachments(in: storage).compactMap { range -> (String, String)? in
        guard let pill = storage.attribute(.attachment, at: range.location, effectiveRange: nil) as? ScripturePillAttachment else { return nil }
        return (pill.reference, pill.translation)
    }
}

/// After re-inserting pills from plain text, remove the trailing " ESV" (or similar) span that was
/// stored alongside the pill reference so the chip is not immediately followed by a plain-text translation code.
func removeDuplicateTranslationAfterPillAttachments(in storage: NSTextStorage) {
    for range in rangesOfScripturePillAttachments(in: storage).reversed() {
        guard let pill = storage.attribute(.attachment, at: range.location, effectiveRange: nil) as? ScripturePillAttachment
        else { continue }
        let after = NSMaxRange(range)
        guard after < storage.length, !pill.translation.isEmpty else { continue }
        let toStrip = " " + pill.translation
        let ns = storage.string as NSString
        if ns.length >= after + toStrip.utf16.count,
           ns.substring(with: NSRange(location: after, length: toStrip.utf16.count)) == toStrip {
            storage.replaceCharacters(in: NSRange(location: after, length: toStrip.utf16.count), with: "")
        }
    }
}

/// Returns true when two reference strings refer to the same verse (handles abbreviation or casing differences).
func scriptureReferencesMatchForTranslationQueue(_ stored: String, _ detected: String) -> Bool {
    if stored == detected { return true }
    guard let a = ScriptureReferenceParser.parse(stored), let b = ScriptureReferenceParser.parse(detected) else {
        return stored.caseInsensitiveCompare(detected) == .orderedSame
    }
    return a.bookIndex == b.bookIndex
        && a.chapter == b.chapter
        && a.verseStart == b.verseStart
        && a.verseEnd == b.verseEnd
}

/// When `note.body` stores `"reference + space + translation"`, on re-load the plain text has no
/// attachments yet. This recovers the trailing translation code that follows a detector match so the
/// pill can be re-inserted with its original translation.
func scriptureTrailingTranslationAfterReference(
    match: ScriptureDetector.Match,
    in plain: String
) -> (translation: String, suffixUTF16Length: Int)? {
    let ns = plain as NSString
    let matchEnd = NSMaxRange(match.range)
    let len = ns.length
    guard matchEnd < len else { return nil }
    var pos = matchEnd
    var foundWhitespace = false
    while pos < len {
        let u = ns.character(at: pos)
        guard let scalar = UnicodeScalar(u) else { return nil }
        if CharacterSet.whitespacesAndNewlines.contains(scalar) {
            foundWhitespace = true
            pos += 1
        } else {
            break
        }
    }
    guard foundWhitespace, pos < len else { return nil }
    let tail = ns.substring(from: pos)
    for code in ScriptureReference.availableTranslations.sorted(by: { $0.utf16.count > $1.utf16.count }) {
        let opts: NSString.CompareOptions = [.anchored, .caseInsensitive]
        let r = (tail as NSString).range(of: code, options: opts)
        guard r.location == 0, r.length == (code as NSString).length else { continue }
        let codeUTF16 = code.utf16.count
        let idxAfter = pos + codeUTF16
        if idxAfter < len {
            let nextU = ns.character(at: idxAfter)
            if let s = UnicodeScalar(nextU), CharacterSet.letters.contains(s) { continue }
        }
        let suffixLen = idxAfter - matchEnd
        return (code, suffixLen)
    }
    return nil
}
