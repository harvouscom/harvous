import Foundation
import SwiftUI
#if os(macOS)
import AppKit
#else
import UIKit
#endif

// MARK: - Preset catalog (keep in sync with shared/appearance-presets.json)

struct HarvousAppearancePreset: Identifiable, Equatable {
    let label: String
    /// Carousel label in dark mode; falls back to `label`.
    let darkLabel: String?
    /// `nil` = follow system default canvas for that color scheme.
    let lightHex: String?
    let darkHex: String?

    var id: String { label }

    /// Same order and values as `shared/appearance-presets.json`.
    static let catalog: [HarvousAppearancePreset] = [
        HarvousAppearancePreset(label: "Paper", darkLabel: "Paper", lightHex: nil, darkHex: nil),
        HarvousAppearancePreset(label: "Sky", darkLabel: "Night", lightHex: "#c2dcf8", darkHex: "#152536"),
        HarvousAppearancePreset(label: "Lilac", darkLabel: "Dusk", lightHex: "#dec5ed", darkHex: "#2a2438"),
        HarvousAppearancePreset(label: "Peach", darkLabel: "Ember", lightHex: "#fbc8ad", darkHex: "#382820"),
        HarvousAppearancePreset(label: "Mint", darkLabel: "Pine", lightHex: "#c9e3b8", darkHex: "#1e2e22"),
        HarvousAppearancePreset(label: "Pink", darkLabel: "Plum", lightHex: "#f3c8e0", darkHex: "#382030"),
        HarvousAppearancePreset(label: "Cream", darkLabel: "Umber", lightHex: "#f6ecd6", darkHex: "#2e2818"),
    ]

    /// Theme-aware carousel label (e.g. Cream → Umber in dark mode).
    func displayLabel(for colorScheme: ColorScheme) -> String {
        if colorScheme == .dark {
            return darkLabel ?? label
        }
        return label
    }

    /// Base Paper preset — theme default canvas (OKLCH), not a stored hex.
    var isBasePaperPreset: Bool {
        lightHex == nil && darkHex == nil
    }

    func swatchHex(for colorScheme: ColorScheme) -> String {
        if colorScheme == .dark, let darkHex {
            return darkHex
        }
        if let lightHex {
            return lightHex
        }
        return HarvousAppearanceColors.defaultCanvasHex(for: colorScheme)
    }

    func applyStoredValue(for colorScheme: ColorScheme) -> HarvousCanvasBackground? {
        if isBasePaperPreset { return nil }
        let hex = swatchHex(for: colorScheme)
        if hex == HarvousAppearanceColors.defaultCanvasHex(for: colorScheme), lightHex == nil {
            return nil
        }
        return .color(hex: hex)
    }

    func matches(_ background: HarvousCanvasBackground?) -> Bool {
        if isBasePaperPreset {
            return background == nil
        }
        guard case let .color(hex) = background else { return false }
        let candidates = [lightHex, darkHex].compactMap { $0 }
        return candidates.contains(hex)
    }
}

enum HarvousAppearanceColors {
    /// Matches `shared/appearance-presets.json` + `prototype-tokens.css` `--pds-lch-canvas-default`.
    private static let defaultLightOklch = HarvousOklchColor(l: 0.987, c: 0.005, h: 92)
    private static let defaultDarkOklch = HarvousOklchColor(l: 0.12, c: 0.01, h: 285)

    static func defaultCanvasHex(for colorScheme: ColorScheme) -> String {
        (colorScheme == .dark ? defaultDarkOklch : defaultLightOklch).hexString()
    }

    static func defaultCanvasColor(for colorScheme: ColorScheme) -> Color {
        (colorScheme == .dark ? defaultDarkOklch : defaultLightOklch).swiftUIColor()
    }
}

/// OKLCH → sRGB (CSS Color Level 4 pipeline). Used for canvas defaults that match web `--pds-canvas-default`.
private struct HarvousOklchColor {
    let l: Double
    let c: Double
    let h: Double

    func srgbComponents() -> (r: Double, g: Double, b: Double) {
        let hr = h * .pi / 180
        let a = c * cos(hr)
        let b = c * sin(hr)
        let l1 = l + 0.3963377774 * a + 0.2158037573 * b
        let m1 = l - 0.1055613458 * a - 0.0638541728 * b
        let s1 = l - 0.0894841775 * a - 1.291485548 * b
        let l3 = l1 * l1 * l1
        let m3 = m1 * m1 * m1
        let s3 = s1 * s1 * s1
        let r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
        let g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
        let bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3
        return (linearToSRGB(r), linearToSRGB(g), linearToSRGB(bl))
    }

    func hexString() -> String {
        let rgb = srgbComponents()
        let r = Int((rgb.r * 255).rounded().clamped(to: 0...255))
        let g = Int((rgb.g * 255).rounded().clamped(to: 0...255))
        let b = Int((rgb.b * 255).rounded().clamped(to: 0...255))
        return String(format: "#%02x%02x%02x", r, g, b)
    }

    func swiftUIColor() -> Color {
        let rgb = srgbComponents()
        return Color(red: rgb.r, green: rgb.g, blue: rgb.b)
    }

    private func linearToSRGB(_ component: Double) -> Double {
        if component <= 0.0031308 { return 12.92 * component }
        return 1.055 * pow(component, 1.0 / 2.4) - 0.055
    }
}

private extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}

// MARK: - Stored background

enum HarvousCanvasBackground: Codable, Equatable {
    case color(hex: String)
    case image(fileName: String, tintHex: String?)

    private enum CodingKeys: String, CodingKey {
        case kind, value, fileName, tintHex
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try container.decode(String.self, forKey: .kind)
        switch kind {
        case "color":
            self = .color(hex: try container.decode(String.self, forKey: .value))
        case "image":
            self = .image(
                fileName: try container.decode(String.self, forKey: .fileName),
                tintHex: try container.decodeIfPresent(String.self, forKey: .tintHex)
            )
        default:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: container, debugDescription: "Unknown kind")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .color(hex):
            try container.encode("color", forKey: .kind)
            try container.encode(hex, forKey: .value)
        case let .image(fileName, tintHex):
            try container.encode("image", forKey: .kind)
            try container.encode(fileName, forKey: .fileName)
            try container.encodeIfPresent(tintHex, forKey: .tintHex)
        }
    }

    var isImage: Bool {
        if case .image = self { return true }
        return false
    }
}

struct HarvousSavedWallpaperArchive: Codable, Equatable {
    let fileName: String
    var tintHex: String?
}

// MARK: - Color scheme preference

enum HarvousColorSchemePreference: String, CaseIterable {
    case system
    case light
    case dark

    var label: String {
        switch self {
        case .system: return "Auto"
        case .light: return "Light"
        case .dark: return "Dark"
        }
    }

    var preferredColorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

enum HarvousAppearanceStorageKeys {
    static let activeCanvas = "harvous.appearance.canvas"
    static let savedWallpaper = "harvous.appearance.savedWallpaper"
    static let colorScheme = "harvous.appearance.colorScheme"
}

/// Removed preset hex values — migrate stored picks to base Paper (nil / theme default).
enum HarvousAppearanceLegacyPaper {
    static let lightHex = "#f7f6f3"
    static let darkHex = "#1a1a1c"

    static func normalize(_ background: HarvousCanvasBackground?) -> HarvousCanvasBackground? {
        guard case let .color(hex) = background else { return background }
        if hex == lightHex || hex == darkHex { return nil }
        return background
    }
}

enum HarvousAppearanceLimits {
    static let maxUploadBytes = 3 * 1024 * 1024
    static let maxImageEdge: CGFloat = 1600
    static let jpegQuality: CGFloat = 0.82
}

// MARK: - Store

@Observable
@MainActor
final class HarvousAppearanceStore {
    static let shared = HarvousAppearanceStore()

    private(set) var activeBackground: HarvousCanvasBackground?
    private(set) var savedWallpaper: HarvousSavedWallpaperArchive?
    private(set) var colorSchemePreference: HarvousColorSchemePreference

    private init() {
        activeBackground = Self.loadActiveBackground()
        savedWallpaper = Self.loadSavedWallpaper()
        colorSchemePreference = Self.loadColorSchemePreference()
    }

    // MARK: - Persistence

    private static func loadActiveBackground() -> HarvousCanvasBackground? {
        guard let raw = UserDefaults.standard.string(forKey: HarvousAppearanceStorageKeys.activeCanvas),
              let data = raw.data(using: .utf8),
              let decoded = try? JSONDecoder().decode(HarvousCanvasBackground.self, from: data)
        else { return nil }
        let normalized = HarvousAppearanceLegacyPaper.normalize(decoded)
        if normalized == nil, decoded != nil {
            UserDefaults.standard.removeObject(forKey: HarvousAppearanceStorageKeys.activeCanvas)
        }
        return normalized
    }

    private static func loadColorSchemePreference() -> HarvousColorSchemePreference {
        guard let raw = UserDefaults.standard.string(forKey: HarvousAppearanceStorageKeys.colorScheme),
              let pref = HarvousColorSchemePreference(rawValue: raw)
        else { return .system }
        return pref
    }

    private static func loadSavedWallpaper() -> HarvousSavedWallpaperArchive? {
        guard let raw = UserDefaults.standard.string(forKey: HarvousAppearanceStorageKeys.savedWallpaper),
              let data = raw.data(using: .utf8)
        else { return nil }
        return try? JSONDecoder().decode(HarvousSavedWallpaperArchive.self, from: data)
    }

    private func persistActiveBackground() {
        let defaults = UserDefaults.standard
        if let activeBackground,
           let data = try? JSONEncoder().encode(activeBackground),
           let raw = String(data: data, encoding: .utf8) {
            defaults.set(raw, forKey: HarvousAppearanceStorageKeys.activeCanvas)
        } else {
            defaults.removeObject(forKey: HarvousAppearanceStorageKeys.activeCanvas)
        }
    }

    private func persistColorSchemePreference() {
        UserDefaults.standard.set(colorSchemePreference.rawValue, forKey: HarvousAppearanceStorageKeys.colorScheme)
    }

    private func persistSavedWallpaper() {
        let defaults = UserDefaults.standard
        if let savedWallpaper,
           let data = try? JSONEncoder().encode(savedWallpaper),
           let raw = String(data: data, encoding: .utf8) {
            defaults.set(raw, forKey: HarvousAppearanceStorageKeys.savedWallpaper)
        } else {
            defaults.removeObject(forKey: HarvousAppearanceStorageKeys.savedWallpaper)
        }
    }

    // MARK: - Public API

    func setColorSchemePreference(_ preference: HarvousColorSchemePreference) {
        colorSchemePreference = preference
        persistColorSchemePreference()
    }

    func selectPreset(_ preset: HarvousAppearancePreset, colorScheme: ColorScheme) {
        activeBackground = preset.applyStoredValue(for: colorScheme)
        persistActiveBackground()
    }

    func selectSavedWallpaper() {
        guard let saved = savedWallpaper else { return }
        activeBackground = .image(fileName: saved.fileName, tintHex: saved.tintHex)
        persistActiveBackground()
    }

    @discardableResult
    func saveUploadedImage(_ platformImage: HarvousPlatformImage, colorScheme: ColorScheme) throws -> HarvousCanvasBackground {
        let optimized = try HarvousWallpaperImageProcessor.optimize(platformImage)
        guard optimized.jpegData.count <= HarvousAppearanceLimits.maxUploadBytes else {
            throw HarvousAppearanceError.imageTooLarge
        }

        let fileName = "\(UUID().uuidString).jpg"
        let url = Self.wallpapersDirectory.appendingPathComponent(fileName)
        try optimized.jpegData.write(to: url, options: .atomic)

        let rawTint = HarvousWallpaperImageProcessor.sampleAverageHex(from: optimized.image)
        let blendedTint = HarvousWallpaperImageProcessor.tintForAppearance(rawTint, colorScheme: colorScheme)

        savedWallpaper = HarvousSavedWallpaperArchive(fileName: fileName, tintHex: rawTint)
        persistSavedWallpaper()

        let background = HarvousCanvasBackground.image(fileName: fileName, tintHex: rawTint)
        activeBackground = background
        persistActiveBackground()
        return background
    }

    func removeSavedWallpaper() {
        if let saved = savedWallpaper {
            let url = Self.wallpapersDirectory.appendingPathComponent(saved.fileName)
            try? FileManager.default.removeItem(at: url)
        }
        savedWallpaper = nil
        persistSavedWallpaper()
        if activeBackground?.isImage == true {
            activeBackground = nil
            persistActiveBackground()
        }
    }

    func refreshAppearanceForColorScheme(_ colorScheme: ColorScheme) {
        guard case let .image(fileName, tintHex) = activeBackground else { return }
        guard tintHex != nil else {
            guard let image = loadPlatformImage(fileName: fileName) else { return }
            let rawTint = HarvousWallpaperImageProcessor.sampleAverageHex(from: image)
            activeBackground = .image(fileName: fileName, tintHex: rawTint)
            persistActiveBackground()
            if savedWallpaper?.fileName == fileName {
                savedWallpaper?.tintHex = rawTint
                persistSavedWallpaper()
            }
            _ = HarvousWallpaperImageProcessor.tintForAppearance(rawTint, colorScheme: colorScheme)
            return
        }
        _ = HarvousWallpaperImageProcessor.tintForAppearance(tintHex!, colorScheme: colorScheme)
    }

    var hasSavedWallpaper: Bool {
        guard let saved = savedWallpaper else { return false }
        return FileManager.default.fileExists(atPath: Self.wallpapersDirectory.appendingPathComponent(saved.fileName).path)
    }

    // MARK: - Resolved canvas

    private func resolvedBackground(for colorScheme: ColorScheme) -> HarvousCanvasBackground? {
        guard let active = activeBackground else { return nil }
        for preset in HarvousAppearancePreset.catalog where preset.matches(active) {
            return preset.applyStoredValue(for: colorScheme)
        }
        return active
    }

    /// Stable identity for SwiftUI canvas invalidation when presets / wallpaper change.
    func canvasVisualIdentity(for colorScheme: ColorScheme) -> String {
        switch resolvedBackground(for: colorScheme) {
        case nil:
            return "default-\(colorScheme == .dark ? "dark" : "light")"
        case let .color(hex):
            return "color-\(hex)-\(colorScheme == .dark ? "dark" : "light")"
        case let .image(fileName, tintHex):
            return "image-\(fileName)-\(tintHex ?? "none")-\(colorScheme == .dark ? "dark" : "light")"
        }
    }

    func canvasColor(for colorScheme: ColorScheme) -> Color {
        switch resolvedBackground(for: colorScheme) {
        case nil:
            return HarvousAppearanceColors.defaultCanvasColor(for: colorScheme)
        case let .color(hex):
            return Color(hex: hex) ?? HarvousAppearanceColors.defaultCanvasColor(for: colorScheme)
        case let .image(_, tintHex):
            let hex = tintHex.map { HarvousWallpaperImageProcessor.tintForAppearance($0, colorScheme: colorScheme) }
                ?? HarvousAppearanceColors.defaultCanvasHex(for: colorScheme)
            return Color(hex: hex) ?? HarvousAppearanceColors.defaultCanvasColor(for: colorScheme)
        }
    }

    func canvasImageURL() -> URL? {
        guard case let .image(fileName, _) = activeBackground else { return nil }
        let url = Self.wallpapersDirectory.appendingPathComponent(fileName)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    func glassTint(for colorScheme: ColorScheme) -> Color {
        canvasColor(for: colorScheme)
    }

    func isPhotoSelected(_ background: HarvousCanvasBackground? = nil) -> Bool {
        (background ?? activeBackground)?.isImage == true
    }

    // MARK: - Files

    static var wallpapersDirectory: URL {
        let fm = FileManager.default
        let base = (try? fm.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )) ?? fm.temporaryDirectory
        let dir = base.appendingPathComponent("Harvous/wallpapers", isDirectory: true)
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    func loadPlatformImage(fileName: String) -> HarvousPlatformImage? {
        let url = Self.wallpapersDirectory.appendingPathComponent(fileName)
        #if os(macOS)
        return NSImage(contentsOf: url)
        #else
        guard let data = try? Data(contentsOf: url) else { return nil }
        return UIImage(data: data)
        #endif
    }

    func savedWallpaperThumbnail() -> HarvousPlatformImage? {
        guard let saved = savedWallpaper else { return nil }
        return loadPlatformImage(fileName: saved.fileName)
    }
}

enum HarvousAppearanceError: LocalizedError {
    case imageTooLarge
    case processingFailed

    var errorDescription: String? {
        switch self {
        case .imageTooLarge: return "Image is too large. Please pick one under 3 MB."
        case .processingFailed: return "Couldn't process that image. Please try another."
        }
    }
}

// MARK: - Image processing

#if os(macOS)
typealias HarvousPlatformImage = NSImage
#else
typealias HarvousPlatformImage = UIImage
#endif

enum HarvousWallpaperImageProcessor {
    struct OptimizedImage {
        let image: HarvousPlatformImage
        let jpegData: Data
    }

    static func optimize(_ source: HarvousPlatformImage) throws -> OptimizedImage {
        #if os(macOS)
        guard let cg = source.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            throw HarvousAppearanceError.processingFailed
        }
        let resized = resize(cgImage: cg, maxEdge: HarvousAppearanceLimits.maxImageEdge)
        let rep = NSBitmapImageRep(cgImage: resized)
        guard let jpeg = rep.representation(using: .jpeg, properties: [.compressionFactor: HarvousAppearanceLimits.jpegQuality]) else {
            throw HarvousAppearanceError.processingFailed
        }
        let image = NSImage(data: jpeg) ?? source
        return OptimizedImage(image: image, jpegData: jpeg)
        #else
        let uiImage = flattenToSDR(source, maxEdge: HarvousAppearanceLimits.maxImageEdge)
        guard let jpeg = uiImage.jpegData(compressionQuality: HarvousAppearanceLimits.jpegQuality) else {
            throw HarvousAppearanceError.processingFailed
        }
        return OptimizedImage(image: uiImage, jpegData: jpeg)
        #endif
    }

    #if os(iOS)
    /// Rasterize through an explicit SDR context so iPhone HDR / gain-map photos don't log
    /// `HDRImageConverter … Missing gain map` when used as wallpaper.
    private static func flattenToSDR(_ source: UIImage, maxEdge: CGFloat) -> UIImage {
        let pixelW = source.size.width * source.scale
        let pixelH = source.size.height * source.scale
        let largest = max(pixelW, pixelH)
        let scale = largest > maxEdge ? maxEdge / largest : 1
        let targetSize = CGSize(
            width: max(1, (pixelW * scale).rounded(.toNearestOrAwayFromZero)),
            height: max(1, (pixelH * scale).rounded(.toNearestOrAwayFromZero))
        )
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        if #available(iOS 17.0, *) {
            format.preferredRange = .standard
        }
        let renderer = UIGraphicsImageRenderer(size: targetSize, format: format)
        return renderer.image { _ in
            source.draw(in: CGRect(origin: .zero, size: targetSize))
        }
    }
    #endif

    private static func resize(cgImage: CGImage, maxEdge: CGFloat) -> CGImage {
        let w = CGFloat(cgImage.width)
        let h = CGFloat(cgImage.height)
        let largest = max(w, h)
        let scale = largest > maxEdge ? maxEdge / largest : 1
        let targetW = max(1, Int((w * scale).rounded()))
        let targetH = max(1, Int((h * scale).rounded()))
        guard let ctx = CGContext(
            data: nil,
            width: targetW,
            height: targetH,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return cgImage }
        ctx.interpolationQuality = .medium
        ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: targetW, height: targetH))
        return ctx.makeImage() ?? cgImage
    }

    static func sampleAverageHex(from image: HarvousPlatformImage) -> String {
        #if os(macOS)
        guard let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            return HarvousAppearanceColors.defaultCanvasHex(for: .light)
        }
        #else
        guard let cg = image.cgImage else { return HarvousAppearanceColors.defaultCanvasHex(for: .light) }
        #endif
        let edge = 32
        let sample = resize(cgImage: cg, maxEdge: CGFloat(edge))
        guard let ctx = CGContext(
                  data: nil,
                  width: edge,
                  height: edge,
                  bitsPerComponent: 8,
                  bytesPerRow: 0,
                  space: CGColorSpaceCreateDeviceRGB(),
                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
              )
        else { return HarvousAppearanceColors.defaultCanvasHex(for: .light) }

        ctx.draw(sample, in: CGRect(x: 0, y: 0, width: edge, height: edge))
        guard let data = ctx.data else { return HarvousAppearanceColors.defaultCanvasHex(for: .light) }
        let ptr = data.bindMemory(to: UInt8.self, capacity: edge * edge * 4)
        var r: Int = 0, g: Int = 0, b: Int = 0, n: Int = 0
        for i in stride(from: 0, to: edge * edge * 4, by: 4) {
            let alpha = ptr[i + 3]
            if alpha < 16 { continue }
            r += Int(ptr[i])
            g += Int(ptr[i + 1])
            b += Int(ptr[i + 2])
            n += 1
        }
        guard n > 0 else { return HarvousAppearanceColors.defaultCanvasHex(for: .light) }
        return rgbHex(r / n, g / n, b / n)
    }

    static func tintForAppearance(_ hex: String, colorScheme: ColorScheme) -> String {
        let target = HarvousAppearanceColors.defaultCanvasHex(for: colorScheme)
        return blendHex(hex, target, amount: 0.8)
    }

    private static func rgbHex(_ r: Int, _ g: Int, _ b: Int) -> String {
        String(format: "#%02x%02x%02x", r, g, b)
    }

    private static func blendHex(_ from: String, _ to: String, amount: Double) -> String {
        guard let a = parseHexRgb(from), let b = parseHexRgb(to) else { return to }
        let t = min(1, max(0, amount))
        return rgbHex(
            Int(Double(a.r) + Double(b.r - a.r) * t),
            Int(Double(a.g) + Double(b.g - a.g) * t),
            Int(Double(a.b) + Double(b.b - a.b) * t)
        )
    }

    private static func parseHexRgb(_ hex: String) -> (r: Int, g: Int, b: Int)? {
        var raw = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.hasPrefix("#") { raw.removeFirst() }
        guard raw.count == 6, let value = Int(raw, radix: 16) else { return nil }
        return ((value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF)
    }
}

// MARK: - Color hex

extension Color {
    init?(hex: String) {
        var raw = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.hasPrefix("#") { raw.removeFirst() }
        guard raw.count == 6, let value = Int(raw, radix: 16) else { return nil }
        let r = Double((value >> 16) & 0xFF) / 255
        let g = Double((value >> 8) & 0xFF) / 255
        let b = Double(value & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
