import SwiftUI

/// Study dock card rim — 2pt shell border (`--pds-border` on web).
struct StudyDockShellBorderOverlay: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.harvousGlassTint) private var glassTint
    @Environment(HarvousAppearanceStore.self) private var appearanceStore

    func body(content: Content) -> some View {
        let canvas = glassTint ?? HarvousAppearanceColors.defaultCanvasColor(for: colorScheme)
        let borderColor = HarvousAppearanceBorders.shellBorder(
            canvasColor: canvas,
            isPhotoWallpaper: appearanceStore.isPhotoSelected(),
            colorScheme: colorScheme
        )
        content.overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(borderColor, lineWidth: 2)
                .allowsHitTesting(false)
        )
    }
}

extension View {
    func studyDockShellBorderOverlay() -> some View {
        modifier(StudyDockShellBorderOverlay())
    }
}
