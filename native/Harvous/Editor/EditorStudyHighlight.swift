import Foundation

#if os(macOS)
import AppKit
#elseif os(iOS) || os(tvOS) || os(visionOS)
import UIKit
#endif

/// Per-highlight pastel override; persisted on `StudyThread.highlightAccentRaw`. `.auto` uses entry-kind hues.
enum StudyHighlightAccentToken: String, CaseIterable {
    case auto
    case warmAmber
    case skyBlue
    case violet
    case mintGreen
    case coralRose

    static var pickerChoices: [StudyHighlightAccentToken] {
        [.warmAmber, .skyBlue, .violet, .mintGreen, .coralRose]
    }

    static func decoding(_ raw: String) -> StudyHighlightAccentToken {
        StudyHighlightAccentToken(rawValue: raw) ?? .auto
    }

    nonisolated var label: String {
        switch self {
        case .auto: return "Default"
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
        case .warmAmber: return "circle.fill"
        case .skyBlue: return "circle.fill"
        case .violet: return "circle.fill"
        case .mintGreen: return "circle.fill"
        case .coralRose: return "circle.fill"
        }
    }

#if os(macOS)
    func resolvedNSColor(kind: StudyThread.EntryKind, isDark: Bool) -> NSColor {
        switch self {
        case .auto:
            HarvousColors.nsStudyHighlight(kind: kind, isDark: isDark)
        case .warmAmber:
            NSColor(calibratedHue: 0.09, saturation: 0.48, brightness: isDark ? 0.93 : 0.98, alpha: isDark ? 0.42 : 0.35)
        case .skyBlue:
            NSColor(calibratedHue: 0.54, saturation: 0.44, brightness: isDark ? 0.93 : 0.98, alpha: isDark ? 0.42 : 0.35)
        case .violet:
            NSColor(calibratedHue: 0.75, saturation: 0.42, brightness: isDark ? 0.93 : 0.98, alpha: isDark ? 0.42 : 0.35)
        case .mintGreen:
            NSColor(calibratedHue: 0.32, saturation: 0.40, brightness: isDark ? 0.93 : 0.98, alpha: isDark ? 0.42 : 0.35)
        case .coralRose:
            NSColor(calibratedHue: 0.97, saturation: 0.38, brightness: isDark ? 0.93 : 0.98, alpha: isDark ? 0.42 : 0.35)
        }
    }
#endif

#if os(iOS)
    func resolvedUIColor(kind: StudyThread.EntryKind, isDark: Bool) -> UIColor {
        switch self {
        case .auto:
            HarvousColors.uiStudyHighlight(kind: kind, isDark: isDark)
        case .warmAmber:
            UIColor(hue: 0.09, saturation: 0.48, brightness: isDark ? 0.93 : 0.98, alpha: isDark ? 0.42 : 0.35)
        case .skyBlue:
            UIColor(hue: 0.54, saturation: 0.44, brightness: isDark ? 0.93 : 0.98, alpha: isDark ? 0.42 : 0.35)
        case .violet:
            UIColor(hue: 0.75, saturation: 0.42, brightness: isDark ? 0.93 : 0.98, alpha: isDark ? 0.42 : 0.35)
        case .mintGreen:
            UIColor(hue: 0.32, saturation: 0.40, brightness: isDark ? 0.93 : 0.98, alpha: isDark ? 0.42 : 0.35)
        case .coralRose:
            UIColor(hue: 0.97, saturation: 0.38, brightness: isDark ? 0.93 : 0.98, alpha: isDark ? 0.42 : 0.35)
        }
    }
#endif
}

extension NSAttributedString.Key {
    /// Stored value: `UUID.uuidString`; marks prose segments painted from `StudyThread` anchors.
    static let harvousStudyHighlightUUID = NSAttributedString.Key("harvous.study.highlight.uuid")
}

#if os(macOS)
extension HarvousColors {
    static func nsStudyHighlight(kind: StudyThread.EntryKind, isDark: Bool) -> NSColor {
        let hue: CGFloat
        let saturation: CGFloat
        let brightness: CGFloat
        switch kind {
        case .miniNote: hue = 0.12; saturation = 0.45; brightness = isDark ? 0.94 : 0.98
        case .linkedNote: hue = 0.75; saturation = 0.40; brightness = isDark ? 0.93 : 0.98
        case .scriptureLink: hue = 0.55; saturation = 0.42; brightness = isDark ? 0.91 : 0.96
        case .workspace: hue = 0.12; saturation = 0.45; brightness = isDark ? 0.94 : 0.98
        }
        return NSColor(calibratedHue: hue, saturation: saturation, brightness: brightness, alpha: isDark ? 0.42 : 0.35)
    }
}
#elseif os(iOS)
extension HarvousColors {
    static func uiStudyHighlight(kind: StudyThread.EntryKind, isDark: Bool) -> UIColor {
        let hue: CGFloat
        let saturation: CGFloat
        let brightness: CGFloat
        switch kind {
        case .miniNote: hue = 0.12; saturation = 0.45; brightness = isDark ? 0.94 : 0.98
        case .linkedNote: hue = 0.75; saturation = 0.40; brightness = isDark ? 0.93 : 0.98
        case .scriptureLink: hue = 0.55; saturation = 0.42; brightness = isDark ? 0.91 : 0.96
        case .workspace: hue = 0.12; saturation = 0.45; brightness = isDark ? 0.94 : 0.98
        }
        return UIColor(hue: hue, saturation: saturation, brightness: brightness, alpha: isDark ? 0.42 : 0.35)
    }
}
#endif

// MARK: - Mapping storage ↔ expanded plain coordinates (matches `harvousExpandedPlainText`).

enum HarvousStudyHighlightMapper {
    enum MapError: Error {
        case partialAttachmentOverlap
    }

#if os(macOS)
    private static func pngDataInline(_ attachment: NoteInlineImageAttachment) -> Data? {
        guard let img = attachment.image else { return nil }
        guard let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) else { return nil }
        return rep.representation(using: .png, properties: [:])
    }
#endif

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
#if os(macOS)
                if attAny is HorizontalRuleAttachment {
                    out.append(Piece(storageRange: eff, expandedSnippet: "\n---\n", isAtomicAttachment: true))
                    i = NSMaxRange(eff)
                    continue
                }
                if let imgAtt = attAny as? NoteInlineImageAttachment {
                    if let png = pngDataInline(imgAtt) {
                        let snip = "\n[Image:\(png.base64EncodedString())]\n"
                        out.append(Piece(storageRange: eff, expandedSnippet: snip, isAtomicAttachment: true))
                    } else {
                        out.append(Piece(storageRange: eff, expandedSnippet: "\n[Image]\n", isAtomicAttachment: true))
                    }
                    i = NSMaxRange(eff)
                    continue
                }
#else
#endif
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
        }
    }

    static func applyHighlights(
        storage: NSTextStorage,
        anchors: [(id: UUID, kind: StudyThread.EntryKind, accent: StudyHighlightAccentToken, expandedRange: NSRange)],
        isDark: Bool
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
            let bgAny = item.accent.resolvedNSColor(kind: item.kind, isDark: isDark)
#elseif os(iOS)
            let bgAny = item.accent.resolvedUIColor(kind: item.kind, isDark: isDark)
#endif
            let tag = item.id.uuidString
            for r in storRanges {
                guard r.location != NSNotFound, NSMaxRange(r) <= storage.length else { continue }
                storage.addAttribute(.harvousStudyHighlightUUID, value: tag, range: r)
                storage.addAttribute(.backgroundColor, value: bgAny, range: r)
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
}

struct StudyHighlightPaint: Equatable {
    let threadId: UUID
    let entryKind: StudyThread.EntryKind
    let accent: StudyHighlightAccentToken
    /// UTF-16 range in expanded plain (`harvousExpandedPlainText`).
    let expandedUTF16Range: NSRange
}