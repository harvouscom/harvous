import SwiftUI

/// Sidebar drill-down detail view for a single Easton's Bible Dictionary entry.
/// See-also chips update `slug` in-place (same entry swaps without navigation).
struct EastonsEntryDetailView: View {
    let initialSlug: String
    @State private var slug: String

    init(initialSlug: String) {
        self.initialSlug = initialSlug
        _slug = State(initialValue: initialSlug)
    }

    var body: some View {
        ScrollView {
            EastonsEntryView(slug: $slug, showHeadword: true, showDisclaimer: true)
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .navigationTitle(Text("Dictionary"))
        #if os(macOS)
        .navigationSubtitle(Text("Easton's Bible Dictionary"))
        #endif
    }
}
