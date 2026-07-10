import SwiftUI
#if os(macOS)
import AppKit
#elseif os(iOS) || os(tvOS) || os(visionOS)
import UIKit
#endif

extension Color {
    // MARK: - Brand accent
    /// Harvous blue — set as the app's .tint everywhere possible
    static let harvousAccent = Color(red: 0.22, green: 0.41, blue: 0.90)

    // MARK: - Semantic status
    /// Destructive / error actions (delete, irreversible removal). Backed by the
    /// system dynamic red so it stays light/dark + accessibility aware. Use this
    /// instead of raw `.red` so the destructive hue is tunable in one place.
    /// See `docs/design-parity/HARVOUS_BUILD_CONVENTIONS.md`.
    static let harvousDestructive = Color.red
    /// Non-blocking warning / attention states (failed sync awaiting retry, soft
    /// alerts). Backed by the system dynamic orange. Use instead of raw `.orange`.
    static let harvousWarning = Color.orange
    /// Positive confirmation / success states. Backed by system dynamic green.
    static let harvousSuccess = Color.green
    /// Informational callouts (read-only, tips). Backed by system dynamic blue.
    static let harvousInfo = Color.blue

    // MARK: - Thread palette (OKLCH pastels, approximated in sRGB)
    static let threadBlue   = Color(red: 0.76, green: 0.89, blue: 1.00)
    static let threadYellow = Color(red: 0.98, green: 0.87, blue: 0.47)
    static let threadGreen  = Color(red: 0.78, green: 0.93, blue: 0.73)
    static let threadPink   = Color(red: 0.97, green: 0.81, blue: 0.93)
    static let threadOrange = Color(red: 0.99, green: 0.85, blue: 0.63)
    static let threadPurple = Color(red: 0.91, green: 0.79, blue: 1.00)

    static func thread(_ key: String) -> Color? {
        switch key {
        case "blue":   return .threadBlue
        case "yellow": return .threadYellow
        case "green":  return .threadGreen
        case "pink":   return .threadPink
        case "orange": return .threadOrange
        case "purple": return .threadPurple
        default:       return nil
        }
    }

    /// Saturated foreground for glyphs/icons on `thread(_:)` pastel fills (toolbar avatar, etc.).
    static func threadGlyph(_ key: String) -> Color? {
        switch key {
        case "blue":   return harvousAccent
        case "yellow": return Color(red: 0.62, green: 0.48, blue: 0.05)
        case "green":  return Color(red: 0.18, green: 0.52, blue: 0.22)
        case "pink":   return Color(red: 0.58, green: 0.18, blue: 0.48)
        case "orange": return Color(red: 0.72, green: 0.38, blue: 0.06)
        case "purple": return Color(red: 0.42, green: 0.22, blue: 0.72)
        default:       return nil
        }
    }
}

enum HarvousColors {
    enum ThemeVariant: String, CaseIterable, Identifiable {
        case blue
        case purple
        case teal
        case green
        case orange
        case rose
        case indigo

        var id: String { rawValue }

        var pickerLabel: String {
            switch self {
            case .blue: return "Blue"
            case .purple: return "Purple"
            case .teal: return "Teal"
            case .green: return "Green"
            case .orange: return "Orange"
            case .rose: return "Rose"
            case .indigo: return "Indigo"
            }
        }
    }

    enum ChipVariant {
        case scripture
    }

    /// sRGB components for scripture pills and matching toolbar accents.
    private static func themeBaseRGB(_ variant: ThemeVariant) -> (CGFloat, CGFloat, CGFloat) {
        switch variant {
        case .blue: return (0.0, 0.48, 1.0)
        case .purple: return (0.55, 0.27, 0.92)
        case .teal: return (0.0, 0.58, 0.62)
        case .green: return (0.20, 0.62, 0.35)
        case .orange: return (0.95, 0.45, 0.10)
        case .rose: return (0.90, 0.28, 0.40)
        case .indigo: return (0.29, 0.32, 0.75)
        }
    }

    static func themeAccent(_ variant: ThemeVariant) -> Color {
        let (r, g, b) = themeBaseRGB(variant)
        return Color(red: Double(r), green: Double(g), blue: Double(b))
    }

    static func themePressedBackground(_ variant: ThemeVariant) -> Color {
        themeAccent(variant).opacity(0.18)
    }

    static func themeActiveBackground(_ variant: ThemeVariant) -> Color {
        themeAccent(variant).opacity(0.12)
    }

    static func themeToolbarBackground(_ variant: ThemeVariant) -> Color {
        themeAccent(variant).opacity(0.18)
    }

    // MARK: - Platform colors (inline scripture attachments)

    #if os(macOS)
    static func nsScriptureAccent(_ theme: ThemeVariant) -> NSColor {
        let (r, g, b) = themeBaseRGB(theme)
        return NSColor(calibratedRed: r, green: g, blue: b, alpha: 1)
    }

    /// Neutral default for scripture pills when the user hasn't picked a per-pill accent. Deliberately
    /// independent of the space theme so pills don't automatically tint.
    static let nsScripturePillNeutralAccent: NSColor = NSColor(calibratedHue: 0.62, saturation: 0.22, brightness: 0.52, alpha: 1)
    #elseif os(iOS) || os(tvOS) || os(visionOS)
    static func uiScriptureAccent(_ theme: ThemeVariant) -> UIColor {
        let (r, g, b) = themeBaseRGB(theme)
        return UIColor(red: r, green: g, blue: b, alpha: 1)
    }

    /// Neutral default for scripture pills when no per-pill accent is set. Dark-mode agnostic hue.
    static let uiScripturePillNeutralAccent: UIColor = UIColor(hue: 0.62, saturation: 0.22, brightness: 0.52, alpha: 1)
    #endif

    // MARK: - Scripture chip (SwiftUI)

    private static func scriptureDayProgress(now: Date = Date()) -> CGFloat {
        let hour = Calendar.current.component(.hour, from: now)
        return CGFloat(hour) / 23
    }

    static func scriptureChipForeground(_ theme: ThemeVariant) -> Color {
        themeAccent(theme)
    }

    static func scriptureChipBackground(_ theme: ThemeVariant) -> Color {
        themeAccent(theme).opacity(0.075)
    }

    static func scriptureChipGradientTop(_ theme: ThemeVariant) -> Color {
        themeAccent(theme).opacity(0.10)
    }

    static func scriptureChipGradientBottom(_ theme: ThemeVariant) -> Color {
        themeAccent(theme).opacity(0.065)
    }

    static func scriptureChipBorder(_ theme: ThemeVariant) -> Color {
        themeAccent(theme).opacity(0.2)
    }

    /// Subtle "sun path" drift: morning light starts from the left side, then moves right by evening.
    static func scriptureChipGradientStartPoint(_ theme: ThemeVariant) -> UnitPoint {
        let progress = scriptureDayProgress()
        let x = 0.35 + (0.30 * progress)
        return UnitPoint(x: x, y: 0.0)
    }

    static func scriptureChipGradientEndPoint(_ theme: ThemeVariant) -> UnitPoint {
        let progress = scriptureDayProgress()
        let x = 0.35 + (0.30 * progress)
        return UnitPoint(x: x, y: 1.0)
    }

    /// Legacy: scripture styling without a space theme (defaults to blue).
    static func chipForeground(_ variant: ChipVariant) -> Color {
        switch variant {
        case .scripture: return scriptureChipForeground(.blue)
        }
    }

    static func chipBackground(_ variant: ChipVariant) -> Color {
        switch variant {
        case .scripture: return scriptureChipBackground(.blue)
        }
    }

    static func chipGradientTop(_ variant: ChipVariant) -> Color {
        switch variant {
        case .scripture: return scriptureChipGradientTop(.blue)
        }
    }

    static func chipGradientBottom(_ variant: ChipVariant) -> Color {
        switch variant {
        case .scripture: return scriptureChipGradientBottom(.blue)
        }
    }

    static func chipBorder(_ variant: ChipVariant) -> Color {
        switch variant {
        case .scripture: return scriptureChipBorder(.blue)
        }
    }

    static func chipGradientStartPoint(_ variant: ChipVariant) -> UnitPoint {
        switch variant {
        case .scripture: return scriptureChipGradientStartPoint(.blue)
        }
    }

    static func chipGradientEndPoint(_ variant: ChipVariant) -> UnitPoint {
        switch variant {
        case .scripture: return scriptureChipGradientEndPoint(.blue)
        }
    }

    // Backward-compatible scripture aliases (blue only).
    static var scripturePillForeground: Color { chipForeground(.scripture) }
    static var scripturePillBackground: Color { chipBackground(.scripture) }
    static var scripturePillGradientTop: Color { chipGradientTop(.scripture) }
    static var scripturePillGradientBottom: Color { chipGradientBottom(.scripture) }
    static var scripturePillBorder: Color { chipBorder(.scripture) }
    static var scripturePillGradientStartPoint: UnitPoint { chipGradientStartPoint(.scripture) }
    static var scripturePillGradientEndPoint: UnitPoint { chipGradientEndPoint(.scripture) }
}

// MARK: - Space scripture theme (SwiftUI environment)

private struct HarvousScriptureThemeKey: EnvironmentKey {
    static let defaultValue: HarvousColors.ThemeVariant = .blue
}

extension EnvironmentValues {
    var harvousScriptureTheme: HarvousColors.ThemeVariant {
        get { self[HarvousScriptureThemeKey.self] }
        set { self[HarvousScriptureThemeKey.self] = newValue }
    }
}
