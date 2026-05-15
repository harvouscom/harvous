import SwiftUI

// MARK: - Scroll-content height measurement

/// Propagates the natural height of scroll content up to the enclosing ScrollView so docks can size
/// themselves to content rather than always filling the max-height cap.
struct DockScrollContentHeightKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

/// Propagates the `ScripturePassageView` frame (in the named `scripture-dock-expanded-body` coordinate
/// space) up to `ActiveScripturePillDock` so the selection overlay can convert passage-local rects into
/// expanded-body-local positions — escaping the ScrollView clip.
struct PassageFrameInBodyKey: PreferenceKey {
    static let defaultValue: CGRect = .zero
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) {
        let n = nextValue()
        if n != .zero { value = n }
    }
}

// MARK: - Layout constants

/// Layout for expandable scripture-passage / highlight-detail regions inside pill and highlight docks.
enum HarvousDockExpandedContentLayout {
    /// Applied when viewport-based height isn’t injected (fallback).
    #if os(iOS)
    static let fallbackMaxScrollHeight: CGFloat = 420
    #else
    static let fallbackMaxScrollHeight: CGFloat = 320
    #endif

    /// Clamp scroll region for dock passage/details.
    /// - iOS: taller cap so expanded docks read more passage/thread detail before scrolling (`min(500, …)`).
    /// - macOS: `min(360, max(200, viewport * 0.45))`.
    static func expandedScrollMaxHeight(viewportHeight: CGFloat) -> CGFloat {
        let v = max(viewportHeight, 1)
        #if os(iOS)
        return min(500, max(200, v * 0.53))
        #else
        return min(360, max(200, v * 0.45))
        #endif
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
