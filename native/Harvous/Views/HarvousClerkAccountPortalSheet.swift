#if os(macOS)
import SwiftUI
import WebKit

/// Legacy in-app Clerk Account Portal (`/user`) via WKWebView. Unused: the portal has no native
/// session cookies, so the sheet renders blank. Both iOS and macOS use
/// `HarvousMacUserProfileSheet` (ClerkKit APIs) for account management.
struct HarvousClerkAccountPortalSheet: View {
    let url: URL
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            HarvousClerkAccountPortalWebView(url: url)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .navigationTitle("Manage account")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Done") { dismiss() }
                    }
                }
        }
        .frame(minWidth: 480, minHeight: 560)
    }
}

private struct HarvousClerkAccountPortalWebView: NSViewRepresentable {
    let url: URL

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}
}
#endif
