import CoreGraphics
import Foundation

#if os(macOS)
import AppKit
#elseif os(iOS)
import UIKit
#endif

// MARK: - Shared chrome

/// Separator color used by horizontal rule and inline images.
enum NoteBodyBlockChrome {
#if os(macOS)
    static let separator = NSColor.separatorColor
#else
    static let separator = UIColor.separator
#endif
    /// Horizontal rule bar height — image stroke matches for a cohesive look.
    static let lineThickness: CGFloat = 1
}

// MARK: - Horizontal rule attachment

final class HorizontalRuleAttachment: NSTextAttachment {
    init() {
        super.init(data: nil, ofType: nil)
#if os(macOS)
        let w: CGFloat = 8
        let h: CGFloat = 8
        self.image = NSImage(size: NSSize(width: w, height: h), flipped: false) { rect in
            NoteBodyBlockChrome.separator.setFill()
            let t = NoteBodyBlockChrome.lineThickness
            let y = (rect.height - t) * 0.5
            NSRect(x: 0, y: y, width: rect.width, height: t).fill()
            return true
        }
#else
        let w: CGFloat = 8
        let h: CGFloat = 8
        let img = UIGraphicsImageRenderer(size: CGSize(width: w, height: h)).image { ctx in
            NoteBodyBlockChrome.separator.setFill()
            let t = NoteBodyBlockChrome.lineThickness
            let rect = CGRect(x: 0, y: CGFloat((CGFloat(h) - t) * 0.5), width: CGFloat(w), height: t)
            ctx.fill(rect)
        }
        self.image = img
#endif
    }

    required init?(coder: NSCoder) { fatalError() }

    override func attachmentBounds(
        for textContainer: NSTextContainer?,
        proposedLineFragment lineFrag: CGRect,
        glyphPosition position: CGPoint,
        characterIndex charIndex: Int
    ) -> CGRect {
        let f = HarvousFonts.system(size: 16, weight: 400)
        let w = max(lineFrag.width, 1)
        let h: CGFloat = 22
#if os(macOS)
        let desc = CGFloat(f.descender)
#else
        let desc = f.descender
#endif
        return CGRect(x: 0, y: desc, width: w, height: h)
    }
}

// MARK: - Inline image attachment

final class NoteInlineImageAttachment: NSTextAttachment {
    private static let maxInnerWidth: CGFloat = 400
    private static let maxCornerRadius: CGFloat = 8

#if os(macOS)
    init(image: NSImage) {
        super.init(data: nil, ofType: nil)
        let s = image.size
        guard s.width > 0, s.height > 0 else { return }
        let scale = min(1, Self.maxInnerWidth / s.width)
        let tw = s.width * scale
        let th = s.height * scale
        let b = NoteBodyBlockChrome.lineThickness
        let r = min(Self.maxCornerRadius, max(2, min(tw, th) * 0.04))
        let outW = tw + 2 * b
        let outH = th + 2 * b

        self.image = NSImage(size: NSSize(width: outW, height: outH), flipped: false) { _ in
            let content = NSRect(x: b, y: b, width: tw, height: th)
            let clip = NSBezierPath(roundedRect: content, xRadius: r, yRadius: r)
            NSGraphicsContext.saveGraphicsState()
            clip.addClip()
            let src = NSRect(origin: .zero, size: s)
            image.draw(in: content, from: src, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: [.interpolation: NSImageInterpolation.high])
            NSGraphicsContext.restoreGraphicsState()

            let border = NSBezierPath(roundedRect: content, xRadius: r, yRadius: r)
            border.lineWidth = b
            border.lineJoinStyle = .round
            NoteBodyBlockChrome.separator.setStroke()
            border.stroke()
            return true
        }

        let f = HarvousFonts.system(size: 16, weight: 400)
        self.bounds = CGRect(x: 0, y: f.descender, width: outW, height: outH)
    }

#else
    init(image: UIImage) {
        super.init(data: nil, ofType: nil)
        let s = image.size
        guard s.width > 0, s.height > 0 else { return }
        let scale = min(1, Self.maxInnerWidth / s.width)
        let tw = s.width * scale
        let th = s.height * scale
        let b = NoteBodyBlockChrome.lineThickness
        let r = min(Self.maxCornerRadius, max(2, min(tw, th) * 0.04))
        let outW = tw + 2 * b
        let outH = th + 2 * b

        let rend = UIGraphicsImageRenderer(size: CGSize(width: outW, height: outH))
        self.image = rend.image { _ in
            let contentRect = CGRect(x: b, y: b, width: tw, height: th)
            let path = UIBezierPath(roundedRect: contentRect, cornerRadius: r)
            path.addClip()
            image.draw(in: contentRect)
            path.lineWidth = b
            NoteBodyBlockChrome.separator.setStroke()
            path.stroke()
        }

        let f = HarvousFonts.system(size: 16, weight: 400)
        self.bounds = CGRect(x: 0, y: f.descender, width: outW, height: outH)
    }
#endif

    required init?(coder: NSCoder) { fatalError() }
}
