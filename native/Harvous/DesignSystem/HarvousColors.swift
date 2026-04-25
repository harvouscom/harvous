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
}

extension Color {
    // MARK: - Warm paper surfaces
    /// Main list column background — warm off-white (≈ oklch 93% 0.012 85)
    static let surfacePaper     = Color(red: 0.97, green: 0.95, blue: 0.92)
    /// Editor surface — slightly lighter / warmer than paper
    static let surfaceElevated  = Color(red: 0.99, green: 0.98, blue: 0.97)
    /// Inset / recessed surface — slightly darker than paper
    static let surfaceInset     = Color(red: 0.93, green: 0.91, blue: 0.88)

    // MARK: - Warm ink hierarchy
    static let inkPrimary       = Color(red: 0.14, green: 0.12, blue: 0.10)
    static let inkSecondary     = Color(red: 0.44, green: 0.40, blue: 0.36)
    static let inkTertiary      = Color(red: 0.62, green: 0.58, blue: 0.54)
    static let inkQuaternary    = Color(red: 0.76, green: 0.72, blue: 0.68)

    // MARK: - Warm separator
    static let separatorWarm    = Color(red: 0.85, green: 0.82, blue: 0.78)
}

enum HarvousColors {
    static func thread(_ key: String) -> Color? { Color.thread(key) }
}
