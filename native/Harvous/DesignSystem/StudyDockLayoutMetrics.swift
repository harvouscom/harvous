import CoreGraphics
import SwiftUI

/// Layout constants shared with web study dock CSS (`--study-dock-max-width`).
enum StudyDockLayoutMetrics {
    /// Paper 720pt + 12pt overhang × 2 + 24pt chrome = 768pt (`study-dock-card.css`).
    static let maxCardWidth: CGFloat = 768

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
