import SwiftUI

/// Layout for expandable scripture-passage / highlight-detail regions inside pill and highlight docks.
enum HarvousDockExpandedContentLayout {
    /// Applied when viewport-based height isn’t injected (fallback).
    static let fallbackMaxScrollHeight: CGFloat = 320

    /// Clamp scroll region for dock passage/details: `min(360, max(200, viewport * 0.45))`.
    static func expandedScrollMaxHeight(viewportHeight: CGFloat) -> CGFloat {
        let v = max(viewportHeight, 1)
        return min(360, max(200, v * 0.45))
    }
}

private struct HarvousDockExpandedContentMaxHeightKey: EnvironmentKey {
    static let defaultValue: CGFloat = HarvousDockExpandedContentLayout.fallbackMaxScrollHeight
}

extension EnvironmentValues {
    /// Max height for ScrollView-backed passage/detail inside `ActiveScripturePillDock` / `ActiveHighlightDock`.
    var harvousDockExpandedContentMaxHeight: CGFloat {
        get { self[HarvousDockExpandedContentMaxHeightKey.self] }
        set { self[HarvousDockExpandedContentMaxHeightKey.self] = newValue }
    }
}
