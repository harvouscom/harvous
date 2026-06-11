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

// MARK: - Cursor-scoped pill insertion (instant Space/Enter/comma/period)

/// Whether `cursorUTF16` sits inside an existing scripture pill attachment range.
func cursorIntersectsScripturePill(in storage: NSTextStorage, cursorUTF16: Int) -> Bool {
    guard storage.length > 0 else { return false }
    let idx = min(max(0, cursorUTF16 - 1), storage.length - 1)
    var eff = NSRange()
    if storage.attribute(.attachment, at: idx, effectiveRange: &eff) is ScripturePillAttachment {
        return NSLocationInRange(idx, eff)
    }
    if cursorUTF16 < storage.length,
       storage.attribute(.attachment, at: cursorUTF16, effectiveRange: &eff) is ScripturePillAttachment {
        return NSLocationInRange(cursorUTF16, eff)
    }
    return false
}

#if os(macOS)
func harvousEditorBackingScale(for textView: NSTextView?) -> CGFloat {
    textView?.window?.backingScaleFactor
        ?? textView?.window?.screen?.backingScaleFactor
        ?? NSScreen.main?.backingScaleFactor
        ?? 2.0
}
#elseif os(iOS)
func harvousEditorBackingScale(for textView: UITextView?) -> CGFloat {
    textView?.traitCollection.displayScale ?? UIScreen.main.scale
}
#endif

/// Inserts a single scripture pill at the reference ending before `cursorUTF16` without strip→reapply.
/// Returns the inserted display reference when a pill was created.
@discardableResult
func detectAndInsertPillAtCursor(
    in storage: NSTextStorage,
    cursorUTF16: Int,
    isBoundaryTrigger: Bool,
    theme: HarvousColors.ThemeVariant,
    pillAccentResolver: ((String) -> StudyHighlightAccentToken?)?,
    backingScale: CGFloat
) -> String? {
    guard cursorUTF16 >= 2 else { return nil }
    if cursorIntersectsScripturePill(in: storage, cursorUTF16: cursorUTF16) {
        return nil
    }

    let plain = storage.string
    let nsPlain = plain as NSString

    let charBefore: UnicodeScalar? = {
        guard cursorUTF16 > 0, cursorUTF16 <= nsPlain.length else { return nil }
        let u = nsPlain.character(at: cursorUTF16 - 1)
        return UnicodeScalar(u)
    }()
    let isNewParagraph: Bool = {
        guard cursorUTF16 > 0, cursorUTF16 <= nsPlain.length else { return false }
        let para = nsPlain.paragraphRange(for: NSRange(location: min(cursorUTF16, max(0, nsPlain.length - 1)), length: 0))
        return cursorUTF16 == para.location && cursorUTF16 > 0
    }()
    let isBoundary = isBoundaryTrigger
        || ScriptureDetector.isScriptureBoundaryInsertion(
            charBeforeCursor: charBefore,
            isNewParagraph: isNewParagraph
        )

    var match = ScriptureDetector.detectReferenceEnding(in: plain, beforeCursorUTF16: cursorUTF16)
    if match == nil, isBoundaryTrigger {
        match = ScriptureDetector.detectLastReferenceInWindow(in: plain, beforeCursorUTF16: cursorUTF16)
    }
    guard let match else { return nil }
    guard ScriptureDetector.shouldCreatePillAtBoundary(match: match, isBoundary: isBoundary) else { return nil }

    for pillRange in rangesOfScripturePillAttachments(in: storage) {
        if NSIntersectionRange(pillRange, match.range).length > 0 { return nil }
    }

    var replaceRange = match.range
    var trans = ScriptureReference.defaultTranslation
    if let suffixPair = scriptureTrailingTranslationAfterReference(match: match, in: plain) {
        trans = suffixPair.translation
        replaceRange = NSRange(location: match.range.location, length: match.range.length + suffixPair.suffixUTF16Length)
    }

    let pill = ScripturePillAttachment(
        reference: match.displayText,
        translation: trans,
        theme: theme,
        accent: pillAccentResolver?(match.displayText),
        backingScale: backingScale
    )
    let pillStr = NSMutableAttributedString(attachment: pill)
    let bodyFont = HarvousFonts.noteComposeBodyPlatformFont()
    var pillAttrs: [NSAttributedString.Key: Any] = [.font: bodyFont]
    let pillLoc = replaceRange.location
    if pillLoc < storage.length,
       let ps = storage.attribute(.paragraphStyle, at: pillLoc, effectiveRange: nil) as? NSParagraphStyle {
        pillAttrs[.paragraphStyle] = ps
    }
    pillStr.addAttributes(pillAttrs, range: NSRange(location: 0, length: pillStr.length))

    storage.beginEditing()
    storage.replaceCharacters(in: replaceRange, with: pillStr)
    storage.endEditing()

    return match.displayText
}
