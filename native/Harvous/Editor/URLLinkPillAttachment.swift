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

/// Trailing glyph character for the external-link indicator. Unicode `↗` renders identically in
/// both AppKit and UIKit text drawing without us having to manage coordinate flips around a custom
/// CGPath.
private let kUrlLinkExternalGlyph = "\u{2197}"

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
    /// Cached host string used for rendering. Recomputed on init from `href`.
    private(set) var displayHost: String

    init(href: String, title: String? = nil) {
        self.href = href
        self.title = title
        self.displayHost = urlLinkPillDisplayHost(href)
        super.init(data: nil, ofType: nil)

        let img = Self.renderPill(displayHost: self.displayHost)
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
    func refreshRasterForCurrentAppearance() {
        NSApp.effectiveAppearance.performAsCurrentDrawingAppearance {
            let img = Self.renderPill(displayHost: self.displayHost)
            self.image = img
            let refFont = HarvousFonts.system(size: kUrlRefSize, weight: 500)
            self.bounds = CGRect(
                origin: CGPoint(x: 0, y: refFont.descender - kUrlVPad),
                size: img.size
            )
        }
    }

    static func renderPill(displayHost: String) -> NSImage {
        let refFont = HarvousFonts.system(size: kUrlRefSize, weight: 500)
        let glyphFont = HarvousFonts.system(size: kUrlGlyphSize, weight: 600)
        let label = NSColor.labelColor.withAlphaComponent(HarvousScripturePillStyle.labelOpacity)
        let tint = HarvousColors.nsScripturePillNeutralAccent

        let refAttrs:   [NSAttributedString.Key: Any] = [.font: refFont,   .foregroundColor: label]
        let glyphAttrs: [NSAttributedString.Key: Any] = [.font: glyphFont, .foregroundColor: label]
        let refStr   = NSAttributedString(string: displayHost, attributes: refAttrs)
        let glyphStr = NSAttributedString(string: kUrlLinkExternalGlyph, attributes: glyphAttrs)
        let refSize   = refStr.size()
        let glyphSize = glyphStr.size()

        let innerW = kUrlHPad + refSize.width + kUrlGap + glyphSize.width + kUrlHPad
        let w = kUrlLineSideMargin + innerW + kUrlLineSideMargin
        let h = max(refSize.height, glyphSize.height) + kUrlVPad * 2
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

            let refY   = (size.height - refSize.height)   / 2
            let glyphY = (size.height - glyphSize.height) / 2
            let textX = kUrlLineSideMargin + kUrlHPad
            refStr.draw(at:   NSPoint(x: textX,                          y: refY))
            glyphStr.draw(at: NSPoint(x: textX + refSize.width + kUrlGap, y: glyphY))
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
    private(set) var displayHost: String

    init(href: String, title: String? = nil) {
        self.href = href
        self.title = title
        self.displayHost = urlLinkPillDisplayHost(href)
        super.init(data: nil, ofType: nil)

        let img = Self.renderPill(displayHost: self.displayHost)
        self.image = img

        let refFont = HarvousFonts.system(size: kUrlRefSize, weight: 500)
        self.bounds = CGRect(
            origin: CGPoint(x: 0, y: CGFloat(refFont.descender) - kUrlVPad),
            size: img.size
        )
    }

    required init?(coder: NSCoder) { fatalError() }

    func refreshRasterForCurrentAppearance() {
        let img = Self.renderPill(displayHost: displayHost)
        self.image = img
        let refFont = HarvousFonts.system(size: kUrlRefSize, weight: 500)
        self.bounds = CGRect(
            origin: CGPoint(x: 0, y: CGFloat(refFont.descender) - kUrlVPad),
            size: img.size
        )
    }

    static func renderPill(displayHost: String) -> UIImage {
        let refFont = HarvousFonts.system(size: kUrlRefSize, weight: 500)
        let glyphFont = HarvousFonts.system(size: kUrlGlyphSize, weight: 600)
        let label = UIColor.label.withAlphaComponent(HarvousScripturePillStyle.labelOpacity)
        let tint = HarvousColors.uiScripturePillNeutralAccent

        let refAttrs:   [NSAttributedString.Key: Any] = [.font: refFont,   .foregroundColor: label]
        let glyphAttrs: [NSAttributedString.Key: Any] = [.font: glyphFont, .foregroundColor: label]
        let refStr   = NSAttributedString(string: displayHost, attributes: refAttrs)
        let glyphStr = NSAttributedString(string: kUrlLinkExternalGlyph, attributes: glyphAttrs)
        let refSize   = refStr.size()
        let glyphSize = glyphStr.size()

        let innerW = kUrlHPad + refSize.width + kUrlGap + glyphSize.width + kUrlHPad
        let w = kUrlLineSideMargin + innerW + kUrlLineSideMargin
        let h = max(refSize.height, glyphSize.height) + kUrlVPad * 2
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

            let refY   = (size.height - refSize.height)   / 2
            let glyphY = (size.height - glyphSize.height) / 2
            let textX = kUrlLineSideMargin + kUrlHPad
            refStr.draw(at:   CGPoint(x: textX,                          y: refY))
            glyphStr.draw(at: CGPoint(x: textX + refSize.width + kUrlGap, y: glyphY))
        }
    }
}

#endif
