import Foundation

#if os(macOS)
import AppKit
#elseif os(iOS)
import UIKit
#endif

/// Shared detection for “non-plain” body attributes (toolbar formatting, links, code blocks, etc.).
/// Study highlight paint (pastel background + `.harvousStudyHighlightUUID`) intentionally reads as body prose.
enum HarvousBodyRichTextDiagnostics {

    /// Mirrors `HarvousEditor.Coordinator.isRichAttributeDictionary` — keep in sync when adding body formatting kinds.
    static func attributesContainClearableFormatting(_ attributes: [NSAttributedString.Key: Any], emptyStorage: Bool) -> Bool {
        if attributes[.link] != nil { return true }
        if (attributes[.strikethroughStyle] as? Int ?? 0) != 0 { return true }
        if attributes[.backgroundColor] != nil && attributes[.harvousStudyHighlightUUID] == nil {
            return true
        }
        if let p = attributes[.paragraphStyle] as? NSParagraphStyle {
            if p.firstLineHeadIndent > 0.5 || p.headIndent > 0.5 { return true }
        }

        let font = (attributes[.font] as? HVFont) ?? HarvousFonts.system(size: 16, weight: 400)
#if os(macOS)
        let manager = NSFontManager.shared
        if HarvousFonts.bodyHeadingLevel(matching: font) != nil { return true }
        if manager.traits(of: font).contains(.boldFontMask) { return true }
        if manager.traits(of: font).contains(.italicFontMask) { return true }
        if font.pointSize >= 19 { return true }
#else
        if HarvousFonts.bodyHeadingLevel(matching: font) != nil { return true }
        let traits = font.fontDescriptor.symbolicTraits
        if traits.contains(.traitBold) { return true }
        if traits.contains(.traitItalic) { return true }
        if font.pointSize >= 19 { return true }
#endif
        if emptyStorage { return false }
        let diff16 = abs(font.pointSize - 16.0)
        let diff15 = abs(font.pointSize - 15.0)
        if diff16 > 0.4 && diff15 > 0.4 { return true }
        return false
    }

    /// True when any non-attachment character in `utf16Range` carries clearable formatting.
    static func selectionIntersectsClearableFormatting(storage: NSTextStorage, utf16Range: NSRange) -> Bool {
        guard utf16Range.length > 0,
              utf16Range.location != NSNotFound,
              NSMaxRange(utf16Range) <= storage.length
        else { return false }

        var idx = utf16Range.location
        let rangeEnd = NSMaxRange(utf16Range)
        while idx < rangeEnd {
            var eff = NSRange()
            if storage.attribute(.attachment, at: idx, effectiveRange: &eff) != nil {
                let next = NSMaxRange(eff)
                if next <= idx { break }
                idx = next
                continue
            }
            storage.attributes(at: idx, effectiveRange: &eff)
            let inter = NSIntersectionRange(eff, utf16Range)
            if inter.length > 0,
               attributesContainClearableFormatting(storage.attributes(at: inter.location, effectiveRange: nil), emptyStorage: false) {
                return true
            }
            let next = NSMaxRange(eff)
            if next <= idx { break }
            idx = next
        }
        return false
    }
}

#if os(macOS)
private typealias HVFont = NSFont
#else
private typealias HVFont = UIFont
#endif
