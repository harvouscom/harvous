import SwiftUI

/// System share sheet for plain text via `ShareLink`. Disabled appearance when payload is empty.
struct HarvousSystemShareLink: View {
    var shareText: String

    var body: some View {
        Group {
            if shareText.isEmpty {
                Button(action: {}) {
                    shareGlyphCore
                }
#if os(macOS)
                .buttonStyle(.bordered)
#else
                .buttonStyle(.bordered)
                .tint(Color.secondary)
#endif
                .disabled(true)
                .opacity(0.4)
                .accessibilityLabel("Share")
                .accessibilityHint("Nothing to share yet")
            } else {
                ShareLink(item: shareText) {
                    shareGlyphCore
                }
#if os(macOS)
                .buttonStyle(.bordered)
#else
                .buttonStyle(.bordered)
                .tint(Color.secondary)
#endif
                .accessibilityLabel("Share")
                .accessibilityHint("Shares a copy of this note")
            }
        }
    }

    private var shareGlyphCore: some View {
        HarvousFAGlyph(
            assetName: "Harvous.ShareSquare",
            edgePt: HarvousFAIconMetrics.catalogGlyphBoxPt
        )
        .frame(
            width: HarvousFAIconMetrics.catalogGlyphBoxPt,
            height: HarvousFAIconMetrics.catalogGlyphBoxPt
        )
        .accessibilityHidden(true)
    }
}
