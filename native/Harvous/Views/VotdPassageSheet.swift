import SwiftUI

/// Bottom sheet that renders today's passage in full. Used by `DailyPassagePill`.
/// `showsAddFAB` is `false` when the passage is already in notes — the FAB is hidden, the reader still dismisses via the header button.
struct VotdPassageSheet: View {
    private enum Metrics {
        /// Header and reading body use the same lateral and top rhythm.
        static let sheetHorizontalPadding: CGFloat = 20
        static let sectionTopPadding: CGFloat = 20
        static let headerBottomPadding: CGFloat = 16
        /// Compact FAB — matches morphing compose orb (44) so the sheet does not feel dominated on medium detent.
        static let fabSide: CGFloat = 44
        static let fabIconSize: CGFloat = 17
        static let fabTrailingPadding: CGFloat = 16
        static let fabBottomPadding: CGFloat = 12
        static let scrollBottomInsetNoFAB: CGFloat = 20
    }

    let votd: VotdToday
    /// When false (passage already in notes), omit the FAB; reader still dismisses via header button.
    var showsAddFAB: Bool = true
    var onAdd: () -> Void

    @Environment(\.dismiss) private var dismiss

    private var passageScrollBottomInset: CGFloat {
        Metrics.scrollBottomInsetNoFAB
    }

    private var attributionFooterTrailingPadding: CGFloat {
        showsAddFAB ? Metrics.fabSide + Metrics.fabTrailingPadding + 4 : 0
    }

    private var attribution: ScriptureReference.TranslationAttribution? {
        ScriptureReference.attribution(for: votd.translation)
    }

    @ViewBuilder
    private func attributionFooter(_ attribution: ScriptureReference.TranslationAttribution) -> some View {
        HStack(alignment: .center, spacing: 10) {
            HarvousFAGlyph(assetName: "Harvous.CircleInfo", edgePt: 9)
                .foregroundStyle(.secondary)
                .accessibilityLabel("Translation attribution")

            Text(attribution.copyright)
                .font(HarvousFonts.font(size: 10, weight: .medium, design: .default))
                .foregroundStyle(.secondary)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)

            if let websiteURL = URL(string: attribution.website) {
                Link(destination: websiteURL) {
                    HStack(spacing: 3) {
                        Text(ScriptureReference.displayTranslationLabel(votd.translation))
                            .font(HarvousFonts.font(size: 9, weight: .semibold, design: .default))
                        HarvousFAGlyph(assetName: "Harvous.ArrowUpRight", edgePt: 7)
                    }
                    .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.leading, Metrics.sheetHorizontalPadding)
        .padding(.trailing, Metrics.sheetHorizontalPadding + attributionFooterTrailingPadding)
        .padding(.vertical, 8)
        .background(Color.primary.opacity(0.03))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Today's Passage")
                        .font(HarvousTypography.noteListPreview)
                        .foregroundStyle(.tertiary)
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(votd.reference)
                            .font(HarvousFonts.font(size: 17, weight: .semibold, design: .default))
                            .lineLimit(1)
                            .truncationMode(.tail)
                            .layoutPriority(0)
                        StudyDockHeaderChipView(
                            chip: .scriptureTranslation(
                                label: ScriptureReference.displayTranslationLabel(votd.translation)
                            )
                        )
                        .layoutPriority(1)
                    }
                }
                Spacer(minLength: 0)
                Button {
                    dismiss()
                } label: {
                    HarvousFAGlyph(assetName: "Harvous.CircleXmark", edgePt: 22)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, Metrics.sheetHorizontalPadding)
            .padding(.top, Metrics.sectionTopPadding)
            .padding(.bottom, Metrics.headerBottomPadding)

            Divider()

            ZStack(alignment: .bottomTrailing) {
                VStack(spacing: 0) {
                    ScrollView {
                        ScripturePassageView(
                            reference: votd.reference,
                            translation: votd.translation,
                            showHeader: false,
                            useReadingTypography: true,
                            useRegularPassageWeight: true,
                            showAttribution: false
                        )
                        .padding(.horizontal, Metrics.sheetHorizontalPadding)
                        .padding(.top, Metrics.sectionTopPadding)
                        .padding(.bottom, passageScrollBottomInset)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)

                    if let attribution {
                        Divider()
                        attributionFooter(attribution)
                    }
                }

                if showsAddFAB {
                    Button(action: onAdd) {
                        HarvousFAGlyph(assetName: "Harvous.Plus", edgePt: Metrics.fabIconSize)
                            .foregroundStyle(.white)
                            .frame(width: Metrics.fabSide, height: Metrics.fabSide)
                            .background(Circle().fill(Color.harvousAccent))
                            .shadow(color: Color.black.opacity(0.12), radius: 4, x: 0, y: 2)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Add to Notes")
                    .padding(.trailing, Metrics.fabTrailingPadding)
                    .padding(.bottom, Metrics.fabBottomPadding)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(minWidth: 300, idealWidth: 360, maxWidth: 460)
        #if os(iOS)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        #endif
    }
}
