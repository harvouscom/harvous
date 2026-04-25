import SwiftUI

enum HarvousRadius {
    static let card:   CGFloat = 16
    static let button: CGFloat = 12
    static let input:  CGFloat = 10
    static let pill:   CGFloat = 999
}

enum HarvousAnimation {
    /// Standard spring — most transitions
    static let spring = Animation.spring(response: 0.3, dampingFraction: 0.7)

    /// Overshoot spring — sheet presents, card appears
    static let snappy = Animation.spring(response: 0.45, dampingFraction: 0.6)
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
