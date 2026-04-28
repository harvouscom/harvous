import SwiftUI

extension Color {
    // MARK: - Brand accent
    /// Harvous blue — set as the app's .tint everywhere possible
    static let harvousAccent = Color(red: 0.22, green: 0.41, blue: 0.90)

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
    static func thread(_ key: String) -> Color? { Color.thread(key) }
    static func threadGlyph(_ key: String) -> Color? { Color.threadGlyph(key) }

    /// Aligned with `ScripturePillAttachment` (system blue, soft fill, hairline stroke) — use SwiftUI `Color` only.
    static var scripturePillForeground: Color { .blue }
    static var scripturePillBackground: Color { Color.blue.opacity(0.08) }
    static var scripturePillBorder: Color { Color.blue.opacity(0.2) }
}
