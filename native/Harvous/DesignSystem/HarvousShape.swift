import SwiftUI

enum HarvousRadius {
    static let card:         CGFloat = 20   // "squishier" — up from 16
    static let button:       CGFloat = 12
    static let input:        CGFloat = 10
    static let pill:         CGFloat = 999
    static let scripturePill: CGFloat = 11
    static let rowHighlight: CGFloat = 10   // warm rounded row selection
    static let formatButton: CGFloat = 8    // format toolbar button press
    /// macOS sidebar: **bottom** leading corner radius (split side stays square; top leading stays 0 for title bar). Tune vs system chrome.
    static let sidebarGlassLeading: CGFloat = 16
}

enum HarvousAnimation {
    /// Standard spring — most transitions
    static let spring = Animation.spring(response: 0.32, dampingFraction: 0.72)

    /// Overshoot spring — sheet presents, card appears
    static let snappy = Animation.spring(response: 0.42, dampingFraction: 0.60)

    /// Tactile press — quick snap with slight bounce
    static let press  = Animation.spring(response: 0.22, dampingFraction: 0.55)
}

/// Card shadow — matches the design system 6/2 shadow
struct CardShadow: ViewModifier {
    func body(content: Content) -> some View {
        content
            .shadow(color: .black.opacity(0.06), radius: 8, x: 0, y: 2)
            .shadow(color: .black.opacity(0.03), radius: 2, x: 0, y: 1)
    }
}

extension View {
    func cardShadow() -> some View { modifier(CardShadow()) }
}
