import Foundation

// Shared constants so init and renderPill agree on the same values.
private let kRefSize:  CGFloat = 15   // match body prose size
private let kTransSize: CGFloat = 11  // translation badge — slightly smaller
private let kHPad:  CGFloat = 7
private let kVPad:  CGFloat = 2   // vertical inset for pill background; lower = shallower chip
private let kGap:   CGFloat = 4
private let kRadius: CGFloat = 7      // squircle-leaning radius for scripture pills

private func scriptureGradientProgress(now: Date = Date()) -> CGFloat {
    let hour = Calendar.current.component(.hour, from: now)
    return CGFloat(hour) / 23
}

#if os(macOS)
import AppKit

/// NSTextAttachment that renders a scripture reference as an inline rounded-rect pill.
final class ScripturePillAttachment: NSTextAttachment {
    let reference: String
    var translation: String
    var theme: HarvousColors.ThemeVariant

    init(reference: String, translation: String = ScriptureReference.defaultTranslation, theme: HarvousColors.ThemeVariant = .blue) {
        self.reference = reference
        self.translation = translation
        self.theme = theme
        super.init(data: nil, ofType: nil)

        let img = Self.renderPill(reference: reference, translation: translation, theme: theme)
        self.image = img

        // Correct baseline formula:
        // In flipped:false NSImage, draw(at:) places the BOTTOM of the bounding box at y.
        // So the text baseline sits |descender| above y.
        // We want pill-baseline == surrounding-baseline, so:
        //   bounds.origin.y = -(y_in_image + |descender|) = refFont.descender - kVPad
        let refFont = HarvousFonts.system(size: kRefSize, weight: 500)
        self.bounds = CGRect(
            origin: CGPoint(x: 0, y: refFont.descender - kVPad),
            size: img.size
        )
    }

    required init?(coder: NSCoder) { fatalError() }

    static func renderPill(reference: String, translation: String, theme: HarvousColors.ThemeVariant) -> NSImage {
        let refFont   = HarvousFonts.system(size: kRefSize, weight: 500)
        let transFont = HarvousFonts.system(size: kTransSize, weight: 400)
        let displayTranslation = ScriptureReference.displayTranslationLabel(translation)
        let accent = HarvousColors.nsScriptureAccent(theme)

        let refAttrs: [NSAttributedString.Key: Any]   = [.font: refFont,
                                                          .foregroundColor: accent]
        let transAttrs: [NSAttributedString.Key: Any] = [.font: transFont,
                                                          .foregroundColor: accent.withAlphaComponent(0.55)]
        let refStr   = NSAttributedString(string: reference,   attributes: refAttrs)
        let transStr = NSAttributedString(string: displayTranslation, attributes: transAttrs)
        let refSize   = refStr.size()
        let transSize = transStr.size()

        let w = kHPad + refSize.width + kGap + transSize.width + kHPad
        let h = max(refSize.height, transSize.height) + kVPad * 2
        let size = NSSize(width: ceil(w), height: ceil(h))

        return NSImage(size: size, flipped: false) { bounds in
            // Rounded rect (not oval)
            let pill = NSBezierPath(roundedRect: bounds.insetBy(dx: 0.25, dy: 0.25),
                                    xRadius: kRadius, yRadius: kRadius)
            accent.withAlphaComponent(0.075).setFill()
            pill.fill()
            pill.addClip()
            let progress = scriptureGradientProgress()
            let xPosition = 0.35 + (0.30 * progress)
            let startPoint = CGPoint(
                x: bounds.minX + bounds.width * xPosition,
                y: bounds.minY
            )
            let endPoint = CGPoint(
                x: bounds.minX + bounds.width * xPosition,
                y: bounds.maxY
            )
            let gradient = NSGradient(
                colors: [
                    accent.withAlphaComponent(0.10),
                    accent.withAlphaComponent(0.065)
                ]
            )
            gradient?.draw(from: startPoint, to: endPoint, options: [])
            accent.withAlphaComponent(0.20).setStroke(); pill.lineWidth = 0.5; pill.stroke()

            // draw(at:) in flipped:false places bottom of bbox at y — so centre by offsetting half the remaining height
            let refY   = (size.height - refSize.height)   / 2
            let transY = (size.height - transSize.height) / 2
            refStr.draw(at:   NSPoint(x: kHPad,                       y: refY))
            transStr.draw(at: NSPoint(x: kHPad + refSize.width + kGap, y: transY))
            return true
        }
    }
}

#else
import UIKit

/// NSTextAttachment that renders a scripture reference as an inline rounded-rect pill on iOS.
final class ScripturePillAttachment: NSTextAttachment {
    let reference: String
    var translation: String
    var theme: HarvousColors.ThemeVariant

    init(reference: String, translation: String = ScriptureReference.defaultTranslation, theme: HarvousColors.ThemeVariant = .blue) {
        self.reference = reference
        self.translation = translation
        self.theme = theme
        super.init(data: nil, ofType: nil)

        let img = Self.renderPill(reference: reference, translation: translation, theme: theme)
        self.image = img

        // iOS UIGraphicsImageRenderer uses Y-down. draw(at:) places the TOP of the bbox at y.
        // Baseline from image top = kVPad + refFont.ascender.
        // In attachment Y-up coords: bounds.origin.y = -(size.height - baseline_from_top)
        //   = -(size.height - kVPad - ascender)
        //   = descender - kVPad   (same formula as macOS — verified algebraically)
        let refFont = HarvousFonts.system(size: kRefSize, weight: 500)
        self.bounds = CGRect(
            origin: CGPoint(x: 0, y: CGFloat(refFont.descender) - kVPad),
            size: img.size
        )
    }

    required init?(coder: NSCoder) { fatalError() }

    static func renderPill(reference: String, translation: String, theme: HarvousColors.ThemeVariant) -> UIImage {
        let refFont   = HarvousFonts.system(size: kRefSize, weight: 500)
        let transFont = HarvousFonts.system(size: kTransSize, weight: 400)
        let displayTranslation = ScriptureReference.displayTranslationLabel(translation)
        let accent = HarvousColors.uiScriptureAccent(theme)

        let refAttrs: [NSAttributedString.Key: Any]   = [.font: refFont,
                                                          .foregroundColor: accent]
        let transAttrs: [NSAttributedString.Key: Any] = [.font: transFont,
                                                          .foregroundColor: accent.withAlphaComponent(0.55)]
        let refStr   = NSAttributedString(string: reference,   attributes: refAttrs)
        let transStr = NSAttributedString(string: displayTranslation, attributes: transAttrs)
        let refSize   = refStr.size()
        let transSize = transStr.size()

        let w = kHPad + refSize.width + kGap + transSize.width + kHPad
        let h = max(refSize.height, transSize.height) + kVPad * 2
        let size = CGSize(width: ceil(w), height: ceil(h))

        return UIGraphicsImageRenderer(size: size).image { _ in
            let bounds = CGRect(origin: .zero, size: size)
            let pill = UIBezierPath(roundedRect: bounds.insetBy(dx: 0.25, dy: 0.25),
                                    cornerRadius: kRadius)
            accent.withAlphaComponent(0.075).setFill()
            pill.fill()
            pill.addClip()
            let progress = scriptureGradientProgress()
            let xPosition = 0.35 + (0.30 * progress)
            let startPoint = CGPoint(
                x: bounds.minX + bounds.width * xPosition,
                y: bounds.minY
            )
            let endPoint = CGPoint(
                x: bounds.minX + bounds.width * xPosition,
                y: bounds.maxY
            )
            guard let context = UIGraphicsGetCurrentContext(),
                  let gradient = CGGradient(
                      colorsSpace: CGColorSpaceCreateDeviceRGB(),
                      colors: [
                          accent.withAlphaComponent(0.10).cgColor,
                          accent.withAlphaComponent(0.065).cgColor
                      ] as CFArray,
                      locations: [0.0, 1.0]
                  ) else {
                accent.withAlphaComponent(0.075).setFill()
                pill.fill()
                accent.withAlphaComponent(0.20).setStroke()
                pill.lineWidth = 0.5
                pill.stroke()
                return
            }
            context.drawLinearGradient(gradient, start: startPoint, end: endPoint, options: [])
            accent.withAlphaComponent(0.20).setStroke(); pill.lineWidth = 0.5; pill.stroke()

            // draw(at:) in UIKit places top-left of bbox at the point (Y-down)
            let refY   = (size.height - refSize.height)   / 2
            let transY = (size.height - transSize.height) / 2
            refStr.draw(at:   CGPoint(x: kHPad,                       y: refY))
            transStr.draw(at: CGPoint(x: kHPad + refSize.width + kGap, y: transY))
        }
    }
}
#endif
