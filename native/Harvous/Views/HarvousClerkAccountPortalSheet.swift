#if os(macOS)
import SwiftUI
import WebKit

/// In-app Clerk Account Portal (`/user`) for macOS, where ClerkKitUI's `UserProfileView`
/// is not available. Keeps account management inside Harvous instead of an external browser tab.
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
