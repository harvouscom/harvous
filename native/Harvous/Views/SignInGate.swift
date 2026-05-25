import SwiftUI
import SwiftData

#if canImport(ClerkKit)
import ClerkKit
#endif
#if canImport(ClerkKitUI)
import ClerkKitUI
#endif

/// Root view that swaps between Clerk's auth UI and `Content` based on
/// the current session state. Loading Clerk is awaited once; thereafter the
/// `Observable` bridge drives view updates as the user signs in / out.
/// On every authenticated entry we also kick a background pull-then-flush.
struct SignInGate<Content: View>: View {
    @ViewBuilder var content: () -> Content
    @State private var bridge = HarvousClerkBridge.shared
    @State private var sync = HarvousSyncService.shared
    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        gatedBody
            .task {
                await bridge.load()
            }
            // Clerk's SwiftUI components read `@Environment(Clerk.self)`.
            // Inject the shared instance once at the root so both `AuthView()`
            // and any descendant `UserProfileView()` resolve correctly.
            #if canImport(ClerkKit)
            .environment(Clerk.shared)
            #endif
    }

    @ViewBuilder
    private var gatedBody: some View {
        if !bridge.isLoaded {
            ProgressView()
                .controlSize(.large)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if bridge.isAuthenticated {
            content()
                .task(id: bridge.userId) {
                    bridge.refreshProfile()
                    await sync.flushPending(context: modelContext)
                    await sync.pullAll(context: modelContext)
                }
                .onChange(of: scenePhase) { _, phase in
                    guard phase == .active else { return }
                    Task {
                        await sync.flushPending(context: modelContext)
                        await sync.pullAll(context: modelContext)
                    }
                }
        } else {
            SignInPlaceholder()
        }
    }
}

/// Wraps Clerk's stock SwiftUI auth experience. If the Clerk SDK is not yet
/// linked (SPM dep not added), shows a developer-facing notice instead of
/// silently breaking the build.
private struct SignInPlaceholder: View {
    var body: some View {
        // ClerkKitUI 1.1.x only ships `AuthView` inside `#if os(iOS)`, so on
        // macOS we render a placeholder until a Mac-native auth flow lands
        // (likely an `ASWebAuthenticationSession` against the Clerk-hosted UI).
        #if os(iOS) && canImport(ClerkKitUI)
        AuthView()
        #elseif canImport(ClerkKit)
        // ClerkKitUI's AuthView is iOS-only in 1.1.x, so on macOS we use a
        // hand-rolled email-code form against ClerkKit's core APIs.
        MacSignInView()
        #else
        VStack(spacing: 12) {
            Text("Clerk SDK not linked")
                .font(.headline)
            Text("Add the clerk-ios Swift Package and rebuild. See native/Harvous/CLERK_SETUP.md.")
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.background)
        #endif
    }
}
