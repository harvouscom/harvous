import SwiftUI

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

/// Loads a remote profile photo over HTTPS and decodes only known image formats.
/// Avoids `AsyncImage` / ImageIO console spam when a URL returns HTML, binaries, or other non-image data.
struct HarvousProfilePhotoView: View {
    let url: URL
    let size: CGFloat

    #if os(iOS)
    @State private var image: UIImage?
    #elseif os(macOS)
    @State private var image: NSImage?
    #endif

    var body: some View {
        ZStack {
            #if os(iOS)
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: size, height: size)
            }
            #elseif os(macOS)
            if let image {
                Image(nsImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: size, height: size)
            }
            #endif
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .clipped()
        .task(id: url) {
            image = nil
            image = await HarvousProfilePhotoLoader.loadThumbnail(url: url, diameter: size)
        }
    }
}

enum HarvousProfilePhotoLoader {
    /// Clerk / CDN profile image URLs must be absolute HTTPS.
    static func validatedURL(from raw: String?) -> URL? {
        let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !trimmed.isEmpty, let url = URL(string: trimmed), url.host != nil else { return nil }
        switch url.scheme?.lowercased() {
        case "https": return url
        case "http": return url
        default: return nil
        }
    }

    #if os(iOS)
    /// Fixed-diameter circular bitmap (no unbounded `.resizable()` layout during toolbar/menu hosting).
    static func loadThumbnail(url: URL, diameter: CGFloat) async -> UIImage? {
        guard let data = await fetchImageData(from: url),
              let src = UIImage(data: data)
        else { return nil }
        return circularThumbnail(from: src, diameter: diameter)
    }

    private static func circularThumbnail(from source: UIImage, diameter: CGFloat) -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = UIScreen.main.scale
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: diameter, height: diameter), format: format)
        return renderer.image { _ in
            let rect = CGRect(origin: .zero, size: CGSize(width: diameter, height: diameter))
            // Opaque matte avoids a white ring if aspect-fill leaves sub-pixel gaps at the clip edge.
            UIColor.black.setFill()
            UIRectFill(rect)
            UIBezierPath(ovalIn: rect).addClip()
            let dstPixels = diameter * format.scale
            let srcPixelsW = source.size.width * source.scale
            let srcPixelsH = source.size.height * source.scale
            let fillScale = max(dstPixels / max(srcPixelsW, 1), dstPixels / max(srcPixelsH, 1)) * 1.06
            let w = srcPixelsW * fillScale / format.scale
            let h = srcPixelsH * fillScale / format.scale
            let draw = CGRect(x: (rect.width - w) / 2, y: (rect.height - h) / 2, width: w, height: h)
            source.draw(in: draw)
        }
    }
    #elseif os(macOS)
    static func loadThumbnail(url: URL, diameter: CGFloat) async -> NSImage? {
        guard let data = await fetchImageData(from: url),
              let src = NSImage(data: data)
        else { return nil }
        return circularThumbnail(from: src, diameter: diameter)
    }

    private static func circularThumbnail(from source: NSImage, diameter: CGFloat) -> NSImage {
        let size = NSSize(width: diameter, height: diameter)
        let thumbnail = NSImage(size: size)
        thumbnail.lockFocus()
        NSBezierPath(ovalIn: NSRect(origin: .zero, size: size)).addClip()
        let src = source.size
        let scale = max(size.width / max(src.width, 1), size.height / max(src.height, 1))
        let w = src.width * scale
        let h = src.height * scale
        let x = (size.width - w) / 2
        let y = (size.height - h) / 2
        source.draw(
            in: NSRect(x: x, y: y, width: w, height: h),
            from: .zero,
            operation: .sourceOver,
            fraction: 1
        )
        thumbnail.unlockFocus()
        return thumbnail
    }
    #endif

    private static func fetchImageData(from url: URL) async -> Data? {
        var request = URLRequest(url: url)
        request.cachePolicy = .returnCacheDataElseLoad
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse,
                  (200 ... 299).contains(http.statusCode),
                  isRecognizedImageData(data)
            else { return nil }
            return data
        } catch {
            return nil
        }
    }

    private static func isRecognizedImageData(_ data: Data) -> Bool {
        guard data.count >= 12 else { return false }
        // Reject Mach-O and other executables (ImageIO logs loudly for these).
        if data.starts(with: [0xCF, 0xFA, 0xED, 0xFE]) { return false }
        if data.starts(with: [0xFE, 0xED, 0xFA, 0xCF]) { return false }
        if data.starts(with: [0xCE, 0xFA, 0xED, 0xFE]) { return false }
        #if os(iOS)
        return UIImage(data: data) != nil
        #elseif os(macOS)
        return NSImage(data: data) != nil
        #else
        return false
        #endif
    }
}
