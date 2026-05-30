import SwiftUI
#if os(iOS)
import UIKit
#endif

// MARK: - Layout

/// macOS / iPad: split sidebar + editor (matches web). iPhone: single-column + bottom chrome hint.
enum HarvousAppearancePreviewShellLayout {
    case macSplit
    case phoneColumn

    static var current: HarvousAppearancePreviewShellLayout {
        #if os(iOS)
        UIDevice.current.userInterfaceIdiom == .phone ? .phoneColumn : .macSplit
        #else
        .macSplit
        #endif
    }
}

// MARK: - Tile

struct HarvousAppearancePreviewTile: View {
    enum GlassMode {
        case preset
        case image
    }

    let label: String
    let selected: Bool
    var canvasColor: Color?
    var thumbnailImage: HarvousPlatformImage?
    var photoEmpty: Bool = false
    var glassMode: GlassMode = .preset
    var shellLayout: HarvousAppearancePreviewShellLayout = .current
    let onSelect: () -> Void

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Button(action: onSelect) {
            VStack(spacing: HarvousAppearancePreviewMetrics.labelGap) {
                ZStack(alignment: .topTrailing) {
                    canvas
                        .frame(
                            width: HarvousAppearancePreviewMetrics.tileWidth,
                            height: HarvousAppearancePreviewMetrics.tileHeight
                        )
                        .clipShape(RoundedRectangle(cornerRadius: HarvousAppearancePreviewMetrics.canvasCornerRadius, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: HarvousAppearancePreviewMetrics.canvasCornerRadius, style: .continuous)
                                .strokeBorder(
                                    selected ? Color.primary.opacity(colorScheme == .dark ? 0.28 : 0.22) : Color.primary.opacity(0.12),
                                    lineWidth: selected ? 1 : 0.5
                                )
                        }
                        .shadow(
                            color: selected ? Color.black.opacity(colorScheme == .dark ? 0.35 : 0.08) : .clear,
                            radius: selected ? 6 : 0,
                            y: selected ? 2 : 0
                        )
                        .opacity(selected ? 1 : 0.65)

                    if selected {
                        checkOrb
                    }
                }

                Text(label)
                    .font(HarvousAppearancePreviewMetrics.labelFont(selected: selected))
                    .foregroundStyle(selected ? Color.primary : Color.secondary)
                    .lineLimit(1)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    @ViewBuilder
    private var canvas: some View {
        if photoEmpty {
            RoundedRectangle(cornerRadius: HarvousAppearancePreviewMetrics.canvasCornerRadius, style: .continuous)
                .fill(Color.secondary.opacity(colorScheme == .dark ? 0.12 : 0.08))
                .overlay {
                    RoundedRectangle(cornerRadius: HarvousAppearancePreviewMetrics.canvasCornerRadius, style: .continuous)
                        .strokeBorder(style: StrokeStyle(lineWidth: 0.5, dash: [4, 3]))
                        .foregroundStyle(Color.secondary.opacity(0.35))
                }
                .overlay {
                    Image(systemName: "photo")
                        .font(.system(size: 18))
                        .foregroundStyle(.tertiary)
                }
        } else {
            GeometryReader { geo in
                ZStack {
                    canvasBackground(size: geo.size)
                    HarvousAppearancePreviewShell(
                        layout: shellLayout,
                        canvasColor: canvasColor ?? HarvousAppearanceColors.defaultCanvasColor(for: colorScheme),
                        glassMode: glassMode,
                        colorScheme: colorScheme
                    )
                    .padding(HarvousAppearancePreviewMetrics.shellPadding(in: geo.size))
                }
            }
        }
    }

    @ViewBuilder
    private func canvasBackground(size: CGSize) -> some View {
        if let thumbnailImage {
            #if os(macOS)
            Image(nsImage: thumbnailImage)
                .resizable()
                .scaledToFill()
                .frame(width: size.width, height: size.height)
                .clipped()
            #else
            Image(uiImage: thumbnailImage)
                .resizable()
                .scaledToFill()
                .frame(width: size.width, height: size.height)
                .clipped()
            #endif
        } else {
            (canvasColor ?? HarvousAppearanceColors.defaultCanvasColor(for: colorScheme))
        }
    }

    private var checkOrb: some View {
        Image(systemName: "checkmark")
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(Color.primary)
            .frame(width: 22, height: 22)
            .background {
                Circle()
                    .fill(checkOrbFill)
                    .overlay {
                        Circle().strokeBorder(Color.primary.opacity(0.12), lineWidth: 0.5)
                    }
                    .shadow(color: Color.black.opacity(0.08), radius: 3, y: 1)
            }
            .padding(5)
    }

    private var checkOrbFill: Color {
        #if os(macOS)
        Color(nsColor: .windowBackgroundColor)
        #else
        Color(uiColor: .systemBackground)
        #endif
    }
}

// MARK: - Metrics (mirrors `proto-appearance-preview*` in prototype-components.css)

private enum HarvousAppearancePreviewMetrics {
    static let tileWidth: CGFloat = 92
    static let tileHeight: CGFloat = tileWidth * 5 / 4
    static let canvasCornerRadius: CGFloat = 10
    static let shellCornerRadius: CGFloat = 5
    static let labelGap: CGFloat = 6
    static let sidebarFraction: CGFloat = 0.28
    static let toolbarFraction: CGFloat = 0.14

    static func shellPadding(in size: CGSize) -> EdgeInsets {
        EdgeInsets(
            top: size.height * 0.12,
            leading: size.width * 0.10,
            bottom: size.height * 0.10,
            trailing: size.width * 0.10
        )
    }

    static func labelFont(selected: Bool) -> Font {
        .system(size: 11, weight: selected ? .semibold : .medium)
    }
}

// MARK: - Mini shell

private struct HarvousAppearancePreviewShell: View {
    let layout: HarvousAppearancePreviewShellLayout
    let canvasColor: Color
    let glassMode: HarvousAppearancePreviewTile.GlassMode
    let colorScheme: ColorScheme

    var body: some View {
        GeometryReader { geo in
            ZStack {
                shellBackground
                shellSheen
                VStack(spacing: 0) {
                    toolbarRow(totalHeight: geo.size.height)
                    bodyRegion(size: geo.size)
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: HarvousAppearancePreviewMetrics.shellCornerRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: HarvousAppearancePreviewMetrics.shellCornerRadius, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.06), lineWidth: 0.5)
        }
        .shadow(color: Color.black.opacity(colorScheme == .dark ? 0.2 : 0.06), radius: 4, y: 1)
    }

    @ViewBuilder
    private var shellBackground: some View {
        switch glassMode {
        case .preset:
            canvasColor.opacity(colorScheme == .dark ? 0.56 : 0.52)
        case .image:
            ZStack {
                #if os(macOS)
                Rectangle().fill(.thinMaterial)
                #else
                if #available(iOS 26.0, *) {
                    Rectangle().fill(.clear).glassEffect(in: Rectangle())
                } else {
                    Rectangle().fill(.ultraThinMaterial)
                }
                #endif
                pageTint.opacity(colorScheme == .dark ? 0.34 : 0.28)
            }
        }
    }

    private var shellSheen: some View {
        LinearGradient(
            colors: [
                Color.white.opacity(colorScheme == .dark ? 0.08 : 0.22),
                Color.white.opacity(colorScheme == .dark ? 0.02 : 0.04),
                Color.clear,
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .allowsHitTesting(false)
    }

    private func toolbarRow(totalHeight: CGFloat) -> some View {
        Rectangle()
            .fill(barFrost)
            .frame(height: totalHeight * HarvousAppearancePreviewMetrics.toolbarFraction)
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(dividerColor)
                    .frame(height: 0.5)
            }
    }

    @ViewBuilder
    private func bodyRegion(size: CGSize) -> some View {
        switch layout {
        case .macSplit:
            HStack(spacing: 0) {
                panelFrost
                    .frame(width: size.width * HarvousAppearancePreviewMetrics.sidebarFraction)
                    .overlay(alignment: .trailing) {
                        Rectangle().fill(dividerColor).frame(width: 0.5)
                    }
                mainColumnPlaceholder
            }
        case .phoneColumn:
            VStack(spacing: 0) {
                mainColumnPlaceholder
                phoneBottomChrome
            }
        }
    }

    private var mainColumnPlaceholder: some View {
        ZStack(alignment: .topLeading) {
            pageTint.opacity(glassMode == .image ? 0.06 : 0.08)
            VStack(alignment: .leading, spacing: 0) {
                Spacer().frame(height: 8)
                placeholderLine(widthRatio: 0.72)
                Spacer().frame(height: 6)
                placeholderLine(widthRatio: 0.48)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var phoneBottomChrome: some View {
        HStack(spacing: 4) {
            Capsule().fill(chromePillFill).frame(width: 12, height: 5)
            Capsule().fill(chromePillFill).frame(maxWidth: .infinity).frame(height: 5)
            Capsule().fill(chromePillFill).frame(width: 12, height: 5)
        }
        .padding(.horizontal, 5)
        .padding(.vertical, 4)
        .background(pageTint.opacity(0.12))
    }

    private func placeholderLine(widthRatio: CGFloat) -> some View {
        Capsule()
            .fill(lineColor)
            .frame(height: 2)
            .frame(maxWidth: HarvousAppearancePreviewMetrics.tileWidth * widthRatio, alignment: .leading)
    }

    private var pageTint: Color {
        colorScheme == .dark ? Color(white: 0.12) : Color(white: 0.99)
    }

    private var barFrost: Color {
        pageTint.opacity(colorScheme == .dark ? 0.55 : 0.5)
    }

    private var panelFrost: Color {
        glassMode == .image
            ? pageTint.opacity(0.1)
            : pageTint.opacity(colorScheme == .dark ? 0.32 : 0.3)
    }

    private var dividerColor: Color {
        glassMode == .image
            ? Color.primary.opacity(0.08)
            : canvasColor.opacity(colorScheme == .dark ? 0.28 : 0.22)
    }

    private var lineColor: Color {
        glassMode == .image
            ? Color.primary.opacity(0.12)
            : canvasColor.opacity(colorScheme == .dark ? 0.38 : 0.32)
    }

    private var chromePillFill: Color {
        Color.primary.opacity(colorScheme == .dark ? 0.14 : 0.1)
    }
}
