import Foundation

#if os(macOS)
import AppKit

/// NSTextAttachment that renders a scripture reference as an inline pill.
/// The pill is rendered to an NSImage at init time and set as self.image.
final class ScripturePillAttachment: NSTextAttachment {
    let reference: String
    var translation: String

    init(reference: String, translation: String = ScriptureReference.defaultTranslation) {
        self.reference = reference
        self.translation = translation
        super.init(data: nil, ofType: nil)
        self.image = Self.renderPill(reference: reference, translation: translation)
        if let img = self.image {
            self.bounds = CGRect(origin: CGPoint(x: 0, y: -3), size: img.size)
        }
    }

    required init?(coder: NSCoder) { fatalError() }

    static func renderPill(reference: String, translation: String) -> NSImage {
        let refFont = NSFont.systemFont(ofSize: 13, weight: .medium)
        let transFont = NSFont.systemFont(ofSize: 11, weight: .regular)
        let hPad: CGFloat = 10, vPad: CGFloat = 3, gap: CGFloat = 5

        let refAttrs: [NSAttributedString.Key: Any] = [.font: refFont, .foregroundColor: NSColor.systemBlue]
        let transAttrs: [NSAttributedString.Key: Any] = [.font: transFont, .foregroundColor: NSColor.systemBlue.withAlphaComponent(0.7)]
        let refStr = NSAttributedString(string: reference, attributes: refAttrs)
        let transStr = NSAttributedString(string: translation, attributes: transAttrs)
        let refSize = refStr.size()
        let transSize = transStr.size()

        let w = hPad + refSize.width + gap + transSize.width + hPad
        let h = max(refSize.height, transSize.height) + vPad * 2
        let size = NSSize(width: ceil(w), height: ceil(h))

        return NSImage(size: size, flipped: false) { bounds in
            // Capsule background
            let path = NSBezierPath(roundedRect: bounds, xRadius: 999, yRadius: 999)
            NSColor.systemBlue.withAlphaComponent(0.10).setFill()
            path.fill()
            NSColor.systemBlue.withAlphaComponent(0.25).setStroke()
            path.lineWidth = 0.5
            path.stroke()

            // Reference
            refStr.draw(at: NSPoint(x: hPad, y: (size.height - refSize.height) / 2))
            // Translation
            transStr.draw(at: NSPoint(x: hPad + refSize.width + gap, y: (size.height - transSize.height) / 2))
            return true
        }
    }
}

#else
import UIKit

/// NSTextAttachment that renders a scripture reference as an inline pill on iOS.
final class ScripturePillAttachment: NSTextAttachment {
    let reference: String
    var translation: String

    init(reference: String, translation: String = ScriptureReference.defaultTranslation) {
        self.reference = reference
        self.translation = translation
        super.init(data: nil, ofType: nil)
        self.image = Self.renderPill(reference: reference, translation: translation)
        if let img = self.image {
            self.bounds = CGRect(origin: CGPoint(x: 0, y: -3), size: img.size)
        }
    }

    required init?(coder: NSCoder) { fatalError() }

    static func renderPill(reference: String, translation: String) -> UIImage {
        let refFont = UIFont.systemFont(ofSize: 13, weight: .medium)
        let transFont = UIFont.systemFont(ofSize: 11, weight: .regular)
        let hPad: CGFloat = 10, vPad: CGFloat = 3, gap: CGFloat = 5

        let refAttrs: [NSAttributedString.Key: Any] = [.font: refFont, .foregroundColor: UIColor.systemBlue]
        let transAttrs: [NSAttributedString.Key: Any] = [.font: transFont, .foregroundColor: UIColor.systemBlue.withAlphaComponent(0.7)]
        let refStr = NSAttributedString(string: reference, attributes: refAttrs)
        let transStr = NSAttributedString(string: translation, attributes: transAttrs)
        let refSize = refStr.size()
        let transSize = transStr.size()

        let w = hPad + refSize.width + gap + transSize.width + hPad
        let h = max(refSize.height, transSize.height) + vPad * 2
        let size = CGSize(width: ceil(w), height: ceil(h))

        return UIGraphicsImageRenderer(size: size).image { _ in
            let bounds = CGRect(origin: .zero, size: size)
            let path = UIBezierPath(roundedRect: bounds, cornerRadius: 999)
            UIColor.systemBlue.withAlphaComponent(0.10).setFill()
            path.fill()
            UIColor.systemBlue.withAlphaComponent(0.25).setStroke()
            path.lineWidth = 0.5
            path.stroke()
            refStr.draw(at: CGPoint(x: hPad, y: (size.height - refSize.height) / 2))
            transStr.draw(at: CGPoint(x: hPad + refSize.width + gap, y: (size.height - transSize.height) / 2))
        }
    }
}
#endif
