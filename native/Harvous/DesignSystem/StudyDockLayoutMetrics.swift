import CoreGraphics
import SwiftUI

/// Layout constants shared with web study dock CSS (`--study-dock-max-width`).
enum StudyDockLayoutMetrics {
    /// Paper 720pt + 12pt overhang × 2 + 24pt chrome = 768pt (`study-dock-card.css`).
    static let maxCardWidth: CGFloat = 768

    // MARK: - Carousel drag handle (web `study-dock-carousel.css` + `study-dock-layout.ts`)

    /// `.study-dock-card__card` vertical padding (10pt top + bottom).
    static let collapsedCardVerticalPadding: CGFloat = 10
    /// `.study-dock-card__header { min-height: 28px }`.
    static let collapsedHeaderMinHeight: CGFloat = 28
    /// Collapsed card face height — header row + card shell padding (not expanded passage body).
    static var collapsedCardChromeHeight: CGFloat {
        collapsedCardVerticalPadding * 2 + collapsedHeaderMinHeight
    }

    static let carouselDragHandleWidth: CGFloat = 14
    static let carouselDragHandleMinHairlineHeight: CGFloat = 22
    /// Default bottom inset on the expanded active slot handle.
    static let carouselDragHandleBottomPaddingExpanded: CGFloat = 10
    /// Bottom inset on compact / inactive slots (aligns with track shadow gutter).
    static let carouselDragHandleBottomPaddingCompact: CGFloat = 12
    /// Web `.study-dock-carousel__drag-handle::before { width: 2px }`.
    static let carouselDragHandleHairlineWidth: CGFloat = 2

    #if os(macOS)
    /// Leading gutter when the navigation split sidebar is hidden (web track `scroll-padding-inline`).
    static let macCollapsedSidebarLeadingGutter: CGFloat = 16
    /// Trailing reserve when the note inspector column is open (`.inspectorColumnWidth(ideal: 280)`).
    static let macInspectorTrailingReserve: CGFloat = 280
    #endif
}

#if os(macOS)
/// Measured width of the navigation split sidebar column (`SidebarPanelView`).
struct SidebarColumnWidthPreferenceKey: PreferenceKey {
    nonisolated static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}
#endif
