import Foundation
import SwiftUI
import CoreText

#if os(macOS)
import AppKit
#elseif os(iOS)
import UIKit
#endif

/// Google Sans Flex everywhere; rounded terminal axis for display/title styles.
enum HarvousFontDesign: Sendable {
    case `default`
    case rounded
}

enum HarvousFonts {
    private static let googleSansFlexPostScriptName = "GoogleSansFlex-Regular"
    private static let roundedAxisValue: CGFloat = 100
    private static let defaultAxisValue: CGFloat = 0

    /// Default note compose body (before Dynamic Type / Larger Text scaling). iOS +1pt for legibility on smaller screens.
    static let noteComposeBodyPointSize: CGFloat = {
#if os(iOS)
        17
#else
        16
#endif
    }()

    /// Compose title baseline (before accessibility scaling); must stay in proportion with `noteComposeBodyPointSize`.
    static var composeTitleReferencePointSize: CGFloat {
#if os(iOS)
        23
#else
        22
#endif
    }

#if os(iOS)
    private static let noteComposeMetrics = UIFontMetrics(forTextStyle: .body)

    /// Note body in the rich editor — scales with Dynamic Type (anchored to `.body`).
    static func noteComposeBodyUIFont() -> UIFont {
        let base = system(size: noteComposeBodyPointSize, weight: 400, design: .default)
        return noteComposeMetrics.scaledFont(for: base)
    }

    /// Note title `TextField` — same metrics chain as the body so proportions hold at every content size.
    static func noteComposeTitleUIFont() -> UIFont {
        let base = system(size: composeTitleReferencePointSize, weight: 600, design: .rounded)
        return noteComposeMetrics.scaledFont(for: base)
    }

    static func noteComposeBodyPlatformFont() -> UIFont { noteComposeBodyUIFont() }

#elseif os(macOS)
    /// Observed `NSFont.preferredFont(forTextStyle: .body).pointSize` at default macOS text settings (Harvous baseline).
    private static let macOSStandardPreferredBodyPointSize: CGFloat = 13

    private static var macComposeRulerPointSize: CGFloat {
        NSFont.preferredFont(forTextStyle: .body, options: [:]).pointSize
    }

    /// Note body — tracks Larger Text / system body sizing while preserving Harvous proportions vs. a 13pt baseline.
    static func noteComposeBodyNSFont() -> NSFont {
        let ruler = macComposeRulerPointSize
        let size = ruler * (noteComposeBodyPointSize / macOSStandardPreferredBodyPointSize)
        return system(size: size, weight: 400, design: .default)
    }

    static func noteComposeTitleNSFont() -> NSFont {
        let ruler = macComposeRulerPointSize
        let size = ruler * (composeTitleReferencePointSize / macOSStandardPreferredBodyPointSize)
        return system(size: size, weight: 600, design: .rounded)
    }

    static func noteComposeBodyPlatformFont() -> NSFont { noteComposeBodyNSFont() }
#endif

    // MARK: - Axis → platform weight (OpenType-style 100…900)

    #if os(macOS)
    private static func nsWeight(fromAxis w: CGFloat) -> NSFont.Weight {
        switch w {
        case ..<150: return .ultraLight
        case ..<250: return .thin
        case ..<350: return .light
        case ..<450: return .regular
        case ..<550: return .medium
        case ..<650: return .semibold
        case ..<750: return .bold
        case ..<850: return .heavy
        default: return .black
        }
    }

    #elseif os(iOS)
    private static func uiWeight(fromAxis w: CGFloat) -> UIFont.Weight {
        switch w {
        case ..<150: return .ultraLight
        case ..<250: return .thin
        case ..<350: return .light
        case ..<450: return .regular
        case ..<550: return .medium
        case ..<650: return .semibold
        case ..<750: return .bold
        case ..<850: return .heavy
        default: return .black
        }
    }
    #endif

    private static func fontWeight(fromAxis w: CGFloat) -> Font.Weight {
        switch w {
        case ..<150: return .ultraLight
        case ..<250: return .thin
        case ..<350: return .light
        case ..<450: return .regular
        case ..<550: return .medium
        case ..<650: return .semibold
        case ..<750: return .bold
        case ..<850: return .heavy
        default: return .black
        }
    }

    private static func axisTag(_ tag: String) -> NSNumber {
        let scalar = tag.utf8.reduce(0) { ($0 << 8) | UInt32($1) }
        return NSNumber(value: scalar)
    }

    private static func axisSettings(size: CGFloat, weight: CGFloat, design: HarvousFontDesign) -> [NSNumber: NSNumber] {
        [
            axisTag("wght"): NSNumber(value: Double(max(1, min(1000, weight)))),
            axisTag("ROND"): NSNumber(value: Double(design == .rounded ? roundedAxisValue : defaultAxisValue)),
            axisTag("opsz"): NSNumber(value: Double(max(6, min(144, size))))
        ]
    }

    // MARK: - AppKit / UIKit (body, pills, `NSTextView`, appearances)

    #if os(macOS)
    private static func googleSansFlexNSFont(size: CGFloat, weight axis: CGFloat, design: HarvousFontDesign) -> NSFont? {
        let variationKey = NSFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String)
        let attrs: [NSFontDescriptor.AttributeName: Any] = [
            .name: googleSansFlexPostScriptName,
            variationKey: axisSettings(size: size, weight: axis, design: design)
        ]
        let descriptor = NSFontDescriptor(fontAttributes: attrs)
        return NSFont(descriptor: descriptor, size: size)
    }

    static func system(size: CGFloat, weight axis: CGFloat = 400, design: HarvousFontDesign = .default) -> NSFont {
        if let font = googleSansFlexNSFont(size: size, weight: axis, design: design) {
            return font
        }
        let w = nsWeight(fromAxis: axis)
        let base = NSFont.systemFont(ofSize: size, weight: w)
        guard design == .rounded else { return base }
        guard let roundedDesc = base.fontDescriptor.withDesign(.rounded) else { return base }
        return NSFont(descriptor: roundedDesc, size: size) ?? base
    }

    /// Paragraph headings in the rich editor — rounded. Levels 2…3 in the toolbar; level 4 retained for legacy detection only.
    /// (`HarvousTypography.composeTitleFieldFont()`); body headings sit clearly below it.
    static func headingFont(level: Int) -> NSFont {
        let ruler = macComposeRulerPointSize
        let lv = max(2, min(level, 4))
        let spec: (CGFloat, CGFloat) = switch lv {
        case 2: (19, 600) // largest in-body section heading
        case 3: (17, 600)
        case 4: (noteComposeBodyPointSize, 520) // same size as body; weight distinguishes H4
        default: (noteComposeBodyPointSize, 500)
        }
        let size = ruler * (spec.0 / macOSStandardPreferredBodyPointSize)
        return system(size: size, weight: spec.1, design: .rounded)
    }

    /// In-body heading level (2…4) when `font` matches a heading style or legacy saved headings; otherwise `nil`.
    static func bodyHeadingLevel(matching font: NSFont) -> Int? {
        for level in 2...4 {
            let ref = headingFont(level: level)
            if headingFontsMatchForDetection(font, ref) { return level }
        }
        let ps = font.pointSize
        let w = NSFontManager.shared.weight(of: font)
        if abs(ps - 28) < 1.2 { return 2 }
        if abs(ps - 22) < 1.0 && w >= 6 { return 2 }
        if abs(ps - 18) < 1.0 { return 3 }
        // Legacy H4 before body-size H4 (15pt semibold)
        if abs(ps - 15) < 0.85 && w >= 7 { return 4 }
        return nil
    }

    private static func headingFontsMatchForDetection(_ a: NSFont, _ b: NSFont) -> Bool {
        abs(a.pointSize - b.pointSize) < 0.9 &&
            abs(NSFontManager.shared.weight(of: a) - NSFontManager.shared.weight(of: b)) < 3
    }

    #elseif os(iOS)
    private static func googleSansFlexUIFont(size: CGFloat, weight axis: CGFloat, design: HarvousFontDesign) -> UIFont? {
        let variationKey = UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String)
        let attrs: [UIFontDescriptor.AttributeName: Any] = [
            .name: googleSansFlexPostScriptName,
            variationKey: axisSettings(size: size, weight: axis, design: design)
        ]
        let descriptor = UIFontDescriptor(fontAttributes: attrs)
        return UIFont(descriptor: descriptor, size: size)
    }

    static func system(size: CGFloat, weight axis: CGFloat = 400, design: HarvousFontDesign = .default) -> UIFont {
        if let font = googleSansFlexUIFont(size: size, weight: axis, design: design) {
            return font
        }
        let w = uiWeight(fromAxis: axis)
        let base = UIFont.systemFont(ofSize: size, weight: w)
        guard design == .rounded else { return base }
        guard let roundedDesc = base.fontDescriptor.withDesign(.rounded) else { return base }
        return UIFont(descriptor: roundedDesc, size: size)
    }

    /// Same level specs as macOS; sizes scale with Dynamic Type (`.body` metrics) so detection matches persisted notes.
    static func headingFont(level: Int) -> UIFont {
        let lv = max(2, min(level, 4))
        let spec: (CGFloat, CGFloat) = switch lv {
        case 2: (19, 600)
        case 3: (17, 600)
        case 4: (noteComposeBodyPointSize, 520) // same size as body; weight distinguishes H4
        default: (noteComposeBodyPointSize, 500)
        }
        let base = system(size: spec.0, weight: spec.1, design: .rounded)
        return noteComposeMetrics.scaledFont(for: base)
    }

    /// In-body heading level (2…4) — mirrors `bodyHeadingLevel(matching: NSFont)` for UIKit fonts.
    static func bodyHeadingLevel(matching font: UIFont) -> Int? {
        for level in 2...4 {
            let ref = headingFont(level: level)
            if headingFontsMatchForDetectionUIFont(font, ref) { return level }
        }
        let ps = font.pointSize
        let w = uiFontTraitWeightApprox(font)
        if abs(ps - 28) < 1.2 { return 2 }
        if abs(ps - 22) < 1.0 && w >= 600 { return 2 }
        if abs(ps - 18) < 1.0 { return 3 }
        // Legacy H4 before body-size H4 (15pt semibold)
        if abs(ps - 15) < 0.85 && w >= 700 { return 4 }
        return nil
    }

    private static func headingFontsMatchForDetectionUIFont(_ a: UIFont, _ b: UIFont) -> Bool {
        abs(a.pointSize - b.pointSize) < 0.9
            && symbolicTraitsRoughlyMatch(a.fontDescriptor.symbolicTraits, b.fontDescriptor.symbolicTraits)
    }

    private static func symbolicTraitsRoughlyMatch(
        _ x: UIFontDescriptor.SymbolicTraits,
        _ y: UIFontDescriptor.SymbolicTraits
    ) -> Bool {
        let mask: UIFontDescriptor.SymbolicTraits = [.traitBold, .traitItalic]
        return x.intersection(mask) == y.intersection(mask)
    }

    /// Heuristic numeric weight (~100–900) for legacy saved headings; bold flag bumps toward semibold detection.
    private static func uiFontTraitWeightApprox(_ font: UIFont) -> CGFloat {
        if font.fontDescriptor.symbolicTraits.contains(.traitBold) { return 650 }
        return 400
    }
    #endif

    // MARK: - SwiftUI

    static func font(size: CGFloat, weight axis: CGFloat, design: HarvousFontDesign = .default) -> Font {
        #if os(macOS)
        Font(system(size: size, weight: axis, design: design))
        #else
        Font(system(size: size, weight: axis, design: design))
        #endif
    }

    static func font(size: CGFloat, weight: Font.Weight, design: HarvousFontDesign = .default) -> Font {
        let axis: CGFloat
        switch weight {
        case .ultraLight: axis = 100
        case .thin: axis = 200
        case .light: axis = 300
        case .regular: axis = 400
        case .medium: axis = 500
        case .semibold: axis = 600
        case .bold: axis = 700
        case .heavy: axis = 800
        case .black: axis = 900
        default: axis = 400
        }
        return font(size: size, weight: axis, design: design)
    }
}
