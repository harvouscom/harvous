import SwiftUI
import SwiftData

#if canImport(ClerkKit)
import ClerkKit
#endif

/// Root view that swaps between Clerk's auth UI and `Content` based on
/// the current session state. Loading Clerk is awaited once; thereafter the
/// `Observable` bridge drives view updates as the user signs in / out.
/// On every authenticated entry we also kick a background pull-then-flush.
///
/// Once authenticated, `content()` stays in the view tree even after session
/// expiry to prevent SwiftUI from tearing down NavigationStacks with active
/// paths — that teardown triggers a fatal `AnyNavigationPath.Error
/// .comparisonTypeMismatch` crash in NavigationColumnState.
struct SignInGate<Content: View>: View {
    @ViewBuilder var content: () -> Content
    @State private var bridge = HarvousClerkBridge.shared
    @State private var sync = HarvousSyncService.shared
    @State private var hasEverAuthenticated = false
    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        gatedBody
            .task {
                await bridge.load()
            }
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
        } else if hasEverAuthenticated {
            ZStack {
                content()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .task(id: bridge.userId) {
                        defer { HarvousRealtimeSync.shared.stop() }
                        guard bridge.isAuthenticated, let userId = bridge.userId else { return }
                        HarvousSyncScheduler.registerContext(modelContext)
                        HarvousSyncScheduler.cancelPendingScheduledSync()
                        sync.resetIfUserChanged(currentUserId: userId)
                        bridge.refreshProfile()
                        await sync.flushPending(context: modelContext)
                        await sync.pullAll(context: modelContext)
                        await sync.flushPending(context: modelContext)
                        HarvousRealtimeSync.shared.start(userId: userId)
                        while !Task.isCancelled {
                            try? await Task.sleep(nanoseconds: 1_000_000_000)
                        }
                    }
                    .onChange(of: scenePhase) { _, phase in
                        if phase != .active {
                            HarvousRealtimeSync.shared.stop()
                            return
                        }
                        guard bridge.isAuthenticated, let userId = bridge.userId else { return }
                        HarvousSyncScheduler.registerContext(modelContext)
                        HarvousSyncScheduler.cancelPendingScheduledSync()
                        HarvousRealtimeSync.shared.start(userId: userId)
                        Task {
                            await sync.flushPending(context: modelContext)
                            await sync.pullAll(context: modelContext)
                            await sync.flushPending(context: modelContext)
                        }
                    }
                    .allowsHitTesting(bridge.isAuthenticated)

                if !bridge.isAuthenticated {
                    SignInPlaceholder()
                        .transition(.opacity)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .animation(.easeInOut(duration: 0.25), value: bridge.isAuthenticated)
        } else {
            SignInPlaceholder()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .onAppear {
                    if bridge.isAuthenticated { hasEverAuthenticated = true }
                }
                .onChange(of: bridge.isAuthenticated) { _, isAuth in
                    if isAuth { hasEverAuthenticated = true }
                }
        }
    }
}

/// Wraps Clerk's stock SwiftUI auth experience. If the Clerk SDK is not yet
/// linked (SPM dep not added), shows a developer-facing notice instead of
/// silently breaking the build.
private struct SignInPlaceholder: View {
    var body: some View {
        #if canImport(ClerkKit)
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
