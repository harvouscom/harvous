import SwiftUI

/// Category / translation chip beside a study-dock title — shared by collapsed cards and reference dock headers.
struct StudyDockHeaderChipView: View {
    let chip: StudyDockCollapsedHeaderChip

    var body: some View {
        switch chip {
        case .referenceCategory(let iconAsset, let label):
            HStack(spacing: 3) {
                HarvousFAGlyph(assetName: iconAsset, edgePt: 10)
                Text(label)
                    .font(HarvousFonts.font(size: 11, weight: .medium, design: .default))
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            .foregroundStyle(Color.primary.opacity(0.5))
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(Capsule().fill(Color.primary.opacity(0.07)))
            .fixedSize(horizontal: true, vertical: false)
        case .scriptureTranslation(let label):
            Text(label)
                .font(HarvousFonts.font(size: 10, weight: .semibold, design: .default))
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.tail)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(Color.primary.opacity(0.04))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.10), lineWidth: 0.5)
                )
                .fixedSize(horizontal: true, vertical: false)
        }
    }
}

/// Compact carousel slot for an inactive study dock — icon, title, optional chip, dismiss (matches web collapsed shell).
struct StudyDockCarouselCollapsedCard: View {
    let title: String
    let iconAsset: String
    let headerChip: StudyDockCollapsedHeaderChip?
    let accentTint: Color
    let onActivate: () -> Void
    let onDismiss: () -> Void

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            Button(action: onActivate) {
                HStack(alignment: .center, spacing: 8) {
                    HarvousFAGlyph(assetName: iconAsset, edgePt: 13)
                        .foregroundStyle(.primary)

                    HStack(alignment: .center, spacing: 8) {
                        Text(title)
                            .font(HarvousFonts.font(size: 14, weight: .semibold, design: .default))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                            .truncationMode(.tail)
                            .layoutPriority(0)

                        if let headerChip {
                            StudyDockHeaderChipView(chip: headerChip)
                                .layoutPriority(1)
                        }
                    }
                    .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(title)
            .accessibilityHint("Show study dock")

            Button(action: onDismiss) {
                HarvousFAGlyph(assetName: "Harvous.Xmark", edgePt: 13)
                    .foregroundStyle(.secondary)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Dismiss")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(dockChrome)
        .studyDockShellBorderOverlay()
        .shadow(color: .black.opacity(colorScheme == .dark ? 0.35 : 0.10), radius: 12, y: 4)
        .shadow(color: .black.opacity(colorScheme == .dark ? 0.2 : 0.06), radius: 3, y: 1)
    }

    private var dockChrome: some View {
        ZStack {
            let shape = RoundedRectangle(cornerRadius: 18, style: .continuous)
            shape.fill(.background)
            if #available(macOS 26.0, iOS 26.0, *) {
                shape
                    .fill(.clear)
                    .glassEffect(in: shape)
            } else {
                shape.fill(.ultraThinMaterial)
            }
        }
        .allowsHitTesting(false)
    }
}
