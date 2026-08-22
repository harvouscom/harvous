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
    /// Anything that floats over the page: menus, cards, and the selection bars.
    /// Mirrors web `--pds-radius-menu`. Same number as `button` by coincidence, not by
    /// meaning — a surface and a control are different things and should be able to diverge.
    static let floatingSurface: CGFloat = 12
    /// An icon target inside a floating surface. Mirrors web `--pds-radius-row`.
    /// A 12pt surface holding 10pt tiles wants 2pt of side padding for concentric corners —
    /// see `SelectionActionBar`.
    static let floatingTile: CGFloat = 10
    /// macOS sidebar: **bottom** leading corner radius (split side stays square; top leading stays 0 for title bar). Tune vs system chrome.
    static let sidebarGlassLeading: CGFloat = 16
}

/// 4pt spacing scale — mirrors web `--pds-space-*`. Prefer these over ad-hoc paddings.
enum HarvousSpacing {
    static let space1: CGFloat = 4
    static let space2: CGFloat = 8
    static let space3: CGFloat = 12
    static let space4: CGFloat = 16
    static let space5: CGFloat = 20
    static let space6: CGFloat = 24
    static let space8: CGFloat = 32
    static let space10: CGFloat = 40
    static let space12: CGFloat = 48
}

/// Icon edge sizes — mirrors web `--pds-icon-*`.
enum HarvousIconSize {
    static let xs: CGFloat = 11
    static let sm: CGFloat = 14
    static let md: CGFloat = 18
    static let lg: CGFloat = 28
    static let xl: CGFloat = 40
}

/// iOS home / library / scripture / highlight feeds: `listRowInsets` horizontal edge plus interior padding keeps row titles aligned across surfaces.
enum HarvousFeedListLayout {
    static let listRowHorizontalInset: CGFloat = 14
    static let interiorContentHPadding: CGFloat = 10
    /// Sidebar compact rows: vertical gap between list cells (`listRowInsets` top + bottom).
    static let sidebarListRowInsetVertical: CGFloat = 2
    /// Sidebar compact rows: padding outside feed-row interior padding (selection pill extent).
    static let sidebarRowContentVInset: CGFloat = 0
    static let sidebarRowContentHInset: CGFloat = 10
}

/// Bible reader canvas geometry — mirrored by `--pds-reader-*` on web.
enum HarvousReaderLayout {
    /// Comfortable reading measure. Wider than this and the eye loses the line return.
    static let measure: CGFloat = 620
    /// Left gutter reserved for margin note notifiers. Always reserved, even with no
    /// notes on screen, so text does not reflow when the first note lands.
    static let marginGutter: CGFloat = 28
    /// Single-note notifier dot.
    static let notifierDotSize: CGFloat = 7
    /// Multi-note notifier capsule width (dots stack vertically inside).
    static let notifierCapsuleWidth: CGFloat = 15
    /// Vertical gap between paragraph blocks in the reading canvas.
    static let paragraphSpacing: CGFloat = 18
}

/// Typography / fill tuning for raster + SwiftUI scripture pills (keep in sync across surfaces).
enum HarvousScripturePillStyle {
    /// Softer than full `label` so reference + translation read as part of the tinted chip.
    static let labelOpacity: CGFloat = 0.70
    /// Inline TextKit editor pills — full opacity to match live body prose (web prototype parity).
    static let labelOpacityInlineEditor: CGFloat = 1.0
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
