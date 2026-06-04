import Foundation
#if os(macOS)
import AppKit
#elseif os(iOS)
import UIKit
#endif

// MARK: - URL pill metrics
// Tuned to match the scripture pill family in inline prose. Slightly tighter horizontal padding
// than scripture pills because the URL pill has a single label (no translation badge).

private let kUrlRefSize: CGFloat = 15  // matches body prose size
private let kUrlGlyphSize: CGFloat = 11
#if os(macOS)
private let kUrlHPad: CGFloat = 11
#else
private let kUrlHPad: CGFloat = 9
#endif
private let kUrlVPad: CGFloat = 4
private let kUrlGap:  CGFloat = 4
private let kUrlLineSideMargin: CGFloat = 3

/// Font Awesome `arrow-up-right-from-square` — matches web URL link pill trailing glyph.
private let kUrlExternalLinkGlyphAsset = "Harvous.ArrowUpRightFromSquare"

#if os(macOS)

private func urlLinkFATemplateNSImage(named name: String, edgePt: CGFloat) -> NSImage? {
    guard let src = NSImage(named: name) else { return nil }
    let dstSize = NSSize(width: edgePt, height: edgePt)
    let dst = NSImage(size: dstSize, flipped: false) { _ in
        if let ctx = NSGraphicsContext.current?.cgContext {
            ctx.interpolationQuality = .high
        }
        let srcSize = src.size
        let aspect = srcSize.width / max(srcSize.height, 0.0001)
        let fitRect: NSRect
        if aspect >= 1 {
            let h = dstSize.width / aspect
            fitRect = NSRect(x: 0, y: (dstSize.height - h) / 2, width: dstSize.width, height: h)
        } else {
            let w = dstSize.height * aspect
            fitRect = NSRect(x: (dstSize.width - w) / 2, y: 0, width: w, height: dstSize.height)
        }
        src.draw(
            in: fitRect,
            from: NSRect(origin: .zero, size: srcSize),
            operation: .sourceOver,
            fraction: 1,
            respectFlipped: true,
            hints: [.interpolation: NSImageInterpolation.high]
        )
        return true
    }
    dst.isTemplate = true
    return dst
}

private func drawUrlLinkExternalGlyph(at origin: NSPoint, color: NSColor) {
    guard let template = urlLinkFATemplateNSImage(named: kUrlExternalLinkGlyphAsset, edgePt: kUrlGlyphSize) else { return }
    let rect = NSRect(x: origin.x, y: origin.y, width: kUrlGlyphSize, height: kUrlGlyphSize)
    let tinted = NSImage(size: rect.size, flipped: false) { bounds in
        color.set()
        bounds.fill()
        template.draw(
            in: bounds,
            from: NSRect(origin: .zero, size: template.size),
            operation: .destinationIn,
            fraction: 1,
            respectFlipped: true,
            hints: [.interpolation: NSImageInterpolation.high]
        )
        return true
    }
    tinted.draw(
        in: rect,
        from: NSRect(origin: .zero, size: tinted.size),
        operation: .sourceOver,
        fraction: 1,
        respectFlipped: true,
        hints: [.interpolation: NSImageInterpolation.high]
    )
}

#else

private func urlLinkFATemplateUIImage(named name: String, edgePt: CGFloat) -> UIImage? {
    guard let src = UIImage(named: name) else { return nil }
    let dstSize = CGSize(width: edgePt, height: edgePt)
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = UIScreen.main.scale
    format.opaque = false
    let renderer = UIGraphicsImageRenderer(size: dstSize, format: format)
    let img = renderer.image { _ in
        let srcSize = src.size
        let aspect = srcSize.width / max(srcSize.height, 0.0001)
        let fitRect: CGRect
        if aspect >= 1 {
            let h = dstSize.width / aspect
            fitRect = CGRect(x: 0, y: (dstSize.height - h) / 2, width: dstSize.width, height: h)
        } else {
            let w = dstSize.height * aspect
            fitRect = CGRect(x: (dstSize.width - w) / 2, y: 0, width: w, height: dstSize.height)
        }
        src.draw(in: fitRect, blendMode: .normal, alpha: 1)
    }.withRenderingMode(.alwaysTemplate)
    return img
}

private func drawUrlLinkExternalGlyph(at origin: CGPoint, color: UIColor) {
    guard let template = urlLinkFATemplateUIImage(named: kUrlExternalLinkGlyphAsset, edgePt: kUrlGlyphSize) else { return }
    let rect = CGRect(x: origin.x, y: origin.y, width: kUrlGlyphSize, height: kUrlGlyphSize)
    template.withTintColor(color, renderingMode: .alwaysOriginal).draw(in: rect)
}

#endif

/// Strips `http(s)://` and a trailing `/` so the pill reads `kemdesign.co/post` rather than
/// `https://kemdesign.co/post/`. Mirrors the web `LinkPreviewCard` `displayUrl` derivation.
func urlLinkPillDisplayHost(_ href: String) -> String {
    var out = href
    if let r = out.range(of: "^https?://", options: [.regularExpression, .caseInsensitive]) {
        out.removeSubrange(r)
    }
    if out.hasSuffix("/") { out.removeLast() }
    return out
}

#if os(macOS)

/// NSTextAttachment that renders a URL link as an inline rounded-rect pill, visually paired with
/// `ScripturePillAttachment` but neutral-tinted and topped with a trailing external-link glyph.
final class URLLinkPillAttachment: NSTextAttachment {
    let href: String
    var title: String?
    /// User-specified visible label (Add Link sheet). When non-empty, replaces `displayHost` as the
    /// pill's rendered text. `nil` / empty means auto-detected URL — pill shows host as before.
    var label: String?
    /// Cached host string used for rendering. Recomputed on init from `href`.
    private(set) var displayHost: String

    /// What the pill image actually draws — label when supplied, host otherwise.
    var effectiveDisplay: String { (label?.isEmpty == false ? label : nil) ?? displayHost }

    init(href: String, title: String? = nil, label: String? = nil) {
        self.href = href
        self.title = title
        self.label = label
        self.displayHost = urlLinkPillDisplayHost(href)
        super.init(data: nil, ofType: nil)

        let img = Self.renderPill(displayHost: self.effectiveDisplay)
        self.image = img

        let refFont = HarvousFonts.system(size: kUrlRefSize, weight: 500)
        self.bounds = CGRect(
            origin: CGPoint(x: 0, y: refFont.descender - kUrlVPad),
            size: img.size
        )
    }

    required init?(coder: NSCoder) { fatalError() }

    /// Re-rasterizes for light/dark transitions — call from the host text view's
    /// `viewDidChangeEffectiveAppearance`, same as `ScripturePillAttachment`. Wraps in
    /// `performAsCurrent` so `NSColor.labelColor` resolves under the new appearance (the callback
    /// runs before `NSAppearance.current` updates).
    @MainActor func refreshRasterForCurrentAppearance() {
        NSApp.effectiveAppearance.performAsCurrentDrawingAppearance {
            let img = Self.renderPill(displayHost: self.effectiveDisplay)
            self.image = img
            let refFont = HarvousFonts.system(size: kUrlRefSize, weight: 500)
            self.bounds = CGRect(
                origin: CGPoint(x: 0, y: refFont.descender - kUrlVPad),
                size: img.size
            )
        }
    }

    /// Mutates label and re-rasterizes. Caller is responsible for any storage `edited` notification
    /// to trigger layout — the cached attachment image changed but storage characters did not.
    @MainActor func setLabelAndRefresh(_ newLabel: String?) {
        label = (newLabel?.isEmpty == true) ? nil : newLabel
        refreshRasterForCurrentAppearance()
    }

    static func renderPill(displayHost: String) -> NSImage {
        let refFont = HarvousFonts.system(size: kUrlRefSize, weight: 500)
        let label = NSColor.labelColor.withAlphaComponent(HarvousScripturePillStyle.labelOpacity)
        let tint = HarvousColors.nsScripturePillNeutralAccent

        let refAttrs: [NSAttributedString.Key: Any] = [.font: refFont, .foregroundColor: label]
        let refStr = NSAttributedString(string: displayHost, attributes: refAttrs)
        let refSize = refStr.size()

        let innerW = kUrlHPad + refSize.width + kUrlGap + kUrlGlyphSize + kUrlHPad
        let w = kUrlLineSideMargin + innerW + kUrlLineSideMargin
        let h = max(refSize.height, kUrlGlyphSize) + kUrlVPad * 2
        let size = NSSize(width: ceil(w), height: ceil(h))

        return NSImage(size: size, flipped: false) { bounds in
            let pillLayout = CGRect(x: kUrlLineSideMargin, y: 0, width: innerW, height: bounds.height)
            let pill = NSBezierPath(
                roundedRect: pillLayout.insetBy(dx: 0.25, dy: 0.25),
                xRadius: HarvousRadius.scripturePill,
                yRadius: HarvousRadius.scripturePill
            )
            tint.withAlphaComponent(0.075).setFill()
            pill.fill()
            tint.withAlphaComponent(0.20).setStroke()
            pill.lineWidth = 0.5
            pill.stroke()

            let refY = (size.height - refSize.height) / 2
            let glyphY = (size.height - kUrlGlyphSize) / 2
            let textX = kUrlLineSideMargin + kUrlHPad
            refStr.draw(at: NSPoint(x: textX, y: refY))
            drawUrlLinkExternalGlyph(at: NSPoint(x: textX + refSize.width + kUrlGap, y: glyphY), color: label)
            return true
        }
    }
}

#else

/// iOS variant of `URLLinkPillAttachment`. Rendering layout matches macOS; uses
/// `UIGraphicsImageRenderer` instead of `NSImage(size:flipped:)`.
final class URLLinkPillAttachment: NSTextAttachment {
    let href: String
    var title: String?
    /// User-specified visible label (Add Link sheet). When non-empty, replaces `displayHost` as the
    /// pill's rendered text. `nil` / empty means auto-detected URL — pill shows host as before.
    var label: String?
    private(set) var displayHost: String

    /// What the pill image actually draws — label when supplied, host otherwise.
    var effectiveDisplay: String { (label?.isEmpty == false ? label : nil) ?? displayHost }

    init(href: String, title: String? = nil, label: String? = nil) {
        self.href = href
        self.title = title
        self.label = label
        self.displayHost = urlLinkPillDisplayHost(href)
        super.init(data: nil, ofType: nil)

        let img = Self.renderPill(displayHost: self.effectiveDisplay)
        self.image = img

        let refFont = HarvousFonts.system(size: kUrlRefSize, weight: 500)
        self.bounds = CGRect(
            origin: CGPoint(x: 0, y: CGFloat(refFont.descender) - kUrlVPad),
            size: img.size
        )
    }

    required init?(coder: NSCoder) { fatalError() }

    func refreshRasterForCurrentAppearance() {
        let img = Self.renderPill(displayHost: effectiveDisplay)
        self.image = img
        let refFont = HarvousFonts.system(size: kUrlRefSize, weight: 500)
        self.bounds = CGRect(
            origin: CGPoint(x: 0, y: CGFloat(refFont.descender) - kUrlVPad),
            size: img.size
        )
    }

    /// Mutates label and re-rasterizes. Caller is responsible for any storage `edited` notification
    /// to trigger layout — the cached attachment image changed but storage characters did not.
    @MainActor func setLabelAndRefresh(_ newLabel: String?) {
        label = (newLabel?.isEmpty == true) ? nil : newLabel
        refreshRasterForCurrentAppearance()
    }

    static func renderPill(displayHost: String) -> UIImage {
        let refFont = HarvousFonts.system(size: kUrlRefSize, weight: 500)
        let label = UIColor.label.withAlphaComponent(HarvousScripturePillStyle.labelOpacity)
        let tint = HarvousColors.uiScripturePillNeutralAccent

        let refAttrs: [NSAttributedString.Key: Any] = [.font: refFont, .foregroundColor: label]
        let refStr = NSAttributedString(string: displayHost, attributes: refAttrs)
        let refSize = refStr.size()

        let innerW = kUrlHPad + refSize.width + kUrlGap + kUrlGlyphSize + kUrlHPad
        let w = kUrlLineSideMargin + innerW + kUrlLineSideMargin
        let h = max(refSize.height, kUrlGlyphSize) + kUrlVPad * 2
        let size = CGSize(width: ceil(w), height: ceil(h))

        return UIGraphicsImageRenderer(size: size).image { _ in
            let pillLayout = CGRect(x: kUrlLineSideMargin, y: 0, width: innerW, height: size.height)
            let pill = UIBezierPath(
                roundedRect: pillLayout.insetBy(dx: 0.25, dy: 0.25),
                cornerRadius: HarvousRadius.scripturePill
            )
            tint.withAlphaComponent(0.075).setFill()
            pill.fill()
            tint.withAlphaComponent(0.20).setStroke()
            pill.lineWidth = 0.5
            pill.stroke()

            let refY = (size.height - refSize.height) / 2
            let glyphY = (size.height - kUrlGlyphSize) / 2
            let textX = kUrlLineSideMargin + kUrlHPad
            refStr.draw(at: CGPoint(x: textX, y: refY))
            drawUrlLinkExternalGlyph(at: CGPoint(x: textX + refSize.width + kUrlGap, y: glyphY), color: label)
        }
    }
}

#endif
