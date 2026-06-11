import Foundation

#if os(macOS)
import AppKit
#elseif os(iOS) || os(tvOS) || os(visionOS)
import UIKit
#endif

// MARK: - Inline reference suggestions (native)
//
// Mirrors the web `TiptapReferenceSuggestion` extension. As the user types, words they
// already have saved material for — for now Easton's Bible Dictionary entries — get a
// faint DOTTED underline hint. The hint is presentation-only: it is painted onto the live
// `NSTextStorage` exactly like `HarvousStudyHighlightMapper.applyHighlights`, and like that
// painting it is stripped/reapplied and never reaches serialized `note.body`
// (`harvousExpandedPlainText` emits text + pill/image/HR markers only — never underline or
// custom attributes). Tapping a hint opens the Easton's entry with a "Save reference" action
// that reuses the existing reference-save path (a `StudyThread` of kind `.reference`).

extension NSAttributedString.Key {
    /// Stored value: the matched headword's slug. Marks a typed reference *suggestion*
    /// (not yet saved). Distinct from `.harvousStudyHighlightUUID` (a saved highlight).
    static let harvousReferenceSuggestion = NSAttributedString.Key("harvous.reference.suggestion")
}

@MainActor
enum ReferenceSuggestionPainter {
    /// Ultra-common names whose entries exist but would underline on nearly every note.
    /// Tunable — keep in sync with the web `REFERENCE_SUGGESTION_STOPLIST`.
    static let stoplist: Set<String> = ["god", "lord", "jesus", "christ", "spirit"]

    /// Minimum token length — keep in sync with web `REFERENCE_SUGGESTION_MIN_LENGTH`.
    static let minLength = 3

    /// Honorific tokens before a capitalized name — keep in sync with web `PERSON_NAME_HONORIFIC_PREFIXES`.
    static let honorificPrefixes = PersonNameContextGate.honorificPrefixes

    /// True when the first character is an uppercase letter (proper-noun gate).
    static func isCapitalized(_ word: String) -> Bool {
        guard let first = word.unicodeScalars.first else { return false }
        return CharacterSet.uppercaseLetters.contains(first)
    }

    /// Decide whether `word` should be suggested, returning the matched slug if so.
    /// Pure aside from the (main-actor) dictionary lookup, so it is unit-testable.
    static func suggestedSlug(
        for word: String,
        entryLookup: (String) -> EastonsSlugIndexEntry?
    ) -> String? {
        guard word.count >= minLength else { return nil }
        if stoplist.contains(word.lowercased()) { return nil }
        guard let entry = entryLookup(word) else { return nil }
        guard entry.headword.count >= minLength else { return nil }
        if entry.category == "thing" {
            return entry.slug
        }
        guard isCapitalized(word) else { return nil }
        return entry.slug
    }

    /// Skip dotted hints when the token looks like a person name in running prose (honorific prefix
    /// and/or a capitalized surname following). Keep in sync with web `shouldSkipPersonNameContext`.
    static func shouldSkipPersonNameContext(in string: String, wordRange: Range<String.Index>) -> Bool {
        PersonNameContextGate.shouldSkip(in: string, wordRange: wordRange)
    }

    /// Convenience over the shared dictionary service: returns the matched index row for `word`.
    private static func serviceLookup(_ word: String) -> EastonsSlugIndexEntry? {
        EastonsDictionaryService.shared.matchedEntry(forWord: word)
    }

    // MARK: - Paint / cleanup

    static func stripSuggestions(from storage: NSMutableAttributedString, fullDocumentRange: NSRange) {
        guard fullDocumentRange.length > 0 else { return }
        storage.beginEditing()
        defer { storage.endEditing() }
        storage.enumerateAttribute(.harvousReferenceSuggestion, in: fullDocumentRange, options: []) { value, range, _ in
            guard value != nil else { return }
            storage.removeAttribute(.harvousReferenceSuggestion, range: range)
            storage.removeAttribute(.underlineStyle, range: range)
            storage.removeAttribute(.underlineColor, range: range)
        }
    }

    /// Faint dotted underline color for a suggestion hint — deliberately lighter than a saved
    /// highlight's accent underline so it reads as a suggestion, not a committed highlight.
    private static func suggestionUnderlineColor(isDark: Bool) -> Any {
#if os(macOS)
        return NSColor.tertiaryLabelColor
#else
        return UIColor.tertiaryLabel
#endif
    }

    /// Repaint suggestions across the whole document. Run AFTER `applyHighlights` so saved
    /// highlights win: words already inside a `.harvousStudyHighlightUUID` run or a scripture
    /// pill attachment are skipped (no double-marking, matching the web mark-exclusion rule).
    static func applySuggestions(
        storage: NSTextStorage,
        isDark: Bool,
        entryLookup: ((String) -> EastonsSlugIndexEntry?)? = nil
    ) {
        let lookup = entryLookup ?? { serviceLookup($0) }
        let fullRange = NSRange(location: 0, length: storage.length)
        stripSuggestions(from: storage, fullDocumentRange: fullRange)
        guard storage.length > 0 else { return }

        let underlineColor = suggestionUnderlineColor(isDark: isDark)
        let dottedStyle = NSUnderlineStyle([.single, .patternDot]).rawValue
        let string = storage.string

        storage.beginEditing()
        defer { storage.endEditing() }

        string.enumerateSubstrings(in: string.startIndex..<string.endIndex, options: .byWords) { sub, subRange, _, _ in
            guard let word = sub, !word.isEmpty else { return }
            guard let slug = suggestedSlug(for: word, entryLookup: lookup) else { return }
            if shouldSkipPersonNameContext(in: string, wordRange: subRange) { return }
            let nsRange = NSRange(subRange, in: string)
            guard nsRange.location != NSNotFound, NSMaxRange(nsRange) <= storage.length else { return }
            // Skip words already inside a saved highlight or a scripture pill / attachment.
            if storage.attribute(.harvousStudyHighlightUUID, at: nsRange.location, effectiveRange: nil) != nil { return }
            if storage.attribute(.attachment, at: nsRange.location, effectiveRange: nil) != nil { return }
            storage.addAttribute(.harvousReferenceSuggestion, value: slug, range: nsRange)
            storage.addAttribute(.underlineStyle, value: dottedStyle, range: nsRange)
            storage.addAttribute(.underlineColor, value: underlineColor, range: nsRange)
        }
    }

    // MARK: - Hit testing

    /// The suggestion slug + word range at a tapped UTF-16 index, when inside a suggestion run.
    static func suggestionAt(storageUTF16Index location: Int, in storage: NSTextStorage) -> (slug: String, range: NSRange)? {
        guard storage.length > 0, location >= 0, location < storage.length else { return nil }
        var eff = NSRange()
        guard let slug = storage.attribute(.harvousReferenceSuggestion, at: location, effectiveRange: &eff) as? String else {
            return nil
        }
        return (slug, eff)
    }

    // MARK: - Save payload (pending suggestion → anchored reference highlight)

    /// Re-resolve the live suggestion run at save time (stored range may be stale after edits).
    static func resolveLiveStorageRange(slug: String, fallback: NSRange, in storage: NSTextStorage) -> NSRange? {
        guard fallback.length > 0, fallback.location != NSNotFound, NSMaxRange(fallback) <= storage.length else {
            return nil
        }
        let mid = fallback.location + fallback.length / 2
        for probe in [fallback.location, mid] {
            if let hit = suggestionAt(storageUTF16Index: probe, in: storage), hit.slug == slug {
                return hit.range
            }
        }
        var nearest: (range: NSRange, distance: Int)?
        storage.enumerateAttribute(.harvousReferenceSuggestion, in: NSRange(location: 0, length: storage.length), options: []) { value, range, _ in
            guard (value as? String) == slug else { return }
            let distance = abs(range.location - fallback.location)
            if nearest == nil || distance < nearest!.distance {
                nearest = (range, distance)
            }
        }
        if let nearest, nearest.distance <= 64 {
            return nearest.range
        }
        if storage.attribute(.harvousReferenceSuggestion, at: fallback.location, effectiveRange: nil) != nil {
            return fallback
        }
        return nil
    }

    /// Maps a pending suggestion tap into anchor text + expanded-plain coordinates from live storage.
    static func resolveSavePayload(
        slug: String,
        headword: String,
        storageRange: NSRange,
        storage: NSTextStorage
    ) -> (word: String, expRange: NSRange, expandedPlain: String)? {
        guard let liveRange = resolveLiveStorageRange(slug: slug, fallback: storageRange, in: storage) else { return nil }
        guard case .success(let expRange) = HarvousStudyHighlightMapper.expandedRange(forStorageSelection: liveRange, in: storage),
              expRange.length > 0 else { return nil }
        let expandedPlain = harvousExpandedPlainText(in: storage)
        let nsExpanded = expandedPlain as NSString
        guard expRange.location != NSNotFound, NSMaxRange(expRange) <= nsExpanded.length else { return nil }
        var word = nsExpanded.substring(with: expRange).trimmingCharacters(in: .whitespacesAndNewlines)
        if word.isEmpty {
            word = headword
        } else if EastonsDictionaryService.shared.matchedSlug(forWord: word) == nil,
                  EastonsDictionaryService.shared.slugIndex[slug] != nil {
            word = headword
        }
        guard !word.isEmpty else { return nil }
        return (word, expRange, expandedPlain)
    }

    // MARK: - Passage suggestions (scripture dock)

    private static func passageBaselineOffset(at location: Int, in storage: NSAttributedString) -> CGFloat {
        guard storage.length > 0, location >= 0, location < storage.length else { return 0 }
        if let n = storage.attribute(.baselineOffset, at: location, effectiveRange: nil) as? NSNumber {
            return CGFloat(truncating: n)
        }
        if let g = storage.attribute(.baselineOffset, at: location, effectiveRange: nil) as? CGFloat {
            return g
        }
        return 0
    }

    /// Verse numerals are painted with a positive `baselineOffset` during HTML import.
    private static func isPassageVerseNumeral(at location: Int, in storage: NSAttributedString) -> Bool {
        passageBaselineOffset(at: location, in: storage) > 0.05
    }

    /// Skip Easton's hint when a Bible book name is followed by chapter/verse digits in the same text node.
    private static func isLikelyScriptureReferenceInProgress(word: String, text: String, wordEndUTF16: Int) -> Bool {
        guard ScriptureCanonicalBooks.bookIndex(matchingRaw: word) != nil else { return false }
        let ns = text as NSString
        guard wordEndUTF16 <= ns.length else { return false }
        let after = ns.substring(from: wordEndUTF16)
        return after.range(of: #"^\s*\d"#, options: .regularExpression) != nil
    }

    private static func intersectsAnyRange(_ range: NSRange, in ranges: [NSRange]) -> Bool {
        ranges.contains { NSIntersectionRange(range, $0).length > 0 }
    }

    /// Paints dotted dictionary hints into passage attributed text. Run after saved passage highlights.
    static func applyPassageSuggestions(
        to storage: NSMutableAttributedString,
        isDark: Bool,
        excludedPaintRanges: [NSRange] = [],
        entryLookup: ((String) -> EastonsSlugIndexEntry?)? = nil
    ) {
        let lookup = entryLookup ?? { serviceLookup($0) }
        guard EastonsDictionaryService.shared.indexLoadState == .loaded else { return }
        let fullRange = NSRange(location: 0, length: storage.length)
        stripSuggestions(from: storage, fullDocumentRange: fullRange)
        guard storage.length > 0 else { return }

        let underlineColor = suggestionUnderlineColor(isDark: isDark)
        let dottedStyle = NSUnderlineStyle([.single, .patternDot]).rawValue
        let string = storage.string

        storage.beginEditing()
        defer { storage.endEditing() }

        string.enumerateSubstrings(in: string.startIndex..<string.endIndex, options: .byWords) { sub, subRange, _, _ in
            guard let word = sub, !word.isEmpty else { return }
            let nsRange = NSRange(subRange, in: string)
            guard nsRange.location != NSNotFound, NSMaxRange(nsRange) <= storage.length else { return }
            if isPassageVerseNumeral(at: nsRange.location, in: storage) { return }
            if intersectsAnyRange(nsRange, in: excludedPaintRanges) { return }
            guard let slug = suggestedSlug(for: word, entryLookup: lookup) else { return }
            if shouldSkipPersonNameContext(in: string, wordRange: subRange) { return }
            if isLikelyScriptureReferenceInProgress(word: word, text: string, wordEndUTF16: NSMaxRange(nsRange)) { return }
            storage.addAttribute(.harvousReferenceSuggestion, value: slug, range: nsRange)
            storage.addAttribute(.underlineStyle, value: dottedStyle, range: nsRange)
            storage.addAttribute(.underlineColor, value: underlineColor, range: nsRange)
        }
    }

    /// Hit-test a passage attributed string for an inline suggestion run.
    static func suggestionAtPassage(storageUTF16Index location: Int, in storage: NSAttributedString) -> (slug: String, range: NSRange)? {
        guard storage.length > 0, location >= 0, location < storage.length else { return nil }
        var eff = NSRange()
        guard let slug = storage.attribute(.harvousReferenceSuggestion, at: location, effectiveRange: &eff) as? String else {
            return nil
        }
        return (slug, eff)
    }
}
