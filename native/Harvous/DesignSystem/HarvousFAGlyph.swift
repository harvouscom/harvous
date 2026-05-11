import SwiftUI

#if os(macOS)
import AppKit
#elseif os(iOS)
import UIKit
#endif

/// Box size for `Assets.xcassets` catalog vectors (`Harvous.*` imagesets).
enum HarvousFAIconMetrics {
    /// Standard raster size: macOS note toolbar, sidebar mode trigger, iOS compose, and default `HarvousFAGlyph` `edgePt`.
    static let catalogGlyphBoxPt: CGFloat = 17
    /// Leading icon in compact picker menus (sidebar mode strip, iOS hub list orb) — slightly smaller than `menuRowLeadingGlyphPt`.
    static let compactMenuRowLeadingGlyphPt: CGFloat = 15
    /// Leading catalog icon in standard SwiftUI `Menu` / `contextMenu` rows (~+2 pt vs typical body text for Mac-style balance).
    static let menuRowLeadingGlyphPt: CGFloat = 16
    /// Trailing selection checkmark in picker-style menu rows.
    static let menuRowCheckGlyphPt: CGFloat = 14
    /// macOS sidebar `NSSearchField` magnifier only — do **not** change when tuning menu icons.
    static let sidebarSearchFieldMagnifierGlyphPt: CGFloat = 13
}

/// Catalog Harvous asset vectors as fixed-size toolbar glyphs.
///
/// **Why rasterize:** On macOS, `Image(assetName).resizable().frame(width:height:)` inside bordered
/// `ToolbarItem`s is often flattened into `NSButton` art that clamps to Apple’s preset icon slot, so SwiftUI-only
/// frame tweaks look like “changing the constant does nothing.” Drawing into an `NSImage` / `UIImage` at the desired
/// point size fixes the intrinsic size AppKit/UIKit lays out against.
///
/// **Sizing:** `edgePt` is logical points; bitmaps use the main screen scale (cached per name + size + scale).
struct HarvousFAGlyph: View {
    let assetName: String
    var edgePt: CGFloat = HarvousFAIconMetrics.catalogGlyphBoxPt

    var body: some View {
        #if os(macOS)
        if let img = HarvousFARasterMac.templateImage(named: assetName, edgePt: edgePt) {
            Image(nsImage: img)
        } else {
            Image(systemName: "questionmark.circle")
                .font(.system(size: edgePt))
        }
        #elseif os(iOS)
        if let img = HarvousFARasterIOS.templateImage(named: assetName, edgePt: edgePt) {
            Image(uiImage: img)
        } else {
            Image(systemName: "questionmark.circle")
                .font(.system(size: edgePt))
        }
        #endif
    }
}

#if os(macOS)
@MainActor
private enum HarvousFARasterMac {
    nonisolated(unsafe) private static let cache = NSCache<NSString, NSImage>()

    static func templateImage(named name: String, edgePt: CGFloat) -> NSImage? {
        let scale = NSScreen.main?.backingScaleFactor ?? 2.0
        let key = "\(name)|\(edgePt)|\(scale)" as NSString
        if let hit = cache.object(forKey: key) { return hit }
        guard let src = NSImage(named: name) else { return nil }
        let dstSize = NSSize(width: edgePt, height: edgePt)
        let dst = NSImage(size: dstSize, flipped: false) { dstRect in
            if let ctx = NSGraphicsContext.current?.cgContext {
                ctx.interpolationQuality = .high
            }
            let srcSize = src.size
            // Aspect-fit: many FA icons (e.g. xmark 384×512, share-square 576×512) ship with
            // non-square viewBoxes. Drawing them into a square `dstRect` with `src.draw(in: …)`
            // stretches them — that's the visible "squish" on the dock close button. Centre the
            // source inside the square at its natural aspect ratio instead.
            let aspect = srcSize.width / max(srcSize.height, 0.0001)
            let fitRect: NSRect
            if aspect >= 1 {
                let h = dstSize.width / aspect
                fitRect = NSRect(
                    x: 0,
                    y: (dstSize.height - h) / 2,
                    width: dstSize.width,
                    height: h
                )
            } else {
                let w = dstSize.height * aspect
                fitRect = NSRect(
                    x: (dstSize.width - w) / 2,
                    y: 0,
                    width: w,
                    height: dstSize.height
                )
            }
            let srcRect = NSRect(origin: .zero, size: srcSize)
            src.draw(in: fitRect, from: srcRect, operation: .sourceOver, fraction: 1.0, respectFlipped: true, hints: nil)
            return true
        }
        dst.isTemplate = true
        cache.setObject(dst, forKey: key)
        return dst
    }
}

extension HarvousFAGlyph {
    /// Rasterized catalog template for AppKit search fields (`NSSearchField` / sidebar `.searchable` toolbar chrome).
    @MainActor
    static func rasterTemplateNSImage(named assetName: String, edgePt: CGFloat = HarvousFAIconMetrics.catalogGlyphBoxPt) -> NSImage? {
        HarvousFARasterMac.templateImage(named: assetName, edgePt: edgePt)
    }
}

/// Harvous `Harvous.MagnifyingGlass` (FA-style catalog) on sidebar `.searchable` `NSSearchField` toolbar chrome.
@MainActor
enum HarvousMacSidebarSearchFieldGlyph {
    private static let magnifyingGlassEdgePt: CGFloat = HarvousFAIconMetrics.sidebarSearchFieldMagnifierGlyphPt
    /// Debounced patch — use `Task` instead of `DispatchWorkItem { @MainActor in … }` to avoid GCD block copy
    /// crashes (`EXC_BAD_ACCESS` in `_Block_copy`) seen with MainActor-isolated captures on some OS/SDK combos.
    private static var pendingPatchTask: Task<Void, Never>?

    static func scheduleBrandMagnifyingGlassPatch() {
        pendingPatchTask?.cancel()
        pendingPatchTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 60_000_000)
            guard !Task.isCancelled else { return }
            patchNow()
            pendingPatchTask = nil
        }
    }

    private static func patchNow() {
        guard let image = HarvousFAGlyph.rasterTemplateNSImage(named: "Harvous.MagnifyingGlass", edgePt: magnifyingGlassEdgePt) else {
            return
        }
        for window in NSApp.windows where window.isVisible {
            guard let root = window.contentView else { continue }
            visitDescendants(of: root) {
                guard let search = $0 as? NSSearchField else { return }
                apply(image: image, to: search)
            }
        }
    }

    private static func visitDescendants(of root: NSView, visit: (NSView) -> Void) {
        var queue: [NSView] = [root]
        var idx = 0
        while idx < queue.count {
            let view = queue[idx]
            idx += 1
            visit(view)
            queue.append(contentsOf: view.subviews)
        }
    }

    private static func apply(image: NSImage, to searchField: NSSearchField) {
        guard let cell = searchField.cell as? NSSearchFieldCell else { return }
        cell.searchButtonCell?.image = image
        cell.searchButtonCell?.alternateImage = image
        cell.searchButtonCell?.imageScaling = .scaleProportionallyDown
        searchField.needsDisplay = true
    }
}
#endif

#if os(iOS)
@MainActor
private enum HarvousFARasterIOS {
    nonisolated(unsafe) private static let cache = NSCache<NSString, UIImage>()

    static func templateImage(named name: String, edgePt: CGFloat) -> UIImage? {
        let scale = UIScreen.main.scale
        let key = "\(name)|\(edgePt)|\(scale)" as NSString
        if let hit = cache.object(forKey: key) { return hit }
        guard let src = UIImage(named: name) else { return nil }
        let dstSize = CGSize(width: edgePt, height: edgePt)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = scale
        format.opaque = false
        let renderer = UIGraphicsImageRenderer(size: dstSize, format: format)
        let img = renderer.image { _ in
            // Aspect-fit (see macOS rasterizer): keep non-square FA viewBoxes (xmark 384×512,
            // share-square 576×512, etc.) at their natural ratio inside the square cell.
            let srcSize = src.size
            let aspect = srcSize.width / max(srcSize.height, 0.0001)
            let fitRect: CGRect
            if aspect >= 1 {
                let h = dstSize.width / aspect
                fitRect = CGRect(
                    x: 0,
                    y: (dstSize.height - h) / 2,
                    width: dstSize.width,
                    height: h
                )
            } else {
                let w = dstSize.height * aspect
                fitRect = CGRect(
                    x: (dstSize.width - w) / 2,
                    y: 0,
                    width: w,
                    height: dstSize.height
                )
            }
            src.draw(in: fitRect, blendMode: .normal, alpha: 1.0)
        }.withRenderingMode(.alwaysTemplate)
        cache.setObject(img, forKey: key)
        return img
    }
}

extension HarvousFAGlyph {
    /// Rasterized catalog template for UIKit navigation chrome (e.g. `UINavigationBarAppearance` back indicator).
    @MainActor
    static func rasterTemplateUIImage(named assetName: String, edgePt: CGFloat = HarvousFAIconMetrics.catalogGlyphBoxPt) -> UIImage? {
        HarvousFARasterIOS.templateImage(named: assetName, edgePt: edgePt)
    }
}
#endif
