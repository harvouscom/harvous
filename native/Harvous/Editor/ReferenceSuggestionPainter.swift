import Foundation

#if os(macOS)
import AppKit
#elseif os(iOS) || os(tvOS) || os(visionOS)
import UIKit
#endif

// MARK: - Inline reference suggestions (native)
//
// Mirrors the web `TiptapReferenceSuggestion` extension. As the user types, words they
// already have saved material for — for now Easton's Bible Dictionary people/places — get a
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

    /// Categories surfaced as suggestions. Proper-noun signal only — `thing` is too noisy.
    static let suggestionCategories: Set<String> = ["person", "place"]

    /// True when the first character is an uppercase letter (proper-noun gate).
    static func isCapitalized(_ word: String) -> Bool {
        guard let first = word.unicodeScalars.first else { return false }
        return CharacterSet.uppercaseLetters.contains(first)
    }

    /// Decide whether `word` should be suggested, returning the matched slug if so.
    /// Pure aside from the (main-actor) dictionary lookup, so it is unit-testable.
    static func suggestedSlug(
        for word: String,
        lookup: (String) -> String?
    ) -> String? {
        guard isCapitalized(word) else { return nil }
        if stoplist.contains(word.lowercased()) { return nil }
        return lookup(word)
    }

    /// Convenience over the shared dictionary service: returns the slug when `word` resolves to
    /// a capitalized, non-stoplisted `person`/`place` entry.
    private static func serviceLookup(_ word: String) -> String? {
        guard let entry = EastonsDictionaryService.shared.matchedEntry(forWord: word) else { return nil }
        guard let category = entry.category, suggestionCategories.contains(category) else { return nil }
        return entry.slug
    }

    // MARK: - Paint / cleanup

    static func stripSuggestions(from storage: NSTextStorage, fullDocumentRange: NSRange) {
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
    static func applySuggestions(storage: NSTextStorage, isDark: Bool) {
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
            guard let slug = suggestedSlug(for: word, lookup: serviceLookup) else { return }
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
}
