import SwiftUI

/// Shared 2-up grid metrics for the collection index surfaces (Folders / Threads /
/// Scripture books) on both the iOS hubs and the macOS sidebar.
enum HarvousCollectionGridLayout {
    static let spacing: CGFloat = 8
    static let topPadding: CGFloat = 6
    /// Match the single-column list's horizontal inset so the grid lines up with note rows.
    static let horizontalPadding: CGFloat = HarvousFeedListLayout.listRowHorizontalInset

    static var columns: [GridItem] {
        [
            GridItem(.flexible(), spacing: spacing),
            GridItem(.flexible(), spacing: spacing),
        ]
    }
}

/// Compact liquid-glass card for the collection *index* grids — Folders, Threads,
/// and Scripture books — laid out 2-up in a `LazyVGrid`. This is the grid analog of
/// `FolderFeedRow` (which stays for the single-column note-row surfaces) and shares the
/// daily-passage card chrome (`DailyPassagePill.cardChrome`).
///
/// Web parity: `.proto-collection-card` in `prototype-components.css` — icon top-left,
/// title (2-line clamp) + count anchored to the bottom.
struct CollectionGridCard: View {
    let iconAssetName: String
    let title: String
    let subtitle: String
    var isPinned: Bool = false

    /// Matches the daily-passage pill (`DailyPassagePill`) so the cards read as the same family.
    private let cornerRadius: CGFloat = 14

    private var minHeight: CGFloat {
        #if os(iOS)
        return 96
        #else
        return 80
        #endif
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 5) {
                HarvousFAGlyph(assetName: iconAssetName, edgePt: 15)
                    .foregroundStyle(.secondary)
                if isPinned {
                    HarvousFAGlyph(assetName: "Harvous.Thumbtack", edgePt: 9)
                        .foregroundStyle(Color.primary.opacity(0.45))
                }
                Spacer(minLength: 0)
            }

            // Push the text block to the bottom (web: `.proto-collection-card__body { margin-top: auto }`).
            Spacer(minLength: 0)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(HarvousTypography.noteListTitle)
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                Text(subtitle)
                    .font(HarvousTypography.noteListPreview)
                    .foregroundStyle(.tertiary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
        }
        .frame(maxWidth: .infinity, minHeight: minHeight, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 11)
        .background(cardChrome)
        .overlay(
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.5)
        )
        .cardShadow()
        .contentShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }

    /// Liquid glass over a stable base — mirrors `DailyPassagePill.cardChrome` so the card
    /// doesn't go dark gray when the window loses focus.
    private var cardChrome: some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        return ZStack {
            shape.fill(.background)
            if #available(macOS 26.0, iOS 26.0, *) {
                shape
                    .fill(.clear)
                    .glassEffect(in: shape)
            } else {
                shape.fill(.thinMaterial)
            }
        }
    }
}
