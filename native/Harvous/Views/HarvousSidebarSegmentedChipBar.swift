import SwiftUI

struct HarvousSidebarSegmentedChipOption: Identifiable, Hashable {
    let id: String
    let label: String
    let iconAsset: String?
}

/// Segmented pill chip bar matching `StudyHighlightListColumn.kindChipBar`.
struct HarvousSidebarSegmentedChipBar: View {
    let options: [HarvousSidebarSegmentedChipOption]
    @Binding var selection: String
    var matchedGeometryId: String = "sidebarSegmentedChip"

    @State private var availableWidth: CGFloat = 300
    @Namespace private var chipNamespace

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(options) { option in
                    chipSegment(option)
                }
            }
            .frame(minWidth: availableWidth - 2 * HarvousFeedListLayout.listRowHorizontalInset)
            .padding(3)
            .background(Capsule().fill(Color.primary.opacity(0.07)))
            .padding(.horizontal, HarvousFeedListLayout.listRowHorizontalInset)
            .padding(.vertical, 8)
        }
        .background(
            GeometryReader { proxy in
                Color.clear
                    .onAppear { availableWidth = proxy.size.width }
                    .onChange(of: proxy.size.width) { _, width in
                        availableWidth = width
                    }
            }
        )
    }

    private func chipSegment(_ option: HarvousSidebarSegmentedChipOption) -> some View {
        let isSelected = selection == option.id
        #if os(iOS)
        let iconPt: CGFloat = 14
        let labelFont: Font = HarvousFonts.font(size: 16, weight: 500, design: .default)
        let hStackSpacing: CGFloat = 6
        let hPad: CGFloat = 12
        let vPad: CGFloat = 8
        #else
        let iconPt: CGFloat = 10
        let labelFont: Font = HarvousFonts.font(size: 12, weight: 500, design: .default)
        let hStackSpacing: CGFloat = 4
        let hPad: CGFloat = 10
        let vPad: CGFloat = 5
        #endif
        return Button {
            withAnimation(.spring(response: 0.25, dampingFraction: 0.82)) {
                selection = option.id
            }
        } label: {
            HStack(spacing: hStackSpacing) {
                if let iconAsset = option.iconAsset {
                    HarvousFAGlyph(assetName: iconAsset, edgePt: iconPt)
                }
                Text(option.label)
                    .font(labelFont)
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
            }
            .padding(.horizontal, hPad)
            .padding(.vertical, vPad)
            .frame(maxWidth: .infinity)
            .foregroundStyle(isSelected ? Color.primary : Color.primary.opacity(0.5))
            .background {
                if isSelected {
                    Capsule()
                        #if os(macOS)
                        .fill(Color(NSColor.controlBackgroundColor))
                        #else
                        .fill(Color(UIColor.systemBackground))
                        #endif
                        .shadow(color: .black.opacity(0.1), radius: 2, y: 1)
                        .matchedGeometryEffect(id: matchedGeometryId, in: chipNamespace)
                }
            }
        }
        .buttonStyle(.plain)
    }
}
