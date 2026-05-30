import Foundation

#if os(macOS)
import AppKit
#elseif os(iOS) || os(tvOS) || os(visionOS)
import UIKit
#endif

/// Per-highlight pastel override; persisted on `StudyThread.highlightAccentRaw`. `.auto` uses entry-kind hues.
enum StudyHighlightAccentToken: String, CaseIterable {
    case auto
    /// Stone gray (low saturation) — default for scripture-link highlights.
    case neutral
    case warmAmber
    case skyBlue
    case violet
    case mintGreen
    case coralRose

    /// Highlights (selection popover + study dock): amber default, no neutral swatch.
    static var pickerChoices: [StudyHighlightAccentToken] {
        [.warmAmber, .skyBlue, .violet, .mintGreen, .coralRose]
    }

    /// Scripture pill / scripture chrome pickers — neutral stays available as explicit default tint.
    static var pickerChoicesWithNeutral: [StudyHighlightAccentToken] {
        [.neutral, .warmAmber, .skyBlue, .violet, .mintGreen, .coralRose]
    }

    static func decoding(_ raw: String) -> StudyHighlightAccentToken {
        StudyHighlightAccentToken(rawValue: raw) ?? .auto
    }

    nonisolated var label: String {
        switch self {
        case .auto: return "Default"
        case .neutral: return "Neutral"
        case .warmAmber: return "Amber"
        case .skyBlue: return "Sky"
        case .violet: return "Violet"
        case .mintGreen: return "Mint"
        case .coralRose: return "Coral"
        }
    }

    nonisolated var symbolName: String {
        switch self {
        case .auto: return "circle.lefthalf.filled.righthalf.striped.horizontal"
        case .neutral: return "circle.fill"
        case .warmAmber: return "circle.fill"
        case .skyBlue: return "circle.fill"
        case .violet: return "circle.fill"
        case .mintGreen: return "circle.fill"
        case .coralRose: return "circle.fill"
        }
    }

    /// Hue + saturation tuple used to derive both the background pastel and foreground pill color for a given accent.
    /// `.auto` returns `nil` so callers fall back to per-kind hues in `HarvousColors`.
    fileprivate var hueSat: (hue: CGFloat, sat: CGFloat)? {
        switch self {
        case .auto: return nil
        case .neutral: return (0.0, 0.0)
        // Tuned to feel like physical Bible-study highlighters (vibrant primaries) while
        // keeping enough saturation to read as a highlight underline against light/dark prose.
        case .warmAmber:   return (0.14, 0.92) // bright yellow (default)
        case .skyBlue:     return (0.55, 0.78) // sky / cyan-blue
        case .violet:      return (0.77, 0.55) // vivid purple
        case .mintGreen:   return (0.32, 0.85) // lime green
        case .coralRose:   return (0.94, 0.62) // hot pink / magenta
        }
    }

    /// Resolve legacy `.auto` storage to the **new per-kind default** so existing rows
    /// pick up the updated highlighter palette without a migration. Mini-notes default to
    /// amber-yellow, scripture links to neutral, linked notes to violet (matches old hue).
    func resolvedFromAuto(forKind kind: StudyThread.EntryKind) -> StudyHighlightAccentToken {
        guard self == .auto else { return self }
        switch kind {
        case .miniNote, .workspace, .reference: return .warmAmber
        case .scriptureLink: return .neutral
        case .linkedNote: return .violet
        }
    }

    /// Per-token accent brightness for the **underline / swatch tint** color (`resolvedAccent…Color`).
    /// Tuned per hue so yellow stays yellow (never olive/brown) and darker hues stay legible.
    fileprivate var accentBrightness: (light: CGFloat, dark: CGFloat) {
        switch self {
        case .warmAmber:  return (0.95, 1.00) // yellow needs high brightness or it goes brown
        case .skyBlue:    return (0.86, 0.95)
        case .violet:     return (0.78, 0.92)
        case .mintGreen:  return (0.78, 0.95)
        case .coralRose:  return (0.92, 1.00)
        case .neutral:    return (0.62, 0.72)
        case .auto:       return (0.82, 0.82)
        }
    }

#if os(macOS)
    /// Pastel background fill (low-alpha) — same look as before.
    func resolvedNSColor(kind: StudyThread.EntryKind, isDark: Bool) -> NSColor {
        let resolved = self.resolvedFromAuto(forKind: kind)
        guard let hs = resolved.hueSat else {
            return HarvousColors.nsStudyHighlight(kind: kind, isDark: isDark)
        }
        return NSColor(calibratedHue: hs.hue, saturation: hs.sat, brightness: isDark ? 0.93 : 0.98, alpha: isDark ? 0.42 : 0.35)
    }

    /// Saturated foreground color for painted highlight text — gives the run a "pill" feel matching scripture chips.
    func resolvedNSForegroundColor(kind: StudyThread.EntryKind, isDark: Bool) -> NSColor {
        let resolved = self.resolvedFromAuto(forKind: kind)
        if resolved == .neutral {
            return NSColor(calibratedWhite: isDark ? 0.78 : 0.44, alpha: 1.0)
        }
        guard let hs = resolved.hueSat else {
            return HarvousColors.nsStudyHighlightForeground(kind: kind, isDark: isDark)
        }
        // Per-token accent brightness so saturated text stays in-hue (e.g. yellow doesn't darken to brown).
        let b = resolved.accentBrightness
        return NSColor(calibratedHue: hs.hue, saturation: min(hs.sat, 0.95), brightness: isDark ? b.dark : b.light, alpha: 1.0)
    }

    /// SwiftUI-side accent tint for themed chrome (dock border, theme badge) — opaque enough for subtle strokes.
    func resolvedAccentNSColor(kind: StudyThread.EntryKind, isDark: Bool) -> NSColor {
        let resolved = self.resolvedFromAuto(forKind: kind)
        if resolved == .neutral {
            return NSColor(calibratedWhite: isDark ? 0.72 : 0.62, alpha: 1.0)
        }
        guard let hs = resolved.hueSat else {
            return HarvousColors.nsStudyHighlightForeground(kind: kind, isDark: isDark)
        }
        let b = resolved.accentBrightness
        return NSColor(calibratedHue: hs.hue, saturation: hs.sat, brightness: isDark ? b.dark : b.light, alpha: 1.0)
    }
#endif

#if os(iOS)
    func resolvedUIColor(kind: StudyThread.EntryKind, isDark: Bool) -> UIColor {
        let resolved = self.resolvedFromAuto(forKind: kind)
        guard let hs = resolved.hueSat else {
            return HarvousColors.uiStudyHighlight(kind: kind, isDark: isDark)
        }
        return UIColor(hue: hs.hue, saturation: hs.sat, brightness: isDark ? 0.93 : 0.98, alpha: isDark ? 0.42 : 0.35)
    }

    func resolvedUIForegroundColor(kind: StudyThread.EntryKind, isDark: Bool) -> UIColor {
        let resolved = self.resolvedFromAuto(forKind: kind)
        if resolved == .neutral {
            return UIColor(white: isDark ? 0.78 : 0.44, alpha: 1.0)
        }
        guard let hs = resolved.hueSat else {
            return HarvousColors.uiStudyHighlightForeground(kind: kind, isDark: isDark)
        }
        let b = resolved.accentBrightness
        return UIColor(hue: hs.hue, saturation: min(hs.sat, 0.95), brightness: isDark ? b.dark : b.light, alpha: 1.0)
    }

    func resolvedAccentUIColor(kind: StudyThread.EntryKind, isDark: Bool) -> UIColor {
        let resolved = self.resolvedFromAuto(forKind: kind)
        if resolved == .neutral {
            return UIColor(white: isDark ? 0.72 : 0.62, alpha: 1.0)
        }
        guard let hs = resolved.hueSat else {
            return HarvousColors.uiStudyHighlightForeground(kind: kind, isDark: isDark)
        }
        let b = resolved.accentBrightness
        return UIColor(hue: hs.hue, saturation: hs.sat, brightness: isDark ? b.dark : b.light, alpha: 1.0)
    }
#endif
}

extension NSAttributedString.Key {
    /// Stored value: `UUID.uuidString`; marks prose segments painted from `StudyThread` anchors.
    static let harvousStudyHighlightUUID = NSAttributedString.Key("harvous.study.highlight.uuid")
}

private struct StudyHighlightKindHues {
    let hue: CGFloat
    let saturation: CGFloat

    static func forKind(_ kind: StudyThread.EntryKind) -> StudyHighlightKindHues {
        switch kind {
        case .miniNote, .reference: return .init(hue: 0.12, saturation: 0.45)
        case .linkedNote: return .init(hue: 0.75, saturation: 0.40)
        case .scriptureLink: return .init(hue: 0.55, saturation: 0.42)
        case .workspace: return .init(hue: 0.12, saturation: 0.45)
        }
    }
}

#if os(macOS)
extension HarvousColors {
    static func nsStudyHighlight(kind: StudyThread.EntryKind, isDark: Bool) -> NSColor {
        let h = StudyHighlightKindHues.forKind(kind)
        return NSColor(calibratedHue: h.hue, saturation: h.saturation, brightness: isDark ? 0.94 : 0.98, alpha: isDark ? 0.42 : 0.35)
    }

    static func nsStudyHighlightForeground(kind: StudyThread.EntryKind, isDark: Bool) -> NSColor {
        let h = StudyHighlightKindHues.forKind(kind)
        // Theme-invariant underline tint so light mode doesn't appear overly dark.
        return NSColor(calibratedHue: h.hue, saturation: min(h.saturation + 0.35, 0.95), brightness: 0.82, alpha: 1.0)
    }
}
#elseif os(iOS)
extension HarvousColors {
    static func uiStudyHighlight(kind: StudyThread.EntryKind, isDark: Bool) -> UIColor {
        let h = StudyHighlightKindHues.forKind(kind)
        return UIColor(hue: h.hue, saturation: h.saturation, brightness: isDark ? 0.94 : 0.98, alpha: isDark ? 0.42 : 0.35)
    }

    static func uiStudyHighlightForeground(kind: StudyThread.EntryKind, isDark: Bool) -> UIColor {
        let h = StudyHighlightKindHues.forKind(kind)
        return UIColor(hue: h.hue, saturation: min(h.saturation + 0.35, 0.95), brightness: 0.82, alpha: 1.0)
    }
}
#endif

// MARK: - Dimmed underline (focused dock)

#if os(macOS)
enum StudyHighlightUnderlineGrayscale {
    /// Perceived-luminance grayscale for an underline accent; keeps light yellows light and deep hues mid.
    static func fromAccentColor(_ color: NSColor) -> NSColor {
        let cg = color.cgColor
        guard let comps = cg.components, !comps.isEmpty else {
            return NSColor(calibratedWhite: 0.55, alpha: 1.0)
        }
        let r: CGFloat
        let g: CGFloat
        let b: CGFloat
        if comps.count >= 3 {
            r = comps[0]
            g = comps[1]
            b = comps[2]
        } else {
            r = comps[0]
            g = comps[0]
            b = comps[0]
        }
        let a = comps.count >= 4 ? comps[3] : CGFloat(cg.alpha)
        let lum = 0.299 * r + 0.587 * g + 0.114 * b
        return NSColor(srgbRed: lum, green: lum, blue: lum, alpha: a)
    }
}
#elseif os(iOS) || os(tvOS) || os(visionOS)
enum StudyHighlightUnderlineGrayscale {
    static func fromAccentColor(_ color: UIColor) -> UIColor {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard color.getRed(&r, green: &g, blue: &b, alpha: &a) else {
            return UIColor(white: 0.55, alpha: 1.0)
        }
        let lum = 0.299 * r + 0.587 * g + 0.114 * b
        return UIColor(red: lum, green: lum, blue: lum, alpha: a)
    }
}
#endif

// MARK: - Mapping storage ↔ expanded plain coordinates (matches `harvousExpandedPlainText`).

enum HarvousStudyHighlightMapper {
    enum MapError: Error {
        case partialAttachmentOverlap
    }

    private struct Piece {
        var storageRange: NSRange
        var expandedSnippet: String
        /// Highlights cannot partially select across this storage span unless the whole span is selected.
        var isAtomicAttachment: Bool
    }

    private static func flattenedPieces(storage: NSTextStorage) -> [Piece] {
        let ns = storage.string as NSString
        let len = storage.length
        var out: [Piece] = []
        var i = 0
        while i < len {
            var eff = NSRange()
            let attAny = storage.attribute(.attachment, at: i, effectiveRange: &eff)

            if attAny != nil {
                if let pill = attAny as? ScripturePillAttachment {
                    var piece = pill.reference
                    if !pill.translation.isEmpty { piece += " " + pill.translation }
                    out.append(Piece(storageRange: eff, expandedSnippet: piece, isAtomicAttachment: true))
                    i = NSMaxRange(eff)
                    continue
                }
                if attAny is HorizontalRuleAttachment {
                    out.append(Piece(storageRange: eff, expandedSnippet: "\n---\n", isAtomicAttachment: true))
                    i = NSMaxRange(eff)
                    continue
                }
                if let imgAtt = attAny as? NoteInlineImageAttachment {
                    if let payload = NoteInlineImageSerialization.inlineImagePayload(from: imgAtt) {
                        let snip = NoteInlineImageSerialization.inlineImageMarker(forPayload: payload)
                        out.append(Piece(storageRange: eff, expandedSnippet: snip, isAtomicAttachment: true))
                    } else {
                        out.append(Piece(storageRange: eff, expandedSnippet: NoteInlineImageSerialization.legacyPlaceholder, isAtomicAttachment: true))
                    }
                    i = NSMaxRange(eff)
                    continue
                }
                let r = ns.rangeOfComposedCharacterSequence(at: i)
                let sub = ns.substring(with: r)
                out.append(Piece(storageRange: r, expandedSnippet: sub, isAtomicAttachment: true))
                let adv = NSMaxRange(r)
                guard adv > i else { break }
                i = adv
            } else {
                let r = ns.rangeOfComposedCharacterSequence(at: i)
                let sub = ns.substring(with: r)
                out.append(Piece(storageRange: r, expandedSnippet: sub, isAtomicAttachment: false))
                let adv = NSMaxRange(r)
                guard adv > i else { break }
                i = adv
            }
        }
        return out
    }

    static func expandedRange(forStorageSelection sel: NSRange, in storage: NSTextStorage) -> Result<NSRange, MapError> {
        guard sel.location != NSNotFound, sel.length > 0, NSMaxRange(sel) <= storage.length else {
            return .failure(.partialAttachmentOverlap)
        }
        let S = sel.location
        let E = NSMaxRange(sel)

        var expCursor = 0
        var accLow: Int?
        var accHigh: Int?

        for piece in flattenedPieces(storage: storage) {
            let sr = piece.storageRange
            let r1 = NSMaxRange(sr)
            guard r1 <= storage.length else { break }
            let expLen = (piece.expandedSnippet as NSString).length
            let expPiece = NSRange(location: expCursor, length: expLen)

            let interLo = max(S, sr.location)
            let interHi = min(E, r1)
            guard interHi > interLo else {
                expCursor = NSMaxRange(expPiece)
                continue
            }

            if piece.isAtomicAttachment {
                guard interLo == sr.location && interHi == r1 else { return .failure(.partialAttachmentOverlap) }
                accLow = accLow ?? expPiece.location
                accHigh = NSMaxRange(expPiece)
            } else {
                let storSub = piece.expandedSnippet as NSString
                let rel = interLo - sr.location
                let spanLen = interHi - interLo
                guard NSMaxRange(NSRange(location: rel, length: spanLen)) <= storSub.length else {
                    return .failure(.partialAttachmentOverlap)
                }
                let mappedLo = expCursor + rel
                let mappedHi = mappedLo + spanLen
                accLow = accLow ?? mappedLo
                accHigh = mappedHi
            }

            expCursor = NSMaxRange(expPiece)
        }

        guard let lo = accLow, let hi = accHigh, hi >= lo else { return .failure(.partialAttachmentOverlap) }
        return .success(NSRange(location: lo, length: hi - lo))
    }

    static func storageRanges(forExpandedRange expRange: NSRange, in storage: NSTextStorage) -> [NSRange] {
        var expCursor = 0
        var collected: [NSRange] = []

        for piece in flattenedPieces(storage: storage) {
            let expLen = (piece.expandedSnippet as NSString).length
            let expPiece = NSRange(location: expCursor, length: expLen)
            let sr = piece.storageRange
            let r1 = NSMaxRange(sr)

            let interLoExp = max(expRange.location, expPiece.location)
            let interHiExp = min(NSMaxRange(expRange), NSMaxRange(expPiece))
            if interHiExp > interLoExp {
                if piece.isAtomicAttachment {
                    collected.append(sr)
                } else {
                    let rel = interLoExp - expPiece.location
                    let span = interHiExp - interLoExp
                    let storLo = sr.location + rel
                    collected.append(NSRange(location: storLo, length: span))
                }
            }

            expCursor = NSMaxRange(expPiece)
            _ = r1
        }

        return mergeRanges(collected.sorted(by: { $0.location < $1.location }))
    }

    private static func mergeRanges(_ sorted: [NSRange]) -> [NSRange] {
        guard sorted.count > 1 else { return sorted }
        var out: [NSRange] = []
        var cur = sorted[0]
        for next in sorted.dropFirst() {
            let cm = NSMaxRange(cur)
            if next.location <= cm {
                cur = NSRange(location: cur.location, length: max(cm, NSMaxRange(next)) - cur.location)
            } else {
                out.append(cur)
                cur = next
            }
        }
        out.append(cur)
        return out
    }

    static func selectionIntersectsUnresolvedAttachment(_ sel: NSRange, in storage: NSTextStorage) -> Bool {
        switch expandedRange(forStorageSelection: sel, in: storage) {
        case .failure: return true
        case .success: return false
        }
    }

    // MARK: - Paint / cleanup

    static func stripPainting(from storage: NSTextStorage, fullDocumentRange: NSRange) {
        storage.beginEditing()
        defer { storage.endEditing() }
        storage.enumerateAttribute(.harvousStudyHighlightUUID, in: fullDocumentRange, options: []) { value, range, _ in
            guard value != nil else { return }
            storage.removeAttribute(.harvousStudyHighlightUUID, range: range)
            storage.removeAttribute(.backgroundColor, range: range)
            storage.removeAttribute(.underlineStyle, range: range)
            storage.removeAttribute(.underlineColor, range: range)
        }
    }

    /// Paints anchored highlights as an accent-colored underline (not a pill chrome).
    /// The `.harvousStudyHighlightUUID` attribute is still stamped on the run so `mouseDown` / `handlePillTap`
    /// hit testing can resolve the thread and open the bottom sheet on click/tap.
    static func applyHighlights(
        storage: NSTextStorage,
        anchors: [(id: UUID, kind: StudyThread.EntryKind, accent: StudyHighlightAccentToken, expandedRange: NSRange)],
        isDark: Bool,
        focusedThreadId: UUID? = nil
    ) {
#if os(macOS) || os(iOS)
        let fullRange = NSRange(location: 0, length: storage.length)
        stripPainting(from: storage, fullDocumentRange: fullRange)

        storage.beginEditing()
        defer { storage.endEditing() }

        for item in anchors {
            let storRanges = storageRanges(forExpandedRange: item.expandedRange, in: storage)
            guard !storRanges.isEmpty else { continue }
#if os(macOS)
            var underlineColor = item.accent.resolvedAccentNSColor(kind: item.kind, isDark: isDark)
            if let focusedThreadId, item.id != focusedThreadId {
                underlineColor = StudyHighlightUnderlineGrayscale.fromAccentColor(underlineColor)
            }
#elseif os(iOS)
            var underlineColor = item.accent.resolvedAccentUIColor(kind: item.kind, isDark: isDark)
            if let focusedThreadId, item.id != focusedThreadId {
                underlineColor = StudyHighlightUnderlineGrayscale.fromAccentColor(underlineColor)
            }
#endif
            let tag = item.id.uuidString
            let underlineStyle = NSUnderlineStyle.thick.rawValue
            for r in storRanges {
                guard r.location != NSNotFound, NSMaxRange(r) <= storage.length else { continue }
                storage.addAttribute(.harvousStudyHighlightUUID, value: tag, range: r)
                storage.addAttribute(.underlineStyle, value: underlineStyle, range: r)
                storage.addAttribute(.underlineColor, value: underlineColor, range: r)
            }
        }
#endif
    }

    /// Returns thread UUID encoded on the attributed body at UTF-16 `location`, when inside a painted highlight.
    static func uuidAt(storageUTF16Index location: Int, in storage: NSTextStorage) -> UUID? {
        guard storage.length > 0, location >= 0, location < storage.length else { return nil }
        let tag = storage.attribute(.harvousStudyHighlightUUID, at: location, effectiveRange: nil) as? String
        return tag.flatMap(UUID.init(uuidString:))
    }

    /// Anchored highlights whose painted body spans intersect the selection (`utf16` in **`NSTextStorage`**).
    /// For a zero-length range (caret), probes the caret index and index−1 against stored highlight UUID attrs.
    /// Only returns IDs that appear in `paints` so stale attributes cannot target missing threads.
    static func threadIdsIntersectingBodySelection(
        _ utf16Selection: NSRange,
        paints: [StudyHighlightPaint],
        storage: NSTextStorage
    ) -> [UUID] {
        guard !paints.isEmpty, storage.length > 0 else { return [] }
        let paintIds = Set(paints.map(\.threadId))
        guard utf16Selection.location != NSNotFound else { return [] }

        var matched = Set<UUID>()

        if utf16Selection.length > 0 {
            guard NSMaxRange(utf16Selection) <= storage.length else { return [] }
            for paint in paints {
                let storRanges = storageRanges(forExpandedRange: paint.expandedUTF16Range, in: storage)
                for sr in storRanges where NSIntersectionRange(sr, utf16Selection).length > 0 {
                    matched.insert(paint.threadId)
                    break
                }
            }
        } else {
            let caret = utf16Selection.location
            guard caret >= 0, caret <= storage.length else { return [] }
            var cand = Set<UUID>()
            if caret < storage.length, let u = uuidAt(storageUTF16Index: caret, in: storage) {
                cand.insert(u)
            }
            if caret > 0, let u = uuidAt(storageUTF16Index: caret - 1, in: storage) {
                cand.insert(u)
            }
            for u in cand where paintIds.contains(u) {
                matched.insert(u)
            }
        }

        guard !matched.isEmpty else { return [] }
        return paints.map(\.threadId).filter { matched.contains($0) }
    }
}

struct StudyHighlightPaint: Equatable {
    let threadId: UUID
    let entryKind: StudyThread.EntryKind
    let accent: StudyHighlightAccentToken
    /// UTF-16 range in expanded plain (`harvousExpandedPlainText`).
    let expandedUTF16Range: NSRange
}

extension HarvousStudyHighlightMapper {
    /// Stable digest for skipping redundant full-document highlight strip/reapply passes.
    static func studyHighlightPaintSignature(
        paints: [StudyHighlightPaint],
        focusedThreadId: UUID?,
        isDark: Bool
    ) -> String {
        let focus = focusedThreadId?.uuidString ?? ""
        let body = paints
            .sorted {
                let lhs = $0.expandedUTF16Range.location
                let rhs = $1.expandedUTF16Range.location
                if lhs != rhs { return lhs < rhs }
                return $0.threadId.uuidString < $1.threadId.uuidString
            }
            .map { p in
                "\(p.threadId.uuidString):\(p.expandedUTF16Range.location):\(p.expandedUTF16Range.length):\(p.accent.rawValue):\(p.entryKind.rawValue)"
            }
            .joined(separator: ";")
        return "\(isDark)|\(focus)|\(body)"
    }
}