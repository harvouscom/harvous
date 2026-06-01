import SwiftUI

/// Compact carousel slot for an inactive study dock — icon, title, dismiss only (matches web collapsed shell).
struct StudyDockCarouselCollapsedCard: View {
    let title: String
    let iconAsset: String
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
                    Text(title)
                        .font(HarvousFonts.font(size: 14, weight: .semibold, design: .default))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .frame(maxWidth: .infinity, alignment: .leading)
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
