import SwiftUI

extension Color {
    // Brand
    static let harvousAccent = Color(red: 0.22, green: 0.41, blue: 0.90)   // bold blue

    // Thread palette — approximates the OKLCH pastels from the web design system
    static let threadBlue   = Color(red: 0.76, green: 0.89, blue: 1.00)
    static let threadYellow = Color(red: 0.98, green: 0.87, blue: 0.47)
    static let threadGreen  = Color(red: 0.78, green: 0.93, blue: 0.73)
    static let threadPink   = Color(red: 0.97, green: 0.81, blue: 0.93)
    static let threadOrange = Color(red: 0.99, green: 0.85, blue: 0.63)
    static let threadPurple = Color(red: 0.91, green: 0.79, blue: 1.00)

    // Surface hierarchy
    static var surfacePrimary: Color   { Color(nsColor: .windowBackgroundColor) }
    static var surfaceSecondary: Color { Color(nsColor: .controlBackgroundColor) }

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

// MARK: - NSColor helpers (macOS only — compile guards in callers)

enum HarvousColors {
    static func thread(_ key: String) -> Color? { Color.thread(key) }
}
