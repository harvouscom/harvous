import SwiftUI

enum HarvousRadius {
    static let card:         CGFloat = 20   // "squishier" — up from 16
    static let button:       CGFloat = 12
    static let input:        CGFloat = 10
    static let pill:         CGFloat = 999
#if os(macOS)
    /// macOS: slightly rounder than iOS for proportional balance with desktop typography.
    static let scripturePill: CGFloat = 14
#else
    static let scripturePill: CGFloat = 11
#endif
    static let rowHighlight: CGFloat = 10   // warm rounded row selection
    static let formatButton: CGFloat = 8    // format toolbar button press
    /// macOS sidebar: **bottom** leading corner radius (split side stays square; top leading stays 0 for title bar). Tune vs system chrome.
    static let sidebarGlassLeading: CGFloat = 16
}

/// iOS home / library / scripture / highlight feeds: `listRowInsets` horizontal edge plus interior padding on row content matches `DailyPassageCard` so titles align with the card copy.
enum HarvousFeedListLayout {
    static let listRowHorizontalInset: CGFloat = 14
    static let interiorContentHPadding: CGFloat = 10
}

/// Typography / fill tuning for raster + SwiftUI scripture pills (keep in sync across surfaces).
enum HarvousScripturePillStyle {
    /// Softer than full `label` so reference + translation read as part of the tinted chip.
    static let labelOpacity: CGFloat = 0.70
    /// Vertical inset inside raster pills; `ScriptureRefChip` matches (mac + iOS).
    static let rasterVerticalInset: CGFloat = 4
#if os(macOS)
    /// Pointer hover on inline editor pills (`NSTextAttachment`) and SwiftUI reference chips.
    static let labelOpacityPointerHover: CGFloat = 1.0
#endif
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
