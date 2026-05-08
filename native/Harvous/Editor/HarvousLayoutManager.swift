#if os(macOS)
import AppKit
#elseif os(iOS)
import UIKit
#endif
import CoreGraphics

/// Custom `NSLayoutManager` that provides 1.6x line spacing via the layout-manager delegate
/// protocol rather than `NSParagraphStyle.lineSpacing`.
///
/// ## Why not `lineSpacing`?
///
/// `NSParagraphStyle.lineSpacing` inflates every stored line fragment rect from `natural` to
/// `natural + lineSpacing`.  That inflated height bleeds into three rendering paths:
///   - Caret height (`drawInsertionPoint` / `caretRect(for:)`)
///   - Selection fill (`fillBackgroundRectArray`)
///   - Spell-check / autocorrect indicator positioning (NSTextView uses `lineFragmentRect`)
///
/// ## The fix
///
/// `NSLayoutManagerDelegate.layoutManager(_:lineSpacingAfterGlyphAt:withProposedLineFragmentRect:)`
/// adds inter-line breathing room.  The returned value IS included in each stored line fragment
/// rect's height (the rect bottom advances by that amount before the next line's origin is set),
/// so the stored rect heights are still `natural + gap`.
///
/// To compensate:
///   - `lineFragmentRect(forGlyphAt:effectiveRange:)` is overridden to report only the natural
///     glyph height (origin unchanged, height clipped). Do **not** override `lineFragmentUsedRect`:
///     returning a clipped used rect while layout still stores `natural + gap` can desync macOS
///     TextKit / Writing Tools and cause layout churn or hangs when switching documents.
///   - `fillBackgroundRectArray` clips selection rects to natural glyph height.
///   - `drawInsertionPoint` / `caretRect(for:)` are overridden in the text-view subclasses.
///   - `drawUnderline` clips the lineFragmentRect before delegating. Study highlights use `.thick`
///     and get the intentional +2pt separation.
///
/// ## Uniform gap
///
/// The gap is computed once from the body font (16pt system) and used for ALL lines.  Without
/// this, lines containing tall attachments (scripture pills) return a larger `rect.size.height`
/// from the delegate and would receive a proportionally larger gap, causing visually unequal
/// spacing.  A fixed gap gives every line — body, pill, heading — the same inter-line breathing
/// room, matching the CSS `line-height: 1.6` rhythm.
final class HarvousLayoutManager: NSLayoutManager, NSLayoutManagerDelegate {

    /// Fixed inter-line gap derived from the 16-pt body font natural height × 0.6.
    /// Computed once so the delegate method is allocation-free.
    private static let bodyLineGap: CGFloat = {
#if os(macOS)
        let f = NSFont.systemFont(ofSize: 16)
#elseif os(iOS)
        let f = UIFont.systemFont(ofSize: 16)
#endif
        let natural = ceil(f.ascender - f.descender + f.leading)
        return max(6, ceil(natural * 0.6))
    }()

    override init() {
        super.init()
        delegate = self
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        delegate = self
    }

    // MARK: - NSLayoutManagerDelegate — fixed inter-line gap

    func layoutManager(
        _ layoutManager: NSLayoutManager,
        lineSpacingAfterGlyphAt glyphIndex: Int,
        withProposedLineFragmentRect rect: CGRect
    ) -> CGFloat {
        // Return the same fixed gap for every line so body text, scripture pills, and headings
        // all share the same inter-line breathing room (no disproportionate spacing on tall lines).
        return Self.bodyLineGap
    }

    // MARK: - Spell-check / autocorrect positioning

    /// Returns a rect clipped to the natural glyph height so NSTextView positions spell-check
    /// squiggles near the text baseline rather than at the bottom of the inflated fragment rect.
    override func lineFragmentRect(
        forGlyphAt glyphIndex: Int,
        effectiveRange effectiveGlyphRange: NSRangePointer?
    ) -> CGRect {
        var r = super.lineFragmentRect(forGlyphAt: glyphIndex, effectiveRange: effectiveGlyphRange)
        let charIdx = characterIndexForGlyph(at: glyphIndex)
        let natural = naturalGlyphHeight(atCharacter: charIdx)
        if r.size.height > natural { r.size.height = natural }
        return r
    }

    // MARK: - Selection / background fill (macOS; iOS selection is UIKit-managed)

#if os(macOS)
    override func fillBackgroundRectArray(
        _ rectArray: UnsafePointer<NSRect>,
        count rectCount: Int,
        forCharacterRange charRange: NSRange,
        color: NSColor
    ) {
        let natural = naturalGlyphHeight(atCharacter: charRange.location)
        var clipped = [CGRect](repeating: .zero, count: rectCount)
        for i in 0..<rectCount {
            var r = rectArray[i]
            if r.size.height > natural { r.size.height = natural }
            clipped[i] = r
        }
        clipped.withUnsafeBufferPointer { buf in
            super.fillBackgroundRectArray(buf.baseAddress!, count: rectCount,
                                          forCharacterRange: charRange, color: color)
        }
    }
#endif

    // MARK: - Underline drawing

    override func drawUnderline(
        forGlyphRange glyphRange: NSRange,
        underlineType underlineVal: NSUnderlineStyle,
        baselineOffset: CGFloat,
        lineFragmentRect lineRect: CGRect,
        lineFragmentGlyphRange lineGlyphRange: NSRange,
        containerOrigin: CGPoint
    ) {
        let charRange = characterRange(forGlyphRange: glyphRange, actualGlyphRange: nil)
        let natural = naturalGlyphHeight(atCharacter: charRange.location)
        var clippedRect = lineRect
        if clippedRect.size.height > natural { clippedRect.size.height = natural }

        // Study highlights use .thick; add a 2pt gap below the text for visual separation.
        if underlineVal.contains(.thick) {
#if os(macOS)
            guard let ctx = NSGraphicsContext.current?.cgContext else {
                super.drawUnderline(forGlyphRange: glyphRange, underlineType: underlineVal,
                                    baselineOffset: baselineOffset, lineFragmentRect: clippedRect,
                                    lineFragmentGlyphRange: lineGlyphRange, containerOrigin: containerOrigin)
                return
            }
            ctx.saveGState()
            ctx.translateBy(x: 0, y: 2)
            super.drawUnderline(forGlyphRange: glyphRange, underlineType: underlineVal,
                                baselineOffset: baselineOffset, lineFragmentRect: clippedRect,
                                lineFragmentGlyphRange: lineGlyphRange, containerOrigin: containerOrigin)
            ctx.restoreGState()
#elseif os(iOS)
            guard let ctx = UIGraphicsGetCurrentContext() else {
                super.drawUnderline(forGlyphRange: glyphRange, underlineType: underlineVal,
                                    baselineOffset: baselineOffset, lineFragmentRect: clippedRect,
                                    lineFragmentGlyphRange: lineGlyphRange, containerOrigin: containerOrigin)
                return
            }
            ctx.saveGState()
            ctx.translateBy(x: 0, y: 2)
            super.drawUnderline(forGlyphRange: glyphRange, underlineType: underlineVal,
                                baselineOffset: baselineOffset, lineFragmentRect: clippedRect,
                                lineFragmentGlyphRange: lineGlyphRange, containerOrigin: containerOrigin)
            ctx.restoreGState()
#endif
        } else {
            super.drawUnderline(forGlyphRange: glyphRange, underlineType: underlineVal,
                                baselineOffset: baselineOffset, lineFragmentRect: clippedRect,
                                lineFragmentGlyphRange: lineGlyphRange, containerOrigin: containerOrigin)
        }
    }

    // MARK: - Helpers

    private func naturalGlyphHeight(atCharacter loc: Int) -> CGFloat {
        guard let storage = textStorage, storage.length > 0 else { return 20 }
        let safeIdx = max(0, min(loc, storage.length - 1))
#if os(macOS)
        let f = storage.attribute(.font, at: safeIdx, effectiveRange: nil) as? NSFont
            ?? NSFont.systemFont(ofSize: 16)
#elseif os(iOS)
        let f = storage.attribute(.font, at: safeIdx, effectiveRange: nil) as? UIFont
            ?? UIFont.systemFont(ofSize: 16)
#endif
        return ceil(f.ascender - f.descender + f.leading)
    }
}
