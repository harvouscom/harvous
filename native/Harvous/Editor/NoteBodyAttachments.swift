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
        let f = HarvousFonts.noteComposeBodyPlatformFont()
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

        let f = HarvousFonts.noteComposeBodyPlatformFont()
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

        let f = HarvousFonts.noteComposeBodyPlatformFont()
        self.bounds = CGRect(x: 0, y: f.descender, width: outW, height: outH)
    }
#endif

    required init?(coder: NSCoder) { fatalError() }
}

// MARK: - Inline image persistence (shared Mac/iOS)

/// JPEG-backed `[Image:base64]` markers, display downscale, and async-safe decode helpers.
enum NoteInlineImageSerialization {
    static let maxInnerWidth: CGFloat = 400
    /// Cap stored payload size so note bodies and sync stay bounded.
    static let maxPayloadBytes = 500_000
    static let jpegQuality: CGFloat = 0.82
    /// Text placeholder while async decode runs after note open.
    static let legacyPlaceholder = "\n[Image]\n"
    private static let markerPrefix = "[Image:"

    /// Serialized marker for a JPEG/PNG payload.
    static func inlineImageMarker(forPayload data: Data) -> String {
        "\n[Image:\(data.base64EncodedString())]\n"
    }

    /// Replace `[Image:base64]` tokens with lightweight placeholders for fast TextKit load.
    static func stripPayloadMarkersForPlainLoad(_ body: String) -> String {
        guard body.contains(markerPrefix) else { return body }
        let ns = body as NSString
        var result = ""
        result.reserveCapacity(body.count)
        var scan = 0
        let len = ns.length
        while scan < len {
            let r = ns.range(of: markerPrefix, options: [], range: NSRange(location: scan, length: len - scan))
            if r.location == NSNotFound {
                result += ns.substring(from: scan)
                break
            }
            result += ns.substring(with: NSRange(location: scan, length: r.location - scan))
            let after = NSMaxRange(r)
            guard after < len else {
                result += legacyPlaceholder
                break
            }
            let tail = ns.range(of: "]", options: [], range: NSRange(location: after, length: len - after))
            if tail.location == NSNotFound {
                result += legacyPlaceholder
                scan = after
                continue
            }
            result += legacyPlaceholder
            scan = tail.location + 1
        }
        return result
    }

    /// Base64 payloads in document order (for async decode on note open).
    static func orderedPayloads(from body: String) -> [Data] {
        guard body.contains(markerPrefix) else { return [] }
        let ns = body as NSString
        var out: [Data] = []
        var scan = 0
        let len = ns.length
        while scan < len {
            let r = ns.range(of: markerPrefix, options: [], range: NSRange(location: scan, length: len - scan))
            if r.location == NSNotFound { break }
            let after = NSMaxRange(r)
            guard after < len else { break }
            let tail = ns.range(of: "]", options: [], range: NSRange(location: after, length: len - after))
            if tail.location == NSNotFound { break }
            let b64 = ns.substring(with: NSRange(location: after, length: tail.location - after))
            if !b64.isEmpty, b64.count < 25_000_000, let data = Data(base64Encoded: b64) {
                out.append(data)
            }
            scan = tail.location + 1
        }
        return out
    }

    /// Encode the attachment's rendered raster for persistence (JPEG, size-capped).
    static func inlineImagePayload(from attachment: NoteInlineImageAttachment) -> Data? {
        guard let img = attachment.image else { return nil }
#if os(macOS)
        return jpegPayload(from: img)
#else
        guard let uiImg = img as? UIImage else { return nil }
        return jpegPayload(from: uiImg)
#endif
    }

#if os(macOS)
    /// Downscale a picked file image before building the bordered attachment raster.
    static func downscaledForInlineInsert(_ image: NSImage) -> NSImage {
        let s = image.size
        guard s.width > 0, s.height > 0 else { return image }
        let maxDim = max(s.width, s.height)
        let cap: CGFloat = maxInnerWidth * 3
        guard maxDim > cap else { return image }
        let scale = cap / maxDim
        let tw = s.width * scale
        let th = s.height * scale
        let out = NSImage(size: NSSize(width: tw, height: th))
        out.lockFocus()
        image.draw(in: NSRect(x: 0, y: 0, width: tw, height: th),
                   from: NSRect(origin: .zero, size: s),
                   operation: .copy,
                   fraction: 1,
                   respectFlipped: true,
                   hints: [.interpolation: NSImageInterpolation.high])
        out.unlockFocus()
        return out
    }

    static func imageFromInlinePayload(_ data: Data) -> NSImage? {
        NSImage(data: data)
    }
#else
    static func downscaledForInlineInsert(_ image: UIImage) -> UIImage {
        let s = image.size
        guard s.width > 0, s.height > 0 else { return image }
        let maxDim = max(s.width, s.height)
        let cap = maxInnerWidth * 3
        guard maxDim > cap else { return image }
        let scale = cap / maxDim
        let tw = s.width * scale
        let th = s.height * scale
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = image.scale
        return UIGraphicsImageRenderer(size: CGSize(width: tw, height: th), format: format).image { _ in
            image.draw(in: CGRect(x: 0, y: 0, width: tw, height: th))
        }
    }

    static func imageFromInlinePayload(_ data: Data) -> UIImage? {
        UIImage(data: data)
    }
#endif

#if os(macOS)
    private static func jpegPayload(from image: NSImage) -> Data? {
        guard image.size.width >= 1, image.size.height >= 1 else { return nil }
        guard let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) else { return nil }
        guard rep.pixelsWide > 0, rep.pixelsHigh > 0 else { return nil }
        var q = jpegQuality
        var data = rep.representation(using: .jpeg, properties: [.compressionFactor: q])
        while let d = data, d.count > maxPayloadBytes, q > 0.35 {
            q -= 0.12
            data = rep.representation(using: .jpeg, properties: [.compressionFactor: q])
        }
        if let d = data, d.count <= maxPayloadBytes { return d }
        return rep.representation(using: .png, properties: [:])
    }
#else
    private static func jpegPayload(from image: UIImage) -> Data? {
        guard image.size.width >= 1, image.size.height >= 1 else { return nil }
        var q = jpegQuality
        var data = image.jpegData(compressionQuality: q)
        while let d = data, d.count > maxPayloadBytes, q > 0.35 {
            q -= 0.12
            data = image.jpegData(compressionQuality: q)
        }
        if let d = data, d.count <= maxPayloadBytes { return d }
        return image.pngData()
    }
#endif
}
