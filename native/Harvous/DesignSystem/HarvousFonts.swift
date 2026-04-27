import Foundation
import SwiftUI

#if os(macOS)
import AppKit
#elseif os(iOS)
import UIKit
#endif

/// SF Pro everywhere; **rounded** for display, note titles, and in-editor headings for a slightly warmer, casual feel.
enum HarvousFontDesign: Sendable {
    case `default`
    case rounded
}

enum HarvousFonts {
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

    // MARK: - AppKit / UIKit (body, pills, `NSTextView`, appearances)

    #if os(macOS)
    static func system(size: CGFloat, weight axis: CGFloat = 400, design: HarvousFontDesign = .default) -> NSFont {
        let w = nsWeight(fromAxis: axis)
        let base = NSFont.systemFont(ofSize: size, weight: w)
        guard design == .rounded else { return base }
        guard let roundedDesc = base.fontDescriptor.withDesign(.rounded) else { return base }
        return NSFont(descriptor: roundedDesc, size: size) ?? base
    }

    /// Paragraph headings in the rich editor — rounded. Levels 2…4 only: the note title field is the sole display “H1”
    /// (`HarvousTypography.composeTitleField`, 22pt); body headings sit clearly below it.
    static func headingFont(level: Int) -> NSFont {
        let lv = max(2, min(level, 4))
        let spec: (CGFloat, CGFloat) = switch lv {
        case 2: (19, 600) // largest in-body section heading
        case 3: (17, 560)
        case 4: (15, 520)
        default: (15, 500)
        }
        return system(size: spec.0, weight: spec.1, design: .rounded)
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
        if abs(ps - 15) < 0.85 && w >= 7 { return 4 }
        return nil
    }

    private static func headingFontsMatchForDetection(_ a: NSFont, _ b: NSFont) -> Bool {
        abs(a.pointSize - b.pointSize) < 0.9 &&
            abs(NSFontManager.shared.weight(of: a) - NSFontManager.shared.weight(of: b)) < 3
    }

    #elseif os(iOS)
    static func system(size: CGFloat, weight axis: CGFloat = 400, design: HarvousFontDesign = .default) -> UIFont {
        let w = uiWeight(fromAxis: axis)
        let base = UIFont.systemFont(ofSize: size, weight: w)
        guard design == .rounded else { return base }
        guard let roundedDesc = base.fontDescriptor.withDesign(.rounded) else { return base }
        return UIFont(descriptor: roundedDesc, size: size)
    }
    #endif

    // MARK: - SwiftUI

    static func font(size: CGFloat, weight axis: CGFloat, design: HarvousFontDesign = .default) -> Font {
        let fw = fontWeight(fromAxis: axis)
        let d: Font.Design = design == .rounded ? .rounded : .default
        return Font.system(size: size, weight: fw, design: d)
    }

    static func font(size: CGFloat, weight: Font.Weight, design: HarvousFontDesign = .default) -> Font {
        let d: Font.Design = design == .rounded ? .rounded : .default
        return Font.system(size: size, weight: weight, design: d)
    }
}
