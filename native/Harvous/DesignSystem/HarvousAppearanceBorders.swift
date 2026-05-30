import SwiftUI

/// Canvas-tinted control borders — keep alphas in sync with `spa/src/styles/prototype-tokens.css`
/// (`--pds-border-control*` relative to `--pds-canvas-bg`).
enum HarvousAppearanceBorders {
    enum Weight {
        case control
        case medium
        case soft
    }

    static func color(
        weight: Weight,
        canvasColor: Color,
        isPhotoWallpaper: Bool,
        colorScheme: ColorScheme
    ) -> Color {
        if isPhotoWallpaper {
            let base = Color.primary
            switch weight {
            case .soft:
                return base.opacity(colorScheme == .dark ? 0.08 : 0.06)
            case .control:
                return base.opacity(colorScheme == .dark ? 0.14 : 0.10)
            case .medium:
                return base.opacity(colorScheme == .dark ? 0.18 : 0.12)
            }
        }

        switch weight {
        case .soft:
            return canvasColor.opacity(colorScheme == .dark ? 0.26 : 0.20)
        case .control:
            return canvasColor.opacity(colorScheme == .dark ? 0.34 : 0.28)
        case .medium:
            return canvasColor.opacity(colorScheme == .dark ? 0.38 : 0.32)
        }
    }

    static func keycapBorder(
        canvasColor: Color,
        isPhotoWallpaper: Bool,
        colorScheme: ColorScheme,
        compact: Bool
    ) -> Color {
        color(
            weight: compact ? .medium : .control,
            canvasColor: canvasColor,
            isPhotoWallpaper: isPhotoWallpaper,
            colorScheme: colorScheme
        )
    }

    static func keycapShadow(
        canvasColor: Color,
        isPhotoWallpaper: Bool,
        colorScheme: ColorScheme
    ) -> Color {
        color(
            weight: .soft,
            canvasColor: canvasColor,
            isPhotoWallpaper: isPhotoWallpaper,
            colorScheme: colorScheme
        )
    }
}
