import SwiftUI

/// Popover menu rows — native `Menu` / `contextMenu` render SF for item labels on iOS and macOS.
enum HarvousPopoverMenuMetrics {
    static var rowFont: Font {
        #if os(iOS)
        HarvousFonts.font(size: 17, weight: 400, design: .default)
        #else
        HarvousTypography.profileMenuAction
        #endif
    }

    static var minWidth: CGFloat {
        #if os(iOS)
        220
        #else
        196
        #endif
    }
}

struct HarvousPopoverMenuPanel<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            content()
        }
        .frame(minWidth: HarvousPopoverMenuMetrics.minWidth, alignment: .leading)
        .padding(.vertical, 4)
    }
}

struct HarvousPopoverMenuRow: View {
    let title: String
    let iconAsset: String
    var iconTint: Color = .primary
    var titleTint: Color = .primary
    var isSelected: Bool = false
    var role: ButtonRole?
    let action: () -> Void

    var body: some View {
        Button(role: role, action: action) {
            HStack(spacing: 8) {
                HarvousFAGlyph(assetName: iconAsset, edgePt: HarvousFAIconMetrics.menuRowLeadingGlyphPt)
                    .foregroundStyle(iconTint)
                Text(title)
                    .font(HarvousPopoverMenuMetrics.rowFont)
                    .foregroundStyle(titleTint)
                Spacer(minLength: 8)
                if isSelected {
                    HarvousFAGlyph(assetName: "Harvous.Check", edgePt: HarvousFAIconMetrics.menuRowCheckGlyphPt)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
    }
}

struct HarvousPopoverMenuDivider: View {
    var body: some View {
        Divider()
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
    }
}
