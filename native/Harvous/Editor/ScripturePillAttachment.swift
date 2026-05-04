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

/// Resolve the concrete draw-time accent for a scripture pill. Per-pill accent wins; falls back to the
/// neutral default (space theme deliberately ignored so pills don't auto-tint per the product decision).
private func resolvedPillAccent(accent: StudyHighlightAccentToken?) -> NSColor {
    guard let accent, accent != .auto else {
        return HarvousColors.nsScripturePillNeutralAccent
    }
    return accent.resolvedAccentNSColor(kind: .scriptureLink, isDark: false)
}

/// Neutral pills should read like normal prose: use content text color for labels.
private func resolvedPillLabelColor(accent: StudyHighlightAccentToken?) -> NSColor {
    _ = accent
    return .labelColor
}

/// NSTextAttachment that renders a scripture reference as an inline rounded-rect pill.
final class ScripturePillAttachment: NSTextAttachment {
    let reference: String
    var translation: String
    /// Preserved for backwards compatibility with existing call sites. Not used at render time.
    var theme: HarvousColors.ThemeVariant
    /// Per-pill accent (persisted on the owning Note). `nil` → neutral default.
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

        let img = Self.renderPill(reference: reference, translation: translation, accent: accent)
        self.image = img

        // Baseline formula (NSImage flipped:false): draw(at:) places bottom-left of the bbox at y,
        // so attachment.bounds.origin.y = refFont.descender - kVPad to center the pill on the baseline.
        let refFont = HarvousFonts.system(size: kRefSize, weight: 500)
        self.bounds = CGRect(
            origin: CGPoint(x: 0, y: refFont.descender - kVPad),
            size: img.size
        )
    }

    required init?(coder: NSCoder) { fatalError() }

    static func renderPill(reference: String, translation: String, accent: StudyHighlightAccentToken?) -> NSImage {
        let refFont   = HarvousFonts.system(size: kRefSize, weight: 500)
        let transFont = HarvousFonts.system(size: kTransSize, weight: 400)
        let displayTranslation = ScriptureReference.displayTranslationLabel(translation)
        let tint = resolvedPillAccent(accent: accent)
        let label = resolvedPillLabelColor(accent: accent)

        let refAttrs: [NSAttributedString.Key: Any]   = [.font: refFont,
                                                          .foregroundColor: label]
        let transAttrs: [NSAttributedString.Key: Any] = [.font: transFont,
                                                          .foregroundColor: label]
        let refStr   = NSAttributedString(string: reference,   attributes: refAttrs)
        let transStr = NSAttributedString(string: displayTranslation, attributes: transAttrs)
        let refSize   = refStr.size()
        let transSize = transStr.size()

        let w = kHPad + refSize.width + kGap + transSize.width + kHPad
        let h = max(refSize.height, transSize.height) + kVPad * 2
        let size = NSSize(width: ceil(w), height: ceil(h))

        return NSImage(size: size, flipped: false) { bounds in
            let pill = NSBezierPath(roundedRect: bounds.insetBy(dx: 0.25, dy: 0.25),
                                    xRadius: kRadius, yRadius: kRadius)
            tint.withAlphaComponent(0.075).setFill()
            pill.fill()
            pill.addClip()
            let progress = scriptureGradientProgress()
            let xPosition = 0.35 + (0.30 * progress)
            let startPoint = CGPoint(x: bounds.minX + bounds.width * xPosition, y: bounds.minY)
            let endPoint   = CGPoint(x: bounds.minX + bounds.width * xPosition, y: bounds.maxY)
            let gradient = NSGradient(
                colors: [
                    tint.withAlphaComponent(0.10),
                    tint.withAlphaComponent(0.065)
                ]
            )
            gradient?.draw(from: startPoint, to: endPoint, options: [])
            tint.withAlphaComponent(0.20).setStroke(); pill.lineWidth = 0.5; pill.stroke()

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

private func resolvedPillAccent(accent: StudyHighlightAccentToken?) -> UIColor {
    guard let accent, accent != .auto else {
        return HarvousColors.uiScripturePillNeutralAccent
    }
    return accent.resolvedAccentUIColor(kind: .scriptureLink, isDark: false)
}

private func resolvedPillLabelColor(accent: StudyHighlightAccentToken?) -> UIColor {
    _ = accent
    return .label
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

        let img = Self.renderPill(reference: reference, translation: translation, accent: accent)
        self.image = img

        let refFont = HarvousFonts.system(size: kRefSize, weight: 500)
        self.bounds = CGRect(
            origin: CGPoint(x: 0, y: CGFloat(refFont.descender) - kVPad),
            size: img.size
        )
    }

    required init?(coder: NSCoder) { fatalError() }

    static func renderPill(reference: String, translation: String, accent: StudyHighlightAccentToken?) -> UIImage {
        let refFont   = HarvousFonts.system(size: kRefSize, weight: 500)
        let transFont = HarvousFonts.system(size: kTransSize, weight: 400)
        let displayTranslation = ScriptureReference.displayTranslationLabel(translation)
        let tint = resolvedPillAccent(accent: accent)
        let label = resolvedPillLabelColor(accent: accent)

        let refAttrs: [NSAttributedString.Key: Any]   = [.font: refFont,
                                                          .foregroundColor: label]
        let transAttrs: [NSAttributedString.Key: Any] = [.font: transFont,
                                                          .foregroundColor: label]
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
            tint.withAlphaComponent(0.075).setFill()
            pill.fill()
            pill.addClip()
            let progress = scriptureGradientProgress()
            let xPosition = 0.35 + (0.30 * progress)
            let startPoint = CGPoint(x: bounds.minX + bounds.width * xPosition, y: bounds.minY)
            let endPoint   = CGPoint(x: bounds.minX + bounds.width * xPosition, y: bounds.maxY)
            guard let context = UIGraphicsGetCurrentContext(),
                  let gradient = CGGradient(
                      colorsSpace: CGColorSpaceCreateDeviceRGB(),
                      colors: [
                          tint.withAlphaComponent(0.10).cgColor,
                          tint.withAlphaComponent(0.065).cgColor
                      ] as CFArray,
                      locations: [0.0, 1.0]
                  ) else {
                tint.withAlphaComponent(0.075).setFill()
                pill.fill()
                tint.withAlphaComponent(0.20).setStroke()
                pill.lineWidth = 0.5
                pill.stroke()
                return
            }
            context.drawLinearGradient(gradient, start: startPoint, end: endPoint, options: [])
            tint.withAlphaComponent(0.20).setStroke(); pill.lineWidth = 0.5; pill.stroke()

            let refY   = (size.height - refSize.height)   / 2
            let transY = (size.height - transSize.height) / 2
            refStr.draw(at:   CGPoint(x: kHPad,                       y: refY))
            transStr.draw(at: CGPoint(x: kHPad + refSize.width + kGap, y: transY))
        }
    }
}
#endif
