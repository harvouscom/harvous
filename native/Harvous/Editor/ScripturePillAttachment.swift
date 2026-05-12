import Foundation
#if os(macOS)
import AppKit
import CoreImage
#elseif os(iOS)
import UIKit
import CoreImage
#endif

// Shared constants so init and renderPill agree on the same values.
private let kRefSize:  CGFloat = 15   // match body prose size
private let kTransSize: CGFloat = 11  // translation badge — slightly smaller
#if os(macOS)
private let kHPad: CGFloat = 11 // +2 vs iOS — mac proportions
#else
private let kHPad: CGFloat = 9
#endif
private let kVPad:  CGFloat = 6   // vertical inset for pill background; pairs with kHPad for even inset
private let kGap:   CGFloat = 4
/// Transparent width on each side of the raster so inline prose isn’t flush against the pill edges.
private let kLineSideMargin: CGFloat = 3

/// Keep aligned with `HarvousConnectionsCapsuleInnerShadow` in `NoteConnectionsBar.swift`.
private enum ScripturePillInnerStrokeLikeConnectionsCapsule {
    static let lineWidthPts: CGFloat = 5.5
    static let blurRadiusPts: CGFloat = 3
    static let lightStrokeAlpha: CGFloat = 0.042
    static let darkStrokeAlpha: CGFloat = 0.036
    /// Room for Gaussian spill + stroke half-width (before device scale).
    static var bleedPadPoints: CGFloat { blurRadiusPts * 3 + lineWidthPts * 0.5 + 2 }
}

#if os(macOS) || os(iOS)
private enum ScripturePillInnerShadowSharedCIContext {
    static let context = CIContext(options: [CIContextOption.useSoftwareRenderer: false])
}

private func scripturePillRasterContextScale(_ cg: CGContext) -> CGFloat {
    let sx = abs(cg.convertToDeviceSpace(CGSize(width: 1, height: 0)).width)
    let sy = abs(cg.convertToDeviceSpace(CGSize(width: 0, height: 1)).height)
    let s = max(sx, sy)
    return (s.isFinite && s > 0.05) ? s : 2
}

#if os(iOS)

private func scripturePillRasterBlurredStrokeUIImage(
    bounds: CGRect,
    pillInset: CGFloat,
    cornerRadius: CGFloat,
    isDarkMode: Bool,
    scale: CGFloat
) -> CGImage? {
    let m = ScripturePillInnerStrokeLikeConnectionsCapsule.self
    let bleed = m.bleedPadPoints
    let cw = bounds.width + bleed * 2
    let ch = bounds.height + bleed * 2
    let pixW = Int(ceil(cw * scale))
    let pixH = Int(ceil(ch * scale))
    guard pixW > 0, pixH > 0 else { return nil }

    let format = UIGraphicsImageRendererFormat.default()
    format.opaque = false
    format.scale = scale
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: cw, height: ch), format: format)
    let strokeImage = renderer.image { _ in
        guard let cg = UIGraphicsGetCurrentContext() else { return }
        cg.clear(CGRect(origin: .zero, size: CGSize(width: cw, height: ch)))
        cg.translateBy(x: bleed, y: bleed)
        let pr = bounds.insetBy(dx: pillInset, dy: pillInset)
        guard pr.width > 0, pr.height > 0 else { return }
        cg.setAllowsAntialiasing(true)
        cg.setShouldAntialias(true)
        cg.setBlendMode(.normal)
        cg.setLineCap(.round)
        cg.setLineJoin(.round)
        cg.addPath(CGPath(roundedRect: pr, cornerWidth: cornerRadius, cornerHeight: cornerRadius, transform: nil))
        UIColor(
            white: isDarkMode ? 1 : 0,
            alpha: isDarkMode ? m.darkStrokeAlpha : m.lightStrokeAlpha
        ).setStroke()
        cg.setLineWidth(m.lineWidthPts)
        cg.strokePath()
    }
    guard let ciStroke = CIImage(image: strokeImage) else { return nil }
    let blurPx = m.blurRadiusPts * scale
    let blurred = ciStroke.clampedToExtent().applyingFilter(
        "CIGaussianBlur",
        parameters: [kCIInputRadiusKey: blurPx]
    )
    let crop = CGRect(origin: .zero, size: CGSize(width: CGFloat(pixW), height: CGFloat(pixH)))
    let from = blurred.extent.intersection(crop)
    guard !from.isNull else { return nil }
    return ScripturePillInnerShadowSharedCIContext.context.createCGImage(blurred, from: from)
}

#elseif os(macOS)

private func scripturePillRasterBlurredStrokeMacOS(
    bounds: CGRect,
    pillInset: CGFloat,
    cornerRadius: CGFloat,
    isDarkMode: Bool,
    scale: CGFloat
) -> CGImage? {
    let m = ScripturePillInnerStrokeLikeConnectionsCapsule.self
    let bleed = m.bleedPadPoints
    let cw = bounds.width + bleed * 2
    let ch = bounds.height + bleed * 2
    let pixW = Int(ceil(cw * scale))
    let pixH = Int(ceil(ch * scale))
    guard pixW > 0, pixH > 0 else { return nil }

    let stride = pixW * 4
    let bitmapInfo = CGBitmapInfo.byteOrder32Big.union(
        CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)
    )
    let byteCount = stride * pixH
    let ptr = UnsafeMutableRawPointer.allocate(byteCount: byteCount, alignment: 64)
    defer { ptr.deallocate() }
    ptr.initializeMemory(as: UInt8.self, repeating: 0, count: byteCount)
    guard let cg = CGContext(
        data: ptr,
        width: pixW,
        height: pixH,
        bitsPerComponent: 8,
        bytesPerRow: stride,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: bitmapInfo.rawValue
    )
    else { return nil }

    cg.scaleBy(x: scale, y: scale)
    cg.translateBy(x: bleed, y: bleed)
    let pr = bounds.insetBy(dx: pillInset, dy: pillInset)
    guard pr.width > 0, pr.height > 0 else { return nil }

    cg.setAllowsAntialiasing(true)
    cg.setBlendMode(.normal)
    cg.setLineCap(.round)
    cg.setLineJoin(.round)
    cg.addPath(CGPath(roundedRect: pr, cornerWidth: cornerRadius, cornerHeight: cornerRadius, transform: nil))
    cg.setStrokeColor(
        gray: isDarkMode ? 1 : 0,
        alpha: isDarkMode ? m.darkStrokeAlpha : m.lightStrokeAlpha
    )
    cg.setLineWidth(m.lineWidthPts)
    cg.strokePath()

    guard let cgStroke = cg.makeImage() else { return nil }
    let ciStroke = CIImage(cgImage: cgStroke)
    let blurPx = m.blurRadiusPts * scale
    let blurred = ciStroke.clampedToExtent().applyingFilter(
        "CIGaussianBlur",
        parameters: [kCIInputRadiusKey: blurPx]
    )
    let crop = CGRect(origin: .zero, size: CGSize(width: CGFloat(pixW), height: CGFloat(pixH)))
    let from = blurred.extent.intersection(crop)
    guard !from.isNull else { return nil }
    return ScripturePillInnerShadowSharedCIContext.context.createCGImage(blurred, from: from)
}

#endif

private func scripturePillRasterBlurredStrokeForCapsuleMatch(
    bounds: CGRect,
    pillInset: CGFloat,
    cornerRadius: CGFloat,
    isDarkMode: Bool,
    scale: CGFloat
) -> CGImage? {
#if os(iOS)
    scripturePillRasterBlurredStrokeUIImage(
        bounds: bounds,
        pillInset: pillInset,
        cornerRadius: cornerRadius,
        isDarkMode: isDarkMode,
        scale: scale
    )
#elseif os(macOS)
    scripturePillRasterBlurredStrokeMacOS(
        bounds: bounds,
        pillInset: pillInset,
        cornerRadius: cornerRadius,
        isDarkMode: isDarkMode,
        scale: scale
    )
#else
    nil
#endif
}

#endif

private func scripturePillApplyCapsuleMatchedStrokeFallback(
    context: CGContext,
    path: CGPath,
    isDarkMode: Bool
) {
    let m = ScripturePillInnerStrokeLikeConnectionsCapsule.self
    context.saveGState()
    defer { context.restoreGState() }
    context.setBlendMode(isDarkMode ? .softLight : .multiply)
    context.setLineCap(.round)
    context.setLineJoin(.round)
    context.addPath(path)
    context.setStrokeColor(gray: isDarkMode ? 1 : 0, alpha: isDarkMode ? m.darkStrokeAlpha : m.lightStrokeAlpha)
    context.setLineWidth(m.lineWidthPts)
    context.strokePath()
}

private func scriptureGradientProgress(now: Date = Date()) -> CGFloat {
    let hour = Calendar.current.component(.hour, from: now)
    return CGFloat(hour) / 23
}

#if os(macOS) || os(iOS)
private func scripturePillEffectiveAppearanceIsDark() -> Bool {
    var isDark = false
    let read = {
        #if os(macOS)
        guard let match = NSApp.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) else {
            isDark = false
            return
        }
        isDark = match == .darkAqua
        #elseif os(iOS)
        isDark = UITraitCollection.current.userInterfaceStyle == .dark
        #endif
    }
    if Thread.isMainThread {
        read()
    } else {
        DispatchQueue.main.sync(execute: read)
    }
    return isDark
}
#endif

/// Inner edge matches connection capsules (`HarvousConnectionsCapsuleInnerShadow`): blurred perimeter stroke rasterized then composited multiply / softLight.
#if os(macOS)
private func scripturePillApplyInnerEdgeShadowsToContext(_ context: CGContext, bounds: CGRect) {
    scripturePillApplyInnerEdgeWash(context: context, bounds: bounds)
}
#elseif os(iOS)
private func scripturePillApplyInnerEdgeShadowsToContext(_ context: CGContext, bounds: CGRect) {
    scripturePillApplyInnerEdgeWash(context: context, bounds: bounds)
}
#else
private func scripturePillApplyInnerEdgeShadowsToContext(_ context: CGContext, bounds: CGRect) {}
#endif

private func scripturePillApplyInnerEdgeWash(context: CGContext, bounds: CGRect) {
    let strokeInset = CGFloat(0.25)
    let pr = bounds.insetBy(dx: strokeInset, dy: strokeInset)
    guard pr.width > 1, pr.height > 1 else { return }

#if os(macOS) || os(iOS)
    let isDarkMode = scripturePillEffectiveAppearanceIsDark()
#else
    let isDarkMode = false
#endif

    let path = CGPath(
        roundedRect: pr,
        cornerWidth: HarvousRadius.scripturePill,
        cornerHeight: HarvousRadius.scripturePill,
        transform: nil
    )

#if os(macOS) || os(iOS)
    let bleed = ScripturePillInnerStrokeLikeConnectionsCapsule.bleedPadPoints
    let scale = scripturePillRasterContextScale(context)
    if let cgBlur = scripturePillRasterBlurredStrokeForCapsuleMatch(
        bounds: bounds,
        pillInset: strokeInset,
        cornerRadius: HarvousRadius.scripturePill,
        isDarkMode: isDarkMode,
        scale: scale
    ) {
        context.saveGState()
        defer { context.restoreGState() }
        context.setAllowsAntialiasing(true)
        context.interpolationQuality = .medium
        context.setBlendMode(isDarkMode ? .softLight : .multiply)
        let drawRect = CGRect(
            x: bounds.minX - bleed,
            y: bounds.minY - bleed,
            width: bounds.width + bleed * 2,
            height: bounds.height + bleed * 2
        )
        context.draw(cgBlur, in: drawRect)
    } else {
        scripturePillApplyCapsuleMatchedStrokeFallback(context: context, path: path, isDarkMode: isDarkMode)
    }
#else
    scripturePillApplyCapsuleMatchedStrokeFallback(context: context, path: path, isDarkMode: isDarkMode)
#endif
}

#if os(macOS)

/// Resolve the concrete draw-time accent for a scripture pill. Per-pill accent wins; falls back to the
/// neutral default (space theme deliberately ignored so pills don't auto-tint per the product decision).
private func resolvedPillAccent(accent: StudyHighlightAccentToken?) -> NSColor {
    guard let accent, accent != .auto else {
        return HarvousColors.nsScripturePillNeutralAccent
    }
    return accent.resolvedAccentNSColor(kind: .scriptureLink, isDark: false)
}

/// Neutral pills should read like normal prose: use content text color for labels.
private func resolvedPillLabelColor(accent: StudyHighlightAccentToken?, pointerHovered: Bool) -> NSColor {
    _ = accent
    if pointerHovered {
        return NSColor.labelColor.withAlphaComponent(HarvousScripturePillStyle.labelOpacityPointerHover)
    }
    return NSColor.labelColor.withAlphaComponent(HarvousScripturePillStyle.labelOpacity)
}

/// NSTextAttachment that renders a scripture reference as an inline rounded-rect pill.
final class ScripturePillAttachment: NSTextAttachment {
    let reference: String
    var translation: String
    /// Preserved for backwards compatibility with existing call sites. Not used at render time.
    var theme: HarvousColors.ThemeVariant
    /// Per-pill accent (persisted on the owning Note). `nil` → neutral default.
    var accent: StudyHighlightAccentToken?
    /// macOS: true while the pointing device is over this pill in the body editor (full-opacity label).
    private(set) var isPointerHovered: Bool = false

    init(reference: String,
         translation: String = ScriptureReference.defaultTranslation,
         theme: HarvousColors.ThemeVariant = .blue,
         accent: StudyHighlightAccentToken? = nil) {
        self.reference = reference
        self.translation = translation
        self.theme = theme
        self.accent = accent
        super.init(data: nil, ofType: nil)

        let img = Self.renderPill(reference: reference, translation: translation, accent: accent, pointerHovered: false)
        self.image = img

        // Baseline formula (NSImage flipped:false): draw(at:) places bottom-left of the bbox at y,
        // so attachment.bounds.origin.y = refFont.descender - kVPad to center the pill on the baseline.
        let refFont = HarvousFonts.system(size: kRefSize, weight: 500)
        self.bounds = CGRect(
            origin: CGPoint(x: 0, y: refFont.descender - kVPad),
            size: img.size
        )
    }

    /// Updates raster label emphasis when the pointer enters/leaves this attachment (macOS body editor).
    func setPointerHovered(_ hovered: Bool) {
        guard hovered != isPointerHovered else { return }
        isPointerHovered = hovered
        let img = Self.renderPill(
            reference: reference,
            translation: translation,
            accent: accent,
            pointerHovered: hovered
        )
        self.image = img
        let refFont = HarvousFonts.system(size: kRefSize, weight: 500)
        self.bounds = CGRect(
            origin: CGPoint(x: 0, y: refFont.descender - kVPad),
            size: img.size
        )
    }

    /// Re-rasterizes the pill image so label color and inner-edge wash track the current
    /// `NSApp.effectiveAppearance`. Call from the host text view's
    /// `viewDidChangeEffectiveAppearance` so light/dark toggles repaint baked-in label colors
    /// (`NSColor.labelColor` resolves to a concrete color when drawn into an `NSImage`).
    func refreshRasterForCurrentAppearance() {
        let img = Self.renderPill(
            reference: reference,
            translation: translation,
            accent: accent,
            pointerHovered: isPointerHovered
        )
        self.image = img
        let refFont = HarvousFonts.system(size: kRefSize, weight: 500)
        self.bounds = CGRect(
            origin: CGPoint(x: 0, y: refFont.descender - kVPad),
            size: img.size
        )
    }

    required init?(coder: NSCoder) { fatalError() }

    static func renderPill(
        reference: String,
        translation: String,
        accent: StudyHighlightAccentToken?,
        pointerHovered: Bool = false
    ) -> NSImage {
        let refFont   = HarvousFonts.system(size: kRefSize, weight: 500)
        let transFont = HarvousFonts.system(size: kTransSize, weight: 400)
        let displayTranslation = ScriptureReference.displayTranslationLabel(translation)
        let tint = resolvedPillAccent(accent: accent)
        let label = resolvedPillLabelColor(accent: accent, pointerHovered: pointerHovered)

        let refAttrs: [NSAttributedString.Key: Any]   = [.font: refFont,
                                                          .foregroundColor: label]
        let transAttrs: [NSAttributedString.Key: Any] = [.font: transFont,
                                                          .foregroundColor: label]
        let refStr   = NSAttributedString(string: reference,   attributes: refAttrs)
        let transStr = NSAttributedString(string: displayTranslation, attributes: transAttrs)
        let refSize   = refStr.size()
        let transSize = transStr.size()

        let innerW = kHPad + refSize.width + kGap + transSize.width + kHPad
        let w = kLineSideMargin + innerW + kLineSideMargin
        let h = max(refSize.height, transSize.height) + kVPad * 2
        let size = NSSize(width: ceil(w), height: ceil(h))

        return NSImage(size: size, flipped: false) { bounds in
            let pillLayout = CGRect(x: kLineSideMargin, y: 0, width: innerW, height: bounds.height)
            let pill = NSBezierPath(roundedRect: pillLayout.insetBy(dx: 0.25, dy: 0.25),
                                    xRadius: HarvousRadius.scripturePill, yRadius: HarvousRadius.scripturePill)
            tint.withAlphaComponent(0.075).setFill()
            pill.fill()
            pill.addClip()
            let progress = scriptureGradientProgress()
            let xPosition = 0.35 + (0.30 * progress)
            let gx = pillLayout.minX + pillLayout.width * xPosition
            let startPoint = CGPoint(x: gx, y: bounds.minY)
            let endPoint   = CGPoint(x: gx, y: bounds.maxY)
            let gradient = NSGradient(
                colors: [
                    tint.withAlphaComponent(0.10),
                    tint.withAlphaComponent(0.065)
                ]
            )
            gradient?.draw(from: startPoint, to: endPoint, options: [])
            if let cgContext = NSGraphicsContext.current?.cgContext {
                scripturePillApplyInnerEdgeShadowsToContext(cgContext, bounds: pillLayout)
            }
            tint.withAlphaComponent(0.20).setStroke(); pill.lineWidth = 0.5; pill.stroke()

            let refY   = (size.height - refSize.height)   / 2
            let transY = (size.height - transSize.height) / 2
            let textX = kLineSideMargin + kHPad
            refStr.draw(at:   NSPoint(x: textX,                       y: refY))
            transStr.draw(at: NSPoint(x: textX + refSize.width + kGap, y: transY))
            return true
        }
    }
}

#else

private func resolvedPillAccent(accent: StudyHighlightAccentToken?) -> UIColor {
    guard let accent, accent != .auto else {
        return HarvousColors.uiScripturePillNeutralAccent
    }
    return accent.resolvedAccentUIColor(kind: .scriptureLink, isDark: false)
}

private func resolvedPillLabelColor(accent: StudyHighlightAccentToken?, pointerHovered: Bool = false) -> UIColor {
    _ = accent
    _ = pointerHovered
    return UIColor.label.withAlphaComponent(HarvousScripturePillStyle.labelOpacity)
}

/// NSTextAttachment that renders a scripture reference as an inline rounded-rect pill on iOS.
final class ScripturePillAttachment: NSTextAttachment {
    let reference: String
    var translation: String
    var theme: HarvousColors.ThemeVariant
    var accent: StudyHighlightAccentToken?

    init(reference: String,
         translation: String = ScriptureReference.defaultTranslation,
         theme: HarvousColors.ThemeVariant = .blue,
         accent: StudyHighlightAccentToken? = nil) {
        self.reference = reference
        self.translation = translation
        self.theme = theme
        self.accent = accent
        super.init(data: nil, ofType: nil)

        let img = Self.renderPill(reference: reference, translation: translation, accent: accent, pointerHovered: false)
        self.image = img

        let refFont = HarvousFonts.system(size: kRefSize, weight: 500)
        self.bounds = CGRect(
            origin: CGPoint(x: 0, y: CGFloat(refFont.descender) - kVPad),
            size: img.size
        )
    }

    /// Re-rasterizes the pill image so label color and inner-edge wash track the current
    /// `UITraitCollection.userInterfaceStyle`. `UIGraphicsImageRenderer` rasterizes eagerly
    /// against the active trait collection, so light/dark toggles must rebuild this `UIImage`
    /// or the pill text stays baked in the previous mode.
    func refreshRasterForCurrentAppearance() {
        let img = Self.renderPill(
            reference: reference,
            translation: translation,
            accent: accent,
            pointerHovered: false
        )
        self.image = img
        let refFont = HarvousFonts.system(size: kRefSize, weight: 500)
        self.bounds = CGRect(
            origin: CGPoint(x: 0, y: CGFloat(refFont.descender) - kVPad),
            size: img.size
        )
    }

    required init?(coder: NSCoder) { fatalError() }

    static func renderPill(
        reference: String,
        translation: String,
        accent: StudyHighlightAccentToken?,
        pointerHovered: Bool = false
    ) -> UIImage {
        let refFont   = HarvousFonts.system(size: kRefSize, weight: 500)
        let transFont = HarvousFonts.system(size: kTransSize, weight: 400)
        let displayTranslation = ScriptureReference.displayTranslationLabel(translation)
        let tint = resolvedPillAccent(accent: accent)
        let label = resolvedPillLabelColor(accent: accent, pointerHovered: pointerHovered)

        let refAttrs: [NSAttributedString.Key: Any]   = [.font: refFont,
                                                          .foregroundColor: label]
        let transAttrs: [NSAttributedString.Key: Any] = [.font: transFont,
                                                          .foregroundColor: label]
        let refStr   = NSAttributedString(string: reference,   attributes: refAttrs)
        let transStr = NSAttributedString(string: displayTranslation, attributes: transAttrs)
        let refSize   = refStr.size()
        let transSize = transStr.size()

        let innerW = kHPad + refSize.width + kGap + transSize.width + kHPad
        let w = kLineSideMargin + innerW + kLineSideMargin
        let h = max(refSize.height, transSize.height) + kVPad * 2
        let size = CGSize(width: ceil(w), height: ceil(h))

        return UIGraphicsImageRenderer(size: size).image { _ in
            let fullBounds = CGRect(origin: .zero, size: size)
            let pillLayout = CGRect(x: kLineSideMargin, y: 0, width: innerW, height: size.height)
            let pill = UIBezierPath(roundedRect: pillLayout.insetBy(dx: 0.25, dy: 0.25),
                                    cornerRadius: HarvousRadius.scripturePill)
            tint.withAlphaComponent(0.075).setFill()
            pill.fill()
            pill.addClip()
            let progress = scriptureGradientProgress()
            let xPosition = 0.35 + (0.30 * progress)
            let gx = pillLayout.minX + pillLayout.width * xPosition
            let startPoint = CGPoint(x: gx, y: fullBounds.minY)
            let endPoint   = CGPoint(x: gx, y: fullBounds.maxY)
            if let context = UIGraphicsGetCurrentContext(),
               let gradient = CGGradient(
                   colorsSpace: CGColorSpaceCreateDeviceRGB(),
                   colors: [
                       tint.withAlphaComponent(0.10).cgColor,
                       tint.withAlphaComponent(0.065).cgColor
                   ] as CFArray,
                   locations: [0.0, 1.0]
               ) {
                context.drawLinearGradient(gradient, start: startPoint, end: endPoint, options: [])
            } else {
                tint.withAlphaComponent(0.075).setFill()
                pill.fill()
            }

            if let cg = UIGraphicsGetCurrentContext() {
                scripturePillApplyInnerEdgeShadowsToContext(cg, bounds: pillLayout)
            }
            tint.withAlphaComponent(0.20).setStroke(); pill.lineWidth = 0.5; pill.stroke()

            let refY   = (size.height - refSize.height)   / 2
            let transY = (size.height - transSize.height) / 2
            let textX = kLineSideMargin + kHPad
            refStr.draw(at:   CGPoint(x: textX,                       y: refY))
            transStr.draw(at: CGPoint(x: textX + refSize.width + kGap, y: transY))
        }
    }
}
#endif
