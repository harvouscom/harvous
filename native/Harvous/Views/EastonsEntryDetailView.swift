import SwiftUI

/// Inline sidebar detail view for a single Easton's Bible Dictionary entry.
/// Rendered directly inside the sidebar column (not pushed via NavigationLink) so it
/// stays in the sidebar panel rather than replacing the main editor area.
/// See-also chips update `slug` in-place without any further navigation.
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
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
